package com.qyf.hangyi.dashboard.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import java.util.Map;

@FeignClient(name = "hangyi-schedule", path = "/api/schedules")
public interface ScheduleFeignClient {
    @GetMapping("/stats/today")
    R<Map<String, Object>> getTodayStats();

    @GetMapping("/count")
    R<Long> getCount();
}
