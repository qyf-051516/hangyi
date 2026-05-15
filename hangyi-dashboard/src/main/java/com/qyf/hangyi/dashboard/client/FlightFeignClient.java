package com.qyf.hangyi.dashboard.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import java.util.Map;

@FeignClient(name = "hangyi-flight", path = "/api/flights")
public interface FlightFeignClient {
    @GetMapping("/stats/today")
    R<Map<String, Object>> getTodayStats();
}
