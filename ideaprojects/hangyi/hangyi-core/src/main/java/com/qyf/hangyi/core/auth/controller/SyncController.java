package com.qyf.hangyi.core.auth.controller;

import com.qyf.hangyi.core.auth.service.SyncService;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private static final int MAX_RECORDS_PER_COLLECTION = 500;
    private static final int MAX_BATCH_RECORDS = 1_000;
    private static final Set<String> BATCH_COLLECTIONS = Set.of(
            "staff", "flights", "schedules", "swap_requests", "swap-requests",
            "leave_requests", "leave-requests", "operation_logs", "operation-logs");

    @Autowired
    private SyncService syncService;

    @Value("${internal.api-key}")
    private String internalApiKey;

    private boolean checkApiKey(HttpServletRequest request) {
        String apiKey = request.getHeader("X-Internal-API-Key");
        if (internalApiKey == null || internalApiKey.isBlank() || apiKey == null) return false;
        // 恒定时间比较,防时序侧信道(security_review low)
        return MessageDigest.isEqual(
                internalApiKey.getBytes(StandardCharsets.UTF_8),
                apiKey.getBytes(StandardCharsets.UTF_8));
    }

    private void requireApiKey(HttpServletRequest request) {
        if (!checkApiKey(request)) {
            throw new BusinessException(403, "无权访问");
        }
    }

    @PostMapping("/staff")
    public R<Map<String, Object>> syncStaff(@RequestBody List<Map<String, Object>> records,
                                             HttpServletRequest request) {
        requireApiKey(request);
        int count = syncService.syncStaff(requireRecords(records, "staff"));
        return R.ok(Map.of("count", count, "collection", "staff"));
    }

    @PostMapping("/flights")
    public R<Map<String, Object>> syncFlights(@RequestBody List<Map<String, Object>> records,
                                               HttpServletRequest request) {
        requireApiKey(request);
        int count = syncService.syncFlights(requireRecords(records, "flights"));
        return R.ok(Map.of("count", count, "collection", "flights"));
    }

    @PostMapping("/schedules")
    public R<Map<String, Object>> syncSchedules(@RequestBody List<Map<String, Object>> records,
                                                 HttpServletRequest request) {
        requireApiKey(request);
        int count = syncService.syncSchedules(requireRecords(records, "schedules"));
        return R.ok(Map.of("count", count, "collection", "schedules"));
    }

    @PostMapping({"/swap-requests", "/swap_requests"})
    public R<Map<String, Object>> syncSwapRequests(@RequestBody List<Map<String, Object>> records,
                                                    HttpServletRequest request) {
        requireApiKey(request);
        int count = syncService.syncSwapRequests(requireRecords(records, "swap_requests"));
        return R.ok(Map.of("count", count, "collection", "swap_requests"));
    }

    @PostMapping({"/leave-requests", "/leave_requests"})
    public R<Map<String, Object>> syncLeaveRequests(@RequestBody List<Map<String, Object>> records,
                                                     HttpServletRequest request) {
        requireApiKey(request);
        int count = syncService.syncLeaveRequests(requireRecords(records, "leave_requests"));
        return R.ok(Map.of("count", count, "collection", "leave_requests"));
    }

    @PostMapping({"/operation-logs", "/operation_logs"})
    public R<Map<String, Object>> syncOperationLogs(@RequestBody List<Map<String, Object>> records,
                                                     HttpServletRequest request) {
        requireApiKey(request);
        int count = syncService.syncOperationLogs(requireRecords(records, "operation_logs"));
        return R.ok(Map.of("count", count, "collection", "operation_logs"));
    }

    @GetMapping("/employee/{empNo}")
    public R<Map<String, Object>> getEmployee(@PathVariable String empNo,
                                               HttpServletRequest request) {
        requireApiKey(request);
        if (empNo == null || !empNo.matches("[A-Za-z0-9_-]{1,50}")) {
            throw new BusinessException(400, "员工工号格式无效");
        }
        Map<String, Object> emp = syncService.findEmployeeByEmpNo(empNo);
        return emp != null ? R.ok(emp) : R.fail(404, "员工不存在");
    }

    @PostMapping("/batch")
    public R<Map<String, Object>> syncBatch(@RequestBody Map<String, List<Map<String, Object>>> payload,
                                             HttpServletRequest request) {
        requireApiKey(request);
        if (payload == null || payload.isEmpty()) {
            throw new BusinessException(400, "同步批次不能为空");
        }
        if (!BATCH_COLLECTIONS.containsAll(payload.keySet())) {
            throw new BusinessException(400, "同步批次包含不支持的集合");
        }
        if ((payload.containsKey("swap_requests") && payload.containsKey("swap-requests"))
                || (payload.containsKey("leave_requests") && payload.containsKey("leave-requests"))
                || (payload.containsKey("operation_logs") && payload.containsKey("operation-logs"))) {
            throw new BusinessException(400, "同一集合不能同时使用新旧同步路径");
        }
        Map<String, List<Map<String, Object>>> checked = new LinkedHashMap<>();
        int totalRecords = 0;
        for (Map.Entry<String, List<Map<String, Object>>> entry : payload.entrySet()) {
            List<Map<String, Object>> records = requireRecords(entry.getValue(), entry.getKey());
            checked.put(entry.getKey(), records);
            totalRecords += records.size();
            if (totalRecords > MAX_BATCH_RECORDS) {
                throw new BusinessException(413, "同步批次记录数超过上限");
            }
        }
        int total = syncService.syncBatch(checked);
        return R.ok(Map.of("totalCount", total));
    }

    private List<Map<String, Object>> requireRecords(List<Map<String, Object>> records, String collection) {
        if (records == null || records.isEmpty()) {
            throw new BusinessException(400, collection + "同步记录不能为空");
        }
        if (records.size() > MAX_RECORDS_PER_COLLECTION) {
            throw new BusinessException(413, collection + "单次同步记录数超过上限");
        }
        for (Map<String, Object> record : records) {
            if (record == null) {
                throw new BusinessException(400, collection + "同步记录格式无效");
            }
        }
        return records;
    }
}
