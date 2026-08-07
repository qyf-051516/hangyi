package com.qyf.hangyi.assistant.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class InternalApiKeyFilterTest {

    private InternalApiKeyFilter filter;

    @BeforeEach
    void setUp() {
        AssistantProperties properties = new AssistantProperties();
        properties.setInternalApiKey("server-secret");
        filter = new InternalApiKeyFilter(new ObjectMapper().findAndRegisterModules(), properties);
    }

    @Test
    void rejectsUnsignedInternalPathEvenWhenApiKeyIsValid() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(
                "POST",
                "/api/assistant/internal/chat"
        );
        request.addHeader(InternalApiKeyFilter.HEADER_NAME, "server-secret");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("内部调用凭证无效"));
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    void acceptsSignedRequestIncludingQueryAndDoesNotFilterPublicPath() throws Exception {
        MockHttpServletRequest internal = signedRequest(
                "GET",
                "/api/assistant/internal/history",
                "limit=10",
                System.currentTimeMillis()
        );
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(internal, response, chain);
        verify(chain).doFilter(internal, response);

        MockHttpServletRequest health = new MockHttpServletRequest(
                "GET",
                "/api/assistant/health"
        );
        MockHttpServletResponse healthResponse = new MockHttpServletResponse();
        FilterChain healthChain = mock(FilterChain.class);
        filter.doFilter(health, healthResponse, healthChain);
        verify(healthChain).doFilter(health, healthResponse);
    }

    @Test
    void rejectsExpiredOrTamperedIdentitySignature() throws Exception {
        MockHttpServletRequest expired = signedRequest(
                "POST",
                "/api/assistant/internal/chat",
                null,
                System.currentTimeMillis() - 61_000
        );
        MockHttpServletResponse expiredResponse = new MockHttpServletResponse();
        FilterChain expiredChain = mock(FilterChain.class);

        filter.doFilter(expired, expiredResponse, expiredChain);

        assertEquals(401, expiredResponse.getStatus());
        verify(expiredChain, never()).doFilter(expired, expiredResponse);

        MockHttpServletRequest tampered = signedRequest(
                "POST",
                "/api/assistant/internal/chat",
                null,
                System.currentTimeMillis()
        );
        tampered.removeHeader("X-Wechat-Is-Admin");
        tampered.addHeader("X-Wechat-Is-Admin", "true");
        MockHttpServletResponse tamperedResponse = new MockHttpServletResponse();
        FilterChain tamperedChain = mock(FilterChain.class);

        filter.doFilter(tampered, tamperedResponse, tamperedChain);

        assertEquals(401, tamperedResponse.getStatus());
        verify(tamperedChain, never()).doFilter(tampered, tamperedResponse);
    }

    private MockHttpServletRequest signedRequest(
            String method,
            String path,
            String query,
            long timestamp
    ) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        if (query != null) request.setQueryString(query);
        request.addHeader(InternalApiKeyFilter.HEADER_NAME, "server-secret");
        request.addHeader("X-Wechat-Openid", "openid-1");
        request.addHeader("X-Wechat-Employee-No", "GH001");
        request.addHeader("X-Wechat-Is-Admin", "false");
        request.addHeader(InternalApiKeyFilter.TIMESTAMP_HEADER, String.valueOf(timestamp));
        request.addHeader(
                InternalApiKeyFilter.SIGNATURE_HEADER,
                sign(method, path, query, timestamp, "openid-1", "GH001", "false")
        );
        return request;
    }

    private String sign(
            String method,
            String path,
            String query,
            long timestamp,
            String openid,
            String employeeNo,
            String isAdmin
    ) throws Exception {
        String pathAndQuery = query == null || query.isBlank() ? path : path + "?" + query;
        String canonical = method + "\n" + pathAndQuery + "\n" + timestamp + "\n"
                + openid + "\n" + employeeNo + "\n" + isAdmin;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("server-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
    }
}
