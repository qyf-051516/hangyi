package com.qyf.hangyi.core.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.core.auth.dto.LoginRequest;
import com.qyf.hangyi.core.auth.dto.LoginResponse;
import com.qyf.hangyi.core.auth.entity.SysUser;
import com.qyf.hangyi.core.auth.mapper.SysUserMapper;
import com.qyf.hangyi.core.auth.security.JwtUtil;
import com.qyf.hangyi.common.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SysUserService {

    private static final Logger log = LoggerFactory.getLogger(SysUserService.class);

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private WechatAuthClient wechatAuthClient;

    public LoginResponse login(LoginRequest request) {
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, request.getUsername())
        );
        if (user == null) {
            throw new BusinessException(401, "用户名或密码错误");
        }

        if (user.getPassword() == null || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException(401, "用户名或密码错误");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(403, "账号已被禁用");
        }

        return buildLoginResponse(user);
    }

    public LoginResponse wechatLogin(String code) {
        String openid = wechatAuthClient.exchangeCodeForOpenid(code);
        SysUser user = sysUserMapper.findByWechatOpenid(openid);
        if (user == null) {
            throw new BusinessException(401, "微信账号未绑定，请先使用账号密码登录后绑定");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(403, "账号已被禁用");
        }

        return buildLoginResponse(user);
    }

    public void revokeToken(String token) {
        jwtUtil.revokeToken(token);
    }

    public SysUser getUserFromToken(String token) {
        if (!jwtUtil.isTokenValid(token)) {
            throw new BusinessException(401, "token无效或已过期");
        }
        return getActiveUser(jwtUtil.getUserId(token));
    }

    public SysUser getUserFromRefreshToken(String token) {
        if (!jwtUtil.isRefreshTokenValid(token)) {
            throw new BusinessException(401, "refresh token无效或已过期");
        }
        return getActiveUser(jwtUtil.getUserId(token));
    }

    public LoginResponse refreshLogin(String refreshToken) {
        SysUser user = getUserFromRefreshToken(refreshToken);
        jwtUtil.revokeToken(refreshToken);
        return buildLoginResponse(user);
    }

    private SysUser getActiveUser(Long userId) {
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(401, "用户不存在");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(401, "账号已被禁用");
        }
        return user;
    }

    private LoginResponse buildLoginResponse(SysUser user) {
        List<String> roles = sysUserMapper.findRoleCodesByUserId(user.getId());
        String token = jwtUtil.generateToken(user.getId(), user.getUsername(), roles);
        String refreshToken = jwtUtil.generateRefreshToken(user.getId(), user.getUsername(), roles);

        LoginResponse resp = new LoginResponse();
        resp.setToken(token);
        resp.setRefreshToken(refreshToken);
        resp.setUserId(user.getId());
        resp.setRealName(user.getRealName());
        resp.setUsername(user.getUsername());
        return resp;
    }
}
