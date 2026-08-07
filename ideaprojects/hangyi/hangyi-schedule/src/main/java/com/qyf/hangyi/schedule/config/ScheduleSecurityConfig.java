package com.qyf.hangyi.schedule.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class ScheduleSecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                    ScheduleJwtAuthFilter jwtAuthFilter) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                .requestMatchers("/actuator/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers("/api/schedules/export/**").hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER", "ROLE_BOSS")
                .requestMatchers(HttpMethod.POST, "/api/schedules/auto", "/api/schedules/smart",
                    "/api/schedules/smart-multi-day", "/api/schedules/smart-roles")
                    .hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER")
                .requestMatchers(HttpMethod.POST, "/api/service-schedules/publish")
                    .hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER")
                // 全员排班、甘特图和勤务表包含同事身份、航班及资质信息；STAFF
                // 的个人排班应通过小程序个人入口读取，不能从 Java 管理端枚举全员。
                .requestMatchers(HttpMethod.GET, "/api/schedules/**", "/api/service-schedules/**")
                    .hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER", "ROLE_BOSS")
                .requestMatchers(HttpMethod.POST, "/api/swap/**").authenticated()
                .requestMatchers(HttpMethod.PUT, "/api/swap/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/shifts/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/shifts/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/shifts/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/schedule-changes/*/approve")
                    .hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER")
                .requestMatchers(HttpMethod.POST, "/api/schedules/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/schedules/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/schedules/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                .anyRequest().authenticated());
        return http.build();
    }
}
