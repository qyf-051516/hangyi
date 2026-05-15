package com.qyf.hangyi.ai.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;
import java.util.Map;

@FeignClient(name = "hangyi-employee", contextId = "preferenceFeignClient", path = "/api/preferences")
public interface PreferenceFeignClient {

    @GetMapping("/employee/{employeeId}")
    R<List<Map<String, Object>>> listByEmployee(@PathVariable Long employeeId);
}
