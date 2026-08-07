-- ============================================
-- 航翼排班系统 · 数据库建表脚本
-- DB: hangyi_scheduling
-- ============================================

CREATE DATABASE IF NOT EXISTS hangyi_scheduling
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE hangyi_scheduling;

-- ============================================
-- 1. 认证授权 (core auth)
-- ============================================

CREATE TABLE sys_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(100) NOT NULL COMMENT 'BCrypt 密码哈希',
    real_name VARCHAR(50) COMMENT '真实姓名',
    phone VARCHAR(20) COMMENT '手机号',
    email VARCHAR(100) COMMENT '邮箱',
    avatar VARCHAR(255) COMMENT '头像URL',
    wechat_openid VARCHAR(64) COMMENT '微信openid',
    status TINYINT DEFAULT 1 COMMENT '状态 1=正常 0=禁用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_openid (wechat_openid)
) ENGINE=InnoDB COMMENT='系统用户';

CREATE TABLE sys_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_code VARCHAR(50) NOT NULL UNIQUE COMMENT '角色编码',
    role_name VARCHAR(50) NOT NULL COMMENT '角色名称',
    description VARCHAR(200) COMMENT '描述',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='系统角色';

CREATE TABLE sys_permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    parent_id BIGINT DEFAULT 0 COMMENT '父权限ID',
    perm_name VARCHAR(50) COMMENT '权限名称',
    perm_code VARCHAR(100) COMMENT '权限编码',
    type TINYINT COMMENT '类型 1=菜单 2=按钮',
    path VARCHAR(200) COMMENT '路由路径',
    icon VARCHAR(50) COMMENT '图标',
    sort_order INT DEFAULT 0,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='系统权限';

CREATE TABLE sys_user_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    UNIQUE KEY uk_user_role (user_id, role_id)
) ENGINE=InnoDB COMMENT='用户-角色关联';

CREATE TABLE sys_role_permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    UNIQUE KEY uk_role_perm (role_id, permission_id)
) ENGINE=InnoDB COMMENT='角色-权限关联';

-- ============================================
-- 2. 人员管理 (core employee)
-- ============================================

