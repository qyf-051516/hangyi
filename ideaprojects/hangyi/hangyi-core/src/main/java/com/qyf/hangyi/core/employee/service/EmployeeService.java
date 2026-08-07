package com.qyf.hangyi.core.employee.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.qyf.hangyi.core.employee.entity.Employee;
import com.qyf.hangyi.core.employee.entity.TeamGroup;
import com.qyf.hangyi.core.employee.mapper.EmployeeMapper;
import com.qyf.hangyi.core.employee.mapper.TeamGroupMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class EmployeeService extends ServiceImpl<EmployeeMapper, Employee> {

    @Autowired
    private TeamGroupMapper teamGroupMapper;

    public Page<Employee> pageQuery(int page, int size, String name, Long groupId) {
        // 防御性 clamp：page>=1，1<=size<=200
        page = Math.max(1, page);
        size = Math.max(1, Math.min(size, 200));

        LambdaQueryWrapper<Employee> wrapper = new LambdaQueryWrapper<Employee>()
                .eq(groupId != null, Employee::getGroupId, groupId)
                .like(name != null && !name.isEmpty(), Employee::getName, name)
                .orderByAsc(Employee::getEmpNo);

        // 用 MP Page 做安全分页（内部走参数化 LIMIT，不再用 last() 拼 SQL 字符串）
        Page<Employee> result = this.page(new Page<>(page, size), wrapper);
        List<Employee> records = result.getRecords();

        // 只查本页涉及的 group_id（避免 selectList(null) 拉全表 N+1）
        if (!records.isEmpty()) {
            Set<Long> groupIds = records.stream()
                    .map(Employee::getGroupId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            if (!groupIds.isEmpty()) {
                Map<Long, String> groupNameMap = teamGroupMapper.selectBatchIds(groupIds).stream()
                        .collect(Collectors.toMap(TeamGroup::getId, TeamGroup::getGroupName));
                for (Employee emp : records) {
                    emp.setGroupName(groupNameMap.get(emp.getGroupId()));
                }
            }
        }
        return result;
    }
}
