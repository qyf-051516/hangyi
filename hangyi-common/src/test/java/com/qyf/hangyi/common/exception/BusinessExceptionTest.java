package com.qyf.hangyi.common.exception;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessExceptionTest {

    @Test
    void testConstructorWithMsg() {
        BusinessException e = new BusinessException("业务错误");
        assertThat(e.getMessage()).isEqualTo("业务错误");
        assertThat(e.getCode()).isEqualTo(500);
    }

    @Test
    void testConstructorWithCodeAndMsg() {
        BusinessException e = new BusinessException(400, "参数错误");
        assertThat(e.getMessage()).isEqualTo("参数错误");
        assertThat(e.getCode()).isEqualTo(400);
    }
}
