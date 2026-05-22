package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.employee.entity.Employee;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class EmployeeServiceTest {

    @Autowired
    private EmployeeService employeeService;

    @Test
    void testListByGroup() {
        List<Employee> list = employeeService.lambdaQuery()
                .eq(Employee::getGroupId, 1L)
                .eq(Employee::getStatus, 1)
                .list();
        assertThat(list).hasSize(2);
    }

    @Test
    void testListAll() {
        List<Employee> list = employeeService.list();
        assertThat(list).hasSize(3);
    }

    @Test
    void testGetStats() {
        long total = employeeService.count();
        assertThat(total).isPositive();
    }

    @Test
    void testPageQuery() {
        Page<Employee> page = employeeService.pageQuery(1, 10, null, null);
        assertThat(page.getRecords()).isNotEmpty();
    }

    @Test
    void testPageQuery_WithNameFilter() {
        Page<Employee> page = employeeService.pageQuery(1, 10, "张三", null);
        assertThat(page.getRecords()).hasSize(1);
        assertThat(page.getRecords().get(0).getName()).isEqualTo("张三");
    }

    @Test
    void testPageQuery_WithGroupFilter() {
        Page<Employee> page = employeeService.pageQuery(1, 10, null, 1L);
        assertThat(page.getRecords()).hasSize(2);
    }

    @Test
    void testCreate() {
        Employee emp = new Employee();
        emp.setEmpNo("EMP004");
        emp.setName("赵六");
        emp.setGroupId(1L);
        emp.setPosition("机械师");
        emp.setStatus(1);
        employeeService.save(emp);
        assertThat(emp.getId()).isNotNull();
        assertThat(employeeService.count()).isEqualTo(4);
    }

    @Test
    void testDelete() {
        employeeService.removeById(1L);
        Employee emp = employeeService.getById(1L);
        assertThat(emp).isNull();
    }

    @Test
    void testGetById() {
        Employee emp = employeeService.getById(1L);
        assertThat(emp).isNotNull();
        assertThat(emp.getName()).isEqualTo("张三");
    }
}
