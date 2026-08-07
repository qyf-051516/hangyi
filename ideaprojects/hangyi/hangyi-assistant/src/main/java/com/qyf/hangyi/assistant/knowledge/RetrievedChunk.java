package com.qyf.hangyi.assistant.knowledge;

public record RetrievedChunk(
        String id,
        String documentId,
        String title,
        String section,
        String sourcePath,
        String visibility,
        String content,
        double score
) {
}
