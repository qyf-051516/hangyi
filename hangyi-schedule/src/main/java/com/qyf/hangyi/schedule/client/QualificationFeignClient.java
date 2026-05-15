package com.qyf.hangyi.schedule.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;
import java.util.Map;

@FeignClient(name = "hangyi-qualification", path = "/api/qualifications")
public interface QualificationFeignClient {

    @GetMapping("/employee/{employeeId}")
    R<List<Map<String, Object>>> listByEmployee(@PathVariable("employeeId") Long employeeId);
}
