package com.qyf.hangyi.common.config;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class MyBatisPlusAutoConfiguration {

    @Bean
    public MyMetaObjectHandler myMetaObjectHandler() {
        return new MyMetaObjectHandler();
    }
}
