-- ============================================================
-- 演示数据
-- ============================================================
USE hangyi_scheduling;

-- 默认管理员账号（密码: 123456 / BCrypt加密）
INSERT INTO sys_user (username, password, real_name, phone, status) VALUES
('admin', '$2a$10$n9kgTE8.LRKToOD4LBPZP.3cNI5mSnmrTb4M3gVUHIG5IA7k36a5m', '系统管理员', '13800000000', 1);

-- 分配管理员角色
INSERT INTO sys_user_role (user_id, role_id) VALUES (1, 1);

-- 班组（机务/地勤/安检）
INSERT INTO team_group (group_name, group_code, group_type, description) VALUES
('机务一中队', 'MT-01', 'MAINTENANCE', '负责波音系列机型维修'),
('机务二中队', 'MT-02', 'MAINTENANCE', '负责空客系列机型维修'),
('地勤A组',   'GD-A',   'GROUND',     '值机、行李、引导'),
('地勤B组',   'GD-B',   'GROUND',     '值机、行李、引导'),
('安检一队',   'SEC-01', 'SECURITY',   '旅检通道'),
('安检二队',   'SEC-02', 'SECURITY',   '行检通道');

-- 员工（机务12人 + 地勤8人 + 安检8人 = 28人）
INSERT INTO employee (group_id, emp_no, name, phone, position, job_title, work_type, hire_date, status, max_hours_per_day, max_hours_per_week) VALUES
-- 机务一中队
(1, 'MT1001', '张建国', '13800001001', '机务维修', '高级技师', 'FULL_TIME', '2018-03-01', 1, 8.0, 40.0),
(1, 'MT1002', '李明强', '13800001002', '机务维修', '中级技师', 'FULL_TIME', '2019-06-15', 1, 8.0, 40.0),
(1, 'MT1003', '王海东', '13800001003', '机务维修', '初级技师', 'FULL_TIME', '2021-09-01', 1, 8.0, 40.0),
(1, 'MT1004', '赵志远', '13800001004', '机务维修', '中级技师', 'FULL_TIME', '2020-01-10', 1, 8.0, 40.0),
(1, 'MT1005', '陈晓峰', '13800001005', '勤务员',   '初级',     'FULL_TIME', '2022-04-20', 1, 8.0, 40.0),
(1, 'MT1006', '刘伟强', '13800001006', '放行人员', '高级技师', 'FULL_TIME', '2016-07-01', 1, 8.0, 40.0),
-- 机务二中队
(2, 'MT2001', '孙浩然', '13800002001', '机务维修', '中级技师', 'FULL_TIME', '2019-11-01', 1, 8.0, 40.0),
(2, 'MT2002', '周志鹏', '13800002002', '机务维修', '初级技师', 'FULL_TIME', '2021-01-15', 1, 8.0, 40.0),
(2, 'MT2003', '吴俊杰', '13800002003', '机务维修', '高级技师', 'FULL_TIME', '2017-05-20', 1, 8.0, 40.0),
(2, 'MT2004', '郑明辉', '13800002004', '放行人员', '高级技师', 'FULL_TIME', '2015-08-10', 1, 8.0, 40.0),
(2, 'MT2005', '黄国华', '13800002005', '勤务员',   '中级',     'FULL_TIME', '2020-03-25', 1, 8.0, 40.0),
(2, 'MT2006', '林志远', '13800002006', '机务维修', '中级技师', 'FULL_TIME', '2020-06-15', 1, 8.0, 40.0),
-- 地勤A组
(3, 'GD1001', '杨丽华', '13800003001', '值机员', '高级', 'FULL_TIME', '2019-04-01', 1, 8.0, 40.0),
(3, 'GD1002', '陈思思', '13800003002', '值机员', '中级', 'FULL_TIME', '2020-07-15', 1, 8.0, 40.0),
(3, 'GD1003', '张伟杰', '13800003003', '引导员', '中级', 'FULL_TIME', '2021-02-20', 1, 8.0, 40.0),
(3, 'GD1004', '李芳芳', '13800003004', '值机员', '初级', 'FULL_TIME', '2022-08-01', 1, 8.0, 40.0),
-- 地勤B组
(4, 'GD2001', '王丽萍', '13800004001', '值机员', '中级', 'FULL_TIME', '2020-01-10', 1, 8.0, 40.0),
(4, 'GD2002', '赵小雪', '13800004002', '值机员', '初级', 'FULL_TIME', '2022-03-20', 1, 8.0, 40.0),
(4, 'GD2003', '马晓明', '13800004003', '引导员', '中级', 'FULL_TIME', '2021-06-15', 1, 8.0, 40.0),
(4, 'GD2004', '刘佳琪', '13800004004', '值机员', '高级', 'FULL_TIME', '2019-09-01', 1, 8.0, 40.0),
-- 安检一队
(5, 'SEC101', '周德华', '13800005001', '安检员', '中级', 'FULL_TIME', '2020-05-01', 1, 8.0, 40.0),
(5, 'SEC102', '吴敏霞', '13800005002', '安检员', '初级', 'FULL_TIME', '2021-10-15', 1, 8.0, 40.0),
(5, 'SEC103', '郑凯丽', '13800005003', '安检员', '中级', 'FULL_TIME', '2020-02-20', 1, 8.0, 40.0),
(5, 'SEC104', '黄志强', '13800005004', '安检员', '高级', 'FULL_TIME', '2018-08-10', 1, 8.0, 40.0),
-- 安检二队
(6, 'SEC201', '林晓婷', '13800006001', '安检员', '中级', 'FULL_TIME', '2021-01-05', 1, 8.0, 40.0),
(6, 'SEC202', '何国梁', '13800006002', '安检员', '初级', 'FULL_TIME', '2022-06-20', 1, 8.0, 40.0),
(6, 'SEC203', '罗美玲', '13800006003', '安检员', '中级', 'FULL_TIME', '2020-11-10', 1, 8.0, 40.0),
(6, 'SEC204', '谢文斌', '13800006004', '安检员', '高级', 'FULL_TIME', '2019-04-15', 1, 8.0, 40.0);

