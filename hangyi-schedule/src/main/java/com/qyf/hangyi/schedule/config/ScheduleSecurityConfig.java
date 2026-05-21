package com.qyf.hangyi.schedule.config;

import com.qyf.hangyi.common.config.HeaderSecurityContextRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class ScheduleSecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .securityContext(context -> context
                .securityContextRepository(new HeaderSecurityContextRepository())
                .requireExplicitSave(true))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/schedules/export/**").permitAll()
                .requestMatchers(HttpMethod.GET,
                    "/api/schedules/page",
                    "/api/schedules/*/details",
                    "/api/schedules/by-date",
                    "/api/schedules/gantt",
                    "/api/schedules/count",
                    "/api/schedules/stats/**",
                    "/api/shifts/**"
                ).permitAll()
                .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/schedules/auto", "/api/schedules/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/**").hasAuthority("ROLE_ADMIN")
                .anyRequest().authenticated());
        return http.build();
    }
}
