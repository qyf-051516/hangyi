package com.qyf.hangyi.assistant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record FeedbackRequest(
        @NotBlank(message = "消息标识不能为空")
        @Size(max = 64, message = "消息标识不能超过64字符")
        String messageId,

        @NotBlank(message = "反馈类型不能为空")
        @Pattern(regexp = "UP|DOWN", message = "反馈类型无效")
        String rating,

        @Size(max = 500, message = "反馈说明不能超过500字")
        String comment
) {
}
