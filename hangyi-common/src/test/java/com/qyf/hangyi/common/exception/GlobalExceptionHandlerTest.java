package com.qyf.hangyi.common.exception;

import com.qyf.hangyi.common.result.R;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

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

    @Test
    void handleValidationException() {
        FieldError fieldError1 = new FieldError("obj", "field1", "字段1不能为空");
        FieldError fieldError2 = new FieldError("obj", "field2", "字段2格式错误");

        MethodArgumentNotValidException e = mock(MethodArgumentNotValidException.class);
        when(e.getBindingResult()).thenReturn(new org.springframework.validation.BeanPropertyBindingResult("obj", "obj") {{
            addError(fieldError1);
            addError(fieldError2);
        }});

        R<Void> r = handler.handleValidationException(e);
        assertThat(r.getCode()).isEqualTo(400);
        assertThat(r.getMsg()).isEqualTo("字段1不能为空, 字段2格式错误");
    }

    @Test
    void handleBindException() {
        FieldError fieldError = new FieldError("obj", "field", "参数绑定失败");

        BindException e = mock(BindException.class);
        when(e.getFieldErrors()).thenReturn(List.of(fieldError));

        R<Void> r = handler.handleBindException(e);
        assertThat(r.getCode()).isEqualTo(400);
        assertThat(r.getMsg()).isEqualTo("参数绑定失败");
    }

    @Test
    void handleConstraintViolationException() {
        ConstraintViolation<?> violation1 = mock(ConstraintViolation.class);
        when(violation1.getMessage()).thenReturn("参数1不能为空");
        ConstraintViolation<?> violation2 = mock(ConstraintViolation.class);
        when(violation2.getMessage()).thenReturn("参数2长度超限");

        ConstraintViolationException e = mock(ConstraintViolationException.class);
        when(e.getConstraintViolations()).thenReturn(Set.of(violation1, violation2));

        R<Void> r = handler.handleConstraintViolationException(e);
        assertThat(r.getCode()).isEqualTo(400);
        // Messages are collected from a Set, ordering is not guaranteed
        assertThat(r.getMsg()).contains("参数1不能为空");
        assertThat(r.getMsg()).contains("参数2长度超限");
    }
}
