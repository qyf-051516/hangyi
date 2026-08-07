package com.qyf.hangyi.gateway.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class JwtUtilTest {
    private static final String SECRET = "test-jwt-secret-key-for-unit-testing";
    private JwtUtil jwtUtil;
    private StringRedisTemplate redis;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        redis = mock(StringRedisTemplate.class);
        ReflectionTestUtils.setField(jwtUtil, "secret", SECRET);
        ReflectionTestUtils.setField(jwtUtil, "redisTemplate", redis);
    }

    private String token(String subject, List<String> roles, String username, String jti, long expiryMs) {
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        var builder = Jwts.builder().subject(subject).claim("roles", roles).claim("username", username)
                .claim("type", "access")
                .issuedAt(new Date()).expiration(new Date(System.currentTimeMillis() + expiryMs));
        if (jti != null) builder.id(jti);
        return builder.signWith(key).compact();
    }

    @Test void validTokenIsAccepted() {
        when(redis.hasKey("jwt:blacklist:id-1")).thenReturn(false);
        assertThat(jwtUtil.isTokenValid(token("1", List.of("ADMIN"), "admin", "id-1", 60_000))).isTrue();
        verify(redis).hasKey("jwt:blacklist:id-1");
    }

    @Test void blacklistedTokenIsRejected() {
        when(redis.hasKey("jwt:blacklist:revoked")).thenReturn(true);
        assertThat(jwtUtil.isTokenValid(token("1", List.of(), "user", "revoked", 60_000))).isFalse();
    }

    @Test void tokenWithoutJtiIsRejectedWithoutQueryingRedis() {
        assertThat(jwtUtil.isTokenValid(token("1", List.of(), "user", null, 60_000))).isFalse();
        verifyNoInteractions(redis);
    }

    @Test void tokenIsRejectedWhenRedisBeanIsAbsent() {
        ReflectionTestUtils.setField(jwtUtil, "redisTemplate", null);
        assertThat(jwtUtil.isTokenValid(token("1", List.of(), "user", "id", 60_000))).isFalse();
    }

    @Test void redisFailureRejectsToken() {
        when(redis.hasKey(anyString())).thenThrow(new IllegalStateException("redis unavailable"));
        assertThat(jwtUtil.isTokenValid(token("1", List.of(), "user", "id", 60_000))).isFalse();
    }

    @Test void expiredMalformedNullAndWrongSignatureTokensAreRejected() {
        String wrongSecret = "another-test-jwt-secret-key-for-signing";
        String wrongSigned = Jwts.builder().subject("1").expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(wrongSecret.getBytes(StandardCharsets.UTF_8))).compact();
        assertThat(jwtUtil.isTokenValid(token("1", List.of(), "user", null, -1_000))).isFalse();
        assertThat(jwtUtil.isTokenValid("invalid.token.here")).isFalse();
        assertThat(jwtUtil.isTokenValid(null)).isFalse();
        assertThat(jwtUtil.isTokenValid(wrongSigned)).isFalse();
    }

    @Test void claimsAccessorsReturnExpectedValues() {
        String token = token("42", List.of("ADMIN", "STAFF"), "tester", null, 60_000);
        assertThat(jwtUtil.getUserId(token)).isEqualTo(42L);
        assertThat(jwtUtil.getRoles(token)).containsExactly("ADMIN", "STAFF");
        assertThat(jwtUtil.getUsername(token)).isEqualTo("tester");
        assertThat(jwtUtil.parseToken(token).getSubject()).isEqualTo("42");
    }

    @Test void invalidRolesTokenReturnsEmptyList() {
        assertThat(jwtUtil.getRoles("invalid.token.here")).isEmpty();
    }
}
