package com.qyf.hangyi.common.exception;

import com.qyf.hangyi.common.result.R;
import jakarta.validation.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void businessExceptionPreservesCodeAndMessage() {
        ResponseEntity<R<Void>> response =
                handler.handleBusinessException(new BusinessException(422, "业务规则不满足"));
        assertThat(response.getStatusCode().value()).isEqualTo(422);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(422);
        assertThat(response.getBody().getMsg()).isEqualTo("业务规则不满足");
        assertThat(response.getBody().getData()).isNull();
    }

    @Test
    void genericExceptionDoesNotLeakInternalMessage() {
        R<Void> result = handler.handleException(new RuntimeException("database password leaked"));
        assertThat(result.getCode()).isEqualTo(500);
        assertThat(result.getMsg()).isEqualTo("服务器内部错误");
    }

    @Test
    void genericHandlerDeclaresHttp500() throws Exception {
        ResponseStatus status = GlobalExceptionHandler.class
                .getMethod("handleException", Exception.class)
                .getAnnotation(ResponseStatus.class);
        assertThat(status).isNotNull();
        assertThat(status.value()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @Test
    void constraintViolationReturnsBadRequest() {
        ConstraintViolationException exception = new ConstraintViolationException(Set.of());

        R<Void> result = handler.handleConstraintViolationException(exception);

        assertThat(result.getCode()).isEqualTo(400);
        assertThat(result.getMsg()).isEqualTo("请求参数校验失败");
    }

    @Test
    void duplicateKeyReturnsConflictWithoutLeakingSql() {
        R<Void> result = handler.handleDuplicateKeyException(
                new DuplicateKeyException("duplicate key uk_secret"));

        assertThat(result.getCode()).isEqualTo(409);
        assertThat(result.getMsg()).isEqualTo("数据已存在，请勿重复提交");
    }
}
