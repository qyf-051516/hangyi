-- ============================================================
-- 迁移脚本：sys_user 添加 wechat_openid 字段
-- 用于国创赛微信小程序统一认证
-- ============================================================
ALTER TABLE sys_user ADD COLUMN wechat_openid VARCHAR(64) DEFAULT NULL COMMENT '微信OPENID' AFTER email;
CREATE UNIQUE INDEX idx_wechat_openid ON sys_user(wechat_openid);
