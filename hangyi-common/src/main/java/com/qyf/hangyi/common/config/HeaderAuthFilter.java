package com.qyf.hangyi.common.config;

import com.qyf.hangyi.common.constant.AuthConstant;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 下游服务认证过滤器 - 信任网关传递的 X-User-Id / X-User-Roles 头
 */
public class HeaderAuthFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String userId = request.getHeader(AuthConstant.X_USER_ID);
        String roles = request.getHeader(AuthConstant.X_USER_ROLES);

        if (userId != null && roles != null) {
            List<SimpleGrantedAuthority> authorities = Arrays.stream(roles.split(","))
                    .map(r -> new SimpleGrantedAuthority("ROLE_" + r.trim()))
                    .collect(Collectors.toList());

            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(userId, null, authorities);
            auth.setDetails(userId);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);
    }
}