CREATE TABLE team_group (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(50) NOT NULL COMMENT '班组名称',
    group_code VARCHAR(50) COMMENT '班组编码',
    group_type VARCHAR(50) NOT NULL COMMENT '班组类型',
    leader_id BIGINT COMMENT '班组长ID',
    description VARCHAR(200),
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='班组';

CREATE TABLE employee (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT COMMENT '关联系统用户ID',
    group_id BIGINT NOT NULL COMMENT '班组ID',
    emp_no VARCHAR(50) NOT NULL COMMENT '员工编号',
    name VARCHAR(50) NOT NULL COMMENT '姓名',
    phone VARCHAR(20) COMMENT '手机号',
    id_card VARCHAR(20) COMMENT '身份证号',
    gender TINYINT COMMENT '性别 0=女 1=男',
    position VARCHAR(50) COMMENT '岗位',
    job_title VARCHAR(50) COMMENT '职称',
    work_type VARCHAR(50) COMMENT '工种',
    hire_date DATE COMMENT '入职日期',
    status TINYINT DEFAULT 1 COMMENT '状态 1=在职 0=离职',
    max_hours_per_day DECIMAL(4,1) COMMENT '每日最大工时',
    max_hours_per_week DECIMAL(5,1) COMMENT '每周最大工时',
    avatar VARCHAR(255) COMMENT '头像URL',
    role_type VARCHAR(20) COMMENT '业务角色(SERVICE/RELEASE/BOTH)',
    openid VARCHAR(64) COMMENT '微信openid',
    tags TEXT COMMENT '标签(JSON)',
    authorized_airlines TEXT COMMENT '授权航司(JSON)',
    authorized_aircraft_types TEXT COMMENT '授权机型(JSON)',
    license_type VARCHAR(50) COMMENT '执照类型',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group (group_id),
    INDEX idx_emp_no (emp_no),
    INDEX idx_openid (openid)
) ENGINE=InnoDB COMMENT='员工';

CREATE TABLE aircraft_type (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    type_code VARCHAR(50) NOT NULL COMMENT '机型编码',
    type_name VARCHAR(100) NOT NULL COMMENT '机型名称',
    manufacturer VARCHAR(100) COMMENT '制造商',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='机型';

CREATE TABLE employee_qualification (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    aircraft_type_id BIGINT COMMENT '机型ID',
    qual_type VARCHAR(50) COMMENT '资质类型',
    qual_code VARCHAR(50) COMMENT '资质编码',
    qual_name VARCHAR(100) COMMENT '资质名称',
    issue_date DATE COMMENT '签发日期',
    expire_date DATE COMMENT '过期日期',
    status TINYINT DEFAULT 1 COMMENT '状态 1=有效 0=过期',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee (employee_id),
    INDEX idx_expire (expire_date)
) ENGINE=InnoDB COMMENT='员工资质';

CREATE TABLE employee_preference (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    pref_type VARCHAR(50) COMMENT '偏好类型',
    pref_key VARCHAR(100) COMMENT '偏好键',
    pref_value VARCHAR(200) COMMENT '偏好值',
    priority INT DEFAULT 0 COMMENT '优先级',
    effective_from DATE COMMENT '生效日期',
    effective_to DATE COMMENT '失效日期',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee (employee_id)
) ENGINE=InnoDB COMMENT='员工排班偏好';

CREATE TABLE leave_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_request_id VARCHAR(64) COMMENT '微信云端请假申请唯一标识',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    leave_type VARCHAR(50) NOT NULL COMMENT '请假类型',
    start_date DATE NOT NULL COMMENT '开始日期',
    end_date DATE COMMENT '结束日期',
    total_days DECIMAL(4,1) COMMENT '合计天数',
    reason VARCHAR(500) COMMENT '请假原因',
    reason_mode VARCHAR(20) COMMENT '原因凭证模式',
    reason_images TEXT COMMENT '图片凭证(JSON)',
    validation_snapshot TEXT COMMENT '提交时校验快照(JSON)',
    audit_trail TEXT COMMENT '云端操作轨迹(JSON)',
    status INT DEFAULT 0 COMMENT '状态 0=待审批 1=已批准 2=已拒绝 3=已撤回',
    approver_id BIGINT COMMENT '审批人ID',
    approve_remark VARCHAR(200) COMMENT '审批意见',
    cancelled_at DATETIME COMMENT '撤回时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee (employee_id),
    INDEX idx_status (status),
    UNIQUE KEY uk_leave_source_request (source_request_id)
) ENGINE=InnoDB COMMENT='请假申请';

-- ============================================
-- 3. 航班管理 (core flight)
-- ============================================

CREATE TABLE flight_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    flight_no VARCHAR(20) NOT NULL COMMENT '航班号',
    aircraft_type_id BIGINT COMMENT '机型ID',
    plan_date DATE NOT NULL COMMENT '计划日期',
    registration VARCHAR(20) COMMENT '注册号',
    engine_model VARCHAR(60) COMMENT '发动机型号',
    estimated_arrival_time DATETIME COMMENT '人工预计到达时间',
    source_id VARCHAR(64) COMMENT '微信云端航班唯一标识',
    plan_time TIME COMMENT '计划时刻',
    arrival_time TIME COMMENT '到达时刻',
    departure_time TIME COMMENT '出发时刻',
    flight_type VARCHAR(20) COMMENT '航班类型(ARR/DEP)',
    route_from VARCHAR(50) COMMENT '出发地',
    route_to VARCHAR(50) COMMENT '目的地',
    gate VARCHAR(20) COMMENT '登机口',
    airline VARCHAR(50) COMMENT '航空公司',
    aircraft_type_name VARCHAR(100) COMMENT '机型名称',
    stay_hours DECIMAL(5,1) COMMENT '停留时长',
    warning_flag TINYINT(1) DEFAULT 0 COMMENT '预警标记',
    status VARCHAR(20) DEFAULT 'SCHEDULED' COMMENT '状态',
    remark VARCHAR(500) COMMENT '备注',
    is_release TINYINT(1) DEFAULT 0 COMMENT '是否放行',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_flight_unique (flight_no, plan_date, plan_time),
    UNIQUE KEY uk_flight_source_id (source_id),
    INDEX idx_date (plan_date),
    INDEX idx_flight_no (flight_no)
) ENGINE=InnoDB COMMENT='航班计划';

