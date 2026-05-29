package com.qyf.hangyi.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class WechatLoginRequest {
    @NotBlank(message = "微信OPENID不能为空")
    private String openid;
}
