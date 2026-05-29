package com.qyf.hangyi.auth.security;

import com.qyf.hangyi.common.config.HeaderSecurityContextRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class AuthSecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(context -> context
                    .securityContextRepository(new HeaderSecurityContextRepository())
                    .requireExplicitSave(true))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**", "/api/sync/**").permitAll()
                        .anyRequest().authenticated()
                );
        return http.build();
    }
}
