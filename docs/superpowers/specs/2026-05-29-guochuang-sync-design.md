# 国创赛功能同步设计

## 目标

以国创赛（微信小程序+云开发）功能为基准，将7个缺失模块同步到 hangyi（Spring Boot + Vue.js + MySQL）。

## 新建微服务模块（5个）

### hangyi-swap（调班 + 通知）

**API**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/swap/requests | createSwapRequest - 代班申请（两员工互换排班） |
| POST | /api/swap/applications | createSwapApplication - 调班申请（时间段调换） |
| GET | /api/swap/requests | listSwapRequests，支持 ?status=PENDING/APPROVED/REJECTED |
| POST | /api/swap/requests/{id}/approve | approveSwapRequest，body: { decision: APPROVE|REJECT, comment } |
| GET | /api/notifications | listMyNotifications - 当前用户通知列表 |
| PUT | /api/notifications/read | markMyNotificationsRead - 全部标记已读 |

**数据表**

- swap_request（新建，替代 auth 模块的 rpt_swap_request，迁移数据后删除旧表）
- 通知系统基于 swap_request 记录实现（与国创赛一致），不建独立通知表

### hangyi-statistics（排班统计）

**API**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/statistics/schedules | getScheduleStatistics，?scheduleDate= |
| GET | /api/statistics/status-overview | getScheduleStatusOverview，?groupId=&startDate=&endDate= |

复用 schedule 模块的：
- POST /api/schedules/{id}/complete | completeSchedule
- GET /api/schedules/history | getScheduleHistory

无独立数据表，查询 schedule/staff 表。

### hangyi-compliance（合规检查）

**API**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/compliance/preflight-check | preflightComplianceCheck，body: { scheduleDate, edits[] } |

检查项：CONCURRENT_SCHEDULE（同班次重复）、EXCEED_CONTINUOUS（连续超限）、EXCEED_WORK_HOURS（工时超限）、SAME_GROUP_CONCENTRATION（同航班同组）。

无独立数据表。

### hangyi-audit（审计日志）

**API**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/audit/logs | queryOperationLogs，?page=&size=&action=&startDate=&endDate= |
| GET | /api/audit/logs/export | exportOperationLogs（CSV） |

**数据表**

- operation_log（新建）

### hangyi-service-schedule（勤务排班）

**API**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/service-schedules | getServiceScheduleTable，?scheduleDate= |
| POST | /api/service-schedules/publish | publishServiceSchedule |

复用 schedule 表，通过 task_type / record_status 字段区分。

## 现有模块扩展

### hangyi-schedule

schedule 表新增字段：source, record_status, task_type, task_start, task_end, prep_time, wrap_time。

新增 API：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/schedules/smart | smartSchedule - 单日智能排班 |
| POST | /api/schedules/smart-multi-day | smartScheduleMultiDay - 多日滚动排班 |
| POST | /api/schedules/smart-roles | smartScheduleWithRoles - 按角色排班 |
| POST | /api/schedules/optimize | optimizeStaffSchedule |
| POST | /api/schedules/import-tsv | importScheduleFromTSV |
| POST | /api/schedules/{id}/complete | completeSchedule |
| GET | /api/schedules/history | getScheduleHistory |

### hangyi-ai

扩展现有 SuggestionService，对接智能排班的资质匹配、疲劳度算法。

## Web 前端变更

### 移除

- views/ai/Suggestion.vue - 智能排班替代
- views/ai/ConflictDetection.vue - 合规检查替代
- views/ai/AiQuery.vue - 无对应功能
- 路由：/ai/suggestions, /ai/conflicts, /ai/query

### 新增

- views/swap/SwapIndex.vue → /swap
- views/statistics/StatisticsIndex.vue → /statistics
- views/compliance/ComplianceIndex.vue → /compliance
- views/audit/AuditIndex.vue → /audit
- views/service-schedule/ServiceScheduleIndex.vue → /service-schedule
- 通知入口放在 MainLayout 顶部导航栏

### 扩展

- views/schedule/ScheduleList.vue：增加智能排班、TSV 导入按钮
- views/dashboard/Dashboard.vue：对接统计 API

## 实施顺序

1. 数据库：新增字段和表
2. hangyi-audit（无依赖，先建基础设施）
3. hangyi-swap + 通知
4. hangyi-schedule 扩展（智能排班 API）
5. hangyi-statistics
6. hangyi-compliance
7. hangyi-service-schedule
8. Web 前端：清理 + 新增页面
