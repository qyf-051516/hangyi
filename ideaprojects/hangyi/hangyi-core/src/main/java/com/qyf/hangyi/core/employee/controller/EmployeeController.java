package com.qyf.hangyi.core.employee.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.sync.GuochuangSyncClient;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.core.employee.entity.Employee;
import com.qyf.hangyi.core.employee.service.EmployeeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/employees")
@Validated
public class EmployeeController {

    @Autowired
    private EmployeeService employeeService;

    @Autowired
    private GuochuangSyncClient guochuangSyncClient;

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

    @GetMapping("/list-by-ids")
    public R<List<Employee>> listByIds(@RequestParam java.util.List<Long> ids) {
        if (ids == null || ids.isEmpty()) return R.ok(java.util.List.of());
        return R.ok(employeeService.listByIds(ids));
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
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size,
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
        guochuangSyncClient.enqueuePush("staff", Map.of(
            "employeeNo", employee.getEmpNo() != null ? employee.getEmpNo().toString() : "",
            "name", employee.getName() != null ? employee.getName() : "",
            "phone", employee.getPhone() != null ? employee.getPhone() : "",
            "active", employee.getStatus() != null && employee.getStatus() == 1,
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }

    @PutMapping
    public R<Void> update(@Valid @RequestBody Employee employee) {
        if (employee.getId() == null) {
            throw new BusinessException(400, "员工ID不能为空");
        }
        Employee existing = employeeService.getById(employee.getId());
        if (existing == null) {
            throw new BusinessException(404, "员工不存在");
        }
        if (isMasked(employee.getPhone())) {
            employee.setPhone(existing.getPhone());
        }
        if (isMasked(employee.getIdCard())) {
            employee.setIdCard(existing.getIdCard());
        }
        employeeService.updateById(employee);
        guochuangSyncClient.enqueuePush("staff", Map.of(
            "employeeNo", employee.getEmpNo() != null ? employee.getEmpNo().toString() : "",
            "name", employee.getName() != null ? employee.getName() : "",
            "phone", employee.getPhone() != null ? employee.getPhone() : "",
            "active", employee.getStatus() != null && employee.getStatus() == 1,
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }

    private boolean isMasked(String value) {
        return value != null && value.indexOf('*') >= 0;
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        employeeService.removeById(id);
        guochuangSyncClient.enqueuePush("staff", Map.of(
            "employeeNo", id.toString(),
            "active", false,
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }
}
