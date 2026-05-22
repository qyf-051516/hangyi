package com.qyf.hangyi.employee.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.employee.entity.EmployeePreference;
import com.qyf.hangyi.employee.service.EmployeePreferenceService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/preferences")
public class EmployeePreferenceController {

    @Autowired
    private EmployeePreferenceService preferenceService;

    @GetMapping("/employee/{employeeId}")
    public R<List<EmployeePreference>> listByEmployee(@PathVariable Long employeeId) {
        return R.ok(preferenceService.listByEmployee(employeeId));
    }

    @PostMapping
    public R<Void> create(@Valid @RequestBody EmployeePreference pref) {
        preferenceService.save(pref);
        return R.ok();
    }

    @PutMapping
    public R<Void> update(@RequestBody EmployeePreference pref) {
        preferenceService.updateById(pref);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        preferenceService.removeById(id);
        return R.ok();
    }
}
