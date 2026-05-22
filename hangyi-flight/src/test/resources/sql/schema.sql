DROP TABLE IF EXISTS flight_plan;

CREATE TABLE flight_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    flight_no VARCHAR(20) NOT NULL,
    aircraft_type_id BIGINT,
    registration VARCHAR(20),
    plan_date DATE NOT NULL,
    plan_time TIME NOT NULL,
    flight_type VARCHAR(10) NOT NULL,
    route_from VARCHAR(50),
    route_to VARCHAR(50),
    gate VARCHAR(20),
    status VARCHAR(20) DEFAULT 'SCHEDULED',
    remark VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO flight_plan (id, flight_no, aircraft_type_id, registration, plan_date, plan_time, flight_type, route_from, route_to, gate, status) VALUES
(1, 'CZ3288', 1, 'B-1234', CURRENT_DATE, '08:30', 'DEP', '南宁', '广州', '01', 'SCHEDULED'),
(2, 'CZ3276', 2, 'B-5678', CURRENT_DATE, '10:00', 'DEP', '南宁', '北京', '02', 'SCHEDULED'),
(3, 'CA1234', 1, 'B-9012', CURRENT_DATE, '09:15', 'ARR', '北京', '南宁', '03', 'SCHEDULED');
