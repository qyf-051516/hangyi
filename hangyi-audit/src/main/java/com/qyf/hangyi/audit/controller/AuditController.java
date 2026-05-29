package com.qyf.hangyi.audit.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.audit.entity.OperationLog;
import com.qyf.hangyi.audit.service.OperationLogService;
import com.qyf.hangyi.common.result.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    @Autowired
    private OperationLogService service;

    @GetMapping("/logs")
    public R<Page<OperationLog>> queryLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return R.ok(service.query(page, size, action, startDate, endDate));
    }

    @GetMapping("/logs/export")
    public ResponseEntity<byte[]> exportLogs(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        String csv = service.exportCsv(action, startDate, endDate);
        byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=audit_logs.csv")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }
}
