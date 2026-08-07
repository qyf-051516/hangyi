package com.qyf.hangyi.core.auth.security;

import com.qyf.hangyi.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JwtUtilTest {

    private JwtUtil jwtUtil;
    private StringRedisTemplate redisTemplate;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        redisTemplate = mock(StringRedisTemplate.class);
        ReflectionTestUtils.setField(jwtUtil, "secret",
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
        ReflectionTestUtils.setField(jwtUtil, "expiration", 60_000L);
        ReflectionTestUtils.setField(jwtUtil, "redisTemplate", redisTemplate);
        when(redisTemplate.hasKey(anyString())).thenReturn(false);
    }

    @Test
    void accessAndRefreshTokensCannotBeUsedInterchangeably() {
        String access = jwtUtil.generateToken(1L, "admin", List.of("ADMIN"));
        String refresh = jwtUtil.generateRefreshToken(1L, "admin", List.of("ADMIN"));

        assertThat(jwtUtil.isTokenValid(access)).isTrue();
        assertThat(jwtUtil.isRefreshTokenValid(access)).isFalse();
        assertThat(jwtUtil.isRefreshTokenValid(refresh)).isTrue();
        assertThat(jwtUtil.isTokenValid(refresh)).isFalse();
    }

    @Test
    void blacklistRejectsAnOtherwiseValidToken() {
        String access = jwtUtil.generateToken(1L, "admin", List.of("ADMIN"));
        when(redisTemplate.hasKey(anyString())).thenReturn(true);

        assertThat(jwtUtil.isTokenValid(access)).isFalse();
    }

    @Test
    void validationFailsClosedWhenRedisIsUnavailable() {
        String access = jwtUtil.generateToken(1L, "admin", List.of("ADMIN"));
        ReflectionTestUtils.setField(jwtUtil, "redisTemplate", null);

        assertThat(jwtUtil.isTokenValid(access)).isFalse();
    }

    @Test
    void revocationPersistsJtiAndFailsIfRedisCannotBeUsed() {
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(values);
        String access = jwtUtil.generateToken(1L, "admin", List.of("ADMIN"));

        jwtUtil.revokeToken(access);

        verify(values).set(anyString(), eq("1"), anyLong(), eq(TimeUnit.MILLISECONDS));
        ReflectionTestUtils.setField(jwtUtil, "redisTemplate", null);
        assertThatThrownBy(() -> jwtUtil.revokeToken(access))
                .isInstanceOf(BusinessException.class)
                .satisfies(exception ->
                        assertThat(((BusinessException) exception).getCode()).isEqualTo(503));
    }
}