-- ============================================
-- 4. 排班管理 (schedule service)
-- ============================================

CREATE TABLE schedule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_name VARCHAR(100) COMMENT '排班名称',
    group_id BIGINT COMMENT '班组ID',
    start_date DATE COMMENT '开始日期',
    end_date DATE COMMENT '结束日期',
    status INT DEFAULT 0 COMMENT '状态 0=草稿 1=已发布 2=已完成',
    version INT NOT NULL DEFAULT 0 COMMENT '发布乐观锁版本',
    schedule_type VARCHAR(20) DEFAULT 'NORMAL' COMMENT '排班类型',
    created_by BIGINT COMMENT '创建人ID',
    published_at DATETIME COMMENT '发布时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group_date (group_id, start_date),
    INDEX idx_status (status)
) ENGINE=InnoDB COMMENT='排班计划';

CREATE TABLE shift_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shift_code VARCHAR(50) NOT NULL COMMENT '班次编码',
    shift_name VARCHAR(100) NOT NULL COMMENT '班次名称',
    start_time TIME NOT NULL COMMENT '开始时间',
    end_time TIME NOT NULL COMMENT '结束时间',
    shift_type VARCHAR(20) COMMENT '班次类型(MORNING/AFTERNOON/NIGHT/STANDBY/REST)',
    color VARCHAR(20) COMMENT '显示颜色',
    require_qualification TINYINT(1) DEFAULT 0 COMMENT '是否需要资质',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_shift_code (shift_code)
) ENGINE=InnoDB COMMENT='班次模板';

CREATE TABLE schedule_detail (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_key VARCHAR(160) COMMENT '外部同步唯一键',
    schedule_id BIGINT NOT NULL COMMENT '排班ID',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    work_date DATE NOT NULL COMMENT '工作日期',
    shift_id BIGINT COMMENT '班次模板ID',
    shift_group VARCHAR(20) COMMENT '班次分组(早/中/晚)',
    schedule_type VARCHAR(20) DEFAULT 'NORMAL' COMMENT '类型(NORMAL/SWAP/COMPLETED)',
    flight_id BIGINT COMMENT '航班ID',
    task_type VARCHAR(50) COMMENT '任务类型',
    task_start DATETIME COMMENT '任务开始时间',
    task_end DATETIME COMMENT '任务结束时间',
    source VARCHAR(50) COMMENT '来源(AUTO/MANUAL/IMPORT)',
    record_status VARCHAR(20) DEFAULT 'active' COMMENT '记录状态',
    needs_reassignment TINYINT(1) DEFAULT 0 COMMENT '是否因请假等原因待改派',
    leave_request_id BIGINT COMMENT '触发待改派的请假申请ID',
    prep_time INT DEFAULT 0 COMMENT '准备时间(分钟)',
    wrap_time INT DEFAULT 0 COMMENT '收尾时间(分钟)',
    remark VARCHAR(200) COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_source_key (source_key),
    INDEX idx_emp_date (employee_id, work_date),
    INDEX idx_schedule (schedule_id),
    INDEX idx_work_date (work_date),
    INDEX idx_flight (flight_id)
) ENGINE=InnoDB COMMENT='排班明细';

