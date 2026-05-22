package com.qyf.hangyi.common.result;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RTest {

    @Test
    void testOk_NoData() {
        R<Void> r = R.ok();
        assertThat(r.getCode()).isEqualTo(200);
        assertThat(r.getMsg()).isEqualTo("success");
    }

    @Test
    void testOk_WithData() {
        R<String> r = R.ok("hello");
        assertThat(r.getCode()).isEqualTo(200);
        assertThat(r.getData()).isEqualTo("hello");
    }

    @Test
    void testFail_Msg() {
        R<Void> r = R.fail("出错了");
        assertThat(r.getCode()).isEqualTo(500);
        assertThat(r.getMsg()).isEqualTo("出错了");
    }

    @Test
    void testFail_CodeAndMsg() {
        R<Void> r = R.fail(400, "参数错误");
        assertThat(r.getCode()).isEqualTo(400);
        assertThat(r.getMsg()).isEqualTo("参数错误");
    }

    @Test
    void testForbidden() {
        R<Void> r = R.forbidden("无权限");
        assertThat(r.getCode()).isEqualTo(403);
    }

    @Test
    void testUnauthorized() {
        R<Void> r = R.unauthorized("未登录");
        assertThat(r.getCode()).isEqualTo(401);
    }

    @Test
    void testTimestampAutoSet() {
        R<String> r = R.ok("data");
        assertThat(r.getTimestamp()).isNotNull();
    }
}
