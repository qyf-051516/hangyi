package com.qyf.hangyi.common.exception;

import com.qyf.hangyi.common.result.R;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void handleBusinessException() {
        BusinessException e = new BusinessException(500, "业务异常");
        R<Void> r = handler.handleBusinessException(e);
        assertThat(r.getCode()).isEqualTo(500);
        assertThat(r.getMsg()).isEqualTo("业务异常");
    }

    @Test
    void handleAccessDeniedException() {
        AccessDeniedException e = new AccessDeniedException("denied");
        R<Void> r = handler.handleAccessDeniedException(e);
        assertThat(r.getCode()).isEqualTo(403);
        assertThat(r.getMsg()).isEqualTo("权限不足");
    }

    @Test
    void handleGenericException() {
        Exception e = new RuntimeException("server error");
        R<Void> r = handler.handleException(e);
        assertThat(r.getCode()).isEqualTo(500);
        assertThat(r.getMsg()).isEqualTo("服务器内部错误");
    }
}
