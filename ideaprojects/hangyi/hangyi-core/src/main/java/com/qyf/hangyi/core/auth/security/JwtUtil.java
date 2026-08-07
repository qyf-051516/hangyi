package com.qyf.hangyi.core.auth.security;

import com.qyf.hangyi.common.exception.BusinessException;
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
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class JwtUtil {

    private static final Logger log = LoggerFactory.getLogger(JwtUtil.class);
    private static final String BLACKLIST_PREFIX = "jwt:blacklist:";

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expiration;

    /** refresh token 有效期：7 天 */
    private static final long REFRESH_EXPIRATION = 7 * 24 * 60 * 60 * 1000L;

    @Autowired(required = false)
    private StringRedisTemplate redisTemplate;

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(Long userId, String username, List<String> roles) {
        // H-3: 加 jti（UUID）以便单 token 吊销
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(String.valueOf(userId))
                .claim("username", username)
                .claim("roles", roles)
                .claim("type", "access")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey())
                .compact();
    }

    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * 校验 token 有效性：签名 + 未过期 + 未被吊销（Redis 黑名单）
     */
    public boolean isTokenValid(String token) {
        try {
            Claims claims = parseToken(token);
            return "access".equals(claims.get("type", String.class))
                    && claims.getId() != null && !claims.getId().isBlank()
                    && !isBlacklisted(claims.getId());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 吊销 token（logout）。把 jti 写入 Redis 黑名单，TTL = 剩余有效期
     */
    public void revokeToken(String token) {
        try {
            Claims claims = parseToken(token);
            String jti = claims.getId();
            if (jti == null || jti.isBlank()) {
                throw new BusinessException(401, "token缺少唯一标识");
            }
            Date exp = claims.getExpiration();
            long ttlMs = exp == null ? expiration : Math.max(1000, exp.getTime() - System.currentTimeMillis());
            if (redisTemplate == null) {
                throw new BusinessException(503, "Token 撤销服务暂时不可用");
            }
            redisTemplate.opsForValue().set(BLACKLIST_PREFIX + jti, "1", ttlMs, TimeUnit.MILLISECONDS);
            log.debug("Token revoked: jti={} ttl={}ms", jti, ttlMs);
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception e) {
            log.warn("Revoke token failed: {}", e.getMessage());
            throw new BusinessException(503, "Token 撤销服务暂时不可用");
        }
    }

    private boolean isBlacklisted(String jti) {
        if (jti == null || jti.isBlank() || redisTemplate == null) return true;
        try {
            return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + jti));
        } catch (Exception e) {
            log.warn("Blacklist check failed: {}", e.getMessage());
            return true;
        }
    }

    public Long getUserId(String token) {
        return Long.parseLong(parseToken(token).getSubject());
    }

    /**
     * 生成 Refresh Token（长 TTL = 7 天，含 refresh 标志）
     */
    public String generateRefreshToken(Long userId, String username, List<String> roles) {
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(String.valueOf(userId))
                .claim("username", username)
                .claim("roles", roles)
                .claim("type", "refresh")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + REFRESH_EXPIRATION))
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * 校验 Refresh Token（签名、过期、类型和撤销状态）
     */
    public boolean isRefreshTokenValid(String token) {
        try {
            Claims claims = parseToken(token);
            return "refresh".equals(claims.get("type", String.class))
                    && claims.getId() != null && !claims.getId().isBlank()
                    && !isBlacklisted(claims.getId());
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    public List<String> getRoles(String token) {
        return parseToken(token).get("roles", List.class);
    }

    public String getUsername(String token) {
        return parseToken(token).get("username", String.class);
    }
}
