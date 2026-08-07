# 项目规则

## 项目背景
Hangyi 是一个 Maven 多模块 Java/Spring Boot 项目，包含 common、core、gateway、schedule 模块，并配有 web 前端与数据库脚本。

## 文件读取优先级
1. 本文件与根目录 README.md
2. 目标模块的 pom.xml、src/main、src/test
3. docs、db、tests 与 web

## 工具与命令
- Java/Maven：优先使用项目自带 `./mvnw`；代码审查先查看 git diff，再按需运行模块测试。
- Python：如需使用，默认 `~/Desktop/.venv/bin/python`；读 PPT 使用 `~/Desktop/readppt_venv/bin/python`。

## 用户偏好
默认简体中文，输出精简，代码审查优先报告可复现的正确性、安全性与回归风险，并标明文件和行号。

## 当前状态
已修复 gateway 的 CORS 白名单、JWT 黑名单校验、白名单前缀绕过和运行时依赖兼容问题，根项目已升级到 Spring Boot 3.3.7；修复 schedule Feign contextId 冲突、测试 JWT 配置和业务错误码。

前端已完成登录链路、Token 自动续期、导航/快捷跳转、响应式布局、404、Dashboard 与排班列表的加载/空/错误状态优化；排班页已补齐角色权限、输入校验、移动端卡片、操作确认和安全导出。工作区已加入低对比度空域航线背景、半透明内容表面和移动端弱化处理，保持航空主题与管理系统可读性。Element Plus 重组件已异步加载，生产构建主 JS 约 380 KB。前端已接入 Vitest 4 + jsdom，覆盖用户角色、路由守卫、Token 刷新队列、错误归一化、排班日期和运行端口逻辑。

后端已补齐 Dashboard 今日班次分布、自动排班日期交叉校验、参数校验 400 响应，以及排班主记录与明细的事务级联删除。

默认端口矩阵已统一为前端开发 5173、前端预览 9003、Gateway 9000、Core 9001、Schedule 9002；端口和主机可由根目录 `.env` 覆盖。Gateway local profile 不再覆盖完整路由，Vite preview、E2E、Nginx 模板和 README 已同步。

### 2026-07-29 修复与验收结果
- 已修复认证与授权问题：密码统一使用 BCrypt，历史明文密码会在启动时迁移；微信登录只接受临时 `code` 并由服务端换取 openid；Access/Refresh Token 区分类型、带 jti、刷新轮换且支持撤销，Gateway/Core/Schedule 均检查 Redis 黑名单并采用失败关闭；内部同步与 Token 验证接口强制校验 `INTERNAL_API_KEY`。
- 已修复排班数据一致性问题：调班和排班变更按当前 JWT 身份限制数据范围，审批采用原子状态迁移并实际更新排班明细；勤务发布先创建 `SERVICE` 主记录后写入明细；自动、角色、智能和 OptaPlanner 排班补齐日期、资质、请假、占用、放行执照及不可行解校验。
- 已修复同步与任务问题：外部同步按业务键幂等写入，批次失败会整体回滚且游标只在成功后推进；航班同步校验计划时间、机型和方向；模拟航班与自动同步默认关闭；审计日志覆盖成功的写操作，CSV 导出已处理公式注入。
- 已修复异常响应：业务状态码映射为真实 HTTP 状态，参数约束返回 400，重复键返回 409，通用 500 不再泄露内部异常信息。
- 已修复本轮服务器内部异常：Core Mapper 扫描仅注册 `@Mapper` 接口；员工选择不再发送超限分页；统计手机号改为 Java 层脱敏；勤务查询补齐航班计划与机型关联。
- 数据库全量结构已同步更新，并新增 `db/02-fix-audit-findings.sql` 供既有数据库备份后执行一次，处理字段对齐、航班去重、排班同步幂等键和旧唯一约束。
- `web/node_modules` 已从 Git 跟踪中移除，依赖仍由 `package-lock.json` 锁定。
- 前端新增全局 `AppPageHeader`、`AppPageState`，人员、班组、资质、机型、排班偏好、班次模板、排班、甘特图、历史、航班、请假、调班、统计、完成情况、审计日志和勤务排班页面均已完成一致化重构：包含加载/错误/空状态、输入校验、防重复提交、权限控制、操作反馈、响应式表格或移动端卡片。
- 临时验收环境使用 Gateway 9100、Core 9101、Schedule 9102、Preview 9103；原异常相关 API 均回归成功，超限分页返回 HTTP 400，其余统计、历史、甘特和勤务接口返回 HTTP 200。临时服务已全部关闭。

## 待办
- 本轮验证完成：
  - `./mvnw test` 全量通过：Common 17、Gateway 22、Core 15、Schedule 87，共 141 项，0 失败、0 错误、3 跳过；本次已包含 `SolverPerformanceTest`。
  - `web` Vitest 5 个文件、25 项测试通过；生产构建通过，主 JS 约 382 KB。
  - `npm audit --registry=https://registry.npmjs.org` 返回 0 个漏洞。
  - `git diff --check` 通过。
  - 桌面和 390px 各 17 个业务路由浏览器回归通过，无页面错误状态、无文档级横向溢出、控制台无 warning/error。
- 既有数据库部署前必须先备份，再执行一次 `db/02-fix-audit-findings.sql`；全新数据库直接导入 `db/01-schema.sql`。
- 部署或本地启动前必须配置 `.env` 中的 `JWT_SECRET`、`INTERNAL_API_KEY`、MySQL 和 Redis；默认端口为前端 5173、Gateway 9000、Core 9001、Schedule 9002。
- 启用微信登录或外部航班/国创同步前，需要补齐真实上游配置并在目标环境做一次联调；这些集成默认关闭。

