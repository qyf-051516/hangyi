DROP TABLE IF EXISTS leave_request;

CREATE TABLE leave_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    leave_type VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL(4,1) NOT NULL,
    reason VARCHAR(500),
    status INT DEFAULT 0,
    approver_id BIGINT,
    approve_remark VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leave_request (id, employee_id, leave_type, start_date, end_date, total_days, reason, status) VALUES
(1, 1, 'ANNUAL', '2026-06-01', '2026-06-03', 3.0, '年假', 0),
(2, 2, 'SICK', '2026-05-20', '2026-05-21', 2.0, '生病', 1),
(3, 1, 'PERSONAL', '2026-06-10', '2026-06-10', 1.0, '事假', 0);
