package com.qyf.hangyi.schedule.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

@FeignClient(name = "hangyi-employee", path = "/api/employees")
public interface EmployeeFeignClient {

    @GetMapping("/list-by-group")
    R<List<Map<String, Object>>> getEmployeesByGroup(@RequestParam("groupId") Long groupId);

    @GetMapping("/list-all")
    R<List<Map<String, Object>>> listAll();
}
