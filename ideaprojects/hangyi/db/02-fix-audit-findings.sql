-- 既有数据库升级脚本：修复审计发现的数据约束与字段不一致。
-- 仅执行一次；全新数据库直接使用 01-schema.sql。

ALTER TABLE schedule_detail
    DROP INDEX uk_emp_date,
    ADD INDEX idx_emp_date (employee_id, work_date),
    ADD COLUMN source_key VARCHAR(160) NULL COMMENT '外部同步唯一键' AFTER id,
    ADD UNIQUE KEY uk_source_key (source_key);

ALTER TABLE swap_request
    ADD COLUMN work_date DATE NULL COMMENT '申请日期' AFTER flight_no;

UPDATE schedule_detail sd
JOIN flight_plan fp ON fp.id = sd.flight_id
JOIN (
    SELECT flight_no, plan_date, plan_time, MIN(id) AS canonical_id
    FROM flight_plan
    GROUP BY flight_no, plan_date, plan_time
    HAVING COUNT(*) > 1
) duplicates
  ON duplicates.flight_no = fp.flight_no
 AND duplicates.plan_date = fp.plan_date
 AND duplicates.plan_time <=> fp.plan_time
SET sd.flight_id = duplicates.canonical_id;

DELETE duplicate
FROM flight_plan duplicate
JOIN flight_plan canonical
  ON canonical.flight_no = duplicate.flight_no
 AND canonical.plan_date = duplicate.plan_date
 AND canonical.plan_time <=> duplicate.plan_time
 AND canonical.id < duplicate.id;

ALTER TABLE flight_plan
    ADD UNIQUE KEY uk_flight_unique (flight_no, plan_date, plan_time);

UPDATE schedule_change
SET status = CASE UPPER(COALESCE(status, 'PENDING'))
    WHEN 'APPROVED' THEN '1'
    WHEN 'REJECTED' THEN '2'
    WHEN '1' THEN '1'
    WHEN '2' THEN '2'
    ELSE '0'
END;

ALTER TABLE schedule_change
    CHANGE COLUMN detail_id schedule_detail_id BIGINT NULL COMMENT '排班明细ID',
    CHANGE COLUMN old_employee_id employee_id BIGINT NULL COMMENT '原员工ID',
    CHANGE COLUMN new_employee_id target_employee_id BIGINT NULL COMMENT '目标员工ID',
    CHANGE COLUMN change_date from_date DATE NULL COMMENT '原日期',
    ADD COLUMN from_shift_id BIGINT NULL COMMENT '原班次ID' AFTER from_date,
    ADD COLUMN to_date DATE NULL COMMENT '目标日期' AFTER from_shift_id,
    ADD COLUMN to_shift_id BIGINT NULL COMMENT '目标班次ID' AFTER to_date,
    MODIFY COLUMN status INT DEFAULT 0 COMMENT '状态(0待审批/1通过/2驳回)',
    DROP COLUMN schedule_id,
    DROP COLUMN approve_time,
    ADD INDEX idx_detail (schedule_detail_id);

ALTER TABLE schedule_change
    ADD COLUMN source_request_id VARCHAR(64) NULL COMMENT '外部申请唯一标识' AFTER id,
    ADD UNIQUE KEY uk_source_request (source_request_id);
