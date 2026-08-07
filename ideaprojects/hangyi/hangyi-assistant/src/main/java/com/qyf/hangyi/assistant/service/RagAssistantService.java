package com.qyf.hangyi.assistant.service;

import com.qyf.hangyi.assistant.client.ChatModelClient;
import com.qyf.hangyi.assistant.client.EmbeddingClient;
import com.qyf.hangyi.assistant.client.JsonHttpClient;
import com.qyf.hangyi.assistant.client.VectorStore;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.assistant.dto.ChatRequest;
import com.qyf.hangyi.assistant.dto.ChatResponse;
import com.qyf.hangyi.assistant.dto.Citation;
import com.qyf.hangyi.assistant.dto.FeedbackRequest;
import com.qyf.hangyi.assistant.knowledge.RetrievedChunk;
import com.qyf.hangyi.assistant.repository.AssistantRepository;
import com.qyf.hangyi.assistant.repository.AssistantRepository.SavedExchange;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class RagAssistantService implements AssistantService {

    private static final String NO_EVIDENCE_ANSWER =
            "当前知识库没有足够依据回答这个问题。你可以换一种更具体的说法，"
                    + "或请管理员补充对应的业务制度与操作说明。";
    private static final Pattern CITATION_MARKER = Pattern.compile("\\[(\\d+)]");

    private final AssistantProperties properties;
    private final EmbeddingClient embeddingClient;
    private final VectorStore vectorStore;
    private final ChatModelClient chatModelClient;
    private final AssistantRepository repository;
    private final JsonHttpClient httpClient;
    private final AssistantRateLimiter rateLimiter;

    public RagAssistantService(
            AssistantProperties properties,
            EmbeddingClient embeddingClient,
            VectorStore vectorStore,
            ChatModelClient chatModelClient,
            AssistantRepository repository,
            JsonHttpClient httpClient,
            AssistantRateLimiter rateLimiter
    ) {
        this.properties = properties;
        this.embeddingClient = embeddingClient;
        this.vectorStore = vectorStore;
        this.chatModelClient = chatModelClient;
        this.repository = repository;
        this.httpClient = httpClient;
        this.rateLimiter = rateLimiter;
    }

    @Override
    public Map<String, Object> status() {
        Map<String, Object> status = new LinkedHashMap<>();
        boolean configured = isConfigured();
        boolean enabled = properties.isEngineEnabled();
        int knowledgeDocuments = repository.countReadyDocuments();
        boolean hasKnowledge = knowledgeDocuments > 0;
        status.put("phase", enabled && configured && hasKnowledge ? "RAG" : "LOCAL_KNOWLEDGE");
        status.put("engineEnabled", properties.isEngineEnabled());
        status.put("ready", enabled && configured && hasKnowledge);
        status.put("fallbackAvailable", true);
        status.put("embeddingModel", properties.getEmbeddingModel());
        status.put("chatModel", properties.getQwenChatModel());
        status.put("knowledgeDocuments", knowledgeDocuments);
        status.put("configured", configured);
        Map<String, String> dependencies = new LinkedHashMap<>();
        if (properties.isDependencyProbeEnabled()) {
            dependencies.put("qdrant", vectorStore.isReady() ? "UP" : "DOWN");
            dependencies.put("ollama", probeOllama() ? "UP" : "DOWN");
            dependencies.put(
                    "qwen",
                    properties.getQwenApiKey() == null || properties.getQwenApiKey().isBlank()
                            ? "UNCONFIGURED"
                            : "CONFIGURED"
            );
        } else {
            dependencies.put("qdrant", "UNKNOWN");
            dependencies.put("ollama", "UNKNOWN");
            dependencies.put("qwen", isConfigured() ? "CONFIGURED" : "UNCONFIGURED");
        }
        status.put("dependencies", dependencies);
        return status;
    }

    @Override
    public ChatResponse chat(AssistantIdentity identity, ChatRequest request) {
        if (!properties.isEngineEnabled()) {
            throw new BusinessException(503, "RAG 问答引擎尚未启用");
        }
        if (!isConfigured()) {
            throw new BusinessException(503, "RAG 问答引擎配置不完整");
        }
        if ("KNOWLEDGE_AND_LIVE".equals(request.normalizedMode())) {
            throw new BusinessException(501, "实时业务查询工具尚未启用，请使用知识问答模式");
        }

        if (request.deadlineExpired()) {
            throw new BusinessException(408, "智能问答请求已超时，请重试");
        }
        String requestId = request.normalizedRequestId() == null
                ? UUID.randomUUID().toString() : request.normalizedRequestId();
        ChatResponse existing = repository.findExchange(identity, requestId).orElse(null);
        if (existing != null) {
            return existing;
        }
        rateLimiter.check(identity);
        long serverDeadline = System.currentTimeMillis() + properties.getRequestTimeout().toMillis();
        long deadline = request.deadlineAt() == null
                ? serverDeadline : Math.min(serverDeadline, request.deadlineAt());

        return JsonHttpClient.withinDeadline(deadline,
                () -> executeChat(identity, request, requestId));
    }

    private ChatResponse executeChat(
            AssistantIdentity identity,
            ChatRequest request,
            String requestId
    ) {

        int dailyLimit = identity.admin()
                ? properties.getAdminDailyQuota()
                : properties.getEmployeeDailyQuota();
        int remainingQuota = repository.consumeQuota(identity, dailyLimit);
        try {
            String question = request.normalizedQuestion();
            String sessionId = repository.resolveSession(identity, request.sessionId());

            JsonHttpClient.requireTimeRemaining();
            List<Double> queryVector = embeddingClient.embed(List.of(question)).get(0);
            JsonHttpClient.requireTimeRemaining();
            List<RetrievedChunk> retrieved = vectorStore.query(
                    queryVector,
                    identity.admin(),
                    properties.getTopK(),
                    properties.getScoreThreshold()
            );
            List<RetrievedChunk> context = limitContext(retrieved);

            boolean degraded = context.isEmpty();
            String answer = degraded
                    ? NO_EVIDENCE_ANSWER
                    : chatModelClient.generate(question, context);
            JsonHttpClient.requireTimeRemaining();
            List<Citation> citations = toCitations(context);
            answer = validateCitationMarkers(answer, citations.size());
            if (answer.length() > 8000) {
                answer = answer.substring(0, 8000);
            }

            SavedExchange saved = repository.saveExchange(
                    identity,
                    sessionId,
                    requestId,
                    question,
                    answer,
                    citations,
                    degraded
            );
            return new ChatResponse(
                    requestId,
                    saved.messageId(),
                    sessionId,
                    question,
                    answer,
                    citations,
                    remainingQuota,
                    degraded,
                    saved.createdAt(),
                    null
            );
        } catch (RuntimeException error) {
            try {
                repository.refundQuota(identity);
            } catch (RuntimeException refundError) {
                error.addSuppressed(refundError);
            }
            throw error;
        }
    }

    @Override
    public List<ChatResponse> history(AssistantIdentity identity, int limit) {
        return repository.findHistory(identity, limit);
    }

    @Override
    public Map<String, Object> feedback(
            AssistantIdentity identity,
            FeedbackRequest request
    ) {
        String comment = request.comment() == null ? "" : request.comment().trim();
        repository.saveFeedback(identity, request.messageId(), request.rating(), comment);
        return Map.of("saved", true, "messageId", request.messageId());
    }

    private List<RetrievedChunk> limitContext(List<RetrievedChunk> retrieved) {
        List<RetrievedChunk> selected = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        int totalChars = 0;
        for (RetrievedChunk chunk : retrieved) {
            String key = chunk.documentId() + "|" + chunk.section();
            if (!seen.add(key)) {
                continue;
            }
            int nextChars = totalChars + chunk.content().length();
            if (!selected.isEmpty() && nextChars > properties.getMaxContextChars()) {
                break;
            }
            selected.add(chunk);
            totalChars = nextChars;
        }
        return List.copyOf(selected);
    }

    private List<Citation> toCitations(List<RetrievedChunk> chunks) {
        List<Citation> citations = new ArrayList<>(chunks.size());
        for (int i = 0; i < chunks.size(); i++) {
            RetrievedChunk chunk = chunks.get(i);
            citations.add(new Citation(
                    String.valueOf(i + 1),
                    chunk.title(),
                    chunk.section(),
                    chunk.sourcePath(),
                    Math.round(chunk.score() * 10000.0) / 10000.0
            ));
        }
        return List.copyOf(citations);
    }

    private String validateCitationMarkers(String answer, int citationCount) {
        Matcher matcher = CITATION_MARKER.matcher(answer);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            int index = Integer.parseInt(matcher.group(1));
            matcher.appendReplacement(
                    result,
                    index >= 1 && index <= citationCount
                            ? Matcher.quoteReplacement(matcher.group())
                            : ""
            );
        }
        matcher.appendTail(result);
        return result.toString().trim();
    }

    private boolean isConfigured() {
        return properties.getEmbeddingDimension() > 0
                && properties.getQdrantCollection() != null
                && !properties.getQdrantCollection().isBlank()
                && properties.getEmbeddingModel() != null
                && !properties.getEmbeddingModel().isBlank()
                && properties.getQwenApiKey() != null
                && !properties.getQwenApiKey().isBlank()
                && properties.getQwenChatModel() != null
                && !properties.getQwenChatModel().isBlank();
    }

    private boolean probeOllama() {
        try {
            String base = properties.getOllamaUrl() == null
                    ? ""
                    : properties.getOllamaUrl().replaceAll("/+$", "");
            return httpClient.get(base + "/api/tags", Map.of()).isSuccess();
        } catch (Exception ignored) {
            return false;
        }
    }
}
