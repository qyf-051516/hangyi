package com.qyf.hangyi.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.auth.dto.LoginRequest;
import com.qyf.hangyi.auth.dto.LoginResponse;
import com.qyf.hangyi.auth.entity.SysUser;
import com.qyf.hangyi.auth.mapper.SysUserMapper;
import com.qyf.hangyi.auth.security.JwtUtil;
import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SysUserService {

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private JwtUtil jwtUtil;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public LoginResponse login(LoginRequest request) {
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, request.getUsername())
        );
        if (user == null) {
            throw new BusinessException("用户名或密码错误");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException("用户名或密码错误");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException("账号已被禁用");
        }

        return buildLoginResponse(user);
    }

    public LoginResponse wechatLogin(String openid) {
        SysUser user = sysUserMapper.findByWechatOpenid(openid);
        if (user == null) {
            throw new BusinessException("微信账号未绑定，请先使用账号密码登录后绑定");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException("账号已被禁用");
        }

        return buildLoginResponse(user);
    }

    public SysUser getUserFromToken(String token) {
        if (!jwtUtil.isTokenValid(token)) {
            throw new BusinessException(401, "token无效或已过期");
        }
        Long userId = jwtUtil.getUserId(token);
        return sysUserMapper.selectById(userId);
    }

    private LoginResponse buildLoginResponse(SysUser user) {
        List<String> roles = sysUserMapper.findRoleCodesByUserId(user.getId());
        String token = jwtUtil.generateToken(user.getId(), user.getUsername(), roles);

        LoginResponse resp = new LoginResponse();
        resp.setToken(token);
        resp.setUserId(user.getId());
        resp.setRealName(user.getRealName());
        resp.setUsername(user.getUsername());
        return resp;
    }
}
