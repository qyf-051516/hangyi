package com.qyf.hangyi.compliance.service;

import java.util.List;
import java.util.Map;

public interface ComplianceService {
    Map<String, Object> preflightCheck(String scheduleDate, List<Map<String, Object>> edits);
}