-- 机型
INSERT INTO aircraft_type (type_code, type_name, manufacturer) VALUES
('B737', '波音737', 'Boeing'),
('A320', '空客A320', 'Airbus'),
('A321', '空客A321', 'Airbus'),
('ERJ190', '巴西航空ERJ190', 'Embraer'),
('B787', '波音787', 'Boeing');

-- 今天和未来6天的排班演示数据
-- 给机务一中队(1)生成一周排班
SET @schedule_id = 1;
INSERT INTO schedule (id, schedule_name, group_id, start_date, end_date, status, created_by) VALUES
(@schedule_id, CONCAT('机务一中队 ', CURDATE(), ' ~ ', DATE_ADD(CURDATE(), INTERVAL 6 DAY), ' 排班'), 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 6 DAY), 1, 1);

-- 为机务一中队的每个人生成每天排班（交替早班/晚班/夜班/休息）
INSERT INTO schedule_detail (schedule_id, employee_id, work_date, shift_id, schedule_type)
SELECT @schedule_id, e.id, d.work_date,
  CASE MOD(e.id + DATEDIFF(d.work_date, CURDATE()), 4)
    WHEN 0 THEN 1  -- 早班(8-16)
    WHEN 1 THEN 2  -- 晚班(16-0)
    WHEN 2 THEN 3  -- 夜班(0-8)
    ELSE NULL       -- 休息
  END,
  'AUTO'
FROM employee e
CROSS JOIN (
  SELECT CURDATE() + INTERVAL 0 DAY AS work_date UNION ALL
  SELECT CURDATE() + INTERVAL 1 DAY UNION ALL
  SELECT CURDATE() + INTERVAL 2 DAY UNION ALL
  SELECT CURDATE() + INTERVAL 3 DAY UNION ALL
  SELECT CURDATE() + INTERVAL 4 DAY UNION ALL
  SELECT CURDATE() + INTERVAL 5 DAY UNION ALL
  SELECT CURDATE() + INTERVAL 6 DAY
) d
WHERE e.group_id = 1 AND (MOD(e.id + DATEDIFF(d.work_date, CURDATE()), 4) < 3);

