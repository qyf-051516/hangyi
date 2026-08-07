package com.qyf.hangyi.core.auth.dto;

import lombok.Data;

@Data
public class LogoutRequest {
    private String refreshToken;
}
