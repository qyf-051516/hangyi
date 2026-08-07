package com.qyf.hangyi.assistant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record ChatRequest(
        @NotBlank(message = "问题不能为空")
        @Size(max = 500, message = "问题不能超过500字")
        String question,

        @Pattern(
                regexp = "KNOWLEDGE_ONLY|KNOWLEDGE_AND_LIVE",
                message = "问答模式无效"
        )
        String mode,

        @Size(max = 64, message = "会话标识不能超过64字符") String sessionId,

        @Pattern(regexp = "[A-Za-z0-9._:-]{8,64}", message = "请求标识格式无效")
        String requestId,

        Long deadlineAt
) {
    public ChatRequest(String question, String mode, String sessionId) {
        this(question, mode, sessionId, null, null);
    }

    public String normalizedQuestion() {
        return question == null ? "" : question.trim();
    }

    public String normalizedMode() {
        return mode == null || mode.isBlank() ? "KNOWLEDGE_ONLY" : mode;
    }

    public String normalizedRequestId() {
        return requestId == null || requestId.isBlank() ? null : requestId.trim();
    }

    public boolean deadlineExpired() {
        return deadlineAt != null && deadlineAt <= Instant.now().toEpochMilli();
    }
}
