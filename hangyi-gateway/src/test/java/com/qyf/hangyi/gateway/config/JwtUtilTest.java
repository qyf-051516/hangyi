package com.qyf.hangyi.gateway.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JwtUtilTest {

    private JwtUtil jwtUtil;
    private static final String SECRET = "test-jwt-secret-key-for-unit-testing-must-be-32chars";

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret", SECRET);
    }

    private String createToken(String subject, List<String> roles, String username, long expirationMs) {
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        return Jwts.builder()
                .subject(subject)
                .claim("roles", roles)
                .claim("username", username)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key)
                .compact();
    }

    @Test
    void testIsTokenValid_ValidToken() {
        String token = createToken("1", List.of("ADMIN"), "admin", 86400000);
        assertThat(jwtUtil.isTokenValid(token)).isTrue();
    }

    @Test
    void testGetUserId() {
        String token = createToken("42", List.of("ADMIN"), "admin", 86400000);
        assertThat(jwtUtil.getUserId(token)).isEqualTo(42L);
    }

    @Test
    void testGetRoles() {
        String token = createToken("1", List.of("ADMIN", "STAFF"), "admin", 86400000);
        assertThat(jwtUtil.getRoles(token)).containsExactly("ADMIN", "STAFF");
    }

    @Test
    void testGetUsername() {
        String token = createToken("1", List.of("ADMIN"), "testuser", 86400000);
        assertThat(jwtUtil.getUsername(token)).isEqualTo("testuser");
    }

    @Test
    void testIsTokenValid_ExpiredToken() {
        String token = createToken("1", List.of("ADMIN"), "admin", -1000);
        assertThat(jwtUtil.isTokenValid(token)).isFalse();
    }

    @Test
    void testIsTokenValid_InvalidToken() {
        assertThat(jwtUtil.isTokenValid("invalid.token.here")).isFalse();
    }

    @Test
    void testGetRoles_InvalidToken() {
        assertThat(jwtUtil.getRoles("invalid.token.here")).isEmpty();
    }
}
