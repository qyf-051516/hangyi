package com.qyf.hangyi.leave;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
public class HangyiLeaveApplication {
    public static void main(String[] args) {
        SpringApplication.run(HangyiLeaveApplication.class, args);
    }
}
