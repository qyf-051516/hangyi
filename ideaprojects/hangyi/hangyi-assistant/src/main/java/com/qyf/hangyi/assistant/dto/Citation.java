package com.qyf.hangyi.assistant.dto;

public record Citation(
        String id,
        String title,
        String section,
        String sourcePath,
        Double score
) {
}
