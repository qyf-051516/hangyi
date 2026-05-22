DROP TABLE IF EXISTS employee_preference;
DROP TABLE IF EXISTS employee_qualification;
DROP TABLE IF EXISTS employee;
DROP TABLE IF EXISTS team_group;
DROP TABLE IF EXISTS aircraft_type;

CREATE TABLE team_group (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(100) NOT NULL,
    group_code VARCHAR(50),
    group_type VARCHAR(20),
    leader_id BIGINT,
    description VARCHAR(255),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT,
    group_id BIGINT,
    emp_no VARCHAR(30) NOT NULL,
    name VARCHAR(50) NOT NULL,
    id_card VARCHAR(18),
    phone VARCHAR(20),
    gender INT,
    position VARCHAR(50),
    job_title VARCHAR(50),
    work_type VARCHAR(20) DEFAULT 'FULL_TIME',
    hire_date DATE,
    status INT DEFAULT 1,
    max_hours_per_day DECIMAL(4,1) DEFAULT 8.0,
    max_hours_per_week DECIMAL(4,1) DEFAULT 40.0,
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE aircraft_type (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    type_code VARCHAR(20) NOT NULL,
    type_name VARCHAR(100),
    manufacturer VARCHAR(50),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_qualification (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    aircraft_type_id BIGINT,
    qual_type VARCHAR(30),
    qual_code VARCHAR(50),
    qual_name VARCHAR(100),
    issue_date DATE,
    expire_date DATE,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_preference (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    pref_type VARCHAR(30),
    pref_key VARCHAR(50),
    pref_value VARCHAR(100),
    priority INT,
    effective_from DATE,
    effective_to DATE,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO team_group (id, group_name, group_code, group_type, status) VALUES
(1, '机务一组', 'MNT-01', 'MAINTENANCE', 1),
(2, '机务二组', 'MNT-02', 'MAINTENANCE', 1);

INSERT INTO employee (id, emp_no, name, group_id, position, work_type, status) VALUES
(1, 'EMP001', '张三', 1, '机械师', 'FULL_TIME', 1),
(2, 'EMP002', '李四', 1, '电子师', 'FULL_TIME', 1),
(3, 'EMP003', '王五', 2, '机械师', 'FULL_TIME', 1);

INSERT INTO aircraft_type (id, type_code, type_name, status) VALUES
(1, 'B737', '波音737', 1),
(2, 'A320', '空客320', 1);

INSERT INTO employee_qualification (id, employee_id, aircraft_type_id, qual_type, qual_code, qual_name, status) VALUES
(1, 1, 1, 'AIRCRAFT_TYPE', 'B737-AUTH', '波音737维护授权', 1),
(2, 2, 2, 'AIRCRAFT_TYPE', 'A320-AUTH', '空客320维护授权', 1);
