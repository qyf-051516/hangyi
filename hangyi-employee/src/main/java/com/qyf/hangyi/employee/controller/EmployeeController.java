package com.qyf.hangyi.employee.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.employee.entity.Employee;
import com.qyf.hangyi.employee.service.EmployeeService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/employees")
public class EmployeeController {

    @Autowired
    private EmployeeService employeeService;

    @GetMapping("/list-by-group")
    public R<List<Employee>> listByGroup(@RequestParam Long groupId) {
        return R.ok(employeeService.lambdaQuery()
                .eq(Employee::getGroupId, groupId)
                .eq(Employee::getStatus, 1)
                .list());
    }

    @GetMapping("/list-all")
    public R<List<Employee>> listAll() {
        return R.ok(employeeService.list());
    }

    @GetMapping("/count")
    public R<Long> getCount() {
        return R.ok(employeeService.lambdaQuery().eq(Employee::getStatus, 1).count());
    }

    @GetMapping("/stats")
    public R<Map<String, Object>> getStats() {
        long total = employeeService.count();
        long active = employeeService.lambdaQuery().eq(Employee::getStatus, 1).count();
        return R.ok(Map.of("totalEmployees", total, "activeEmployees", active));
    }

    @GetMapping("/page")
    public R<Page<Employee>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Long groupId) {
        return R.ok(employeeService.pageQuery(page, size, name, groupId));
    }

    @GetMapping("/{id}")
    public R<Employee> get(@PathVariable Long id) {
        return R.ok(employeeService.getById(id));
    }

    @PostMapping
    public R<Void> create(@Valid @RequestBody Employee employee) {
        employeeService.save(employee);
        return R.ok();
    }

    @PutMapping
    public R<Void> update(@RequestBody Employee employee) {
        employeeService.updateById(employee);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        employeeService.removeById(id);
        return R.ok();
    }
}
