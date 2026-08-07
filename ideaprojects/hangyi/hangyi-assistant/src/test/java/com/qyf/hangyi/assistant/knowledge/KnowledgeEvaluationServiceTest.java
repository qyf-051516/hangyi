package com.qyf.hangyi.assistant.knowledge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.assistant.client.EmbeddingClient;
import com.qyf.hangyi.assistant.client.VectorStore;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KnowledgeEvaluationServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void calculatesRecallAt5AndListsMisses() throws Exception {
        Path questions = tempDir.resolve("questions.json");
        Files.writeString(questions, """
                [
                  {
                    "id": "hit",
                    "question": "调班怎么申请",
                    "expectedSourcePaths": ["03.md"],
                    "admin": false
                  },
                  {
                    "id": "miss",
                    "question": "管理员如何发布",
                    "expectedSourcePaths": ["06.md"],
                    "admin": true
                  }
                ]
                """);
        AssistantProperties properties = new AssistantProperties();
        properties.setEvaluationPath(questions);
        EmbeddingClient embeddingClient = mock(EmbeddingClient.class);
        VectorStore vectorStore = mock(VectorStore.class);
        when(embeddingClient.embed(anyList())).thenReturn(List.of(List.of(0.1, 0.2)));
        when(vectorStore.query(anyList(), anyBoolean(), anyInt(), anyDouble()))
                .thenReturn(List.of(new RetrievedChunk(
                        "c1", "d1", "调班", "提交", "03.md",
                        "EMPLOYEE", "正文", 0.8
                )));
        KnowledgeEvaluationService service = new KnowledgeEvaluationService(
                properties,
                new ObjectMapper(),
                embeddingClient,
                vectorStore
        );

        EvaluationReport report = service.evaluate();

        assertEquals(2, report.total());
        assertEquals(1, report.hits());
        assertEquals(0.5, report.recallAt5());
        assertEquals(List.of("miss"), report.missedQuestionIds());
        verify(vectorStore, org.mockito.Mockito.times(2)).query(
                anyList(), anyBoolean(), anyInt(),
                org.mockito.ArgumentMatchers.eq(properties.getScoreThreshold()));
    }
}
