package com.qyf.hangyi.employee.mapper;

import com.qyf.hangyi.employee.entity.Employee;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class EmployeeMapperTest {

    @Autowired
    private EmployeeMapper employeeMapper;

    @Test
    void testSelectById() {
        Employee emp = employeeMapper.selectById(1L);
        assertThat(emp).isNotNull();
        assertThat(emp.getName()).isEqualTo("张三");
        assertThat(emp.getEmpNo()).isEqualTo("EMP001");
    }

    @Test
    void testListByGroup() {
        List<Employee> list = employeeMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Employee>()
                        .eq(Employee::getGroupId, 1L)
                        .eq(Employee::getStatus, 1));
        assertThat(list).hasSize(2);
    }

    @Test
    void testCount() {
        Long count = employeeMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Employee>()
                        .eq(Employee::getStatus, 1));
        assertThat(count).isEqualTo(3);
    }
}
