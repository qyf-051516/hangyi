package com.qyf.hangyi.assistant.service;

import com.qyf.hangyi.assistant.dto.ChatRequest;
import com.qyf.hangyi.assistant.dto.ChatResponse;
import com.qyf.hangyi.assistant.dto.FeedbackRequest;

import java.util.List;
import java.util.Map;

public interface AssistantService {

    Map<String, Object> status();

    ChatResponse chat(AssistantIdentity identity, ChatRequest request);

    List<ChatResponse> history(AssistantIdentity identity, int limit);

    Map<String, Object> feedback(AssistantIdentity identity, FeedbackRequest request);
}
