package com.qyf.hangyi.assistant.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ChatResponse(
        String requestId,
        String messageId,
        String sessionId,
        String question,
        String answer,
        List<Citation> sources,
        Integer remainingQuota,
        boolean degraded,
        LocalDateTime createdAt,
        String feedback
) {
    public ChatResponse(
            String requestId,
            String messageId,
            String sessionId,
            String question,
            String answer,
            List<Citation> sources,
            Integer remainingQuota,
            boolean degraded,
            LocalDateTime createdAt
    ) {
        this(requestId, messageId, sessionId, question, answer, sources,
                remainingQuota, degraded, createdAt, null);
    }
}
