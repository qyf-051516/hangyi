package com.qyf.hangyi.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
public class HangyiAuthApplication {
    public static void main(String[] args) {
        SpringApplication.run(HangyiAuthApplication.class, args);
    }
}
