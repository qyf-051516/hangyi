package com.qyf.hangyi.assistant.service;

import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AssistantRateLimiterTest {

    private StringRedisTemplate redisTemplate;
    private AssistantProperties properties;
    private AssistantRateLimiter rateLimiter;
    private AssistantIdentity employee;

    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        properties = new AssistantProperties();
        properties.setEmployeeMinuteLimit(10);
        properties.setRateLimitWindow(Duration.ofMinutes(1));
        rateLimiter = new AssistantRateLimiter(redisTemplate, properties);
        employee = new AssistantIdentity("MINIPROGRAM", "openid-1", "GH001", "张伟", false);
    }

    @Test
    void allowsRequestsInsideConfiguredWindow() {
        when(redisTemplate.execute(any(), anyList(), eq("60000"))).thenReturn(10L);

        assertDoesNotThrow(() -> rateLimiter.check(employee));
    }

    @Test
    void rejectsRequestsOverLimit() {
        when(redisTemplate.execute(any(), anyList(), eq("60000"))).thenReturn(11L);

        BusinessException error = assertThrows(BusinessException.class, () -> rateLimiter.check(employee));

        assertEquals(429, error.getCode());
    }

    @Test
    void failsClosedWhenRedisIsUnavailable() {
        when(redisTemplate.execute(any(), anyList(), eq("60000")))
                .thenThrow(new DataAccessResourceFailureException("redis unavailable"));

        BusinessException error = assertThrows(BusinessException.class, () -> rateLimiter.check(employee));

        assertEquals(503, error.getCode());
    }
}
