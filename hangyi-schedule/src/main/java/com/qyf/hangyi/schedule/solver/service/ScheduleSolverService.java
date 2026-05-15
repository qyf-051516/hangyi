package com.qyf.hangyi.schedule.solver.service;

import com.qyf.hangyi.schedule.client.EmployeeFeignClient;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import com.qyf.hangyi.schedule.mapper.ShiftTemplateMapper;
import com.qyf.hangyi.schedule.solver.domain.Employee;
import com.qyf.hangyi.schedule.solver.domain.ScheduleSolution;
import com.qyf.hangyi.schedule.solver.domain.ShiftAssignment;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ScheduleSolverService {

    @Autowired
    private EmployeeFeignClient employeeFeignClient;

    @Autowired
    private ShiftTemplateMapper shiftTemplateMapper;

    public ScheduleSolution autoSchedule(Long groupId, LocalDate startDate, LocalDate endDate) {
        // 1. 获取员工数据
        List<Employee> employees = fetchEmployeesByGroup(groupId);
        if (employees.isEmpty()) {
            throw new RuntimeException("未找到员工数据");
        }

        // 2. 获取可用班次
        List<ShiftTemplate> shifts = shiftTemplateMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ShiftTemplate>()
                        .eq(ShiftTemplate::getStatus, 1)
        );
        if (shifts.isEmpty()) {
            throw new RuntimeException("未找到班次模板");
        }

        Map<String, ShiftTemplate> shiftMap = shifts.stream()
                .collect(Collectors.toMap(ShiftTemplate::getShiftCode, s -> s));

        // 3. 轮转排班算法生成排班
        int totalDays = (int) ChronoUnit.DAYS.between(startDate, endDate) + 1;
        int empCount = employees.size();

        // 按人数分配每天各时段/休班数量
        int[] slots = computeDailySlots(empCount);
        // slots: [rest, morning, evening, night]

        String[] shiftCodes = {"REST", "MORNING", "EVENING", "NIGHT"};

        List<ShiftAssignment> assignments = new ArrayList<>();
        long id = 0;

        for (int day = 0; day < totalDays; day++) {
            LocalDate currentDate = startDate.plusDays(day);

            for (int empIdx = 0; empIdx < empCount; empIdx++) {
                // 轮转：员工 permIdx 在第 day 天的班次由 (empIdx + day) % empCount 决定
                int pos = (empIdx + day) % empCount;

                // 找到 pos 落在哪个 slot 区间
                String shiftCode = null;
                int cumulative = 0;
                for (int s = 0; s < slots.length; s++) {
                    cumulative += slots[s];
                    if (pos < cumulative) {
                        shiftCode = shiftCodes[s];
                        break;
                    }
                }
                if (shiftCode == null) continue;

                ShiftTemplate shift = shiftMap.get(shiftCode);
                if (shift == null) continue;

                ShiftAssignment assignment = new ShiftAssignment();
                assignment.setId(id++);
                assignment.setEmployee(employees.get(empIdx));
                assignment.setWorkDate(currentDate);
                assignment.setShift(shift);
                assignments.add(assignment);
            }
        }

        return new ScheduleSolution(employees, shifts, assignments);
    }

    /**
     * 根据班组人数计算每日各时段分配名额
     * @return [休息人数, 早班人数, 晚班人数, 夜班人数]
     */
    private int[] computeDailySlots(int empCount) {
        if (empCount <= 3) {
            // 3人及以下：人停班不停，每人每天一个班次，由上层业务安排补休
            return new int[]{0, Math.max(1, empCount / 3), Math.max(1, empCount / 3), Math.max(1, empCount / 3)};
        }
        // 4人以上：按 2:2:1:1 比例分配 休息:早班:晚班:夜班
        int rest = Math.max(1, (int) Math.round(empCount * 2.0 / 6.0));
        int morning = Math.max(1, (int) Math.round(empCount * 2.0 / 6.0));
        int evening = Math.max(1, (int) Math.round(empCount * 1.0 / 6.0));
        int night = empCount - rest - morning - evening;
        if (night < 0) {
            evening += night;
            night = 0;
        }
        if (rest + morning + evening > empCount) {
            morning = empCount - rest - evening;
        }
        return new int[]{rest, morning, evening, night};
    }

    @SuppressWarnings("unchecked")
    private List<Employee> fetchEmployeesByGroup(Long groupId) {
        var response = employeeFeignClient.getEmployeesByGroup(groupId);
        if (response.getData() == null) return List.of();

        List<Employee> result = new ArrayList<>();
        for (Map<String, Object> item : (List<Map<String, Object>>) response.getData()) {
            Employee emp = new Employee();
            emp.setId(toLong(item.get("id")));
            emp.setName((String) item.get("name"));
            emp.setEmpNo((String) item.get("empNo"));
            emp.setGroupId(toLong(item.get("groupId")));
            emp.setStatus(toInt(item.get("status")));
            emp.setMaxHoursPerDay(toBigDecimal(item.get("maxHoursPerDay")));
            emp.setMaxHoursPerWeek(toBigDecimal(item.get("maxHoursPerWeek")));
            result.add(emp);
        }
        return result;
    }

    private Long toLong(Object val) {
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).longValue();
        return Long.valueOf(val.toString());
    }

    private Integer toInt(Object val) {
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).intValue();
        return Integer.valueOf(val.toString());
    }

    private BigDecimal toBigDecimal(Object val) {
        if (val == null) return null;
        if (val instanceof BigDecimal) return (BigDecimal) val;
        return new BigDecimal(val.toString());
    }
}
