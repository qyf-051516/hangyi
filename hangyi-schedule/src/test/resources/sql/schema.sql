DROP TABLE IF EXISTS schedule_detail;
DROP TABLE IF EXISTS schedule_change;
DROP TABLE IF EXISTS schedule;
DROP TABLE IF EXISTS schedule_rule;
DROP TABLE IF EXISTS shift_template;

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
    created_by BIGINT,
    published_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedule_detail (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_id BIGINT NOT NULL,
    employee_id BIGINT NOT NULL,
    work_date DATE NOT NULL,
    shift_id BIGINT NOT NULL,
    shift_group VARCHAR(20),
    schedule_type VARCHAR(20) DEFAULT 'AUTO',
    remark VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedule_change (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
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

INSERT INTO shift_template (id, shift_code, shift_name, start_time, end_time, shift_type, color, status) VALUES
(1, 'MORNING', '早班', '08:00', '16:00', 'DAY', '#409EFF', 1),
(2, 'EVENING', '晚班', '16:00', '00:00', 'DAY', '#67C23A', 1),
(3, 'NIGHT', '夜班', '00:00', '08:00', 'NIGHT', '#E6A23C', 1);

INSERT INTO schedule (id, schedule_name, group_id, start_date, end_date, status, created_by) VALUES
(1, '2026年5月第3周排班', 1, '2026-05-18', '2026-05-24', 1, 1);

INSERT INTO schedule_detail (id, schedule_id, employee_id, work_date, shift_id, schedule_type) VALUES
(1, 1, 1, '2026-05-18', 1, 'AUTO'),
(2, 1, 1, '2026-05-19', 2, 'AUTO'),
(3, 1, 2, '2026-05-18', 1, 'AUTO');

INSERT INTO schedule_change (id, employee_id, change_type, from_date, from_shift_id, status) VALUES
(1, 1, 'SWAP', '2026-05-18', 1, 0);
