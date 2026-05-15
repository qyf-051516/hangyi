package com.qyf.hangyi.dashboard.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import java.util.Map;

@FeignClient(name = "hangyi-leave", path = "/api/leaves")
public interface LeaveFeignClient {
    @GetMapping("/stats/pending")
    R<Map<String, Object>> getPendingStats();
}
