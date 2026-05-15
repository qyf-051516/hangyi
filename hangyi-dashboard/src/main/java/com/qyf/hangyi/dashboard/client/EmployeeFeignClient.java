package com.qyf.hangyi.dashboard.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import java.util.Map;

@FeignClient(name = "hangyi-employee", path = "/api/employees")
public interface EmployeeFeignClient {
    @GetMapping("/stats")
    R<Map<String, Object>> getStats();

    @GetMapping("/count")
    R<Long> getCount();
}
