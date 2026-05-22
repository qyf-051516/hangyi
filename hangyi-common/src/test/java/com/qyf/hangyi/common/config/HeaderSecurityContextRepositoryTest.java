package com.qyf.hangyi.common.config;

import com.qyf.hangyi.common.constant.AuthConstant;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpRequestResponseHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class HeaderSecurityContextRepositoryTest {

    @Test
    void testLoadContext_WithHeaders() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(request.getHeader(AuthConstant.X_USER_ID)).thenReturn("1");
        when(request.getHeader(AuthConstant.X_USER_ROLES)).thenReturn("ADMIN,STAFF");

        HttpRequestResponseHolder holder = new HttpRequestResponseHolder(request, response);
        HeaderSecurityContextRepository repository = new HeaderSecurityContextRepository();

        SecurityContext context = repository.loadContext(holder);

        assertThat(context.getAuthentication()).isInstanceOf(UsernamePasswordAuthenticationToken.class);
        UsernamePasswordAuthenticationToken auth =
                (UsernamePasswordAuthenticationToken) context.getAuthentication();
        assertThat(auth.getPrincipal()).isEqualTo("1");
        assertThat(auth.getAuthorities()).hasSize(2);
        assertThat(auth.getAuthorities())
                .extracting(GrantedAuthority::getAuthority)
                .containsExactly("ROLE_ADMIN", "ROLE_STAFF");
        assertThat(auth.getDetails()).isEqualTo("1");
    }

    @Test
    void testLoadContext_WithoutHeaders() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(request.getHeader(AuthConstant.X_USER_ID)).thenReturn(null);

        HttpRequestResponseHolder holder = new HttpRequestResponseHolder(request, response);
        HeaderSecurityContextRepository repository = new HeaderSecurityContextRepository();

        SecurityContext context = repository.loadContext(holder);

        assertThat(context.getAuthentication()).isNull();
    }

    @Test
    void testContainsContext_WithHeaders() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader(AuthConstant.X_USER_ID)).thenReturn("1");
        when(request.getHeader(AuthConstant.X_USER_ROLES)).thenReturn("ADMIN");

        HeaderSecurityContextRepository repository = new HeaderSecurityContextRepository();
        assertThat(repository.containsContext(request)).isTrue();
    }

    @Test
    void testContainsContext_WithoutHeaders() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader(AuthConstant.X_USER_ID)).thenReturn(null);

        HeaderSecurityContextRepository repository = new HeaderSecurityContextRepository();
        assertThat(repository.containsContext(request)).isFalse();
    }

    @Test
    void testSaveContext_NoOp() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        SecurityContext context = SecurityContextHolder.createEmptyContext();

        HeaderSecurityContextRepository repository = new HeaderSecurityContextRepository();
        repository.saveContext(context, request, response);
        // no-op, should not throw
    }
}
