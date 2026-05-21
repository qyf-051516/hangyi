package com.qyf.hangyi.schedule.client;

import com.qyf.hangyi.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;

@FeignClient(name = "hangyi-flight", path = "/api/flights")
public interface FlightFeignClient {

    @GetMapping("/page")
    R<Map<String, Object>> page(
            @RequestParam("page") int page,
            @RequestParam("size") int size,
            @RequestParam(value = "date", required = false) String date);
}
