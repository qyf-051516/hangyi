package com.qyf.hangyi.common.config;

import com.qyf.hangyi.common.constant.AuthConstant;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class HeaderAuthFilterTest {

    private final HeaderAuthFilter filter = new HeaderAuthFilter();

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void testDoFilterInternal_WithHeaders() throws Exception {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        FilterChain filterChain = mock(FilterChain.class);

        when(request.getHeader(AuthConstant.X_USER_ID)).thenReturn("1");
        when(request.getHeader(AuthConstant.X_USER_ROLES)).thenReturn("ADMIN,STAFF");

        filter.doFilterInternal(request, response, filterChain);

        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isInstanceOf(UsernamePasswordAuthenticationToken.class);
        assertThat(auth.getPrincipal()).isEqualTo("1");
        assertThat(auth.getAuthorities()).hasSize(2);
        assertThat(auth.getDetails()).isEqualTo("1");

        verify(filterChain).doFilter(request, response);
    }

    @Test
    void testDoFilterInternal_WithoutHeaders() throws Exception {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        FilterChain filterChain = mock(FilterChain.class);

        when(request.getHeader(AuthConstant.X_USER_ID)).thenReturn(null);

        filter.doFilterInternal(request, response, filterChain);

        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNull();

        verify(filterChain).doFilter(request, response);
    }

    @Test
    void testDoFilterInternal_MissingRolesHeader() throws Exception {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        FilterChain filterChain = mock(FilterChain.class);

        when(request.getHeader(AuthConstant.X_USER_ID)).thenReturn("1");
        when(request.getHeader(AuthConstant.X_USER_ROLES)).thenReturn(null);

        filter.doFilterInternal(request, response, filterChain);

        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNull();

        verify(filterChain).doFilter(request, response);
    }
}