CREATE TABLE schedule_change (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_request_id VARCHAR(64) COMMENT '外部申请唯一标识',
    source_schedule_source_id VARCHAR(64) COMMENT '微信云端源排班唯一标识',
    target_schedule_source_id VARCHAR(64) COMMENT '微信云端目标排班唯一标识',
    schedule_detail_id BIGINT COMMENT '排班明细ID',
    employee_id BIGINT NOT NULL COMMENT '原员工ID',
    target_employee_id BIGINT COMMENT '目标员工ID',
    change_type VARCHAR(50) COMMENT '变更类型',
    from_date DATE NOT NULL COMMENT '原日期',
    from_shift_id BIGINT COMMENT '原班次ID',
    to_date DATE COMMENT '目标日期',
    to_shift_id BIGINT COMMENT '目标班次ID',
    reason VARCHAR(500) COMMENT '变更原因',
    status INT DEFAULT 0 COMMENT '状态(0待审批/1通过/2驳回/3撤回)',
    approver_id BIGINT COMMENT '审批人ID',
    approve_remark VARCHAR(200) COMMENT '审批意见',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_source_request (source_request_id),
    INDEX idx_detail (schedule_detail_id),
    INDEX idx_status (status)
) ENGINE=InnoDB COMMENT='排班变更';

CREATE TABLE schedule_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rule_code VARCHAR(50) COMMENT '规则编码',
    rule_name VARCHAR(100) COMMENT '规则名称',
    rule_type VARCHAR(50) COMMENT '规则类型',
    rule_content TEXT COMMENT '规则内容(JSON)',
    penalty_weight INT DEFAULT 1 COMMENT '惩罚权重',
    description VARCHAR(200) COMMENT '描述',
    enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='排班规则';

CREATE TABLE swap_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_type VARCHAR(20) DEFAULT 'SWAP' COMMENT '请求类型(SWAP/SHIFT_APPLY)',
    source_schedule_id BIGINT COMMENT '源排班ID',
    target_schedule_id BIGINT COMMENT '目标排班ID',
    source_staff_id BIGINT COMMENT '源员工ID',
    target_staff_id BIGINT COMMENT '目标员工ID',
    employee_no VARCHAR(50) COMMENT '员工编号',
    name VARCHAR(50) COMMENT '员工姓名',
    flight_no VARCHAR(20) COMMENT '航班号',
    work_date DATE COMMENT '申请日期',
    start_time TIME COMMENT '开始时间',
    end_time TIME COMMENT '结束时间',
    reason VARCHAR(500) COMMENT '申请原因',
    status VARCHAR(20) DEFAULT 'PENDING' COMMENT '状态(PENDING/APPROVED/REJECTED)',
    verifier VARCHAR(50) COMMENT '审核人',
    comment VARCHAR(500) COMMENT '审核意见',
    requester_id BIGINT COMMENT '申请人ID',
    approver_id BIGINT COMMENT '审批人ID',
    requester_read_at DATETIME COMMENT '申请人阅读时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_requester (requester_id)
) ENGINE=InnoDB COMMENT='换班申请';

-- ============================================
-- 5. 审计日志 (core audit)
-- ============================================

CREATE TABLE operation_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_id VARCHAR(64) COMMENT '微信云端日志唯一标识',
    action VARCHAR(50) COMMENT '操作动作',
    detail TEXT COMMENT '操作详情',
    target_type VARCHAR(50) COMMENT '目标类型',
    target_id TEXT COMMENT '结构化操作对象(JSON)',
    operator_id BIGINT COMMENT '操作人ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_operator (operator_id),
    INDEX idx_created (created_at),
    UNIQUE KEY uk_operation_source_id (source_id)
) ENGINE=InnoDB COMMENT='操作日志';

-- ============================================
-- 6. 数据同步 (core sync, SyncService 使用)
-- ============================================

CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    operator VARCHAR(50) COMMENT '操作人',
    openid VARCHAR(64) COMMENT '微信openid',
    action VARCHAR(100) COMMENT '操作',
    detail VARCHAR(500) COMMENT '详情',
    target VARCHAR(100) COMMENT '操作对象',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='同步审计日志';

