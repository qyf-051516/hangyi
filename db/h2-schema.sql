-- ============================================================
-- 广西机场机务/地勤排班系统 - 数据库表结构设计
-- H2兼容版本
-- ============================================================

CREATE TABLE sys_user (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE COMMENT '登录用户名',
    password        VARCHAR(255) NOT NULL COMMENT '加密密码',
    real_name       VARCHAR(50)  NOT NULL COMMENT '真实姓名',
    phone           VARCHAR(20)  COMMENT '手机号',
    email           VARCHAR(100) COMMENT '邮箱',
    avatar          VARCHAR(255) COMMENT '头像URL',
    wechat_openid   VARCHAR(64)  COMMENT '微信OPENID（国创赛统一认证）',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '状态 1=启用 0=禁用',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_status (status)
) COMMENT '系统用户表';

CREATE TABLE sys_role (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_code       VARCHAR(50)  NOT NULL UNIQUE COMMENT '角色编码: ADMIN/BOSS/TEAM_LEADER/STAFF',
    role_name       VARCHAR(50)  NOT NULL COMMENT '角色名称: 管理员/班组长/员工',
    description     VARCHAR(255) COMMENT '角色描述',
    status          TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT '角色表';

CREATE TABLE sys_user_role (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    role_id         BIGINT NOT NULL,
    UNIQUE KEY uk_user_role (user_id, role_id)
) COMMENT '用户角色关联';

CREATE TABLE sys_permission (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    parent_id       BIGINT       DEFAULT 0 COMMENT '父权限ID',
    perm_name       VARCHAR(100) NOT NULL COMMENT '权限名称',
    perm_code       VARCHAR(100) NOT NULL UNIQUE COMMENT '权限编码: system:user:list',
    type            TINYINT      NOT NULL DEFAULT 1 COMMENT '类型 1=菜单 2=按钮 3=API',
    path            VARCHAR(255) COMMENT '路由路径',
    icon            VARCHAR(100) COMMENT '图标',
    sort_order      INT          DEFAULT 0 COMMENT '排序',
    status          TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT '权限表';

CREATE TABLE sys_role_permission (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_id         BIGINT NOT NULL,
    permission_id   BIGINT NOT NULL,
    UNIQUE KEY uk_role_perm (role_id, permission_id)
) COMMENT '角色权限关联';

CREATE TABLE team_group (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_name      VARCHAR(50)  NOT NULL COMMENT '班组名称 e.g. 机务一中队/地勤A组',
    group_code      VARCHAR(50)  NOT NULL UNIQUE COMMENT '班组编码',
    group_type      VARCHAR(20)  NOT NULL COMMENT '班组类型: MAINTENANCE/GROUND/SECURITY',
    leader_id       BIGINT       COMMENT '班组长ID(关联employee)',
    description     VARCHAR(255) COMMENT '班组描述',
    status          TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT '班组表';

CREATE TABLE employee (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT       COMMENT '关联系统用户ID(可为空,未开通账号)',
    group_id        BIGINT       COMMENT '所属班组ID',
    emp_no          VARCHAR(30)  NOT NULL UNIQUE COMMENT '工号',
    name            VARCHAR(50)  NOT NULL COMMENT '姓名',
    id_card         VARCHAR(18)  COMMENT '身份证号',
    phone           VARCHAR(20)  COMMENT '手机号',
    gender          TINYINT      COMMENT '性别 1=男 2=女',
    position        VARCHAR(50)  COMMENT '岗位: 机务维修/地勤/安检/勤务',
    job_title       VARCHAR(50)  COMMENT '职称: 初级/中级/高级',
    work_type       VARCHAR(20)  NOT NULL DEFAULT 'FULL_TIME' COMMENT '工作性质: FULL_TIME/PART_TIME',
    hire_date       DATE         COMMENT '入职日期',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '状态 1=在职 2=休假 3=离职',
    max_hours_per_day  DECIMAL(4,1) DEFAULT 8.0 COMMENT '每日最大工时限制',
    max_hours_per_week DECIMAL(4,1) DEFAULT 40.0 COMMENT '每周最大工时限制',
    avatar          VARCHAR(255) COMMENT '头像',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group (group_id),
    INDEX idx_status (status),
    INDEX idx_work_type (work_type)
) COMMENT '员工表';

CREATE TABLE aircraft_type (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    type_code       VARCHAR(10)  NOT NULL UNIQUE COMMENT '机型编码: B737/A320/ERJ190',
    type_name       VARCHAR(50)  NOT NULL COMMENT '机型名称: 波音737/空客A320',
    manufacturer    VARCHAR(50)  COMMENT '制造商: Boeing/Airbus/Embraer',
    status          TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT '机型表';

CREATE TABLE employee_qualification (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id     BIGINT       NOT NULL COMMENT '员工ID',
    aircraft_type_id BIGINT      COMMENT '机型ID(NULL表示通用资质)',
    qual_type       VARCHAR(30)  NOT NULL COMMENT '资质类型: AIRCRAFT_TYPE(机型授权)/LICENSE(执照)/CERT(证书)',
    qual_code       VARCHAR(50)  NOT NULL COMMENT '资质编码',
    qual_name       VARCHAR(100) NOT NULL COMMENT '资质名称',
    issue_date      DATE         COMMENT '发证日期',
    expire_date     DATE         COMMENT '有效期至',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '1=有效 0=过期',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee (employee_id),
    INDEX idx_expire (expire_date),
    UNIQUE KEY uk_emp_qual (employee_id, qual_code)
) COMMENT '员工资质授权表';

CREATE TABLE shift_template (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    shift_code      VARCHAR(20)  NOT NULL UNIQUE COMMENT '班次编码: MORNING/EVENING/NIGHT/STANDBY',
    shift_name      VARCHAR(50)  NOT NULL COMMENT '班次名称: 早班/晚班/夜班/备勤',
    start_time      TIME         NOT NULL COMMENT '开始时间 e.g. 08:00',
    end_time        TIME         NOT NULL COMMENT '结束时间 e.g. 20:00',
    shift_type      VARCHAR(20)  NOT NULL COMMENT '班次类型: DAY(白班)/NIGHT(夜班)/STANDBY(备勤)',
    color           VARCHAR(20)  DEFAULT '#409EFF' COMMENT '甘特图显示颜色',
    require_qualification TINYINT DEFAULT 0 COMMENT '是否需要资质匹配 1=是',
    status          TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT '班次模板表';

CREATE TABLE schedule_rule (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    rule_code       VARCHAR(50)  NOT NULL UNIQUE COMMENT '规则编码',
    rule_name       VARCHAR(100) NOT NULL COMMENT '规则名称',
    rule_type       VARCHAR(30)  NOT NULL COMMENT '规则类型: HARD(硬约束)/SOFT(软约束)',
    rule_content    JSON         COMMENT '规则内容(JSON格式存储参数)',
    penalty_weight  INT          DEFAULT 0 COMMENT '软约束惩罚权重',
    description     VARCHAR(255) COMMENT '规则说明',
    enabled         TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT '排班规则配置表';

CREATE TABLE schedule (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_name   VARCHAR(100) NOT NULL COMMENT '排班名称 e.g. 2026年5月第2周机务排班',
    group_id        BIGINT       COMMENT '排班班组ID(NULL表示全站)',
    start_date      DATE         NOT NULL COMMENT '排班周期开始日期',
    end_date        DATE         NOT NULL COMMENT '排班周期结束日期',
    status          TINYINT      NOT NULL DEFAULT 0 COMMENT '状态: 0=草稿 1=已发布 2=锁定',
    created_by      BIGINT       COMMENT '创建人用户ID',
    published_at    DATETIME     COMMENT '发布时间',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group (group_id),
    INDEX idx_date_range (start_date, end_date),
    INDEX idx_status (status)
) COMMENT '排班主表';

CREATE TABLE schedule_detail (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_id     BIGINT       NOT NULL COMMENT '所属排班主表ID',
    employee_id     BIGINT       NOT NULL COMMENT '员工ID',
    work_date       DATE         NOT NULL COMMENT '工作日期',
    shift_id        BIGINT       NOT NULL COMMENT '班次模板ID',
    shift_group     VARCHAR(20)  COMMENT '班次分组标识(同一天内分组)',
    schedule_type   VARCHAR(20)  DEFAULT 'AUTO' COMMENT '排班方式: AUTO(自动)/MANUAL(手动调班)/SWAP(换班)',
    remark          VARCHAR(255) COMMENT '备注',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_emp_date (employee_id, work_date),
    INDEX idx_schedule (schedule_id),
    INDEX idx_date (work_date),
    INDEX idx_shift (shift_id)
) COMMENT '排班明细表';

CREATE TABLE schedule_change (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_detail_id BIGINT   COMMENT '原排班明细ID',
    employee_id     BIGINT       NOT NULL COMMENT '申请人(员工ID)',
    target_employee_id BIGINT   COMMENT '换班目标员工ID(NULL表示调班不换班)',
    change_type     VARCHAR(20)  NOT NULL COMMENT '类型: ADJUST(调班)/SWAP(换班)',
    from_date       DATE         NOT NULL COMMENT '原班次日期',
    from_shift_id   BIGINT       COMMENT '原班次ID',
    to_date         DATE         COMMENT '目标日期(调班)',
    to_shift_id     BIGINT       COMMENT '目标班次ID(调班)',
    reason          VARCHAR(500) COMMENT '申请原因',
    status          TINYINT      NOT NULL DEFAULT 0 COMMENT '状态: 0=待审批 1=通过 2=驳回',
    approver_id     BIGINT       COMMENT '审批人用户ID',
    approve_remark  VARCHAR(255) COMMENT '审批意见',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee (employee_id),
    INDEX idx_status (status)
) COMMENT '调班/换班申请表';

CREATE TABLE leave_request (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id     BIGINT       NOT NULL COMMENT '员工ID',
    leave_type      VARCHAR(20)  NOT NULL COMMENT '请假类型: ANNUAL(年假)/SICK(病假)/PERSONAL(事假)/OTHER',
    start_date      DATE         NOT NULL COMMENT '开始日期',
    end_date        DATE         NOT NULL COMMENT '结束日期',
    total_days      DECIMAL(4,1) NOT NULL COMMENT '请假天数',
    reason          VARCHAR(500) COMMENT '请假原因',
    status          TINYINT      NOT NULL DEFAULT 0 COMMENT '状态: 0=待审批 1=通过 2=驳回',
    approver_id     BIGINT       COMMENT '审批人用户ID',
    approve_remark  VARCHAR(255) COMMENT '审批意见',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee (employee_id),
    INDEX idx_date_range (start_date, end_date),
    INDEX idx_status (status)
) COMMENT '请假申请表';

CREATE TABLE flight_plan (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    flight_no       VARCHAR(20)  NOT NULL COMMENT '航班号 e.g. CZ3275',
    aircraft_type_id BIGINT      COMMENT '机型ID',
    registration    VARCHAR(20)  COMMENT '机号/注册号 e.g. B-1234',
    plan_date       DATE         NOT NULL COMMENT '计划日期',
    plan_time       TIME         NOT NULL COMMENT '计划时刻(起飞/到达)',
    flight_type     VARCHAR(10)  NOT NULL COMMENT '飞行动态: DEP(出港)/ARR(进港)',
    route_from      VARCHAR(50)  COMMENT '始发站',
    route_to        VARCHAR(50)  COMMENT '目的站',
    gate            VARCHAR(20)  COMMENT '登机口/机位',
    status          VARCHAR(20)  DEFAULT 'SCHEDULED' COMMENT '状态: SCHEDULED/DELAYED/CANCELLED/COMPLETED',
    remark          VARCHAR(255) COMMENT '备注',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_date (plan_date),
    INDEX idx_flight (flight_no)
) COMMENT '航班计划表';
