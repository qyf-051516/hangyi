package com.qyf.hangyi.ai.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

@FeignClient(name = "hangyi-schedule", path = "/api/schedules")
public interface ScheduleFeignClient {

    @GetMapping("/page")
    R<Map<String, Object>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Integer status);

    @GetMapping("/{id}/details")
    R<List<Map<String, Object>>> details(@PathVariable Long id);

    @GetMapping("/by-date")
    R<List<Map<String, Object>>> byDate(
            @RequestParam String date,
            @RequestParam(required = false) Long groupId);
}
