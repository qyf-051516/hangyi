package com.qyf.hangyi.auth.controller;

import com.qyf.hangyi.auth.dto.LoginRequest;
import com.qyf.hangyi.auth.dto.LoginResponse;
import com.qyf.hangyi.auth.service.SysUserService;
import com.qyf.hangyi.common.result.R;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private SysUserService sysUserService;

    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return R.ok(sysUserService.login(request));
    }
}
