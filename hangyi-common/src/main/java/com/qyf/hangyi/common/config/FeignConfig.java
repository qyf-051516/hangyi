package com.qyf.hangyi.common.config;

import com.qyf.hangyi.common.constant.AuthConstant;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.stream.Collectors;

/**
 * Feign 请求拦截器：将当前用户上下文传递到下游微服务。
 *
 * 从 SecurityContextHolder 获取当前认证信息，设置 X-User-Id / X-User-Roles / X-User-Name 请求头，
 * 使下游服务能通过 HeaderSecurityContextRepository 重建 SecurityContext。
 */
@Configuration
@ConditionalOnClass(RequestInterceptor.class)
public class FeignConfig {

    @Bean
    public RequestInterceptor userContextInterceptor() {
        return (RequestTemplate request) -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && auth.getPrincipal() != null) {
                String userId = auth.getName();
                if (userId != null && !userId.isEmpty()) {
                    request.header(AuthConstant.X_USER_ID, userId);
                }

                String roles = auth.getAuthorities().stream()
                        .map(GrantedAuthority::getAuthority)
                        .map(r -> r.startsWith("ROLE_") ? r.substring(5) : r)
                        .collect(Collectors.joining(","));
                if (!roles.isEmpty()) {
                    request.header(AuthConstant.X_USER_ROLES, roles);
                }

                Object details = auth.getDetails();
                if (details instanceof String) {
                    request.header(AuthConstant.X_USER_NAME, (String) details);
                }
            }
        };
    }
}
