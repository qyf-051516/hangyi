package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.qyf.hangyi.employee.entity.EmployeeQualification;
import com.qyf.hangyi.employee.mapper.EmployeeQualificationMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
public class QualificationService extends ServiceImpl<EmployeeQualificationMapper, EmployeeQualification> {

    public Page<EmployeeQualification> pageQuery(int page, int size, Long employeeId, Integer status) {
        return page(new Page<>(page, size),
                new LambdaQueryWrapper<EmployeeQualification>()
                        .eq(employeeId != null, EmployeeQualification::getEmployeeId, employeeId)
                        .eq(status != null, EmployeeQualification::getStatus, status)
                        .orderByDesc(EmployeeQualification::getExpireDate));
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
                .eq(EmployeeQualification::getStatus, 1)
                .lt(EmployeeQualification::getExpireDate, LocalDate.now())
                .list();
    }
}
