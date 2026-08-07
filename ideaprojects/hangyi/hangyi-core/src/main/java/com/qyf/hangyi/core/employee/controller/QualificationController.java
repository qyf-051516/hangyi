package com.qyf.hangyi.core.employee.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.core.employee.entity.EmployeeQualification;
import com.qyf.hangyi.core.employee.service.QualificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/qualifications")
@Validated
public class QualificationController {

    @Autowired
    private QualificationService qualificationService;

    @GetMapping("/page")
    public R<Page<EmployeeQualification>> page(
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size,
            @RequestParam(required = false) Long employeeId) {
        return R.ok(qualificationService.pageQuery(page, size, employeeId, null));
    }

    @GetMapping("/employee/{employeeId}")
    public R<List<EmployeeQualification>> listByEmployee(@PathVariable Long employeeId) {
        return R.ok(qualificationService.listByEmployee(employeeId));
    }

    @PostMapping("/employee/batch")
    public R<Map<Long, List<EmployeeQualification>>> listByEmployees(@RequestBody List<Long> employeeIds) {
        if (employeeIds == null || employeeIds.isEmpty()) return R.ok(Map.of());
        List<EmployeeQualification> all = qualificationService.lambdaQuery()
                .in(EmployeeQualification::getEmployeeId, employeeIds)
                .list();
        return R.ok(all.stream().collect(java.util.stream.Collectors.groupingBy(
                EmployeeQualification::getEmployeeId)));
    }

    @GetMapping("/expiring")
    public R<Map<String, Object>> expiring() {
        List<EmployeeQualification> expiringSoon = qualificationService.listExpiringSoon(30);
        List<EmployeeQualification> expired = qualificationService.listExpired();
        long totalCount = qualificationService.count();
        long expiredCount = qualificationService.lambdaQuery()
                .lt(EmployeeQualification::getExpireDate, java.time.LocalDate.now())
                .count();
        long expiringCount = qualificationService.listExpiringSoon(30).size();
        long validCount = totalCount - expiringCount - expiredCount;
        return R.ok(Map.of(
                "expiringSoon", expiringSoon,
                "expired", expired,
                "totalCount", (int) totalCount,
                "validCount", (int) validCount,
                "expiringCount", (int) expiringCount,
                "expiredCount", (int) expiredCount
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
