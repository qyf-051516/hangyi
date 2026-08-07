package com.qyf.hangyi.assistant;

import com.qyf.hangyi.assistant.config.AssistantProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication(
        scanBasePackages = "com.qyf.hangyi",
        exclude = UserDetailsServiceAutoConfiguration.class
)
@EnableConfigurationProperties(AssistantProperties.class)
public class AssistantApplication {

    public static void main(String[] args) {
        SpringApplication.run(AssistantApplication.class, args);
    }
}
