package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.qyf.hangyi.employee.entity.Employee;
import com.qyf.hangyi.employee.mapper.EmployeeMapper;
import org.springframework.stereotype.Service;

@Service
public class EmployeeService extends ServiceImpl<EmployeeMapper, Employee> {

    public Page<Employee> pageQuery(int page, int size, String name, Long groupId) {
        Page<Employee> p = new Page<>(page, size);
        LambdaQueryWrapper<Employee> wrapper = new LambdaQueryWrapper<Employee>()
                .eq(groupId != null, Employee::getGroupId, groupId)
                .like(name != null && !name.isEmpty(), Employee::getName, name)
                .orderByAsc(Employee::getEmpNo);
        return this.page(p, wrapper);
    }
}
