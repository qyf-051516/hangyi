package com.qyf.hangyi.assistant.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.assistant.knowledge.KnowledgeChunk;
import com.qyf.hangyi.assistant.knowledge.RetrievedChunk;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class QdrantVectorStore implements VectorStore {

    private final AssistantProperties properties;
    private final JsonHttpClient httpClient;

    public QdrantVectorStore(AssistantProperties properties, JsonHttpClient httpClient) {
        this.properties = properties;
        this.httpClient = httpClient;
    }

    @Override
    public void ensureCollection() {
        JsonHttpClient.Result current = httpClient.get(collectionUrl(), headers());
        if (current.isSuccess()) {
            return;
        }
        if (current.statusCode() != 404) {
            throw new BusinessException(503, "向量库状态检查失败");
        }
        JsonHttpClient.Result created = httpClient.put(
                collectionUrl(),
                headers(),
                Map.of(
                        "vectors", Map.of(
                                "size", properties.getEmbeddingDimension(),
                                "distance", "Cosine"
                        )
                )
        );
        if (!created.isSuccess()) {
            throw new BusinessException(503, "向量库集合创建失败");
        }
    }

    @Override
    public void recreateCollection() {
        JsonHttpClient.Result deleted = httpClient.delete(collectionUrl(), headers());
        if (!deleted.isSuccess() && deleted.statusCode() != 404) {
            throw new BusinessException(503, "向量库集合重建失败");
        }
        ensureCollection();
    }

    @Override
    public void upsert(List<KnowledgeChunk> chunks, List<List<Double>> vectors) {
        if (chunks.size() != vectors.size()) {
            throw new IllegalArgumentException("知识分块与向量数量不一致");
        }
        List<Map<String, Object>> points = new ArrayList<>(chunks.size());
        for (int i = 0; i < chunks.size(); i++) {
            KnowledgeChunk chunk = chunks.get(i);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("documentId", chunk.documentId());
            payload.put("title", chunk.title());
            payload.put("section", chunk.section());
            payload.put("sourcePath", chunk.sourcePath());
            payload.put("version", chunk.version());
            payload.put("visibility", chunk.visibility());
            payload.put("checksum", chunk.checksum());
            payload.put("content", chunk.content());
            points.add(Map.of(
                    "id", chunk.id(),
                    "vector", vectors.get(i),
                    "payload", payload
            ));
        }
        JsonHttpClient.Result response = httpClient.put(
                collectionUrl() + "/points?wait=true",
                headers(),
                Map.of("points", points)
        );
        if (!response.isSuccess()) {
            throw new BusinessException(503, "知识向量写入失败");
        }
    }

    @Override
    public void deleteDocument(String documentId) {
        JsonHttpClient.Result response = httpClient.post(
                collectionUrl() + "/points/delete?wait=true",
                headers(),
                Map.of(
                        "filter", Map.of(
                                "must", List.of(Map.of(
                                        "key", "documentId",
                                        "match", Map.of("value", documentId)
                                ))
                        )
                )
        );
        if (!response.isSuccess()) {
            throw new BusinessException(503, "旧知识向量删除失败");
        }
    }

    @Override
    public List<RetrievedChunk> query(
            List<Double> vector,
            boolean admin,
            int limit,
            double threshold
    ) {
        List<Map<String, Object>> allowedVisibility = new ArrayList<>();
        allowedVisibility.add(Map.of("key", "visibility", "match", Map.of("value", "EMPLOYEE")));
        if (admin) {
            allowedVisibility.add(Map.of("key", "visibility", "match", Map.of("value", "ADMIN")));
        }
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("query", vector);
        request.put("limit", limit);
        request.put("score_threshold", threshold);
        request.put("with_payload", true);
        request.put("with_vector", false);
        request.put("filter", Map.of("should", allowedVisibility));

        JsonHttpClient.Result response = httpClient.post(
                collectionUrl() + "/points/query",
                headers(),
                request
        );
        if (!response.isSuccess()) {
            throw new BusinessException(503, "知识检索暂不可用");
        }
        JsonNode result = response.body().path("result");
        JsonNode points = result.path("points");
        if (!points.isArray() && result.isArray()) {
            points = result;
        }
        if (!points.isArray()) {
            throw new BusinessException(502, "向量库返回格式无效");
        }
        List<RetrievedChunk> chunks = new ArrayList<>();
        for (JsonNode point : points) {
            JsonNode payload = point.path("payload");
            String content = payload.path("content").asText("");
            String visibility = payload.path("visibility").asText("");
            double score = point.path("score").asDouble(Double.NEGATIVE_INFINITY);
            if (content.isBlank()
                    || score < threshold
                    || !("EMPLOYEE".equals(visibility)
                    || (admin && "ADMIN".equals(visibility)))) {
                continue;
            }
            chunks.add(new RetrievedChunk(
                    point.path("id").asText(),
                    payload.path("documentId").asText(),
                    payload.path("title").asText("未命名资料"),
                    payload.path("section").asText("正文"),
                    payload.path("sourcePath").asText(),
                    visibility,
                    content,
                    score
            ));
        }
        return List.copyOf(chunks);
    }

    @Override
    public boolean isReady() {
        try {
            return httpClient.get(cleanBaseUrl(properties.getQdrantUrl()) + "/readyz", headers())
                    .isSuccess();
        } catch (Exception ignored) {
            return false;
        }
    }

    private String collectionUrl() {
        return cleanBaseUrl(properties.getQdrantUrl())
                + "/collections/"
                + properties.getQdrantCollection();
    }

    private Map<String, String> headers() {
        String key = properties.getQdrantApiKey();
        return key == null || key.isBlank() ? Map.of() : Map.of("api-key", key);
    }

    private String cleanBaseUrl(String url) {
        return url == null ? "" : url.replaceAll("/+$", "");
    }
}