CREATE TABLE rpt_staff (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_no VARCHAR(50) COMMENT '员工编号',
    name VARCHAR(50) COMMENT '姓名',
    group_id VARCHAR(20) COMMENT '班组ID',
    active TINYINT(1) DEFAULT 1 COMMENT '是否在职',
    on_leave TINYINT(1) DEFAULT 0 COMMENT '是否休假',
    role_type VARCHAR(20) COMMENT '角色类型',
    phone VARCHAR(20) COMMENT '手机号',
    is_admin TINYINT(1) DEFAULT 0 COMMENT '是否管理员',
    openid VARCHAR(64) COMMENT '微信openid',
    tags VARCHAR(200) COMMENT '标签',
    authorized_airlines VARCHAR(200) COMMENT '授权航司',
    authorized_aircraft_types VARCHAR(200) COMMENT '授权机型',
    qualifications TEXT COMMENT '资质(JSON)',
    preferences TEXT COMMENT '偏好(JSON)',
    source_id VARCHAR(64) COMMENT '数据源ID',
    source_sync_at DATETIME COMMENT '源同步时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rpt_staff_employee_no (employee_no)
) ENGINE=InnoDB COMMENT='同步-员工报表';

CREATE TABLE rpt_flight (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    flight_no VARCHAR(20) COMMENT '航班号',
    airline VARCHAR(50) COMMENT '航空公司',
    aircraft_type VARCHAR(50) COMMENT '机型',
    engine_model VARCHAR(60) COMMENT '发动机型号',
    aircraft_registration VARCHAR(20) COMMENT '航空器注册号',
    estimated_arrival_time VARCHAR(32) COMMENT '人工预计到达时间',
    schedule_date DATE COMMENT '排班日期',
    arrival_time VARCHAR(10) COMMENT '到达时间',
    departure_time VARCHAR(10) COMMENT '出发时间',
    stay_hours DECIMAL(5,1) COMMENT '停留时长',
    warning_flag TINYINT(1) DEFAULT 0 COMMENT '预警标记',
    source_id VARCHAR(64) COMMENT '数据源ID',
    source_sync_at DATETIME COMMENT '源同步时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rpt_flight_source_id (source_id)
) ENGINE=InnoDB COMMENT='同步-航班报表';

CREATE TABLE rpt_schedule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_key VARCHAR(100) COMMENT '排班唯一键',
    flight_no VARCHAR(20) COMMENT '航班号',
    airline VARCHAR(50) COMMENT '航空公司',
    aircraft_type VARCHAR(50) COMMENT '机型',
    schedule_date DATE COMMENT '排班日期',
    shift_code VARCHAR(20) COMMENT '班次编码',
    staff_id VARCHAR(20) COMMENT '员工ID',
    staff_name VARCHAR(50) COMMENT '员工姓名',
    employee_no VARCHAR(50) COMMENT '员工编号',
    group_id VARCHAR(20) COMMENT '班组ID',
    status VARCHAR(20) COMMENT '状态',
    source_id VARCHAR(64) COMMENT '数据源ID',
    extra_data TEXT COMMENT '扩展数据',
    source_sync_at DATETIME COMMENT '源同步时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rpt_schedule_key (schedule_key)
) ENGINE=InnoDB COMMENT='同步-排班报表';

CREATE TABLE rpt_swap_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(50) COMMENT '请求ID',
    request_type VARCHAR(20) COMMENT '请求类型',
    requester_emp VARCHAR(50) COMMENT '申请人编号',
    target_emp VARCHAR(50) COMMENT '目标人编号',
    approver_emp VARCHAR(50) COMMENT '审批人编号',
    status VARCHAR(20) COMMENT '状态',
    reason VARCHAR(500) COMMENT '原因',
    source_flight VARCHAR(20) COMMENT '源航班',
    target_flight VARCHAR(20) COMMENT '目标航班',
    extra_data TEXT COMMENT '扩展数据',
    source_id VARCHAR(64) COMMENT '数据源ID',
    source_sync_at DATETIME COMMENT '源同步时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rpt_swap_request_id (request_id)
) ENGINE=InnoDB COMMENT='同步-换班报表';

CREATE TABLE rpt_sync_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    collection VARCHAR(50) COMMENT '集合名称',
    action VARCHAR(20) COMMENT '操作(UPSERT/DELETE)',
    source_id VARCHAR(50) COMMENT '数据源ID',
    record_count INT DEFAULT 0 COMMENT '记录数',
    status VARCHAR(20) COMMENT '状态(SUCCESS/FAILED)',
    error_msg TEXT COMMENT '错误信息',
    sync_batch VARCHAR(50) COMMENT '同步批次号',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='同步-同步日志';

