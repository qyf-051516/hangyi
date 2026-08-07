package com.qyf.hangyi.assistant.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.function.Supplier;

@Component
public class JsonHttpClient {

    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final ThreadLocal<Long> REQUEST_DEADLINE = new ThreadLocal<>();

    private final ObjectMapper objectMapper;
    private final AssistantProperties properties;
    private final HttpClient httpClient;

    public JsonHttpClient(ObjectMapper objectMapper, AssistantProperties properties) {
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(properties.getConnectTimeout())
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public Result get(String url, Map<String, String> headers) {
        return exchange("GET", url, headers, null);
    }

    public Result post(String url, Map<String, String> headers, Object body) {
        return exchange("POST", url, headers, body);
    }

    public Result put(String url, Map<String, String> headers, Object body) {
        return exchange("PUT", url, headers, body);
    }

    public Result delete(String url, Map<String, String> headers) {
        return exchange("DELETE", url, headers, null);
    }

    public static <T> T withinDeadline(long deadlineEpochMillis, Supplier<T> action) {
        Long previous = REQUEST_DEADLINE.get();
        REQUEST_DEADLINE.set(deadlineEpochMillis);
        try {
            requireTimeRemaining();
            return action.get();
        } finally {
            if (previous == null) {
                REQUEST_DEADLINE.remove();
            } else {
                REQUEST_DEADLINE.set(previous);
            }
        }
    }

    public static void requireTimeRemaining() {
        Long deadline = REQUEST_DEADLINE.get();
        if (deadline != null && deadline <= System.currentTimeMillis()) {
            throw new BusinessException(408, "智能问答请求已超时，请重试");
        }
    }

    private Result exchange(String method, String url, Map<String, String> headers, Object body) {
        try {
            URI uri = safeUri(url);
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(uri)
                    .timeout(effectiveTimeout())
                    .header("Accept", "application/json");
            if (headers != null) {
                headers.forEach(builder::header);
            }
            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                byte[] payload = objectMapper.writeValueAsBytes(body);
                builder.header("Content-Type", "application/json; charset=utf-8")
                        .method(method, HttpRequest.BodyPublishers.ofByteArray(payload));
            }
            HttpResponse<InputStream> response = httpClient.send(
                    builder.build(),
                    HttpResponse.BodyHandlers.ofInputStream()
            );
            byte[] responseBody;
            try (InputStream stream = response.body()) {
                responseBody = stream == null
                        ? new byte[0]
                        : stream.readNBytes(MAX_RESPONSE_BYTES + 1);
            }
            if (responseBody.length > MAX_RESPONSE_BYTES) {
                throw new BusinessException(502, "外部知识服务响应过大");
            }
            JsonNode json;
            if (responseBody.length == 0) {
                json = objectMapper.createObjectNode();
            } else {
                String raw = new String(responseBody, StandardCharsets.UTF_8);
                try {
                    json = objectMapper.readTree(raw);
                } catch (Exception ignored) {
                    json = objectMapper.getNodeFactory().textNode(raw);
                }
            }
            return new Result(response.statusCode(), json);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new BusinessException(503, "外部知识服务请求被中断");
        } catch (HttpTimeoutException error) {
            throw new BusinessException(408, "智能问答请求已超时，请重试");
        } catch (BusinessException error) {
            throw error;
        } catch (Exception error) {
            throw new BusinessException(503, "外部知识服务暂不可用");
        }
    }

    private Duration effectiveTimeout() {
        Duration configured = properties.getReadTimeout();
        Long deadline = REQUEST_DEADLINE.get();
        if (deadline == null) return configured;
        long remainingMillis = deadline - System.currentTimeMillis();
        if (remainingMillis <= 0) {
            throw new BusinessException(408, "智能问答请求已超时，请重试");
        }
        return Duration.ofMillis(Math.max(1,
                Math.min(configured.toMillis(), remainingMillis)));
    }

    private URI safeUri(String url) {
        URI uri = URI.create(url);
        String scheme = uri.getScheme();
        if ((!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))
                || uri.getHost() == null
                || uri.getUserInfo() != null) {
            throw new BusinessException(503, "外部知识服务地址无效");
        }
        return uri;
    }

    public record Result(int statusCode, JsonNode body) {
        public boolean isSuccess() {
            return statusCode >= 200 && statusCode < 300;
        }
    }
}
