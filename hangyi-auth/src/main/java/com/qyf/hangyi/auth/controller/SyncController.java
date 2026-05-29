package com.qyf.hangyi.auth.controller;

import com.qyf.hangyi.auth.service.SyncService;
import com.qyf.hangyi.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    @Autowired
    private SyncService syncService;

    @Value("${internal.api-key:}")
    private String internalApiKey;

    private boolean checkApiKey(HttpServletRequest request) {
        if (internalApiKey == null || internalApiKey.isBlank()) return true;
        String apiKey = request.getHeader("X-Internal-API-Key");
        return internalApiKey.equals(apiKey);
    }

    @PostMapping("/staff")
    public R<Map<String, Object>> syncStaff(@RequestBody List<Map<String, Object>> records,
                                             HttpServletRequest request) {
        if (!checkApiKey(request)) return R.forbidden("无权访问");
        int count = syncService.syncStaff(records);
        return R.ok(Map.of("count", count, "collection", "staff"));
    }

    @PostMapping("/flights")
    public R<Map<String, Object>> syncFlights(@RequestBody List<Map<String, Object>> records,
                                               HttpServletRequest request) {
        if (!checkApiKey(request)) return R.forbidden("无权访问");
        int count = syncService.syncFlights(records);
        return R.ok(Map.of("count", count, "collection", "flights"));
    }

    @PostMapping("/schedules")
    public R<Map<String, Object>> syncSchedules(@RequestBody List<Map<String, Object>> records,
                                                 HttpServletRequest request) {
        if (!checkApiKey(request)) return R.forbidden("无权访问");
        int count = syncService.syncSchedules(records);
        return R.ok(Map.of("count", count, "collection", "schedules"));
    }

    @PostMapping({"/swap-requests", "/swap_requests"})
    public R<Map<String, Object>> syncSwapRequests(@RequestBody List<Map<String, Object>> records,
                                                    HttpServletRequest request) {
        if (!checkApiKey(request)) return R.forbidden("无权访问");
        int count = syncService.syncSwapRequests(records);
        return R.ok(Map.of("count", count, "collection", "swap_requests"));
    }

    @PostMapping("/batch")
    public R<Map<String, Object>> syncBatch(@RequestBody Map<String, List<Map<String, Object>>> payload,
                                             HttpServletRequest request) {
        if (!checkApiKey(request)) return R.forbidden("无权访问");
        int total = 0;
        if (payload.containsKey("staff")) total += syncService.syncStaff(payload.get("staff"));
        if (payload.containsKey("flights")) total += syncService.syncFlights(payload.get("flights"));
        if (payload.containsKey("schedules")) total += syncService.syncSchedules(payload.get("schedules"));
        if (payload.containsKey("swap_requests")) total += syncService.syncSwapRequests(payload.get("swap_requests"));
        return R.ok(Map.of("totalCount", total));
    }
}
