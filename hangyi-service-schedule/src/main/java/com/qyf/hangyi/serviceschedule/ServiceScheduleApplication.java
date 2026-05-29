package com.qyf.hangyi.serviceschedule;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
@MapperScan({"com.qyf.hangyi.serviceschedule.mapper", "com.qyf.hangyi.schedule.mapper"})
public class ServiceScheduleApplication {
    public static void main(String[] args) {
        SpringApplication.run(ServiceScheduleApplication.class, args);
    }
}
