package com.qyf.hangyi.employee.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.employee.entity.EmployeeQualification;
import com.qyf.hangyi.employee.service.QualificationService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/qualifications")
public class QualificationController {

    @Autowired
    private QualificationService qualificationService;

    @GetMapping("/page")
    public R<Page<EmployeeQualification>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long employeeId) {
        return R.ok(qualificationService.pageQuery(page, size, employeeId, null));
    }

    @GetMapping("/employee/{employeeId}")
    public R<List<EmployeeQualification>> listByEmployee(@PathVariable Long employeeId) {
        return R.ok(qualificationService.listByEmployee(employeeId));
    }

    @GetMapping("/expiring")
    public R<Map<String, Object>> expiring() {
        List<EmployeeQualification> expiringSoon = qualificationService.listExpiringSoon(30);
        List<EmployeeQualification> expired = qualificationService.listExpired();
        return R.ok(Map.of(
                "expiringSoon", expiringSoon,
                "expired", expired,
                "expiringCount", expiringSoon.size(),
                "expiredCount", expired.size()
        ));
    }

    @PostMapping
    public R<Void> create(@Valid @RequestBody EmployeeQualification qual) {
        if (qual.getExpireDate() != null && qual.getExpireDate().isBefore(java.time.LocalDate.now())) {
            qual.setStatus(0);
        }
        qualificationService.save(qual);
        return R.ok();
    }

    @PutMapping
    public R<Void> update(@RequestBody EmployeeQualification qual) {
        if (qual.getExpireDate() != null && qual.getExpireDate().isBefore(java.time.LocalDate.now())) {
            qual.setStatus(0);
        }
        qualificationService.updateById(qual);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        qualificationService.removeById(id);
        return R.ok();
    }
}
