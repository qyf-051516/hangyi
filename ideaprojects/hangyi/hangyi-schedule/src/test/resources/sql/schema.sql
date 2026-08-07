DROP TABLE IF EXISTS schedule_detail;
DROP TABLE IF EXISTS schedule_change;
DROP TABLE IF EXISTS schedule;
DROP TABLE IF EXISTS employee_qualification;
DROP TABLE IF EXISTS leave_request;
DROP TABLE IF EXISTS flight_plan;
DROP TABLE IF EXISTS employee;
DROP TABLE IF EXISTS schedule_rule;
DROP TABLE IF EXISTS shift_template;
DROP TABLE IF EXISTS operation_log;

CREATE TABLE shift_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shift_code VARCHAR(20) NOT NULL,
    shift_name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    shift_type VARCHAR(20) NOT NULL,
    color VARCHAR(20) DEFAULT '#409EFF',
    require_qualification INT DEFAULT 0,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_name VARCHAR(100) NOT NULL,
    group_id BIGINT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status INT DEFAULT 0,
    version INT NOT NULL DEFAULT 0,
    schedule_type VARCHAR(20) DEFAULT 'NORMAL',
    created_by BIGINT,
    published_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedule_detail (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_key VARCHAR(160),
    schedule_id BIGINT NOT NULL,
    employee_id BIGINT NOT NULL,
    work_date DATE NOT NULL,
    shift_id BIGINT,
    shift_group VARCHAR(20),
    schedule_type VARCHAR(20) DEFAULT 'AUTO',
    remark VARCHAR(255),
    flight_id BIGINT,
    task_type VARCHAR(20),
    task_start DATETIME,
    task_end DATETIME,
    source VARCHAR(20) DEFAULT 'MANUAL',
    record_status VARCHAR(20) DEFAULT 'active',
    needs_reassignment BOOLEAN DEFAULT FALSE,
    leave_request_id BIGINT,
    prep_time INT DEFAULT 30,
    wrap_time INT DEFAULT 15,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_emp_date ON schedule_detail(employee_id, work_date);

CREATE TABLE schedule_change (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_request_id VARCHAR(64),
    schedule_detail_id BIGINT,
    employee_id BIGINT NOT NULL,
    target_employee_id BIGINT,
    change_type VARCHAR(20) NOT NULL,
    from_date DATE NOT NULL,
    from_shift_id BIGINT,
    to_date DATE,
    to_shift_id BIGINT,
    reason VARCHAR(500),
    status INT DEFAULT 0,
    approver_id BIGINT,
    approve_remark VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    emp_no VARCHAR(50),
    name VARCHAR(100),
    status INT NOT NULL DEFAULT 1,
    max_hours_per_day DECIMAL(4,1) DEFAULT 12,
    license_type VARCHAR(20)
);

CREATE TABLE leave_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status INT NOT NULL DEFAULT 0
);

CREATE TABLE flight_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    flight_no VARCHAR(20),
    plan_date DATE,
    aircraft_type_id BIGINT,
    is_release BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'SCHEDULED'
);

CREATE TABLE employee_qualification (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    aircraft_type_id BIGINT,
    issue_date DATE,
    expire_date DATE,
    status INT NOT NULL DEFAULT 1
);

CREATE TABLE schedule_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rule_code VARCHAR(50) NOT NULL,
    rule_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(30) NOT NULL,
    rule_content TEXT,
    penalty_weight INT DEFAULT 0,
    description VARCHAR(255),
    enabled INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE operation_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(100),
    detail VARCHAR(500),
    target_type VARCHAR(50),
    target_id VARCHAR(50),
    operator_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shift_template (id, shift_code, shift_name, start_time, end_time, shift_type, color, status) VALUES
(1, 'MORNING', '早班', '08:00', '16:00', 'DAY', '#409EFF', 1),
(2, 'EVENING', '晚班', '16:00', '00:00', 'DAY', '#67C23A', 1),
(3, 'NIGHT', '夜班', '00:00', '08:00', 'NIGHT', '#E6A23C', 1);

INSERT INTO schedule (id, schedule_name, group_id, start_date, end_date, status, created_by) VALUES
(1, '2026年5月第3周排班', 1, '2026-05-18', '2026-05-24', 1, 1);

INSERT INTO employee (id, emp_no, name, status, max_hours_per_day, license_type) VALUES
(1, 'HY001', '员工一', 1, 12, 'TA'),
(2, 'HY002', '员工二', 1, 12, 'TA'),
(3, 'HY003', '员工三', 1, 12, 'TA');

INSERT INTO schedule_detail (id, schedule_id, employee_id, work_date, shift_id, schedule_type) VALUES
(1, 1, 1, '2026-05-18', 1, 'AUTO'),
(2, 1, 1, '2026-05-19', 2, 'AUTO'),
(3, 1, 2, '2026-05-18', 1, 'AUTO');

INSERT INTO schedule_change (
    id, schedule_detail_id, employee_id, target_employee_id,
    change_type, from_date, from_shift_id, status
) VALUES
(1, 1, 1, 3, 'SWAP', '2026-05-18', 1, 0);
