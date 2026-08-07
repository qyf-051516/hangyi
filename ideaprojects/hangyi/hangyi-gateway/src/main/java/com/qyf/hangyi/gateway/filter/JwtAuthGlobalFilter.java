package com.qyf.hangyi.gateway.filter;

import com.qyf.hangyi.gateway.config.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

@Component
public class JwtAuthGlobalFilter implements GlobalFilter, Ordered {

    private static final List<String> WHITE_LIST = List.of(
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/wechat-login",
            "/api/auth/refresh",
            "/api/auth/verify",
            "/api/sync/",
            "/api/assistant/internal/",
            "/api/assistant/health",
            "/v3/api-docs",
            "/swagger-ui"
    );

    @Autowired
    private JwtUtil jwtUtil;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        if (WHITE_LIST.stream().anyMatch(entry -> path.equals(entry)
                || path.startsWith(entry.endsWith("/") ? entry : entry + "/"))) {
            return chain.filter(exchange);
        }

        String token = extractToken(exchange);
        if (token == null || !jwtUtil.isTokenValid(token)) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        return chain.filter(exchange);
    }

    private String extractToken(ServerWebExchange exchange) {
        HttpHeaders headers = exchange.getRequest().getHeaders();
        String authHeader = headers.getFirst("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        if (exchange.getRequest().getURI().getPath().startsWith("/api/schedules/export")) {
            return exchange.getRequest().getQueryParams().getFirst("token");
        }
        return null;
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
