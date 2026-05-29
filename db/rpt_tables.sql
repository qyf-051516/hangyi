-- ============================================================
-- 国创赛数据同步报表表（Hangyi MySQL 数据仓库）
-- 用于接收国创赛云函数推送的数据，实现跨系统 SQL 报表
-- ============================================================

USE hangyi_scheduling;

-- -----------------------------------------------------------
-- 1. 国创赛员工报表表
-- -----------------------------------------------------------
CREATE TABLE rpt_staff (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_no     VARCHAR(30)  NOT NULL COMMENT '工号',
    name            VARCHAR(50)  NOT NULL COMMENT '姓名',
    group_id        VARCHAR(30)  DEFAULT NULL COMMENT '分组',
    active          TINYINT(1)   DEFAULT 1 COMMENT '是否在职',
    on_leave        TINYINT(1)   DEFAULT 0 COMMENT '是否请假',
    role_type       VARCHAR(20)  DEFAULT NULL COMMENT '角色类型(SERVICE/RELEASE/BOTH)',
    phone           VARCHAR(20)  DEFAULT NULL COMMENT '电话',
    is_admin        TINYINT(1)   DEFAULT 0 COMMENT '是否管理员',
    openid          VARCHAR(64)  DEFAULT NULL COMMENT '微信OPENID',
    tags            JSON         DEFAULT NULL COMMENT '标签',
    authorized_airlines      JSON DEFAULT NULL COMMENT '授权航司',
    authorized_aircraft_types JSON DEFAULT NULL COMMENT '授权机型',
    qualifications           JSON DEFAULT NULL COMMENT '资质列表',
    preferences              JSON DEFAULT NULL COMMENT '偏好设置',
    source_id       VARCHAR(64)  DEFAULT NULL COMMENT '国创赛源记录_id',
    source_sync_at  DATETIME     DEFAULT NULL COMMENT '最后同步时间',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_employee_no (employee_no),
    INDEX idx_openid (openid),
    INDEX idx_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='国创赛员工同步表';

-- -----------------------------------------------------------
-- 2. 国创赛航班报表表
-- -----------------------------------------------------------
CREATE TABLE rpt_flight (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    flight_no       VARCHAR(20)  NOT NULL COMMENT '航班号',
    airline         VARCHAR(50)  DEFAULT NULL COMMENT '航司',
    aircraft_type   VARCHAR(20)  DEFAULT NULL COMMENT '机型',
    schedule_date   DATE         DEFAULT NULL COMMENT '计划日期',
    arrival_time    VARCHAR(30)  DEFAULT NULL COMMENT '到达时间',
    departure_time  VARCHAR(30)  DEFAULT NULL COMMENT '出发时间',
    stay_hours      DECIMAL(5,1) DEFAULT NULL COMMENT '停留时长(小时)',
    warning_flag    TINYINT(1)   DEFAULT 0 COMMENT '长停预警标记',
    source_id       VARCHAR(64)  DEFAULT NULL COMMENT '国创赛源记录_id',
    source_sync_at  DATETIME     DEFAULT NULL COMMENT '最后同步时间',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_flight_date (flight_no, schedule_date),
    INDEX idx_date (schedule_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='国创赛航班同步表';

-- -----------------------------------------------------------
-- 3. 国创赛排班报表表
-- -----------------------------------------------------------
CREATE TABLE rpt_schedule (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_key    VARCHAR(100) NOT NULL COMMENT '排班唯一键',
    flight_no       VARCHAR(20)  DEFAULT NULL COMMENT '航班号',
    airline         VARCHAR(50)  DEFAULT NULL COMMENT '航司',
    aircraft_type   VARCHAR(20)  DEFAULT NULL COMMENT '机型',
    schedule_date   DATE         DEFAULT NULL COMMENT '排班日期',
    shift_code      VARCHAR(20)  DEFAULT NULL COMMENT '班次代码',
    staff_id        VARCHAR(64)  DEFAULT NULL COMMENT '员工ID(国创赛)',
    staff_name      VARCHAR(50)  DEFAULT NULL COMMENT '员工姓名',
    employee_no     VARCHAR(30)  DEFAULT NULL COMMENT '工号',
    group_id        VARCHAR(30)  DEFAULT NULL COMMENT '分组',
    status          VARCHAR(20)  DEFAULT 'ASSIGNED' COMMENT '状态',
    source_id       VARCHAR(64)  DEFAULT NULL COMMENT '国创赛源记录_id',
    extra_data      JSON         DEFAULT NULL COMMENT '其他字段',
    source_sync_at  DATETIME     DEFAULT NULL COMMENT '最后同步时间',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_schedule_key (schedule_key),
    INDEX idx_employee_date (employee_no, schedule_date),
    INDEX idx_date (schedule_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='国创赛排班同步表';

-- -----------------------------------------------------------
-- 4. 国创赛换班请求报表表
-- -----------------------------------------------------------
CREATE TABLE rpt_swap_request (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id      VARCHAR(64)  NOT NULL COMMENT '请求ID',
    request_type    VARCHAR(20)  DEFAULT 'SWAP' COMMENT '类型(SWAP/SHIFT_APPLY)',
    requester_emp   VARCHAR(30)  DEFAULT NULL COMMENT '申请人工号',
    target_emp      VARCHAR(30)  DEFAULT NULL COMMENT '目标人员工号',
    approver_emp    VARCHAR(30)  DEFAULT NULL COMMENT '审批人工号',
    status          VARCHAR(20)  DEFAULT 'PENDING' COMMENT '状态',
    reason          TEXT         DEFAULT NULL COMMENT '原因',
    source_flight   VARCHAR(20)  DEFAULT NULL COMMENT '源航班',
    target_flight   VARCHAR(20)  DEFAULT NULL COMMENT '目标航班',
    extra_data      JSON         DEFAULT NULL COMMENT '其他字段',
    source_id       VARCHAR(64)  DEFAULT NULL COMMENT '国创赛源记录_id',
    source_sync_at  DATETIME     DEFAULT NULL COMMENT '最后同步时间',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_request_id (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='国创赛换班请求同步表';

-- -----------------------------------------------------------
-- 5. 同步日志表
-- -----------------------------------------------------------
CREATE TABLE rpt_sync_log (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    collection      VARCHAR(50)  NOT NULL COMMENT '集合名称',
    action          VARCHAR(20)  NOT NULL COMMENT 'INSERT/UPDATE/DELETE',
    source_id       VARCHAR(64)  DEFAULT NULL COMMENT '源记录ID',
    record_count    INT          DEFAULT 0 COMMENT '同步记录数',
    status          VARCHAR(20)  DEFAULT 'SUCCESS' COMMENT 'SUCCESS/FAILED',
    error_msg       TEXT         DEFAULT NULL COMMENT '错误信息',
    sync_batch      VARCHAR(36)  DEFAULT NULL COMMENT '同步批次UUID',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_collection (collection),
    INDEX idx_batch (sync_batch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='同步日志表';
