package com.qyf.hangyi.gateway.filter;

import com.qyf.hangyi.common.constant.AuthConstant;
import com.qyf.hangyi.gateway.config.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JwtAuthGlobalFilterTest {

    private JwtUtil jwtUtil;
    private JwtAuthGlobalFilter filter;
    private GatewayFilterChain chain;

    @BeforeEach
    void setUp() {
        jwtUtil = mock(JwtUtil.class);
        filter = new JwtAuthGlobalFilter();
        try {
            var field = JwtAuthGlobalFilter.class.getDeclaredField("jwtUtil");
            field.setAccessible(true);
            field.set(filter, jwtUtil);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());
    }

    @Test
    void permitAll_loginPath_shouldPassWithoutToken() {
        ServerWebExchange exchange = createExchange("/api/auth/login", null);
        filter.filter(exchange, chain).block();
        verify(chain).filter(exchange);
    }

    @Test
    void permitAll_swaggerPath_shouldPassWithoutToken() {
        ServerWebExchange exchange = createExchange("/v3/api-docs/test", null);
        filter.filter(exchange, chain).block();
        verify(chain).filter(exchange);
    }

    @Test
    void missingToken_shouldReturn401() {
        ServerHttpResponse response = mock(ServerHttpResponse.class);
        when(response.setComplete()).thenReturn(Mono.empty());
        ServerWebExchange exchange = createExchange("/api/test", null, response);

        filter.filter(exchange, chain).block();
        verify(response).setStatusCode(HttpStatus.UNAUTHORIZED);
        verify(response).setComplete();
    }

    @Test
    void invalidToken_shouldReturn401() {
        when(jwtUtil.isTokenValid("invalid-token")).thenReturn(false);
        ServerHttpResponse response = mock(ServerHttpResponse.class);
        when(response.setComplete()).thenReturn(Mono.empty());
        ServerWebExchange exchange = createExchange("/api/test", "Bearer invalid-token", response);

        filter.filter(exchange, chain).block();
        verify(response).setStatusCode(HttpStatus.UNAUTHORIZED);
        verify(response).setComplete();
    }

    @Test
    void validToken_shouldPass() {
        when(jwtUtil.isTokenValid("valid-token")).thenReturn(true);
        when(jwtUtil.getUserId("valid-token")).thenReturn(1L);
        when(jwtUtil.getRoles("valid-token")).thenReturn(List.of("ADMIN"));
        when(jwtUtil.getUsername("valid-token")).thenReturn("admin");

        ServerWebExchange exchange = createExchange("/api/test", "Bearer valid-token");
        // Mock request.mutate() chain for header injection
        ServerHttpRequest.Builder reqBuilder = mock(ServerHttpRequest.Builder.class);
        when(reqBuilder.header(any(), any())).thenReturn(reqBuilder);
        when(reqBuilder.build()).thenReturn(mock(ServerHttpRequest.class));
        when(exchange.getRequest().mutate()).thenReturn(reqBuilder);
        // Mock exchange.mutate() chain
        ServerWebExchange.Builder exchangeBuilder = mock(ServerWebExchange.Builder.class);
        when(exchangeBuilder.request(any(ServerHttpRequest.class))).thenReturn(exchangeBuilder);
        when(exchangeBuilder.build()).thenReturn(mock(ServerWebExchange.class));
        when(exchange.mutate()).thenReturn(exchangeBuilder);

        filter.filter(exchange, chain).block();
        verify(chain).filter(any());
    }

    private ServerWebExchange createExchange(String path, String authHeader) {
        return createExchange(path, authHeader, mock(ServerHttpResponse.class));
    }

    private ServerWebExchange createExchange(String path, String authHeader, ServerHttpResponse response) {
        ServerHttpRequest request = mock(ServerHttpRequest.class);
        when(request.getURI()).thenReturn(URI.create(path));

        HttpHeaders headers = new HttpHeaders();
        if (authHeader != null) {
            headers.add(AuthConstant.AUTHORIZATION_HEADER, authHeader);
        }
        when(request.getHeaders()).thenReturn(headers);

        ServerWebExchange exchange = mock(ServerWebExchange.class);
        when(exchange.getRequest()).thenReturn(request);
        when(exchange.getResponse()).thenReturn(response);
        return exchange;
    }
}
