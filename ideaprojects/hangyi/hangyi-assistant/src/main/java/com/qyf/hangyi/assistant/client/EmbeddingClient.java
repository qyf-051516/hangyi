package com.qyf.hangyi.assistant.client;

import java.util.List;

public interface EmbeddingClient {

    List<List<Double>> embed(List<String> texts);
}
