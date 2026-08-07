package com.qyf.hangyi.schedule.config;

import com.qyf.hangyi.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Set;

@Aspect
@Component
@Order(100)
public class ControllerAuditAspect {

    private static final Logger log = LoggerFactory.getLogger(ControllerAuditAspect.class);
    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final JdbcTemplate jdbc;

    public ControllerAuditAspect(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Around("execution(public * com.qyf.hangyi.schedule..controller..*(..))")
    public Object audit(ProceedingJoinPoint joinPoint) throws Throwable {
        Object result = joinPoint.proceed();
        HttpServletRequest request = currentRequest();
        if (request == null || !MUTATING_METHODS.contains(request.getMethod()) || !succeeded(result)) {
            return result;
        }
        try {
            String uri = request.getRequestURI();
            jdbc.update(
                    "INSERT INTO operation_log " +
                            "(action, detail, target_type, target_id, operator_id, created_at) " +
                            "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    request.getMethod() + " " + uri,
                    "排班管理接口操作成功",
                    targetType(uri),
                    targetId(uri),
                    operatorId());
        } catch (Exception exception) {
            log.error("写入审计日志失败", exception);
        }
        return result;
    }

    private boolean succeeded(Object result) {
        if (result instanceof R<?> response) {
            return response.getCode() >= 200 && response.getCode() < 300;
        }
        if (result instanceof ResponseEntity<?> response) {
            return response.getStatusCode().is2xxSuccessful();
        }
        return true;
    }

    private HttpServletRequest currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes.getRequest();
        }
        return null;
    }

    private Long operatorId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(authentication.getPrincipal()));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String targetType(String uri) {
        String[] segments = uri.split("/");
        return segments.length > 2 ? segments[2] : "api";
    }

    private String targetId(String uri) {
        String[] segments = uri.split("/");
        for (int i = segments.length - 1; i >= 0; i--) {
            if (segments[i].matches("\\d+")) {
                return segments[i];
            }
        }
        return null;
    }
}
