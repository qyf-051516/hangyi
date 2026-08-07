package com.qyf.hangyi.assistant.knowledge;

public record KnowledgeChunk(
        String id,
        String documentId,
        String title,
        String section,
        String sourcePath,
        String version,
        String visibility,
        String checksum,
        String content
) {
}
