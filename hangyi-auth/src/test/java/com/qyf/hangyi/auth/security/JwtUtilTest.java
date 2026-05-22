package com.qyf.hangyi.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class JwtUtilTest {

    @Autowired
    private JwtUtil jwtUtil;

    @Test
    void generateToken_shouldReturnValidToken() {
        String token = jwtUtil.generateToken(1L, "admin", List.of("ADMIN"));
        assertThat(token).isNotBlank();
        assertThat(token.split("\\.")).hasSize(3);
    }

    @Test
    void generateToken_differentUsers_differentTokens() {
        String token1 = jwtUtil.generateToken(1L, "admin", List.of("ADMIN"));
        String token2 = jwtUtil.generateToken(2L, "user", List.of("USER"));
        assertThat(token1).isNotEqualTo(token2);
    }

    @Test
    void generateToken_withMultipleRoles() {
        String token = jwtUtil.generateToken(1L, "admin", List.of("ADMIN", "TEAM_LEADER"));
        assertThat(token).isNotBlank();
        assertThat(token.split("\\.")).hasSize(3);
    }
}
