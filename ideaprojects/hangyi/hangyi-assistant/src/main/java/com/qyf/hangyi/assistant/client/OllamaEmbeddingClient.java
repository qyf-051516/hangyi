package com.qyf.hangyi.assistant.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class OllamaEmbeddingClient implements EmbeddingClient {

    private final AssistantProperties properties;
    private final JsonHttpClient httpClient;

    public OllamaEmbeddingClient(AssistantProperties properties, JsonHttpClient httpClient) {
        this.properties = properties;
        this.httpClient = httpClient;
    }

    @Override
    public List<List<Double>> embed(List<String> texts) {
        if (texts == null || texts.isEmpty()) {
            return List.of();
        }
        JsonHttpClient.Result response = httpClient.post(
                cleanBaseUrl(properties.getOllamaUrl()) + "/api/embed",
                Map.of(),
                Map.of(
                        "model", properties.getEmbeddingModel(),
                        "input", texts
                )
        );
        if (!response.isSuccess()) {
            throw new BusinessException(503, "向量模型暂不可用");
        }
        JsonNode embeddings = response.body().path("embeddings");
        if (!embeddings.isArray() || embeddings.size() != texts.size()) {
            throw new BusinessException(502, "向量模型返回格式无效");
        }
        List<List<Double>> result = new ArrayList<>(embeddings.size());
        for (JsonNode embedding : embeddings) {
            if (!embedding.isArray() || embedding.size() != properties.getEmbeddingDimension()) {
                throw new BusinessException(502, "向量维度与配置不一致");
            }
            List<Double> vector = new ArrayList<>(embedding.size());
            embedding.forEach(value -> vector.add(value.asDouble()));
            result.add(List.copyOf(vector));
        }
        return List.copyOf(result);
    }

    private String cleanBaseUrl(String url) {
        return url == null ? "" : url.replaceAll("/+$", "");
    }
}
