package com.qyf.hangyi.assistant.client;

import com.qyf.hangyi.assistant.knowledge.KnowledgeChunk;
import com.qyf.hangyi.assistant.knowledge.RetrievedChunk;

import java.util.List;

public interface VectorStore {

    void ensureCollection();

    void recreateCollection();

    void upsert(List<KnowledgeChunk> chunks, List<List<Double>> vectors);

    void deleteDocument(String documentId);

    List<RetrievedChunk> query(List<Double> vector, boolean admin, int limit, double threshold);

    boolean isReady();
}
