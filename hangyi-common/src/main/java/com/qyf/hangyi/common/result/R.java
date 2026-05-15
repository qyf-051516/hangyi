package com.qyf.hangyi.common.result;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class R<T> {
    private int code;
    private String msg;
    private T data;
    private LocalDateTime timestamp;

    public R() {
        this.timestamp = LocalDateTime.now();
    }

    public static <T> R<T> ok() {
        R<T> r = new R<>();
        r.code = 200;
        r.msg = "success";
        return r;
    }

    public static <T> R<T> ok(T data) {
        R<T> r = new R<>();
        r.code = 200;
        r.msg = "success";
        r.data = data;
        return r;
    }

    public static <T> R<T> fail(String msg) {
        R<T> r = new R<>();
        r.code = 500;
        r.msg = msg;
        return r;
    }

    public static <T> R<T> fail(int code, String msg) {
        R<T> r = new R<>();
        r.code = code;
        r.msg = msg;
        return r;
    }

    public static <T> R<T> forbidden(String msg) {
        R<T> r = new R<>();
        r.code = 403;
        r.msg = msg;
        return r;
    }

    public static <T> R<T> unauthorized(String msg) {
        R<T> r = new R<>();
        r.code = 401;
        r.msg = msg;
        return r;
    }
}
