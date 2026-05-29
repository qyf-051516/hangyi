DROP TABLE IF EXISTS sys_user_role;
DROP TABLE IF EXISTS sys_role;
DROP TABLE IF EXISTS sys_user;
DROP TABLE IF EXISTS sys_permission;
DROP TABLE IF EXISTS sys_role_permission;

CREATE TABLE sys_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    real_name VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(100),
    avatar VARCHAR(255),
    wechat_openid VARCHAR(64),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sys_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_code VARCHAR(50) NOT NULL,
    role_name VARCHAR(50),
    description VARCHAR(255),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sys_user_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL
);

CREATE TABLE sys_permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    parent_id BIGINT DEFAULT 0,
    perm_name VARCHAR(100) NOT NULL,
    perm_code VARCHAR(100) NOT NULL,
    type INT DEFAULT 1,
    path VARCHAR(255),
    icon VARCHAR(100),
    sort_order INT DEFAULT 0,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sys_role_permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL
);

INSERT INTO sys_user (id, username, password, real_name, status) VALUES
(1, 'admin', '$2a$10$10Cw58bRXBnO2g5TpLRAsO1LeTsgcXvCwvvKkyLaAyx2LIZp6TTkC', '管理员', 1);

INSERT INTO sys_role (id, role_code, role_name, status) VALUES
(1, 'ADMIN', '管理员', 1);

INSERT INTO sys_user_role (user_id, role_id) VALUES (1, 1);
