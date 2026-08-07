package com.qyf.hangyi.assistant.knowledge;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.assistant.client.EmbeddingClient;
import com.qyf.hangyi.assistant.client.VectorStore;
import com.qyf.hangyi.assistant.config.AssistantProperties;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class KnowledgeEvaluationService {

    private static final TypeReference<List<EvaluationQuestion>> QUESTION_LIST =
            new TypeReference<>() { };

    private final AssistantProperties properties;
    private final ObjectMapper objectMapper;
    private final EmbeddingClient embeddingClient;
    private final VectorStore vectorStore;

    public KnowledgeEvaluationService(
            AssistantProperties properties,
            ObjectMapper objectMapper,
            EmbeddingClient embeddingClient,
            VectorStore vectorStore
    ) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.embeddingClient = embeddingClient;
        this.vectorStore = vectorStore;
    }

    public EvaluationReport evaluate() {
        List<EvaluationQuestion> questions = readQuestions();
        List<String> missed = new ArrayList<>();
        int hits = 0;
        for (EvaluationQuestion question : questions) {
            if (question.question() == null
                    || question.question().isBlank()
                    || question.expectedSourcePaths() == null
                    || question.expectedSourcePaths().isEmpty()) {
                throw new BusinessException(400, "知识评测题格式无效: " + question.id());
            }
            List<Double> vector = embeddingClient.embed(List.of(question.question())).get(0);
            List<RetrievedChunk> chunks = vectorStore.query(
                    vector,
                    question.admin(),
                    5,
                    properties.getScoreThreshold()
            );
            Set<String> retrievedPaths = new HashSet<>();
            chunks.forEach(chunk -> retrievedPaths.add(chunk.sourcePath()));
            boolean hit = question.expectedSourcePaths().stream().anyMatch(retrievedPaths::contains);
            if (hit) {
                hits++;
            } else {
                missed.add(question.id());
            }
        }
        double recall = questions.isEmpty() ? 0.0 : (double) hits / questions.size();
        return new EvaluationReport(
                questions.size(),
                hits,
                Math.round(recall * 10000.0) / 10000.0,
                List.copyOf(missed)
        );
    }

    private List<EvaluationQuestion> readQuestions() {
        try {
            if (!Files.isRegularFile(properties.getEvaluationPath())) {
                throw new BusinessException(400, "知识评测题集不存在");
            }
            List<EvaluationQuestion> questions = objectMapper.readValue(
                    properties.getEvaluationPath().toFile(),
                    QUESTION_LIST
            );
            if (questions.isEmpty()) {
                throw new BusinessException(400, "知识评测题集不能为空");
            }
            return questions;
        } catch (BusinessException error) {
            throw error;
        } catch (Exception error) {
            throw new BusinessException(500, "知识评测题集读取失败");
        }
    }
}
