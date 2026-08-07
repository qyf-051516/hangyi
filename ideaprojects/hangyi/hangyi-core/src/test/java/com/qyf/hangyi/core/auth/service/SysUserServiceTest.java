package com.qyf.hangyi.core.auth.service;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.core.auth.dto.LoginRequest;
import com.qyf.hangyi.core.auth.dto.LoginResponse;
import com.qyf.hangyi.core.auth.entity.SysUser;
import com.qyf.hangyi.core.auth.mapper.SysUserMapper;
import com.qyf.hangyi.core.auth.security.JwtUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SysUserServiceTest {

    @Mock
    private SysUserMapper userMapper;

    @Mock
    private JwtUtil jwtUtil;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private WechatAuthClient wechatAuthClient;

    @InjectMocks
    private SysUserService service;

    @Test
    void loginUsesPasswordEncoderAndIssuesBothTokenTypes() {
        LoginRequest request = new LoginRequest();
        request.setUsername("admin");
        request.setPassword("secret");
        SysUser user = activeUser();
        user.setPassword("$2b$12$hash");
        when(userMapper.selectOne(any())).thenReturn(user);
        when(passwordEncoder.matches("secret", "$2b$12$hash")).thenReturn(true);
        when(userMapper.findRoleCodesByUserId(1L)).thenReturn(List.of("ADMIN"));
        when(jwtUtil.generateToken(1L, "admin", List.of("ADMIN"))).thenReturn("access");
        when(jwtUtil.generateRefreshToken(1L, "admin", List.of("ADMIN"))).thenReturn("refresh");

        LoginResponse response = service.login(request);

        assertThat(response.getToken()).isEqualTo("access");
        assertThat(response.getRefreshToken()).isEqualTo("refresh");
        verify(passwordEncoder).matches("secret", "$2b$12$hash");
    }

    @Test
    void loginNeverFallsBackToPlaintextComparison() {
        LoginRequest request = new LoginRequest();
        request.setUsername("admin");
        request.setPassword("secret");
        SysUser user = activeUser();
        user.setPassword("secret");
        when(userMapper.selectOne(any())).thenReturn(user);
        when(passwordEncoder.matches("secret", "secret")).thenReturn(false);

        assertThatThrownBy(() -> service.login(request))
                .isInstanceOf(BusinessException.class)
                .satisfies(exception ->
                        assertThat(((BusinessException) exception).getCode()).isEqualTo(401));
        verify(jwtUtil, never()).generateToken(any(), any(), any());
    }

    @Test
    void wechatLoginUsesVerifiedOpenidInsteadOfTrustingClientIdentity() {
        SysUser user = activeUser();
        when(wechatAuthClient.exchangeCodeForOpenid("temporary-code")).thenReturn("verified-openid");
        when(userMapper.findByWechatOpenid("verified-openid")).thenReturn(user);
        when(userMapper.findRoleCodesByUserId(1L)).thenReturn(List.of("STAFF"));
        when(jwtUtil.generateToken(1L, "admin", List.of("STAFF"))).thenReturn("access");
        when(jwtUtil.generateRefreshToken(1L, "admin", List.of("STAFF"))).thenReturn("refresh");

        LoginResponse response = service.wechatLogin("temporary-code");

        assertThat(response.getUserId()).isEqualTo(1L);
        verify(userMapper).findByWechatOpenid("verified-openid");
    }

    @Test
    void refreshRotatesAndRevokesThePresentedRefreshToken() {
        SysUser user = activeUser();
        when(jwtUtil.isRefreshTokenValid("old-refresh")).thenReturn(true);
        when(jwtUtil.getUserId("old-refresh")).thenReturn(1L);
        when(userMapper.selectById(1L)).thenReturn(user);
        when(userMapper.findRoleCodesByUserId(1L)).thenReturn(List.of("ADMIN"));
        when(jwtUtil.generateToken(1L, "admin", List.of("ADMIN"))).thenReturn("new-access");
        when(jwtUtil.generateRefreshToken(1L, "admin", List.of("ADMIN"))).thenReturn("new-refresh");

        LoginResponse response = service.refreshLogin("old-refresh");

        assertThat(response.getToken()).isEqualTo("new-access");
        assertThat(response.getRefreshToken()).isEqualTo("new-refresh");
        verify(jwtUtil).revokeToken("old-refresh");
    }

    private SysUser activeUser() {
        SysUser user = new SysUser();
        user.setId(1L);
        user.setUsername("admin");
        user.setRealName("管理员");
        user.setStatus(1);
        return user;
    }
}
