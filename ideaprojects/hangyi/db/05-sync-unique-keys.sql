-- ═══════════════════════════════════════════════════════════════════════
-- 05-sync-unique-keys.sql — SyncService 非唯一键加固(审查 H3)
-- 目标: employee.emp_no 与 aircraft_type.type_code 建立唯一索引,
--       避免跨端同步 selectOne 命中多行 → TooManyResultsException → 整批 500 回滚。
-- 执行前: 先去重历史脏数据,重复行合并或删除后再建唯一索引,否则 CREATE 会失败。
-- ═══════════════════════════════════════════════════════════════════════

-- 0) 检查重复(应返回 0 行才可安全建索引)
SELECT emp_no, COUNT(*) c FROM employee GROUP BY emp_no HAVING c > 1;
SELECT type_code, COUNT(*) c FROM aircraft_type GROUP BY type_code HAVING c > 1;

-- 1) employee.emp_no 唯一索引(替换普通索引 idx_emp_no)
--    MySQL 8: 先删普通索引再建唯一;若已有重复数据先人工合并
ALTER TABLE employee DROP INDEX idx_emp_no;
ALTER TABLE employee ADD UNIQUE KEY uk_emp_no (emp_no);

-- 2) aircraft_type.type_code 唯一索引
ALTER TABLE aircraft_type ADD UNIQUE KEY uk_type_code (type_code);

-- 3) 回滚(如需撤销)
-- ALTER TABLE employee DROP INDEX uk_emp_no;
-- ALTER TABLE employee ADD INDEX idx_emp_no (emp_no);
-- ALTER TABLE aircraft_type DROP INDEX uk_type_code;
