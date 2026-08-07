package com.qyf.hangyi.assistant.knowledge;

import com.qyf.hangyi.assistant.client.EmbeddingClient;
import com.qyf.hangyi.assistant.client.VectorStore;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.assistant.repository.AssistantRepository;
import com.qyf.hangyi.assistant.repository.AssistantRepository.DocumentState;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class KnowledgeIngestionService {

    private static final int EMBEDDING_BATCH_SIZE = 16;

    private final AssistantProperties properties;
    private final MarkdownKnowledgeLoader loader;
    private final AssistantRepository repository;
    private final EmbeddingClient embeddingClient;
    private final VectorStore vectorStore;

    public KnowledgeIngestionService(
            AssistantProperties properties,
            MarkdownKnowledgeLoader loader,
            AssistantRepository repository,
            EmbeddingClient embeddingClient,
            VectorStore vectorStore
    ) {
        this.properties = properties;
        this.loader = loader;
        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.vectorStore = vectorStore;
    }

    public IngestionReport run(String requestedMode) {
        String mode = normalizeMode(requestedMode);
        List<LoadedKnowledgeDocument> sourceDocuments = loader.load(properties.getKnowledgePath());
        Map<String, DocumentState> storedByPath = new HashMap<>();
        repository.listDocuments().forEach(document -> storedByPath.put(document.sourcePath(), document));
        Set<String> sourcePaths = new HashSet<>();
        sourceDocuments.forEach(document -> sourcePaths.add(document.sourcePath()));

        List<LoadedKnowledgeDocument> changed = sourceDocuments.stream()
                .filter(document -> {
                    DocumentState stored = storedByPath.get(document.sourcePath());
                    return "full".equals(mode)
                            || stored == null
                            || !stored.checksum().equals(document.checksum())
                            || !"READY".equals(stored.status());
                })
                .toList();
        List<DocumentState> removed = storedByPath.values().stream()
                .filter(document -> !sourcePaths.contains(document.sourcePath()))
                .toList();
        int unchanged = sourceDocuments.size() - changed.size();
        int chunkCount = changed.stream().mapToInt(document -> document.chunks().size()).sum();

        if ("dry-run".equals(mode)) {
            return new IngestionReport(
                    mode,
                    sourceDocuments.size(),
                    changed.size(),
                    unchanged,
                    removed.size(),
                    chunkCount
            );
        }
        if ("full".equals(mode) && !properties.isConfirmFullRebuild()) {
            throw new BusinessException(
                    400,
                    "全量重建需同时设置 ASSISTANT_CONFIRM_FULL_REBUILD=true"
            );
        }

        if ("full".equals(mode)) {
            vectorStore.recreateCollection();
        } else {
            vectorStore.ensureCollection();
        }

        int indexedChunks = 0;
        for (LoadedKnowledgeDocument document : changed) {
            DocumentState state = toState(document, "INDEXING", 0);
            repository.markDocumentIndexing(state);
            try {
                if (!"full".equals(mode)) {
                    vectorStore.deleteDocument(document.id());
                }
                indexDocument(document);
                repository.markDocumentReady(document.id(), document.chunks().size());
                indexedChunks += document.chunks().size();
            } catch (RuntimeException error) {
                repository.markDocumentFailed(document.id());
                throw error;
            }
        }
        for (DocumentState stale : removed) {
            vectorStore.deleteDocument(stale.id());
            repository.deleteDocument(stale.id());
        }
        return new IngestionReport(
                mode,
                sourceDocuments.size(),
                changed.size(),
                unchanged,
                removed.size(),
                indexedChunks
        );
    }

    private void indexDocument(LoadedKnowledgeDocument document) {
        List<KnowledgeChunk> chunks = document.chunks();
        for (int start = 0; start < chunks.size(); start += EMBEDDING_BATCH_SIZE) {
            int end = Math.min(chunks.size(), start + EMBEDDING_BATCH_SIZE);
            List<KnowledgeChunk> batch = new ArrayList<>(chunks.subList(start, end));
            List<String> texts = batch.stream()
                    .map(chunk -> chunk.title() + "\n" + chunk.section() + "\n" + chunk.content())
                    .toList();
            vectorStore.upsert(batch, embeddingClient.embed(texts));
        }
    }

    private DocumentState toState(
            LoadedKnowledgeDocument document,
            String status,
            int chunkCount
    ) {
        return new DocumentState(
                document.id(),
                document.title(),
                document.sourcePath(),
                document.checksum(),
                document.version(),
                document.visibility(),
                status,
                chunkCount
        );
    }

    private String normalizeMode(String requestedMode) {
        String mode = requestedMode == null
                ? ""
                : requestedMode.trim().toLowerCase(Locale.ROOT);
        if (!List.of("dry-run", "incremental", "full").contains(mode)) {
            throw new BusinessException(400, "入库模式只能是 dry-run、incremental 或 full");
        }
        return mode;
    }
}
