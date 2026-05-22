package com.qyf.hangyi.common.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FeignConfigTest {

    private final RequestInterceptor interceptor = new FeignConfig().userContextInterceptor();

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void interceptor_shouldSetUserIdAndRolesHeaders() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("1", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertThat(template.headers()).containsKey("X-User-Id");
        assertThat(template.headers().get("X-User-Id")).contains("1");
        assertThat(template.headers().get("X-User-Roles")).contains("ADMIN");
    }

    @Test
    void interceptor_shouldStripRolePrefix() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("1", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"),
                                new SimpleGrantedAuthority("ROLE_TEAM_LEADER"))));

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        String roles = String.join(",", template.headers().get("X-User-Roles"));
        assertThat(roles).doesNotContain("ROLE_");
        assertThat(roles).contains("ADMIN");
        assertThat(roles).contains("TEAM_LEADER");
    }

    @Test
    void interceptor_shouldSetUserNameFromDetails() {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("1", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        auth.setDetails("张三");
        SecurityContextHolder.getContext().setAuthentication(auth);

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertThat(template.headers().get("X-User-Name")).contains("张三");
    }

    @Test
    void interceptor_shouldNotSetHeadersWhenNoAuth() {
        SecurityContextHolder.clearContext();
        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);
        assertThat(template.headers()).isEmpty();
    }
}
