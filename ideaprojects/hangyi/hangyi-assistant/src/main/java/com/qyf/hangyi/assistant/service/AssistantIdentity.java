package com.qyf.hangyi.assistant.service;

public record AssistantIdentity(
        String channel,
        String subject,
        String employeeNo,
        String displayName,
        boolean admin
) {
}