-- ============================================
-- 7. 智能知识问答
-- ============================================

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

-- ============================================
-- 8. 初始数据
-- ============================================

-- 角色
INSERT INTO sys_role (id, role_code, role_name, description) VALUES
(1, 'ADMIN', '管理员', '系统管理员，拥有所有权限'),
(2, 'BOSS', '站领导', '可查看所有数据'),
(3, 'TEAM_LEADER', '班组长', '管理本班组人员和排班'),
(4, 'STAFF', '员工', '查看个人排班和换班申请');

-- 管理员用户 (初始密码: 123456，首次登录后请立即修改)
INSERT INTO sys_user (id, username, password, real_name, phone, status) VALUES
(1, 'admin', '$2y$12$MkhucGOGV0eVw8sRuIh6d.e4wgE0y4VSqOvM7gQRAc1fDo9PsTVQq', '管理员', '13800000000', 1);

-- 用户-角色关联
INSERT INTO sys_user_role (user_id, role_id) VALUES (1, 1);

-- 班次模板
INSERT INTO shift_template (id, shift_code, shift_name, start_time, end_time, shift_type, color, status) VALUES
(1, 'MORNING', '早班', '06:00', '14:00', 'MORNING', '#409EFF', 1),
(2, 'AFTERNOON', '中班', '14:00', '22:00', 'AFTERNOON', '#E6A23C', 1),
(3, 'NIGHT', '晚班', '22:00', '06:00', 'NIGHT', '#909399', 1),
(4, 'STANDBY', '备勤', '08:00', '17:00', 'STANDBY', '#67C23A', 1),
(5, 'REST', '休息', '00:00', '00:00', 'REST', '#F56C6C', 1);

-- 机型
INSERT INTO aircraft_type (id, type_code, type_name, manufacturer, status) VALUES
(1, 'B737', '波音 737', 'Boeing', 1),
(2, 'B738', '波音 737-800', 'Boeing', 1),
(3, 'B787', '波音 787', 'Boeing', 1),
(4, 'A320', '空客 A320', 'Airbus', 1),
(5, 'A330', '空客 A330', 'Airbus', 1),
(6, 'A350', '空客 A350', 'Airbus', 1),
(7, 'E190', '巴航工业 E190', 'Embraer', 1),
(8, 'ARJ21', '中国商飞 ARJ21', 'COMAC', 1);

-- 班组
INSERT INTO team_group (id, group_name, group_code, group_type, status) VALUES
(1, '机务一组', 'JW01', 'MAINTENANCE', 1),
(2, '机务二组', 'JW02', 'MAINTENANCE', 1),
(3, '地勤一组', 'DQ01', 'GROUND', 1);

-- 排班规则
INSERT INTO schedule_rule (rule_code, rule_name, rule_type, rule_content, penalty_weight, description, enabled) VALUES
('R1', '资质匹配', 'HARD', '{}', 100, '员工须持有对应机型资质', 1),
('R2', '连续工作', 'HARD', '{}', 100, '连续工作不超过3天', 1),
('R3', '跨班间隙', 'HARD', '{}', 100, '两班之间至少间隔8小时', 1),
('R4', '月工时上限', 'HARD', '{}', 100, '月工时不超过176小时', 1),
('R5', '一人一天一班', 'HARD', '{}', 100, '每人每天最多一个班次', 1),
('Ca', '放行持照', 'HARD', '{}', 100, 'CCAR-145: 放行人员须持有效执照', 1),
('Cb', '夜班限制', 'HARD', '{}', 100, 'CCAR-145: 7天内不超过3个夜班', 1),
('Cc', '连续值班', 'HARD', '{}', 100, 'CCAR-145: 连续值班不超过6天', 1),
('S1', '工时均衡', 'SOFT', '{}', 10, '尽量均衡分配工时', 1),
('S2', '优先低工时', 'SOFT', '{}', 5, '优先给工时少的员工排班', 1);
