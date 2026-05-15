package com.qyf.hangyi.ai.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;

@FeignClient(name = "hangyi-flight", path = "/api/flights")
public interface FlightFeignClient {

    @GetMapping("/page")
    R<Map<String, Object>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String flightNo);
}
