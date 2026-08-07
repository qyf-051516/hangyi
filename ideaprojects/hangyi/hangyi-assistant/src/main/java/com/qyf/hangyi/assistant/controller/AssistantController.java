package com.qyf.hangyi.assistant.controller;

import com.qyf.hangyi.assistant.dto.ChatRequest;
import com.qyf.hangyi.assistant.dto.ChatResponse;
import com.qyf.hangyi.assistant.dto.FeedbackRequest;
import com.qyf.hangyi.assistant.service.AssistantIdentity;
import com.qyf.hangyi.assistant.service.AssistantService;
import com.qyf.hangyi.common.result.R;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Validated
@RestController
@RequestMapping("/api/assistant")
public class AssistantController {

    private final AssistantService assistantService;

    public AssistantController(AssistantService assistantService) {
        this.assistantService = assistantService;
    }

    @GetMapping("/health")
    public R<Map<String, Object>> health() {
        return R.ok(assistantService.status());
    }

    @PostMapping("/chat")
    public R<ChatResponse> chat(
            Authentication authentication,
            @Valid @RequestBody ChatRequest request
    ) {
        return R.ok(assistantService.chat(webIdentity(authentication), request));
    }

    @GetMapping("/history")
    public R<List<ChatResponse>> history(
            Authentication authentication,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit
    ) {
        return R.ok(assistantService.history(webIdentity(authentication), limit));
    }

    @PostMapping("/feedback")
    public R<Map<String, Object>> feedback(
            Authentication authentication,
            @Valid @RequestBody FeedbackRequest request
    ) {
        return R.ok(assistantService.feedback(webIdentity(authentication), request));
    }

    private AssistantIdentity webIdentity(Authentication authentication) {
        boolean admin = authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
        String displayName = authentication.getDetails() instanceof String value ? value : "";
        return new AssistantIdentity("WEB", authentication.getName(), "", displayName, admin);
    }
}
