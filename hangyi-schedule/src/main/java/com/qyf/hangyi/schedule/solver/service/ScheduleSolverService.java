package com.qyf.hangyi.schedule.solver.service;

import ai.timefold.solver.core.api.solver.SolverManager;
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

    @Autowired
    private SolverManager<ScheduleSolution, Long> solverManager;

    /**
     * 使用 Timefold 求解器执行自动排班。
     * 约束规则定义在 {@link com.qyf.hangyi.schedule.solver.constraint.ScheduleConstraintProvider}。
     */
    public ScheduleSolution autoSchedule(Long groupId, LocalDate startDate, LocalDate endDate) {
        // 1. 获取员工数据
        List<Employee> employees = fetchEmployeesByGroup(groupId);
        if (employees.isEmpty()) {
            throw new RuntimeException("未找到员工数据");
        }

        // 2. 获取可用班次模板（包含 REST）
        List<ShiftTemplate> shifts = shiftTemplateMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ShiftTemplate>()
                        .eq(ShiftTemplate::getStatus, 1)
        );
        if (shifts.isEmpty()) {
            throw new RuntimeException("未找到班次模板");
        }

        // 3. 为每个员工 x 每天创建一个 ShiftAssignment（初始不分配班次）
        int totalDays = (int) ChronoUnit.DAYS.between(startDate, endDate) + 1;
        List<ShiftAssignment> assignments = new ArrayList<>();
        long idCounter = 0;

        for (Employee emp : employees) {
            for (int day = 0; day < totalDays; day++) {
                ShiftAssignment a = new ShiftAssignment();
                a.setId(idCounter++);
                a.setEmployee(emp);
                a.setWorkDate(startDate.plusDays(day));
                a.setShift(null); // Timefold 求解器将分配班次
                assignments.add(a);
            }
        }

        // 4. 构建求解问题
        ScheduleSolution problem = new ScheduleSolution(employees, shifts, assignments);

        // 5. 调用 Timefold 求解器（通过 SolverJob 阻塞等待结果）
        ScheduleSolution solved;
        try {
            var solverJob = solverManager.solve(
                    groupId * 10000 + startDate.toEpochDay(),
                    problem
            );
            solved = solverJob.getFinalBestSolution();
        } catch (InterruptedException | java.util.concurrent.ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("排班求解被中断", e);
        }

        if (solved.getScore() == null || !solved.getScore().isFeasible()) {
            throw new RuntimeException("排班求解未能找到可行的排班方案，请检查约束条件与员工/班次配置");
        }

        return solved;
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
