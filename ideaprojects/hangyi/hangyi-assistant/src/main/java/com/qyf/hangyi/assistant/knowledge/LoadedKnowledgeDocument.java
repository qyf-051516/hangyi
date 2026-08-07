package com.qyf.hangyi.assistant.knowledge;

import java.util.List;

public record LoadedKnowledgeDocument(
        String id,
        String title,
        String sourcePath,
        String version,
        String visibility,
        String checksum,
        List<KnowledgeChunk> chunks
) {
}
