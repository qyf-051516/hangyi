package com.qyf.hangyi.employee;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
@EnableDiscoveryClient
public class HangyiEmployeeApplication {
    public static void main(String[] args) {
        SpringApplication.run(HangyiEmployeeApplication.class, args);
    }
}