### 2026-07-31 智能知识助手 RAG

- 新增独立 `hangyi-assistant` 模块，默认端口 9004，Gateway 已路由
  `/api/assistant/**`；Web 使用 JWT，微信小程序 internal 入口使用独立
  `ASSISTANT_INTERNAL_KEY`。
- 完成 Markdown/TXT 业务知识解析、章节切块、Ollama `bge-m3` embedding、
  Qdrant 增量/删除/全量重建、通义千问 grounded generation、低分拒答和服务端引用校验。
- 完成 EMPLOYEE/ADMIN 知识分级、MySQL 会话历史、反馈归属校验和原子每日配额。
- `knowledge/business/` 当前有 6 份业务资料；`knowledge/evaluation/questions.json`
  有 30 道 Recall@5 题，默认门槛 0.85。
- 新增 `db/03-assistant-rag.sql`、`deploy/assistant/docker-compose.yml` 和
  `docs/智能知识助手部署与使用.md`。
- 当前代码实现完成但尚未连接真实 Qdrant/Ollama/Qwen 环境；生产启用前必须完成
  数据库迁移、增量入库、Recall@5 验收，再设置 `ASSISTANT_ENGINE_ENABLED=true`。
- 下一阶段优先做本人排班、航班状态、审批进度和本人资质的只读工具；不要直接开放
  NL2SQL，也不要让模型执行审批、授权或改排班。

### 2026-08-01 小程序跨端员工契约修复

- `GET /api/sync/employee/{empNo}` 已补齐班组名称、在职/请假状态、岗位角色、
  航司授权、机型授权和结构化资质，继续由 `X-Internal-API-Key` 保护。
- `rpt_staff` 同步不再丢失 tags、航司、机型、资质和偏好 JSON；小程序云函数已按
  Java 统一响应 `R.data` 解包，跨端首次登录可实际命中。
- `employee.status` 统一为 `1=在职、0=离职`；请假不再写成状态 2，停用不再写成
  状态 3，请假快照保留在 `rpt_staff.on_leave` 和请假业务表。
- 新增 `SyncServiceTest` 4 个契约测试；全量 Maven 当前 192 项，189 通过、3 跳过、
  0 失败、0 错误。Web Vitest 25/25、生产构建和生产依赖审计 0 漏洞。
- 待办：部署 Core 与 Gateway 后，用真实内部密钥和公网 HTTPS 地址完成一次
  `GH001` 查询及小程序首次登录联调；生产数据若残留员工状态 2/3，应在备份后
  通过下一次 staff 同步归一化。

### 2026-08-03 小程序同步、请假/调班与 RAG 收口

- Core 同步端点已覆盖 staff、flights、schedules、swap、leave、operation logs；请假和
  操作日志保留连字符/下划线兼容路径，所有重试数据使用云 `_id` 或稳定 source key 幂等。
- 修复 `AFTERNOON`、字符串排班 ID、CANCELLED/archived、ADMIN 虚拟航班、A-H 班组、
  业务角色/执照、发动机型号、机号、人工 ETA 和结构化审计日志。
- Java 请假改为服务端身份派生、本人提交/撤回、原子审批、文字/图片凭证和重叠校验；
  批准后将区间内活动排班标记为 `needs_reassignment`。调班审批重新校验请假、机型资质、
  同日/时段冲突和每日最大工时。
- Assistant 已补 `requestId` 幂等、端到端 deadline、反馈状态/错误和生产阈值一致性；
  Java 引擎关闭时由小程序降级内置知识。
- 新增 `db/04-miniapp-sync-contract.sql`，既有数据库备份后在部署新版服务前执行；脚本
  可重复执行，并清理同步报表重复业务键后建立唯一索引。
- 本地验证：小程序云函数 `225/225`；Java 当前 Reactor `185` 项中 `182` 通过、
  `3` 个既有求解器场景跳过、`0` 失败；
  `git diff --check` 通过。
- 待办：在真实 MySQL 演练 `04` 迁移；完成 CloudBase → 公网 Gateway 六集合冒烟；
  `schedule_rule` 动态规则尚未接入求解器，实时业务查询助手仍作为后续只读工具建设。

### 2026-08-04 RAG P0/P1 安全收口

- Java Assistant 增加 Redis 分布式短窗口限流：默认员工 `10/60s`、管理员
  `30/60s`；限流 Redis 不可用时 fail-closed，MySQL 每日配额继续作为硬上限。
- internal status/chat/history/feedback 除 `ASSISTANT_INTERNAL_KEY` 外，还必须校验
  `X-Wechat-Timestamp` 和 `X-Wechat-Signature`。签名为
  `METHOD + pathAndQuery + timestamp + openid + employeeNo + isAdmin` 的
  HMAC-SHA256，默认仅接受 60 秒时间窗，避免 Java 单独信任身份 header。
- RAG 状态只有在引擎配置完成且至少一份知识文档 READY 时才返回 `ready=true`；
  模型输入明确隔离不可信问题和资料文本。Web 请求层已为 408/429 提供可理解的错误提示。
- Assistant 同时会复核 Qdrant 返回的 score 与 EMPLOYEE/ADMIN 可见性，防止远端过滤配置异常时越级资料进入模型上下文。
- 验证：`./mvnw -pl hangyi-assistant -am test` 为 Common 17 + Assistant 31，均通过；
  Web Vitest 26/26 及生产构建通过。真实 CloudBase 签名与公网 Gateway、Redis、
  Qdrant/Ollama/Qwen 联调仍需在部署环境完成。
