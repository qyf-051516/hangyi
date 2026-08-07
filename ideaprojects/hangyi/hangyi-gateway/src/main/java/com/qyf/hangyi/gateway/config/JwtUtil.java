package com.qyf.hangyi.gateway.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Component
public class JwtUtil {
    private static final Logger log = LoggerFactory.getLogger(JwtUtil.class);
    private static final String BLACKLIST_PREFIX = "jwt:blacklist:";

    @Value("${jwt.secret}")
    private String secret;

    @Autowired
    private StringRedisTemplate redisTemplate;

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public Claims parseToken(String token) {
        return Jwts.parser().verifyWith(getSigningKey()).build().parseSignedClaims(token).getPayload();
    }

    public Long getUserId(String token) {
        return Long.parseLong(parseToken(token).getSubject());
    }

    public String getUsername(String token) {
        return parseToken(token).get("username", String.class);
    }

    @SuppressWarnings("unchecked")
    public java.util.List<String> getRoles(String token) {
        try {
            return parseToken(token).get("roles", java.util.List.class);
        } catch (Exception e) {
            return java.util.List.of();
        }
    }

    public boolean isTokenValid(String token) {
        try {
            Claims claims = parseToken(token);
            if (!"access".equals(claims.get("type", String.class))) {
                return false;
            }
            String jti = claims.getId();
            if (jti == null || jti.isBlank()) {
                return false;
            }
            if (redisTemplate == null) {
                log.error("Redis is unavailable; rejecting JWT with jti");
                return false;
            }
            return !Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + jti));
        } catch (Exception e) {
            log.debug("JWT validation failed", e);
            return false;
        }
    }
}
