package com.qyf.hangyi.core.employee.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.qyf.hangyi.core.employee.entity.AircraftType;
import com.qyf.hangyi.core.employee.entity.Employee;
import com.qyf.hangyi.core.employee.entity.EmployeeQualification;
import com.qyf.hangyi.core.employee.mapper.AircraftTypeMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeQualificationMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class QualificationService extends ServiceImpl<EmployeeQualificationMapper, EmployeeQualification> {

    @Autowired private EmployeeMapper employeeMapper;
    @Autowired private AircraftTypeMapper aircraftTypeMapper;

    public Page<EmployeeQualification> pageQuery(int page, int size, Long employeeId, Integer status) {
        // 防御性 clamp：page>=1，1<=size<=200
        page = Math.max(1, page);
        size = Math.max(1, Math.min(size, 200));

        LambdaQueryWrapper<EmployeeQualification> wrapper = new LambdaQueryWrapper<EmployeeQualification>()
                .eq(employeeId != null, EmployeeQualification::getEmployeeId, employeeId)
                .eq(status != null, EmployeeQualification::getStatus, status)
                .orderByDesc(EmployeeQualification::getExpireDate);

        // 用 MP Page 做安全分页（内部走参数化 LIMIT，不再用 last() 拼 SQL 字符串）
        Page<EmployeeQualification> result = this.page(new Page<>(page, size), wrapper);
        List<EmployeeQualification> records = result.getRecords();

        // 只查本页涉及的 emp_id / aircraft_type_id（避免 selectList(null) 拉全表 N+1）
        if (!records.isEmpty()) {
            Set<Long> empIds = records.stream()
                    .map(EmployeeQualification::getEmployeeId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            Set<Long> typeIds = records.stream()
                    .map(EmployeeQualification::getAircraftTypeId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            Map<Long, Employee> empMap = empIds.isEmpty() ? Collections.emptyMap() :
                    employeeMapper.selectBatchIds(empIds).stream()
                            .collect(Collectors.toMap(Employee::getId, e -> e));
            Map<Long, String> typeMap = typeIds.isEmpty() ? Collections.emptyMap() :
                    aircraftTypeMapper.selectBatchIds(typeIds).stream()
                            .collect(Collectors.toMap(AircraftType::getId, AircraftType::getTypeName));
            for (EmployeeQualification q : records) {
                Employee e = empMap.get(q.getEmployeeId());
                if (e != null) {
                    q.setEmployeeName(e.getName());
                    q.setEmpNo(e.getEmpNo());
                }
                q.setAircraftTypeName(typeMap.get(q.getAircraftTypeId()));
            }
        }
        return result;
    }

    public List<EmployeeQualification> listByEmployee(Long employeeId) {
        return lambdaQuery()
                .eq(EmployeeQualification::getEmployeeId, employeeId)
                .orderByDesc(EmployeeQualification::getExpireDate)
                .list();
    }

    public List<EmployeeQualification> listExpiringSoon(int withinDays) {
        LocalDate today = LocalDate.now();
        return lambdaQuery()
                .eq(EmployeeQualification::getStatus, 1)
                .between(EmployeeQualification::getExpireDate, today, today.plusDays(withinDays))
                .list();
    }

    public List<EmployeeQualification> listExpired() {
        return lambdaQuery()
                .lt(EmployeeQualification::getExpireDate, LocalDate.now())
                .orderByDesc(EmployeeQualification::getExpireDate)
                .list();
    }
}
