package com.qyf.hangyi.employee.config;

import com.qyf.hangyi.common.config.HeaderSecurityContextRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class EmployeeSecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .securityContext(context -> context
                .securityContextRepository(new HeaderSecurityContextRepository())
                .requireExplicitSave(true))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET,
                    "/api/employees/list-all",
                    "/api/employees/list-by-group",
                    "/api/employees/{id}",
                    "/api/employees/count",
                    "/api/employees/stats",
                    "/api/groups/list",
                    "/api/qualifications/**",
                    "/api/aircraft-types/list**",
                    "/api/preferences/**"
                ).permitAll()
                .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/**").hasAuthority("ROLE_ADMIN")
                .anyRequest().authenticated());
        return http.build();
    }
}
