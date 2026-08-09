package com.qyf.hangyi.core.auth.controller;

import com.qyf.hangyi.core.auth.dto.LoginRequest;
import com.qyf.hangyi.core.auth.dto.LoginResponse;
import com.qyf.hangyi.core.auth.dto.LogoutRequest;
import com.qyf.hangyi.core.auth.dto.WechatLoginRequest;
import com.qyf.hangyi.core.auth.entity.SysUser;
import com.qyf.hangyi.core.auth.service.SysUserService;
import com.qyf.hangyi.common.constant.AuthConstant;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private SysUserService sysUserService;

    @Value("${internal.api-key}")
    private String internalApiKey;

    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return R.ok(sysUserService.login(request));
    }

    @PostMapping("/wechat-login")
    public R<LoginResponse> wechatLogin(@Valid @RequestBody WechatLoginRequest request) {
        return R.ok(sysUserService.wechatLogin(request.getCode()));
    }

    @PostMapping("/logout")
    public R<Void> logout(HttpServletRequest request,
                          @RequestBody(required = false) LogoutRequest logoutRequest) {
        String authHeader = request.getHeader(AuthConstant.AUTHORIZATION_HEADER);
        if (authHeader != null && authHeader.startsWith(AuthConstant.BEARER_PREFIX)) {
            sysUserService.revokeToken(authHeader.substring(7));
        }
        if (logoutRequest != null && logoutRequest.getRefreshToken() != null
                && !logoutRequest.getRefreshToken().isBlank()) {
            sysUserService.revokeToken(logoutRequest.getRefreshToken());
        }
        return R.ok();
    }

    /**
     * H-3: Token 刷新端点。接收 refresh token，返回新的 access token。
     */
    @PostMapping("/refresh")
    public R<LoginResponse> refresh(HttpServletRequest request) {
        String authHeader = request.getHeader(AuthConstant.AUTHORIZATION_HEADER);
        if (authHeader == null || !authHeader.startsWith(AuthConstant.BEARER_PREFIX)) {
            throw new BusinessException(401, "未提供token");
        }
        String token = authHeader.substring(7);
        return R.ok(sysUserService.refreshLogin(token));
    }

    @GetMapping("/verify")
    public R<Map<String, Object>> verify(HttpServletRequest request) {
        String apiKey = request.getHeader("X-Internal-API-Key");
        if (internalApiKey == null || internalApiKey.isBlank() || apiKey == null
                || !MessageDigest.isEqual(
                    internalApiKey.getBytes(StandardCharsets.UTF_8),
                    apiKey.getBytes(StandardCharsets.UTF_8))) {
            throw new BusinessException(403, "无权访问");
        }

        String authHeader = request.getHeader(AuthConstant.AUTHORIZATION_HEADER);
        if (authHeader == null || !authHeader.startsWith(AuthConstant.BEARER_PREFIX)) {
            throw new BusinessException(401, "未提供token");
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
