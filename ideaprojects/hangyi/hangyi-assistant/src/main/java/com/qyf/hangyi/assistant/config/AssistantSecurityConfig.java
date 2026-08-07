package com.qyf.hangyi.assistant.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class AssistantSecurityConfig {

    @Bean
    public SecurityFilterChain assistantSecurityFilterChain(
            HttpSecurity http,
            AssistantJwtAuthFilter jwtAuthFilter,
            InternalApiKeyFilter internalApiKeyFilter
    ) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(internalApiKeyFilter, AssistantJwtAuthFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/actuator/health",
                                "/actuator/info",
                                "/api/assistant/health",
                                "/api/assistant/internal/**"
                        ).permitAll()
                        .anyRequest().authenticated());
        return http.build();
    }
}
