package com.qyf.hangyi.assistant.client;

import com.qyf.hangyi.assistant.knowledge.RetrievedChunk;

import java.util.List;

public interface ChatModelClient {

    String generate(String question, List<RetrievedChunk> chunks);
}
