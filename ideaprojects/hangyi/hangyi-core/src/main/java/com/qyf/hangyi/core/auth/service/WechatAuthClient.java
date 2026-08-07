package com.qyf.hangyi.core.auth.service;

import com.qyf.hangyi.common.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Map;

@Component
public class WechatAuthClient {

    private final RestClient restClient;

    @Value("${wechat.login-enabled:false}")
    private boolean loginEnabled;

    @Value("${wechat.app-id:}")
    private String appId;

    @Value("${wechat.app-secret:}")
    private String appSecret;

    @Value("${wechat.session-url:https://api.weixin.qq.com/sns/jscode2session}")
    private String sessionUrl;

    public WechatAuthClient(RestClient.Builder restClientBuilder) {
        this.restClient = restClientBuilder.build();
    }

    public String exchangeCodeForOpenid(String code) {
        if (!loginEnabled) {
            throw new BusinessException(503, "微信登录未启用");
        }
        if (appId == null || appId.isBlank() || appSecret == null || appSecret.isBlank()) {
            throw new BusinessException(503, "微信登录配置不完整");
        }

        URI uri = UriComponentsBuilder.fromUriString(sessionUrl)
                .queryParam("appid", appId)
                .queryParam("secret", appSecret)
                .queryParam("js_code", code)
                .queryParam("grant_type", "authorization_code")
                .build()
                .encode()
                .toUri();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(Map.class);
            if (response == null) {
                throw new BusinessException(502, "微信身份验证失败");
            }
            Object errorCode = response.get("errcode");
            if (errorCode instanceof Number number && number.intValue() != 0) {
                throw new BusinessException(401, "微信登录凭证无效或已过期");
            }
            String openid = response.get("openid") == null ? "" : response.get("openid").toString().trim();
            if (openid.isEmpty()) {
                throw new BusinessException(401, "微信身份验证失败");
            }
            return openid;
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new BusinessException(502, "微信服务暂时不可用");
        }
    }
}
