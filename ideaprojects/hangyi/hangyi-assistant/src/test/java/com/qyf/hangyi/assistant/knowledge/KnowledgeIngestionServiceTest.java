package com.qyf.hangyi.assistant.knowledge;

import com.qyf.hangyi.assistant.client.EmbeddingClient;
import com.qyf.hangyi.assistant.client.VectorStore;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.assistant.repository.AssistantRepository;
import com.qyf.hangyi.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KnowledgeIngestionServiceTest {

    @TempDir
    Path tempDir;

    private AssistantProperties properties;
    private AssistantRepository repository;
    private EmbeddingClient embeddingClient;
    private VectorStore vectorStore;
    private KnowledgeIngestionService service;

    @BeforeEach
    void setUp() {
        properties = new AssistantProperties();
        properties.setKnowledgePath(tempDir);
        repository = mock(AssistantRepository.class);
        embeddingClient = mock(EmbeddingClient.class);
        vectorStore = mock(VectorStore.class);
        service = new KnowledgeIngestionService(
                properties,
                new MarkdownKnowledgeLoader(),
                repository,
                embeddingClient,
                vectorStore
        );
    }

    @Test
    void dryRunOnlyReportsChanges() throws Exception {
        Files.writeString(tempDir.resolve("one.md"), "# 文档\n\n## 章节\n\n业务内容");
        when(repository.listDocuments()).thenReturn(List.of());

        IngestionReport report = service.run("dry-run");

        assertEquals(1, report.scannedDocuments());
        assertEquals(1, report.changedDocuments());
        assertEquals(1, report.indexedChunks());
        verify(vectorStore, never()).ensureCollection();
        verify(embeddingClient, never()).embed(anyList());
    }

    @Test
    void incrementalIndexesChangedAndDeletesMissingDocuments() throws Exception {
        Files.writeString(tempDir.resolve("one.md"), "# 文档\n\n## 章节\n\n业务内容");
        AssistantRepository.DocumentState stale = new AssistantRepository.DocumentState(
                "stale-id", "旧文档", "old.md", "old", "1", "EMPLOYEE", "READY", 1
        );
        when(repository.listDocuments()).thenReturn(List.of(stale));
        when(embeddingClient.embed(anyList())).thenAnswer(invocation -> {
            List<String> values = invocation.getArgument(0);
            return values.stream()
                    .map(value -> Collections.nCopies(4, 0.1))
                    .toList();
        });

        IngestionReport report = service.run("incremental");

        assertEquals(1, report.changedDocuments());
        assertEquals(1, report.removedDocuments());
        verify(vectorStore).ensureCollection();
        verify(vectorStore).upsert(anyList(), anyList());
        verify(vectorStore).deleteDocument("stale-id");
        verify(repository).deleteDocument("stale-id");
    }

    @Test
    void fullRebuildRequiresExplicitConfirmation() throws Exception {
        Files.writeString(tempDir.resolve("one.md"), "# 文档\n\n正文");
        when(repository.listDocuments()).thenReturn(List.of());

        assertThrows(BusinessException.class, () -> service.run("full"));
        verify(vectorStore, never()).recreateCollection();
    }
}
