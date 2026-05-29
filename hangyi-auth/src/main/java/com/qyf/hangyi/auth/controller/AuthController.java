package com.qyf.hangyi.auth.controller;

import com.qyf.hangyi.auth.dto.LoginRequest;
import com.qyf.hangyi.auth.dto.LoginResponse;
import com.qyf.hangyi.auth.dto.WechatLoginRequest;
import com.qyf.hangyi.auth.entity.SysUser;
import com.qyf.hangyi.auth.service.SysUserService;
import com.qyf.hangyi.common.constant.AuthConstant;
import com.qyf.hangyi.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private SysUserService sysUserService;

    @Value("${internal.api-key:}")
    private String internalApiKey;

    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return R.ok(sysUserService.login(request));
    }

    @PostMapping("/wechat-login")
    public R<LoginResponse> wechatLogin(@Valid @RequestBody WechatLoginRequest request) {
        return R.ok(sysUserService.wechatLogin(request.getOpenid()));
    }

    @GetMapping("/verify")
    public R<Map<String, Object>> verify(HttpServletRequest request) {
        String apiKey = request.getHeader("X-Internal-API-Key");
        if (internalApiKey != null && !internalApiKey.isBlank() && !internalApiKey.equals(apiKey)) {
            return R.forbidden("无权访问");
        }

        String authHeader = request.getHeader(AuthConstant.AUTHORIZATION_HEADER);
        if (authHeader == null || !authHeader.startsWith(AuthConstant.BEARER_PREFIX)) {
            return R.unauthorized("未提供token");
        }

        String token = authHeader.substring(7);
        SysUser user = sysUserService.getUserFromToken(token);

        return R.ok(Map.of(
                "userId", user.getId(),
                "username", user.getUsername(),
                "realName", user.getRealName(),
                "status", user.getStatus(),
                "wechatOpenid", user.getWechatOpenid() != null ? user.getWechatOpenid() : ""
        ));
    }
}
