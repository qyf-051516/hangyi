package com.qyf.hangyi.common.constant;

public interface AuthConstant {
    String AUTHORIZATION_HEADER = "Authorization";
    String BEARER_PREFIX = "Bearer ";
    String TOKEN_PARAM = "token";

    interface Role {
        String ADMIN = "ADMIN";
        String BOSS = "BOSS";
        String TEAM_LEADER = "TEAM_LEADER";
        String STAFF = "STAFF";
    }
}
