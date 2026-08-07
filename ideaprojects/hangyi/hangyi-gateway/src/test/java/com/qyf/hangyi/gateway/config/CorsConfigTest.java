package com.qyf.hangyi.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;

class CorsConfigTest {
    @Test
    void configuredOriginReceivesCredentialedCorsHeaders() {
        CorsConfig config = new CorsConfig();
        ReflectionTestUtils.setField(config, "allowedOrigins", " https://app.example.com, http://localhost:5173 , ");
        var filter = config.corsWebFilter();
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.options("https://api.example.com/api/test")
                .header(HttpHeaders.ORIGIN, "https://app.example.com")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, HttpMethod.GET.name()));
        filter.filter(exchange, ignored -> Mono.empty()).block();
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowOrigin()).isEqualTo("https://app.example.com");
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowCredentials()).isTrue();
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowMethods()).contains(HttpMethod.GET);
    }

    @Test
    void unknownOriginIsNotAllowed() {
        CorsConfig config = new CorsConfig();
        ReflectionTestUtils.setField(config, "allowedOrigins", "https://app.example.com");
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.options("https://api.example.com/api/test")
                .header(HttpHeaders.ORIGIN, "https://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, HttpMethod.GET.name()));
        config.corsWebFilter().filter(exchange, ignored -> Mono.empty()).block();
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowOrigin()).isNull();
    }

    @Test
    void blankConfigurationFailsClosed() {
        CorsConfig config = new CorsConfig();
        ReflectionTestUtils.setField(config, "allowedOrigins", "  , ");
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.options("https://api.example.com/api/test")
                .header(HttpHeaders.ORIGIN, "https://app.example.com")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, HttpMethod.GET.name()));
        config.corsWebFilter().filter(exchange, ignored -> Mono.empty()).block();
        assertThat(exchange.getResponse().getHeaders().getAccessControlAllowOrigin()).isNull();
    }
}
