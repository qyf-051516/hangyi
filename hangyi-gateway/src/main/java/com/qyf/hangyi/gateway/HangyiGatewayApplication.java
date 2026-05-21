package com.qyf.hangyi.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
@EnableDiscoveryClient
public class HangyiGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(HangyiGatewayApplication.class, args);
    }
}
