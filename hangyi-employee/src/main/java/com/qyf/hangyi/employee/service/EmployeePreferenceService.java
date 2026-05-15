package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.qyf.hangyi.employee.entity.EmployeePreference;
import com.qyf.hangyi.employee.mapper.EmployeePreferenceMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class EmployeePreferenceService extends ServiceImpl<EmployeePreferenceMapper, EmployeePreference> {

    public List<EmployeePreference> listByEmployee(Long employeeId) {
        return lambdaQuery()
                .eq(EmployeePreference::getEmployeeId, employeeId)
                .eq(EmployeePreference::getStatus, 1)
                .list();
    }
}
