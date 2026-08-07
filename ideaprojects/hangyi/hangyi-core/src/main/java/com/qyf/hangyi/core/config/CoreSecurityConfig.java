package com.qyf.hangyi.core.config;

import com.qyf.hangyi.core.auth.security.JwtUtil;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class CoreSecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public JwtAuthFilter jwtAuthFilter(JwtUtil jwtUtil) {
        return new JwtAuthFilter(jwtUtil);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                    JwtAuthFilter jwtAuthFilter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .authorizeHttpRequests(auth -> auth
                // === 公开端点 ===
                .requestMatchers("/api/auth/login", "/api/auth/register",
                    "/api/auth/wechat-login", "/api/auth/refresh",
                    "/api/auth/verify").permitAll()
                .requestMatchers("/api/sync/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()

                // === 审计日志 ADMIN-only ===
                .requestMatchers("/api/audit/**").hasAuthority("ROLE_ADMIN")

                // === Employee PII 保护 ===
                .requestMatchers(HttpMethod.GET,
                    "/api/employees/page",
                    "/api/employees/list-all",
                    "/api/employees/list-by-group",
                    "/api/employees/{id}",
                    "/api/employees/list-by-ids",
                    "/api/employees/count",
                    "/api/employees/stats",
                    "/api/qualifications/page",
                    "/api/leaves/page"
                ).hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER", "ROLE_BOSS")

                // === Employee 字典类 GET 需登录 ===
                .requestMatchers(HttpMethod.GET,
                    "/api/groups/list",
                    "/api/qualifications/employee/**",
                    "/api/qualifications/expiring",
                    "/api/qualifications/employee/batch",
                    "/api/aircraft-types/list**",
                    "/api/preferences/employee/**",
                    "/api/leaves/stats/pending"
                ).authenticated()

                // === Employee 写操作 ADMIN-only ===
                .requestMatchers(HttpMethod.POST, "/api/leaves").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/employees/**",
                    "/api/groups/**", "/api/qualifications/**",
                    "/api/aircraft-types/**", "/api/preferences/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/leaves/*/withdraw").authenticated()
                .requestMatchers(HttpMethod.PUT, "/api/leaves/*/approve")
                    .hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER")
                .requestMatchers(HttpMethod.PUT, "/api/employees/**",
                    "/api/groups/**", "/api/qualifications/**",
                    "/api/aircraft-types/**", "/api/preferences/**",
                    "/api/leaves/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/employees/**",
                    "/api/groups/**", "/api/qualifications/**",
                    "/api/aircraft-types/**", "/api/preferences/**").hasAuthority("ROLE_ADMIN")

                // === Flight / Statistics / Users / Reports GET ===
                .requestMatchers(HttpMethod.GET, "/api/flights/**",
                    "/api/statistics/**", "/api/dashboard/**",
                    "/api/users/**", "/api/reports/**").authenticated()

                // === Flight / Statistics / Users 写操作 ===
                .requestMatchers(HttpMethod.POST, "/api/flights/**",
                    "/api/statistics/**", "/api/users/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/flights/**",
                    "/api/statistics/**", "/api/users/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/flights/**",
                    "/api/users/**").hasAuthority("ROLE_ADMIN")

                // === 其余 API ===
                .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                .anyRequest().authenticated()
            );
        return http.build();
    }
}
