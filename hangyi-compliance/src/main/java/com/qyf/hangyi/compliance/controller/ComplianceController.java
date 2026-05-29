package com.qyf.hangyi.compliance.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.compliance.service.ComplianceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/compliance")
public class ComplianceController {

    @Autowired
    private ComplianceService complianceService;

    @PostMapping("/preflight-check")
    public R<Map<String, Object>> preflightCheck(@RequestBody Map<String, Object> payload) {
        String scheduleDate = String.valueOf(payload.get("scheduleDate"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> edits = (List<Map<String, Object>>) payload.get("edits");
        return R.ok(complianceService.preflightCheck(scheduleDate, edits));
    }
}
