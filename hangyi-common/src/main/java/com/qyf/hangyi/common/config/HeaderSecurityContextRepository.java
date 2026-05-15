package com.qyf.hangyi.common.config;

import com.qyf.hangyi.common.constant.AuthConstant;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpRequestResponseHolder;
import org.springframework.security.web.context.SecurityContextRepository;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Loads SecurityContext from X-User-Id / X-User-Roles headers.
 * Used by SecurityContextHolderFilter in place of the default repository.
 */
public class HeaderSecurityContextRepository implements SecurityContextRepository {

    private final SecurityContextHolderStrategy securityContextHolderStrategy;

    public HeaderSecurityContextRepository() {
        this.securityContextHolderStrategy = null;
    }

    public HeaderSecurityContextRepository(SecurityContextHolderStrategy strategy) {
        this.securityContextHolderStrategy = strategy;
    }

    @Override
    public SecurityContext loadContext(HttpRequestResponseHolder requestResponseHolder) {
        HttpServletRequest request = requestResponseHolder.getRequest();
        String userId = request.getHeader(AuthConstant.X_USER_ID);
        String roles = request.getHeader(AuthConstant.X_USER_ROLES);

        if (userId == null || roles == null) {
            return getStrategy().createEmptyContext();
        }

        List<SimpleGrantedAuthority> authorities = Arrays.stream(roles.split(","))
                .map(r -> new SimpleGrantedAuthority("ROLE_" + r.trim()))
                .collect(Collectors.toList());

        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(userId, null, authorities);
        auth.setDetails(userId);

        SecurityContext context = getStrategy().createEmptyContext();
        context.setAuthentication(auth);
        return context;
    }

    @Override
    public void saveContext(SecurityContext context, HttpServletRequest request, HttpServletResponse response) {
        // no-op: stateless
    }

    @Override
    public boolean containsContext(HttpServletRequest request) {
        String userId = request.getHeader(AuthConstant.X_USER_ID);
        String roles = request.getHeader(AuthConstant.X_USER_ROLES);
        return userId != null && roles != null;
    }

    private SecurityContextHolderStrategy getStrategy() {
        if (this.securityContextHolderStrategy != null) {
            return this.securityContextHolderStrategy;
        }
        return org.springframework.security.core.context.SecurityContextHolder.getContextHolderStrategy();
    }
}
