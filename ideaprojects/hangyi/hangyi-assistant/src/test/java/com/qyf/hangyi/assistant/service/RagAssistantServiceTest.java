package com.qyf.hangyi.assistant.service;

import com.qyf.hangyi.assistant.client.ChatModelClient;
import com.qyf.hangyi.assistant.client.EmbeddingClient;
import com.qyf.hangyi.assistant.client.JsonHttpClient;
import com.qyf.hangyi.assistant.client.VectorStore;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.assistant.dto.ChatRequest;
import com.qyf.hangyi.assistant.dto.ChatResponse;
import com.qyf.hangyi.assistant.dto.FeedbackRequest;
import com.qyf.hangyi.assistant.knowledge.RetrievedChunk;
import com.qyf.hangyi.assistant.repository.AssistantRepository;
import com.qyf.hangyi.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RagAssistantServiceTest {

    private AssistantProperties properties;
    private EmbeddingClient embeddingClient;
    private VectorStore vectorStore;
    private ChatModelClient chatModelClient;
    private AssistantRepository repository;
    private AssistantRateLimiter rateLimiter;
    private RagAssistantService service;
    private AssistantIdentity employee;

    @BeforeEach
    void setUp() {
        properties = new AssistantProperties();
        properties.setEngineEnabled(true);
        properties.setQwenApiKey("test-key");
        embeddingClient = mock(EmbeddingClient.class);
        vectorStore = mock(VectorStore.class);
        chatModelClient = mock(ChatModelClient.class);
        repository = mock(AssistantRepository.class);
        rateLimiter = mock(AssistantRateLimiter.class);
        service = new RagAssistantService(
                properties,
                embeddingClient,
                vectorStore,
                chatModelClient,
                repository,
                mock(JsonHttpClient.class),
                rateLimiter
        );
        employee = new AssistantIdentity("MINIPROGRAM", "openid-1", "GH001", "张伟", false);
        when(repository.consumeQuota(any(), anyInt())).thenReturn(19);
        when(repository.resolveSession(any(), any())).thenReturn("session-1");
        when(repository.findExchange(any(), anyString())).thenReturn(Optional.empty());
        when(repository.saveExchange(
                any(), anyString(), anyString(), anyString(), anyString(), anyList(), anyBoolean()
        )).thenReturn(new AssistantRepository.SavedExchange(
                "message-1",
                LocalDateTime.of(2026, 7, 31, 10, 0)
        ));
        when(embeddingClient.embed(anyList())).thenReturn(List.of(List.of(0.1, 0.2)));
    }

    @Test
    void refusesWithoutEvidenceAndDoesNotCallChatModel() {
        when(vectorStore.query(anyList(), anyBoolean(), anyInt(), anyDouble()))
                .thenReturn(List.of());

        ChatResponse response = service.chat(
                employee,
                new ChatRequest("我应该如何处理未知流程", "KNOWLEDGE_ONLY", null)
        );

        assertTrue(response.degraded());
        assertTrue(response.answer().contains("没有足够依据"));
        assertTrue(response.sources().isEmpty());
        assertEquals(19, response.remainingQuota());
        verify(chatModelClient, never()).generate(anyString(), anyList());
    }

    @Test
    void returnsServerOwnedCitationsAndRemovesInvalidMarkers() {
        RetrievedChunk chunk = new RetrievedChunk(
                "chunk-1",
                "doc-1",
                "调班流程",
                "审批",
                "03-调班与请假.md",
                "EMPLOYEE",
                "批准前需要再次校验。",
                0.81234
        );
        when(vectorStore.query(anyList(), anyBoolean(), anyInt(), anyDouble()))
                .thenReturn(List.of(chunk));
        when(chatModelClient.generate(anyString(), anyList()))
                .thenReturn("审批前需要复核。[1] 不存在的引用。[9]");

        ChatResponse response = service.chat(
                employee,
                new ChatRequest("调班怎么审批", null, "")
        );

        assertFalse(response.degraded());
        assertEquals(1, response.sources().size());
        assertEquals("调班流程", response.sources().get(0).title());
        assertTrue(response.answer().contains("[1]"));
        assertFalse(response.answer().contains("[9]"));
        verify(vectorStore).query(anyList(), org.mockito.ArgumentMatchers.eq(false), anyInt(), anyDouble());
    }

    @Test
    void rejectsLiveModeUntilReadOnlyToolsAreEnabled() {
        assertThrows(BusinessException.class, () -> service.chat(
                employee,
                new ChatRequest("我今天的航班是什么", "KNOWLEDGE_AND_LIVE", null)
        ));
        verify(repository, never()).consumeQuota(any(), anyInt());
    }

    @Test
    void disabledEngineRejectsBeforeUsingQuota() {
        properties.setEngineEnabled(false);

        assertThrows(BusinessException.class, () -> service.chat(
                employee,
                new ChatRequest("问题", "KNOWLEDGE_ONLY", null)
        ));
        verify(repository, never()).consumeQuota(any(), anyInt());
    }

    @Test
    void externalFailureRefundsReservedQuota() {
        when(embeddingClient.embed(anyList())).thenThrow(new BusinessException(503, "向量服务失败"));

        assertThrows(BusinessException.class, () -> service.chat(
                employee,
                new ChatRequest("调班怎么申请", "KNOWLEDGE_ONLY", null)
        ));

        verify(repository).refundQuota(employee);
    }

    @Test
    void feedbackIsScopedByIdentityInRepositoryCall() {
        service.feedback(employee, new FeedbackRequest("message-1", "DOWN", "内容不完整"));

        verify(repository).saveFeedback(employee, "message-1", "DOWN", "内容不完整");
    }

    @Test
    void disabledStatusExplicitlyAdvertisesLocalFallback() {
        properties.setEngineEnabled(false);

        Map<String, Object> status = service.status();

        assertEquals("LOCAL_KNOWLEDGE", status.get("phase"));
        assertEquals(false, status.get("ready"));
        assertEquals(true, status.get("fallbackAvailable"));
    }

    @Test
    void repeatedRequestIdReturnsSavedAnswerWithoutConsumingQuota() {
        ChatResponse saved = new ChatResponse(
                "request-123", "message-old", "session-old", "调班怎么办",
                "已保存的回答", List.of(), 18, false,
                LocalDateTime.of(2026, 8, 3, 10, 0), "UP");
        when(repository.findExchange(employee, "request-123")).thenReturn(Optional.of(saved));

        ChatResponse response = service.chat(employee, new ChatRequest(
                "调班怎么办", "KNOWLEDGE_ONLY", null, "request-123",
                System.currentTimeMillis() + 10_000));

        assertEquals("message-old", response.messageId());
        assertEquals("UP", response.feedback());
        verify(repository, never()).consumeQuota(any(), anyInt());
        verify(rateLimiter, never()).check(any());
    }

    @Test
    void expiredClientDeadlineRejectsBeforeQuotaAndExternalCalls() {
        assertThrows(BusinessException.class, () -> service.chat(employee, new ChatRequest(
                "调班怎么办", "KNOWLEDGE_ONLY", null, "request-456",
                System.currentTimeMillis() - 1)));

        verify(repository, never()).consumeQuota(any(), anyInt());
        verify(embeddingClient, never()).embed(anyList());
    }

    @Test
    void feedbackPersistenceFailureIsNotReportedAsSuccess() {
        doThrow(new BusinessException(404, "消息不存在"))
                .when(repository).saveFeedback(employee, "missing-message", "UP", "");

        assertThrows(BusinessException.class, () -> service.feedback(
                employee, new FeedbackRequest("missing-message", "UP", "")));
    }

    @Test
    void rateLimitRejectsBeforeDailyQuotaAndExternalCalls() {
        doThrow(new BusinessException(429, "提问过于频繁，请稍后再试"))
                .when(rateLimiter).check(employee);

        assertThrows(BusinessException.class, () -> service.chat(
                employee, new ChatRequest("调班怎么申请", "KNOWLEDGE_ONLY", null)));

        verify(repository, never()).consumeQuota(any(), anyInt());
        verify(embeddingClient, never()).embed(anyList());
    }

    @Test
    void statusIsNotReadyUntilKnowledgeDocumentsAreIndexed() {
        when(repository.countReadyDocuments()).thenReturn(0);

        Map<String, Object> status = service.status();

        assertEquals("LOCAL_KNOWLEDGE", status.get("phase"));
        assertEquals(false, status.get("ready"));
    }
}
