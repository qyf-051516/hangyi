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
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@Validated
@RestController
@RequestMapping("/api/assistant/internal")
public class InternalAssistantController {

    private final AssistantService assistantService;

    public InternalAssistantController(AssistantService assistantService) {
        this.assistantService = assistantService;
    }

    @GetMapping("/status")
    public R<Map<String, Object>> status() {
        return R.ok(assistantService.status());
    }

    @PostMapping("/chat")
    public R<ChatResponse> chat(
            @RequestHeader("X-Wechat-Openid")
            @NotBlank @Size(max = 128) String openid,
            @RequestHeader(value = "X-Wechat-Employee-No", defaultValue = "")
            @Size(max = 32) String employeeNo,
            @RequestHeader(value = "X-Wechat-Name", defaultValue = "")
            @Size(max = 200) String encodedName,
            @RequestHeader(value = "X-Wechat-Is-Admin", defaultValue = "false")
            @Pattern(regexp = "true|false") String isAdmin,
            @Valid @RequestBody ChatRequest request
    ) {
        return R.ok(assistantService.chat(
                miniProgramIdentity(openid, employeeNo, encodedName, isAdmin),
                request
        ));
    }

    @GetMapping("/history")
    public R<List<ChatResponse>> history(
            @RequestHeader("X-Wechat-Openid")
            @NotBlank @Size(max = 128) String openid,
            @RequestHeader(value = "X-Wechat-Employee-No", defaultValue = "")
            @Size(max = 32) String employeeNo,
            @RequestHeader(value = "X-Wechat-Name", defaultValue = "")
            @Size(max = 200) String encodedName,
            @RequestHeader(value = "X-Wechat-Is-Admin", defaultValue = "false")
            @Pattern(regexp = "true|false") String isAdmin,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit
    ) {
        return R.ok(assistantService.history(
                miniProgramIdentity(openid, employeeNo, encodedName, isAdmin),
                limit
        ));
    }

    @PostMapping("/feedback")
    public R<Map<String, Object>> feedback(
            @RequestHeader("X-Wechat-Openid")
            @NotBlank @Size(max = 128) String openid,
            @RequestHeader(value = "X-Wechat-Employee-No", defaultValue = "")
            @Size(max = 32) String employeeNo,
            @RequestHeader(value = "X-Wechat-Name", defaultValue = "")
            @Size(max = 200) String encodedName,
            @RequestHeader(value = "X-Wechat-Is-Admin", defaultValue = "false")
            @Pattern(regexp = "true|false") String isAdmin,
            @Valid @RequestBody FeedbackRequest request
    ) {
        return R.ok(assistantService.feedback(
                miniProgramIdentity(openid, employeeNo, encodedName, isAdmin),
                request
        ));
    }

    private AssistantIdentity miniProgramIdentity(
            String openid,
            String employeeNo,
            String encodedName,
            String isAdmin
    ) {
        String displayName = URLDecoder.decode(encodedName, StandardCharsets.UTF_8);
        return new AssistantIdentity(
                "MINIPROGRAM",
                openid,
                employeeNo,
                displayName,
                Boolean.parseBoolean(isAdmin)
        );
    }
}
