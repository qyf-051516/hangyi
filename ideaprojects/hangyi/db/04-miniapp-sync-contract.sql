-- 微信小程序与 Java 后端同步契约增量迁移。
-- 部署步骤：备份数据库后执行本文件，再部署 Core 服务；全新数据库只需导入 01-schema.sql。
-- 本文件通过 information_schema 判断列和索引，可重复执行。

DELIMITER //

DROP PROCEDURE IF EXISTS add_column_if_missing//
CREATE PROCEDURE add_column_if_missing(
    IN table_name_value VARCHAR(64),
    IN column_name_value VARCHAR(64),
    IN column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND COLUMN_NAME = column_name_value
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', table_name_value, '` ADD COLUMN ', column_definition);
        PREPARE statement_to_run FROM @ddl;
        EXECUTE statement_to_run;
        DEALLOCATE PREPARE statement_to_run;
    END IF;
END//

DROP PROCEDURE IF EXISTS add_index_if_missing//
CREATE PROCEDURE add_index_if_missing(
    IN table_name_value VARCHAR(64),
    IN index_name_value VARCHAR(64),
    IN index_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND INDEX_NAME = index_name_value
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', table_name_value, '` ADD ', index_definition);
        PREPARE statement_to_run FROM @ddl;
        EXECUTE statement_to_run;
        DEALLOCATE PREPARE statement_to_run;
    END IF;
END//

DELIMITER ;

CALL add_column_if_missing('employee', 'role_type',
    '`role_type` VARCHAR(20) NULL COMMENT ''角色类型(SERVICE/RELEASE/BOTH)'' AFTER `avatar`');
CALL add_column_if_missing('employee', 'tags',
    '`tags` TEXT NULL COMMENT ''标签(JSON)'' AFTER `openid`');
CALL add_column_if_missing('employee', 'authorized_airlines',
    '`authorized_airlines` TEXT NULL COMMENT ''授权航司(JSON)'' AFTER `tags`');
CALL add_column_if_missing('employee', 'authorized_aircraft_types',
    '`authorized_aircraft_types` TEXT NULL COMMENT ''授权机型(JSON)'' AFTER `authorized_airlines`');
CALL add_column_if_missing('employee', 'license_type',
    '`license_type` VARCHAR(50) NULL COMMENT ''执照类型'' AFTER `authorized_aircraft_types`');
ALTER TABLE employee
    MODIFY COLUMN tags TEXT NULL COMMENT '标签(JSON)',
    MODIFY COLUMN authorized_airlines TEXT NULL COMMENT '授权航司(JSON)',
    MODIFY COLUMN authorized_aircraft_types TEXT NULL COMMENT '授权机型(JSON)';

CALL add_column_if_missing('schedule_detail', 'needs_reassignment',
    '`needs_reassignment` TINYINT(1) DEFAULT 0 COMMENT ''是否因请假等原因待改派'' AFTER `record_status`');
CALL add_column_if_missing('schedule_detail', 'leave_request_id',
    '`leave_request_id` BIGINT NULL COMMENT ''触发待改派的请假申请ID'' AFTER `needs_reassignment`');
CALL add_column_if_missing('schedule', 'version',
    '`version` INT NOT NULL DEFAULT 0 COMMENT ''发布乐观锁版本'' AFTER `status`');

CALL add_column_if_missing('flight_plan', 'engine_model',
    '`engine_model` VARCHAR(60) NULL COMMENT ''发动机型号'' AFTER `registration`');
CALL add_column_if_missing('flight_plan', 'estimated_arrival_time',
    '`estimated_arrival_time` DATETIME NULL COMMENT ''人工预计到达时间'' AFTER `engine_model`');
CALL add_column_if_missing('flight_plan', 'source_id',
    '`source_id` VARCHAR(64) NULL COMMENT ''微信云端航班唯一标识'' AFTER `estimated_arrival_time`');
UPDATE schedule_detail sd
JOIN flight_plan duplicate ON duplicate.id = sd.flight_id
JOIN (
    SELECT source_id, MIN(id) AS canonical_id
    FROM flight_plan
    WHERE source_id IS NOT NULL AND source_id <> ''
    GROUP BY source_id
    HAVING COUNT(*) > 1
) canonical ON canonical.source_id = duplicate.source_id
SET sd.flight_id = canonical.canonical_id
WHERE duplicate.source_id IS NOT NULL AND duplicate.source_id <> '';
DELETE older FROM flight_plan older
JOIN flight_plan newer ON older.source_id = newer.source_id AND older.id < newer.id
WHERE older.source_id IS NOT NULL AND older.source_id <> '';
CALL add_index_if_missing('flight_plan', 'uk_flight_source_id',
    'UNIQUE KEY `uk_flight_source_id` (`source_id`)');

CALL add_column_if_missing('rpt_flight', 'engine_model',
    '`engine_model` VARCHAR(60) NULL COMMENT ''发动机型号'' AFTER `aircraft_type`');
CALL add_column_if_missing('rpt_flight', 'aircraft_registration',
    '`aircraft_registration` VARCHAR(20) NULL COMMENT ''航空器注册号'' AFTER `engine_model`');
CALL add_column_if_missing('rpt_flight', 'estimated_arrival_time',
    '`estimated_arrival_time` VARCHAR(32) NULL COMMENT ''人工预计到达时间'' AFTER `aircraft_registration`');
CALL add_column_if_missing('rpt_flight', 'source_id',
    '`source_id` VARCHAR(64) NULL COMMENT ''微信云端航班唯一标识'' AFTER `warning_flag`');
ALTER TABLE rpt_flight
    MODIFY COLUMN source_id VARCHAR(64) NULL COMMENT '微信云端航班唯一标识';

ALTER TABLE rpt_staff
    MODIFY COLUMN source_id VARCHAR(64) NULL COMMENT '微信云端员工唯一标识';
ALTER TABLE rpt_schedule
    MODIFY COLUMN source_id VARCHAR(64) NULL COMMENT '微信云端排班唯一标识';
ALTER TABLE rpt_swap_request
    MODIFY COLUMN source_id VARCHAR(64) NULL COMMENT '微信云端调班申请唯一标识';

CALL add_column_if_missing('schedule_change', 'source_schedule_source_id',
    '`source_schedule_source_id` VARCHAR(64) NULL COMMENT ''微信云端源排班唯一标识'' AFTER `source_request_id`');
CALL add_column_if_missing('schedule_change', 'target_schedule_source_id',
    '`target_schedule_source_id` VARCHAR(64) NULL COMMENT ''微信云端目标排班唯一标识'' AFTER `source_schedule_source_id`');
ALTER TABLE schedule_change
    MODIFY COLUMN status INT DEFAULT 0 COMMENT '状态(0待审批/1通过/2驳回/3撤回)';

CALL add_column_if_missing('leave_request', 'source_request_id',
    '`source_request_id` VARCHAR(64) NULL COMMENT ''微信云端请假申请唯一标识'' AFTER `id`');
CALL add_column_if_missing('leave_request', 'reason_mode',
    '`reason_mode` VARCHAR(20) NULL COMMENT ''原因凭证模式'' AFTER `reason`');
CALL add_column_if_missing('leave_request', 'reason_images',
    '`reason_images` TEXT NULL COMMENT ''图片凭证(JSON)'' AFTER `reason_mode`');
CALL add_column_if_missing('leave_request', 'validation_snapshot',
    '`validation_snapshot` TEXT NULL COMMENT ''提交时校验快照(JSON)'' AFTER `reason_images`');
CALL add_column_if_missing('leave_request', 'audit_trail',
    '`audit_trail` TEXT NULL COMMENT ''云端操作轨迹(JSON)'' AFTER `validation_snapshot`');
CALL add_column_if_missing('leave_request', 'cancelled_at',
    '`cancelled_at` DATETIME NULL COMMENT ''撤回时间'' AFTER `approve_remark`');
ALTER TABLE leave_request
    MODIFY COLUMN status INT DEFAULT 0 COMMENT '状态 0=待审批 1=已批准 2=已拒绝 3=已撤回';
UPDATE schedule_detail sd
JOIN leave_request duplicate ON duplicate.id = sd.leave_request_id
JOIN (
    SELECT source_request_id, MIN(id) AS canonical_id
    FROM leave_request
    WHERE source_request_id IS NOT NULL AND source_request_id <> ''
    GROUP BY source_request_id
    HAVING COUNT(*) > 1
) canonical ON canonical.source_request_id = duplicate.source_request_id
SET sd.leave_request_id = canonical.canonical_id
WHERE duplicate.source_request_id IS NOT NULL AND duplicate.source_request_id <> '';
DELETE older FROM leave_request older
JOIN leave_request newer ON older.source_request_id = newer.source_request_id AND older.id < newer.id
WHERE older.source_request_id IS NOT NULL AND older.source_request_id <> '';
CALL add_index_if_missing('leave_request', 'uk_leave_source_request',
    'UNIQUE KEY `uk_leave_source_request` (`source_request_id`)');

CALL add_column_if_missing('operation_log', 'source_id',
    '`source_id` VARCHAR(64) NULL COMMENT ''微信云端日志唯一标识'' AFTER `id`');
ALTER TABLE operation_log
    MODIFY COLUMN detail TEXT NULL COMMENT '操作详情',
    MODIFY COLUMN target_id TEXT NULL COMMENT '结构化操作对象(JSON)';
DELETE older FROM operation_log older
JOIN operation_log newer ON older.source_id = newer.source_id AND older.id < newer.id
WHERE older.source_id IS NOT NULL AND older.source_id <> '';
CALL add_index_if_missing('operation_log', 'uk_operation_source_id',
    'UNIQUE KEY `uk_operation_source_id` (`source_id`)');

-- 老版本同步表没有唯一约束。保留每个业务键最新一条后再加索引，
-- 防止即时同步和定时同步并发时重复插入报表快照。
DELETE older FROM rpt_staff older
JOIN rpt_staff newer ON older.employee_no = newer.employee_no AND older.id < newer.id
WHERE older.employee_no IS NOT NULL AND older.employee_no <> '';
DELETE older FROM rpt_flight older
JOIN rpt_flight newer ON older.source_id = newer.source_id AND older.id < newer.id
WHERE older.source_id IS NOT NULL AND older.source_id <> '';
DELETE older FROM rpt_schedule older
JOIN rpt_schedule newer ON older.schedule_key = newer.schedule_key AND older.id < newer.id
WHERE older.schedule_key IS NOT NULL AND older.schedule_key <> '';
DELETE older FROM rpt_swap_request older
JOIN rpt_swap_request newer ON older.request_id = newer.request_id AND older.id < newer.id
WHERE older.request_id IS NOT NULL AND older.request_id <> '';
CALL add_index_if_missing('rpt_staff', 'uk_rpt_staff_employee_no',
    'UNIQUE KEY `uk_rpt_staff_employee_no` (`employee_no`)');
CALL add_index_if_missing('rpt_flight', 'uk_rpt_flight_source_id',
    'UNIQUE KEY `uk_rpt_flight_source_id` (`source_id`)');
CALL add_index_if_missing('rpt_schedule', 'uk_rpt_schedule_key',
    'UNIQUE KEY `uk_rpt_schedule_key` (`schedule_key`)');
CALL add_index_if_missing('rpt_swap_request', 'uk_rpt_swap_request_id',
    'UNIQUE KEY `uk_rpt_swap_request_id` (`request_id`)');
CALL add_index_if_missing('schedule_detail', 'idx_schedule_detail_active_employee_date',
    'INDEX `idx_schedule_detail_active_employee_date` (`employee_id`, `work_date`, `record_status`)');

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
