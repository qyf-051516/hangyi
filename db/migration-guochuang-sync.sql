-- ============================================================
-- 迁移脚本：国创赛数据同步与智能排班功能扩展
-- 为 schedule_detail 添加新字段，新建 swap_request 和 operation_log 表
-- ============================================================
USE hangyi_scheduling;

-- -----------------------------------------------------------
-- 1. schedule_detail 表加字段
--    支持智能排班来源追踪、服务排班准备/收尾时长
-- -----------------------------------------------------------
ALTER TABLE schedule_detail
    ADD COLUMN source VARCHAR(20) DEFAULT 'MANUAL' COMMENT '来源: SMART/MANUAL/ADMIN_ROLES',
    ADD COLUMN record_status VARCHAR(20) DEFAULT 'active' COMMENT '状态: active/archived',
    ADD COLUMN prep_time INT DEFAULT 30 COMMENT '准备时长(分钟)',
    ADD COLUMN wrap_time INT DEFAULT 15 COMMENT '收尾时长(分钟)';

-- -----------------------------------------------------------
-- 2. 操作审计日志表
--    记录系统关键操作，支持审计追溯
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS operation_log (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    action          VARCHAR(50)  NOT NULL COMMENT '操作类型',
    detail          VARCHAR(500) COMMENT '操作描述',
    target_type     VARCHAR(50)  COMMENT '目标类型',
    target_id       VARCHAR(100) COMMENT '目标ID',
    operator_id     BIGINT       COMMENT '操作人ID',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作审计日志';

-- -----------------------------------------------------------
-- 3. 调班申请表（国创赛对接）
--    支持微信小程序端发起调班/换班申请，并与国创赛数据互通
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS swap_request (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_type        VARCHAR(20)  DEFAULT 'SWAP' COMMENT 'SWAP/SHIFT_APPLY',
    source_schedule_id  BIGINT       COMMENT '原排班详情ID',
    target_schedule_id  BIGINT       COMMENT '目标排班详情ID',
    source_staff_id     BIGINT       COMMENT '申请人ID',
    target_staff_id     BIGINT       COMMENT '目标人ID',
    employee_no         VARCHAR(20)  COMMENT '工号',
    name                VARCHAR(50)  COMMENT '姓名',
    flight_no           VARCHAR(20)  COMMENT '航班号',
    start_time          TIME         COMMENT '调班开始时间',
    end_time            TIME         COMMENT '调班结束时间',
    reason              VARCHAR(200) COMMENT '原因',
    status              VARCHAR(20)  DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED',
    verifier            VARCHAR(50)  COMMENT '验证方式',
    comment             VARCHAR(200) COMMENT '审批备注',
    requester_id        BIGINT       COMMENT '申请人用户ID',
    approver_id         BIGINT       COMMENT '审批人用户ID',
    requester_read_at   DATETIME     COMMENT '申请人已读时间',
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_requester (requester_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='调班申请';
