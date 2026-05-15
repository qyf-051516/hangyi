package com.qyf.hangyi.gateway.filter;

import com.qyf.hangyi.common.constant.AuthConstant;
import com.qyf.hangyi.gateway.config.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

@Component
public class JwtAuthGlobalFilter implements GlobalFilter, Ordered {

    private static final List<String> WHITE_LIST = List.of(
            "/api/auth/login",
            "/api/auth/register",
            "/v3/api-docs",
            "/swagger-ui"
    );

    @Autowired
    private JwtUtil jwtUtil;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        boolean isWhiteListed = WHITE_LIST.stream().anyMatch(path::startsWith);
        if (isWhiteListed) {
            return chain.filter(exchange);
        }

        // 从 /api/schedules/export 路径支持 URL 参数 token
        String token = null;
        HttpHeaders headers = exchange.getRequest().getHeaders();
        String authHeader = headers.getFirst(AuthConstant.AUTHORIZATION_HEADER);
        if (authHeader != null && authHeader.startsWith(AuthConstant.BEARER_PREFIX)) {
            token = authHeader.substring(7);
        }

        if (token == null && path.startsWith("/api/schedules/export")) {
            token = exchange.getRequest().getQueryParams().getFirst(AuthConstant.TOKEN_PARAM);
        }

        if (token == null || !jwtUtil.isTokenValid(token)) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        // 将用户信息传递到下游服务
        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .header(AuthConstant.X_USER_ID, jwtUtil.getUserId(token).toString())
                .header(AuthConstant.X_USER_ROLES, String.join(",", jwtUtil.getRoles(token)))
                .header(AuthConstant.X_USER_NAME, jwtUtil.getUsername(token))
                .build();

        return chain.filter(exchange.mutate().request(mutatedRequest).build());
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
