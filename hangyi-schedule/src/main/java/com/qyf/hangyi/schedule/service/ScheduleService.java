package com.qyf.hangyi.schedule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.client.EmployeeFeignClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.qyf.hangyi.schedule.client.FlightFeignClient;
import com.qyf.hangyi.schedule.client.QualificationFeignClient;
import com.qyf.hangyi.schedule.dto.ScheduleDetailVO;
import com.qyf.hangyi.schedule.entity.Schedule;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.mapper.ScheduleMapper;
import com.qyf.hangyi.schedule.mapper.ShiftTemplateMapper;
import com.qyf.hangyi.schedule.solver.domain.ScheduleSolution;
import com.qyf.hangyi.schedule.solver.domain.ShiftAssignment;
import com.qyf.hangyi.schedule.solver.service.ScheduleSolverService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ScheduleService extends ServiceImpl<ScheduleMapper, Schedule> {

    private static final Logger log = LoggerFactory.getLogger(ScheduleService.class);

    @Autowired
    private ScheduleSolverService solverService;

    @Autowired
    private ScheduleDetailMapper detailMapper;

    @Autowired
    private ShiftTemplateMapper shiftTemplateMapper;

    @Autowired
    private EmployeeFeignClient employeeFeignClient;

    @Autowired
    private FlightFeignClient flightFeignClient;

    @Autowired
    private QualificationFeignClient qualificationFeignClient;

    public Page<Schedule> pageQuery(int page, int size, Long groupId, Integer status) {
        return this.page(
                new Page<>(page, size),
                new LambdaQueryWrapper<Schedule>()
                        .eq(groupId != null, Schedule::getGroupId, groupId)
                        .eq(status != null, Schedule::getStatus, status)
                        .orderByDesc(Schedule::getCreatedAt)
        );
    }

    /**
     * 执行自动排班并保存结果
     */
    @Transactional(rollbackFor = Exception.class)
    public Schedule autoScheduleAndSave(Long groupId, LocalDate startDate, LocalDate endDate, Long userId) {
        // 检查是否有重叠排班
        long overlap = this.count(new LambdaQueryWrapper<Schedule>()
                .eq(Schedule::getGroupId, groupId)
                .eq(Schedule::getStatus, 1)
                .lt(Schedule::getStartDate, endDate.plusDays(1))
                .gt(Schedule::getEndDate, startDate.minusDays(1)));
        if (overlap > 0) {
            throw new BusinessException("该班组在选定时段已存在排班，请先删除或调整");
        }

        try {
            ScheduleSolution solution = solverService.autoSchedule(groupId, startDate, endDate);

            // 保存排班主表
            Schedule schedule = new Schedule();
            schedule.setScheduleName(startDate + " ~ " + endDate + " 排班");
            schedule.setGroupId(groupId);
            schedule.setStartDate(startDate);
            schedule.setEndDate(endDate);
            schedule.setStatus(0); // 草稿，待审核
            schedule.setCreatedBy(userId);
            this.save(schedule);

            // 保存排班明细（包含休息记录，保证排班视图完整）
            List<ScheduleDetail> details = solution.getShiftAssignments().stream()
                    .filter(a -> a.getShift() != null)
                    .map(a -> {
                        ScheduleDetail d = new ScheduleDetail();
                        d.setScheduleId(schedule.getId());
                        d.setEmployeeId(a.getEmployee().getId());
                        d.setWorkDate(a.getWorkDate());
                        d.setShiftId(a.getShift().getId());
                        d.setShiftGroup(a.getShift().getShiftType());
                        d.setScheduleType("AUTO");
                        return d;
                    })
                    .collect(Collectors.toList());
            if (details.isEmpty()) {
                throw new BusinessException("排班结果为空，请检查员工和班次配置");
            }
            for (ScheduleDetail d : details) {
                detailMapper.insert(d);
            }

            return schedule;
        } catch (RuntimeException e) {
            throw new BusinessException("排班计算失败: " + e.getMessage());
        }
    }

    public List<ScheduleDetail> getScheduleDetails(Long scheduleId) {
        return detailMapper.selectList(
                new LambdaQueryWrapper<ScheduleDetail>()
                        .eq(ScheduleDetail::getScheduleId, scheduleId)
        );
    }

    public List<ScheduleDetail> getDetailsByDate(LocalDate date, Long groupId) {
        LambdaQueryWrapper<ScheduleDetail> wrapper = new LambdaQueryWrapper<ScheduleDetail>()
                .eq(ScheduleDetail::getWorkDate, date);

        if (groupId != null) {
            try {
                var empResponse = employeeFeignClient.getEmployeesByGroup(groupId);
                if (empResponse.getData() != null && !empResponse.getData().isEmpty()) {
                    List<Long> empIds = empResponse.getData().stream()
                            .map(m -> ((Number) m.get("id")).longValue())
                            .collect(Collectors.toList());
                    wrapper.in(ScheduleDetail::getEmployeeId, empIds);
                    wrapper.orderByAsc(ScheduleDetail::getEmployeeId);
                }
            } catch (Exception e) {
                log.warn("获取班组员工失败, groupId: {}", groupId, e);
            }
        }

        return detailMapper.selectList(wrapper);
    }

    /**
     * 获取日期范围内的甘特图数据
     */
    @SuppressWarnings("unchecked")
    public List<ScheduleDetailVO> getGanttDataRange(LocalDate startDate, LocalDate endDate, Long groupId) {
        // 1. 获取日期范围内所有排班明细
        List<ScheduleDetail> details;
        if (groupId != null) {
            var empResponse = employeeFeignClient.getEmployeesByGroup(groupId);
            List<Long> empIds = empResponse.getData() != null
                    ? empResponse.getData().stream().map(m -> ((Number) m.get("id")).longValue()).collect(Collectors.toList())
                    : List.of();
            if (empIds.isEmpty()) return List.of();
            details = detailMapper.selectList(new LambdaQueryWrapper<ScheduleDetail>()
                    .ge(ScheduleDetail::getWorkDate, startDate)
                    .le(ScheduleDetail::getWorkDate, endDate)
                    .in(ScheduleDetail::getEmployeeId, empIds)
                    .orderByAsc(ScheduleDetail::getEmployeeId, ScheduleDetail::getWorkDate));
        } else {
            details = detailMapper.selectList(new LambdaQueryWrapper<ScheduleDetail>()
                    .ge(ScheduleDetail::getWorkDate, startDate)
                    .le(ScheduleDetail::getWorkDate, endDate)
                    .orderByAsc(ScheduleDetail::getEmployeeId, ScheduleDetail::getWorkDate));
        }
        if (details.isEmpty()) return List.of();

        // 2. 缓存员工数据
        Map<Long, Map<String, Object>> empMap = new HashMap<>();
        try {
            var empResp = employeeFeignClient.listAll();
            if (empResp.getCode() == 200 && empResp.getData() != null) {
                for (Map<String, Object> e : empResp.getData()) {
                    Object id = e.get("id");
                    if (id != null) empMap.put(((Number) id).longValue(), e);
                }
            }
        } catch (Exception e) {
                log.warn("Feign调用失败", e);
            }

        // 3. 缓存班次数据
        Map<Long, Map<String, Object>> shiftMap = new HashMap<>();
        try {
            List<ShiftTemplate> shifts = shiftTemplateMapper.selectList(null);
            for (ShiftTemplate s : shifts) {
                Map<String, Object> m = new HashMap<>();
                m.put("shiftCode", s.getShiftCode());
                m.put("shiftName", s.getShiftName());
                m.put("startTime", s.getStartTime());
                m.put("endTime", s.getEndTime());
                m.put("color", s.getColor());
                m.put("shiftType", s.getShiftType());
                shiftMap.put(s.getId(), m);
            }
        } catch (Exception e) {
                log.warn("Feign调用失败", e);
            }

        // 4. 缓存所有员工的资质
        Map<Long, List<Map<String, Object>>> qualMap = new HashMap<>();
        for (Long empId : empMap.keySet()) {
            try {
                var qualResp = qualificationFeignClient.listByEmployee(empId);
                if (qualResp.getCode() == 200 && qualResp.getData() != null) {
                    qualMap.put(empId, qualResp.getData());
                }
            } catch (Exception e) {
                log.warn("Feign调用失败", e);
            }
        }

        // 5. 组装结果
        List<ScheduleDetailVO> result = new ArrayList<>();
        for (ScheduleDetail d : details) {
            result.add(ScheduleDetailVO.from(
                    d,
                    empMap.get(d.getEmployeeId()),
                    shiftMap.get(d.getShiftId()),
                    List.of(),
                    qualMap.getOrDefault(d.getEmployeeId(), List.of())
            ));
        }
        return result;
    }

    /**
     * 获取甘特图数据：排班明细 + 员工信息 + 班次信息 + 航班信息 + 资质信息
     */
    @SuppressWarnings("unchecked")
    public List<ScheduleDetailVO> getGanttData(LocalDate date, Long groupId) {
        // 1. 获取基础排班明细
        List<ScheduleDetail> details = getDetailsByDate(date, groupId);
        if (details.isEmpty()) return List.of();

        // 2. 缓存员工数据 (id -> employee map)
        Map<Long, Map<String, Object>> empMap = new HashMap<>();
        try {
            var empResp = employeeFeignClient.listAll();
            if (empResp.getCode() == 200 && empResp.getData() != null) {
                for (Map<String, Object> e : empResp.getData()) {
                    Object id = e.get("id");
                    if (id != null) empMap.put(((Number) id).longValue(), e);
                }
            }
        } catch (Exception e) {
                log.warn("Feign调用失败", e);
            }

        // 3. 缓存班次数据 (id -> shift map)
        Map<Long, Map<String, Object>> shiftMap = new HashMap<>();
        try {
            List<ShiftTemplate> shifts = shiftTemplateMapper.selectList(null);
            for (ShiftTemplate s : shifts) {
                Map<String, Object> m = new HashMap<>();
                m.put("shiftCode", s.getShiftCode());
                m.put("shiftName", s.getShiftName());
                m.put("startTime", s.getStartTime());
                m.put("endTime", s.getEndTime());
                m.put("color", s.getColor());
                m.put("shiftType", s.getShiftType());
                shiftMap.put(s.getId(), m);
            }
        } catch (Exception e) {
                log.warn("Feign调用失败", e);
            }

        // 4. 获取当天航班数据
        List<Map<String, Object>> flights = new ArrayList<>();
        try {
            var flightResp = flightFeignClient.page(1, 50, date.toString());
            if (flightResp.getCode() == 200 && flightResp.getData() != null) {
                Object records = flightResp.getData().get("records");
                if (records instanceof List) {
                    flights = (List<Map<String, Object>>) records;
                }
            }
        } catch (Exception e) {
                log.warn("Feign调用失败", e);
            }

        // 5. 获取所有员工的资质（批量缓存）
        Map<Long, List<Map<String, Object>>> qualMap = new HashMap<>();
        for (Long empId : empMap.keySet()) {
            try {
                var qualResp = qualificationFeignClient.listByEmployee(empId);
                if (qualResp.getCode() == 200 && qualResp.getData() != null) {
                    qualMap.put(empId, qualResp.getData());
                }
            } catch (Exception e) {
                log.warn("Feign调用失败", e);
            }
        }

        // 6. 组装结果
        List<ScheduleDetailVO> result = new ArrayList<>();
        for (ScheduleDetail d : details) {
            result.add(ScheduleDetailVO.from(
                    d,
                    empMap.get(d.getEmployeeId()),
                    shiftMap.get(d.getShiftId()),
                    flights,
                    qualMap.getOrDefault(d.getEmployeeId(), List.of())
            ));
        }
        return result;
    }

    /**
     * 统计今日在岗人数（已发布排班中今天有排班记录的员工数，含去重）
     */
    public int countOnDutyToday(LocalDate today) {
        List<Schedule> activeSchedules = this.lambdaQuery()
                .eq(Schedule::getStatus, 1)
                .le(Schedule::getStartDate, today)
                .ge(Schedule::getEndDate, today)
                .list();
        if (activeSchedules.isEmpty()) return 0;
        List<Long> scheduleIds = activeSchedules.stream()
                .map(Schedule::getId)
                .collect(Collectors.toList());
        return detailMapper.selectList(
                new LambdaQueryWrapper<ScheduleDetail>()
                        .select(ScheduleDetail::getEmployeeId)
                        .eq(ScheduleDetail::getWorkDate, today)
                        .in(ScheduleDetail::getScheduleId, scheduleIds)
                        .groupBy(ScheduleDetail::getEmployeeId)
        ).size();
    }

}