-- 今天同步一些航班
INSERT INTO flight_plan (flight_no, plan_date, plan_time, flight_type, route_from, route_to, registration, gate, status) VALUES
('CZ3275', CURDATE(), '08:30:00', 'DEP', '广州', '桂林', 'B-1234', '07', 'SCHEDULED'),
('CZ3276', CURDATE(), '12:15:00', 'ARR', '桂林', '广州', 'B-1234', '07', 'SCHEDULED'),
('CA1837', CURDATE(), '09:00:00', 'DEP', '北京', '桂林', 'B-5678', '12', 'SCHEDULED'),
('CA1838', CURDATE(), '13:20:00', 'ARR', '桂林', '北京', 'B-5678', '12', 'SCHEDULED'),
('MU5381', CURDATE(), '10:30:00', 'DEP', '上海', '桂林', 'A-3201', '15', 'SCHEDULED'),
('MU5382', CURDATE(), '15:45:00', 'ARR', '桂林', '上海', 'A-3201', '15', 'SCHEDULED'),
('3U8765', CURDATE(), '11:00:00', 'DEP', '成都', '桂林', 'B-9012', '08', 'SCHEDULED'),
('3U8766', CURDATE(), '16:30:00', 'ARR', '桂林', '成都', 'B-9012', '08', 'SCHEDULED'),
('MF8642', CURDATE(), '14:20:00', 'DEP', '厦门', '桂林', 'B-3456', '10', 'SCHEDULED'),
('ZH9841', CURDATE(), '17:00:00', 'DEP', '深圳', '桂林', 'B-7890', '06', 'SCHEDULED');

-- 员工资质（机务一中队）
INSERT INTO employee_qualification (employee_id, aircraft_type_id, qual_type, qual_code, qual_name, issue_date, expire_date, status) VALUES
(1, 1, 'AIRCRAFT_TYPE', 'B737-AUTH', 'B737机型授权', '2025-01-01', '2027-01-01', 1),
(1, 2, 'AIRCRAFT_TYPE', 'A320-AUTH', 'A320机型授权', '2025-03-01', '2027-03-01', 1),
(1, NULL, 'LICENSE', 'MAINT-LICENSE', '维修执照(ME)', '2024-06-01', '2027-06-01', 1),
(2, 1, 'AIRCRAFT_TYPE', 'B737-AUTH', 'B737机型授权', '2025-02-01', '2027-02-01', 1),
(2, NULL, 'LICENSE', 'MAINT-LICENSE', '维修执照(AV)', '2024-08-01', '2027-08-01', 1),
(3, 1, 'AIRCRAFT_TYPE', 'B737-AUTH', 'B737机型授权', '2025-04-01', '2027-04-01', 1),
(3, 2, 'AIRCRAFT_TYPE', 'A320-AUTH', 'A320机型授权', '2025-05-01', '2027-05-01', 1),
(4, 1, 'AIRCRAFT_TYPE', 'B737-AUTH', 'B737机型授权', '2025-01-15', '2027-01-15', 1),
(4, NULL, 'LICENSE', 'MAINT-LICENSE', '维修执照(ME)', '2024-09-01', '2027-09-01', 1),
(5, NULL, 'CERT', 'APRON-CERT', '机坪安全证', '2025-06-01', '2026-12-31', 1),
(6, 1, 'AIRCRAFT_TYPE', 'B737-AUTH', 'B737机型授权', '2024-12-01', '2027-12-01', 1),
(6, 2, 'AIRCRAFT_TYPE', 'A320-AUTH', 'A320机型授权', '2024-12-01', '2027-12-01', 1),
(6, NULL, 'LICENSE', 'RELEASE-LICENSE', '放行执照', '2023-06-01', '2028-06-01', 1);

-- 确认数据已插入
SELECT '演示数据插入完成!' AS result;
SELECT CONCAT('班组: ', COUNT(*)) FROM team_group
UNION ALL
SELECT CONCAT('员工: ', COUNT(*)) FROM employee
UNION ALL
SELECT CONCAT('排班明细: ', COUNT(*)) FROM schedule_detail
UNION ALL
SELECT CONCAT('航班: ', COUNT(*)) FROM flight_plan;
