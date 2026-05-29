package com.qyf.hangyi.swap;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
@MapperScan("com.qyf.hangyi.swap.mapper")
public class SwapApplication {
    public static void main(String[] args) {
        SpringApplication.run(SwapApplication.class, args);
    }
}
