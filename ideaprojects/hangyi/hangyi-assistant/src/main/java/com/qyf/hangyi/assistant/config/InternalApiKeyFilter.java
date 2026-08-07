package com.qyf.hangyi.assistant.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.common.result.R;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

@Component
public class InternalApiKeyFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-Internal-API-Key";
    public static final String TIMESTAMP_HEADER = "X-Wechat-Timestamp";
    public static final String SIGNATURE_HEADER = "X-Wechat-Signature";
    private static final String OPENID_HEADER = "X-Wechat-Openid";
    private static final String EMPLOYEE_NO_HEADER = "X-Wechat-Employee-No";
    private static final String IS_ADMIN_HEADER = "X-Wechat-Is-Admin";
    private static final String INTERNAL_PATH = "/api/assistant/internal/";

    private final ObjectMapper objectMapper;
    private final AssistantProperties properties;

    public InternalApiKeyFilter(ObjectMapper objectMapper, AssistantProperties properties) {
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(INTERNAL_PATH);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String expected = properties.getInternalApiKey();
        String supplied = request.getHeader(HEADER_NAME);
        if (expected == null || expected.isBlank()
                || supplied == null
                || !constantTimeEquals(expected, supplied)
                || !hasValidSignature(request, expected)) {
            reject(response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean hasValidSignature(HttpServletRequest request, String signingKey) {
        String timestamp = request.getHeader(TIMESTAMP_HEADER);
        String signature = request.getHeader(SIGNATURE_HEADER);
        String openid = request.getHeader(OPENID_HEADER);
        String employeeNo = valueOrEmpty(request.getHeader(EMPLOYEE_NO_HEADER));
        String isAdmin = valueOrEmpty(request.getHeader(IS_ADMIN_HEADER));
        if (timestamp == null || !timestamp.matches("\\d{13}")
                || signature == null || !signature.matches("[0-9a-fA-F]{64}")
                || openid == null || openid.isBlank()
                || !("true".equals(isAdmin) || "false".equals(isAdmin))) {
            return false;
        }
        long sentAt;
        try {
            sentAt = Long.parseLong(timestamp);
        } catch (NumberFormatException error) {
            return false;
        }
        Duration maxAge = properties.getInternalSignatureMaxAge();
        if (maxAge == null || maxAge.isZero() || maxAge.isNegative()
                || Math.abs(System.currentTimeMillis() - sentAt) > maxAge.toMillis()) {
            return false;
        }
        String expected = hmacSha256(
                signingKey,
                canonicalRequest(request, timestamp, openid, employeeNo, isAdmin)
        );
        return expected != null && constantTimeEquals(expected, signature.toLowerCase());
    }

    private String canonicalRequest(
            HttpServletRequest request,
            String timestamp,
            String openid,
            String employeeNo,
            String isAdmin
    ) {
        String pathAndQuery = request.getRequestURI();
        if (request.getQueryString() != null && !request.getQueryString().isBlank()) {
            pathAndQuery += "?" + request.getQueryString();
        }
        return request.getMethod().toUpperCase() + "\n"
                + pathAndQuery + "\n"
                + timestamp + "\n"
                + openid + "\n"
                + employeeNo + "\n"
                + isAdmin;
    }

    private String hmacSha256(String key, String canonical) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            return null;
        }
    }

    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), R.unauthorized("内部调用凭证无效"));
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private boolean constantTimeEquals(String expected, String supplied) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8)
        );
    }
}
