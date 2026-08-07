package com.qyf.hangyi.common.serializer;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.annotation.JacksonStdImpl;

import java.io.IOException;

/**
 * 手机号/身份证等敏感字段脱敏序列化器。
 *
 * <p>使用方式：在实体字段上加 {@code @JsonSerialize(using = MaskedSerializer.class)}</p>
 *
 * <p>脱敏规则：
 * <ul>
 *   <li>手机号（11 位）：保留前 3 后 4，中间 4 位替换为 ****</li>
 *   <li>身份证（18 位）：保留前 6 后 4，中间 8 位替换为 ********</li>
 *   <li>其余长度：保留前 1/3 后 1/3，中间替换为 ***</li>
 * </ul>
 */
@JacksonStdImpl
public class MaskedSerializer extends JsonSerializer<String> {

    @Override
    public void serialize(String value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        if (value == null || value.isEmpty()) {
            gen.writeString(value);
            return;
        }
        gen.writeString(mask(value));
    }

    static String mask(String value) {
        int len = value.length();
        if (len <= 4) {
            return value.charAt(0) + "***";
        }
        if (len == 11) {
            // 手机号：138****1234
            return value.substring(0, 3) + "****" + value.substring(7);
        }
        if (len == 18) {
            // 身份证：450103********1234
            return value.substring(0, 6) + "********" + value.substring(14);
        }
        // 通用规则：保留前 1/3 后 1/3
        int prefix = len / 3;
        int suffix = len / 3;
        return value.substring(0, prefix) + "***" + value.substring(len - suffix);
    }
}
