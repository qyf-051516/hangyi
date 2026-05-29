package com.qyf.hangyi.compliance;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
public class ComplianceApplication {
    public static void main(String[] args) {
        SpringApplication.run(ComplianceApplication.class, args);
    }
}
