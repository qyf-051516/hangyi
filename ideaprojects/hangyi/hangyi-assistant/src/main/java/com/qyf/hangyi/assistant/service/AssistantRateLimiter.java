package com.qyf.hangyi.assistant.service;

import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;

/**
 * 分布式短窗口限流。每日配额防止持续消耗，本限流器用于限制突发请求，
 * 仅由已经完成身份验证的 AssistantIdentity 生成键。
 */
@Component
public class AssistantRateLimiter {

    private static final String KEY_PREFIX = "assistant:rate:";
    private static final DefaultRedisScript<Long> INCREMENT_WITH_EXPIRY =
            new DefaultRedisScript<>("""
                    local current = redis.call('INCR', KEYS[1])
                    if current == 1 then
                        redis.call('PEXPIRE', KEYS[1], ARGV[1])
                    end
                    return current
                    """, Long.class);

    private final StringRedisTemplate redisTemplate;
    private final AssistantProperties properties;

    public AssistantRateLimiter(StringRedisTemplate redisTemplate, AssistantProperties properties) {
        this.redisTemplate = redisTemplate;
        this.properties = properties;
    }

    public void check(AssistantIdentity identity) {
        int limit = identity.admin()
                ? properties.getAdminMinuteLimit()
                : properties.getEmployeeMinuteLimit();
        if (limit <= 0) {
            throw new BusinessException(503, "智能问答限流配置无效");
        }
        Duration window = properties.getRateLimitWindow();
        if (window == null || window.isZero() || window.isNegative()) {
            throw new BusinessException(503, "智能问答限流配置无效");
        }
        try {
            Long count = redisTemplate.execute(
                    INCREMENT_WITH_EXPIRY,
                    List.of(key(identity)),
                    String.valueOf(window.toMillis())
            );
            if (count == null) {
                throw new BusinessException(503, "智能问答限流服务暂不可用");
            }
            if (count > limit) {
                throw new BusinessException(429, "提问过于频繁，请稍后再试");
            }
        } catch (BusinessException error) {
            throw error;
        } catch (DataAccessException error) {
            // Redis 不可用时拒绝访问，不能在失去短窗口保护后继续消耗模型配额。
            throw new BusinessException(503, "智能问答限流服务暂不可用");
        }
    }

    private String key(AssistantIdentity identity) {
        return KEY_PREFIX + identity.channel() + ":" + identity.subject();
    }
}
