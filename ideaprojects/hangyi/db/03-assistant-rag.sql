-- 既有数据库升级脚本：新增智能知识问答的会话、消息、配额和文档索引表。
-- 仅执行一次；全新数据库直接使用 01-schema.sql。

CREATE TABLE assistant_session (
    id VARCHAR(64) PRIMARY KEY,
    channel VARCHAR(20) NOT NULL COMMENT 'WEB/MINIPROGRAM',
    subject VARCHAR(128) NOT NULL COMMENT '可信身份主体',
    employee_no VARCHAR(32) COMMENT '员工工号',
    display_name VARCHAR(100) COMMENT '显示姓名',
    title VARCHAR(100) COMMENT '会话标题',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_assistant_session_owner (channel, subject, updated_at)
) ENGINE=InnoDB COMMENT='助手会话';

CREATE TABLE assistant_message (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    request_id VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL COMMENT 'USER/ASSISTANT',
    content TEXT NOT NULL,
    citations_json JSON COMMENT '服务端检索引用',
    degraded TINYINT(1) DEFAULT 0,
    feedback VARCHAR(10) COMMENT 'UP/DOWN',
    feedback_comment VARCHAR(500),
    feedback_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_assistant_request_role (request_id, role),
    INDEX idx_assistant_message_session (session_id, created_at),
    CONSTRAINT fk_assistant_message_session
        FOREIGN KEY (session_id) REFERENCES assistant_session(id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='助手消息与反馈';

CREATE TABLE assistant_daily_quota (
    channel VARCHAR(20) NOT NULL,
    subject VARCHAR(128) NOT NULL,
    quota_date DATE NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (channel, subject, quota_date)
) ENGINE=InnoDB COMMENT='助手每日配额';

CREATE TABLE assistant_document (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    source_path VARCHAR(500) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    version VARCHAR(50) NOT NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE',
    status VARCHAR(20) NOT NULL DEFAULT 'INDEXING',
    chunk_count INT NOT NULL DEFAULT 0,
    indexed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_assistant_document_path (source_path)
) ENGINE=InnoDB COMMENT='助手知识文档索引状态';
