package com.qyf.hangyi.schedule;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
@EnableDiscoveryClient
@EnableFeignClients
public class HangyiScheduleApplication {
    public static void main(String[] args) {
        SpringApplication.run(HangyiScheduleApplication.class, args);
    }
}
