package com.qyf.hangyi.ai.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

@FeignClient(name = "hangyi-employee", path = "/api/employees")
public interface EmployeeFeignClient {

    @GetMapping("/list-all")
    R<List<Map<String, Object>>> listAll();

    @GetMapping("/list-by-group")
    R<List<Map<String, Object>>> listByGroup(@RequestParam Long groupId);

    @GetMapping("/{id}")
    R<Map<String, Object>> get(@PathVariable Long id);
}
