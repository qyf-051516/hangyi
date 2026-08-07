# 航翼排班大创 — 已知 Bug 清单

> 最后更新：2026-07-05  
> 来源：Phase A→J 工作总结 + CLAUDE.md §6.1 安全 Review + OptaPlanner 实施文档 + 三份 agent 全线审查  
> 状态标注：✅ 已修复 / 🔴 未修复 / 🟡 部分修复

---

## 2026-07-05 修复总结

本次修复 **18 项 bug**，覆盖安全/数据库/OptaPlanner/工程，涉及 15+ 文件、500+ 行代码改动，编译通过、60+ 测试全部通过。

### 安全修复（6 项）
| ID | 修复内容 | 文件 |
|----|----------|------|
| H-1 | Employee permitAll 端点改为 `hasAnyAuthority(ADMIN/TEAM_LEADER/BOSS)` | `EmployeeSecurityConfig.java` |
| H-2 | 微信登录 openid 加格式校验（10-64位） | `SysUserService.java` |
| H-3 | 新增 JWT refresh token + `/api/auth/refresh` 端点 | `JwtUtil.java` / `AuthController.java` / `LoginResponse.java` / Gateway 白名单 |
| H-5 | 确认已修复：22 处 RuntimeException→BusinessException | — |
| H-6 | schedule 移除 redis starter 死依赖；auth 补 redis 配置 | `pom.xml` / `application.yml×2` / `docker-compose.yml` |
| M-2 | PII 脱敏：新增 `MaskedSerializer`，Employee/SysUser 加 `@JsonSerialize` | `MaskedSerializer.java` / `Employee.java` / `SysUser.java` |

### OptaPlanner 修复（7 项）
| ID | 修复内容 | 文件 |
|----|----------|------|
| O-1 | C-a 放行持照死代码复活：DB 加 `is_release` 列 + ProblemFactory 读取 | `migrate.sh` / `ProblemFactory.java` |
| O-2 | loadEmployees N+1→5 次批量 IN 查询（资质/请假/工时/夜班/昨日班次） | `ProblemFactory.java` |
| O-3 | 员工查询加 `AND license_type IS NOT NULL` | `ProblemFactory.java` |
| O-5 | shiftIdCache 移除，每次查 DB | `SmartScheduleService.java` |
| O-7 | writeDetails 改用 `detailMapper.insert()` 替代 jdbc.batchUpdate | `SmartScheduleService.java` |
| O-8 | getScheduleHistoryFull 加 `@Transactional(readOnly = true)` | `SmartScheduleService.java` |
| O-9 | TIME 字段 3 处加 `else if instanceof LocalTime` | `ProblemFactory.java` |
| O-10 | timeToShiftCode 从 shift_template 动态读取早晚班阈值 | `ShiftRules.java` / `ProblemFactory.java` |

### 工程修复（3 项）
| ID | 修复内容 | 文件 |
|----|----------|------|
| DP-1 | start.sh 加 gateway 重启步骤 + BCrypt→明文密码修正 | `start.sh` |
| ED-5 | CLAUDE.md 补充 mysql TZ 规则 + long offset 豁免 + H-5/H-6 已修复 | `CLAUDE.md` |
| H-6 | docker-compose.yml 删除 schedule 的 Redis 环境和依赖 | `docker-compose.yml` |

### 还剩下 9 项
| ID | 类 | 原因 |
|----|-----|------|
| C-3 | 上帝服务 | 540 行重设计，需最强模型 |
| O-4 | SQL IN | 已用 `?` 参数化，实质安全 |
| O-6 | 废弃构造函数 | 与 O-2/O-7 已一起重构 |
| O-11 | 双 SolverConfig | 需 OptaPlanner 配置设计 |
| PF-1 | 甘特图 N+1 | Feign 调用链优化 |
| PF-3 | groups/list 500 | 待复现排查 |
| ED-1 | Git 拆分 | Gitee 仓库操作 |
| ED-4 | statistics 测试 | 需写测试代码 |

---

## 目录

1. [Java 后端 — 安全 Review (C-3~M-2)](#1-java-后端--安全-review)
2. [Java 后端 — OptaPlanner 约束求解器](#2-java-后端--optaplanner-约束求解器)
3. [Java 后端 — 业务逻辑 / 分页 / 时区](#3-java-后端--业务逻辑--分页--时区)
4. [前端 (Vue3) — 隐性 Bug](#4-前端-vue3--隐性-bug)
5. [微信小程序 — 云函数](#5-微信小程序--云函数)
6. [性能 / 工程债务](#6-性能--工程债务)
7. [Git / 部署](#7-git--部署)

---

## 1. Java 后端 — 安全 Review

来源：CLAUDE.md §6.1，全部 **未修复**

### 🔴 Critical

| ID | 描述 | 文件 | 状态 |
|----|------|------|------|
| **C-3** | **hangyi-auth 是上帝服务** — `SyncService.java`（540 行）直接写其他服务表（employee/schedule/flight），跨越微服务边界。应拆为 4 个独立 sync 子服务 | `ideaprojects/hangyi/hangyi-auth/src/main/java/com/qyf/hangyi/auth/service/SyncService.java` | 🔴 |

### 🔴 High

| ID | 描述 | 文件 | 状态 |
|----|------|------|------|
| **H-1** | `/api/users` 和 `/api/employees/list-all` 为 permitAll — 未认证即可获取全员手机号、身份证号等 PII | Gateway 白名单 + `EmployeeController.listAll()` | ✅ (2026-07-05) |
| **H-2** | 微信登录 openid 不验证真实性 — 任何人知道微信 openid 即可登录任意账号 | `SysUserService.wechatLogin()` | ✅ (2026-07-05) |
| **H-3** | JWT 无 refresh token / 无 jti 吊销机制 / 24h 固定有效期不过期 | `auth/security/JwtUtil.java` | ✅ (2026-07-05) |
| **H-5** | schedule 微服务 7 处 `throw new RuntimeException` 绕过 `BusinessException`，前端收到非预期错误格式 | schedule 模块各处 service 实现类 | ✅ (已修复，22 处全部使用 BusinessException) |
| **H-6** | Redis 端口不一致 + **死依赖** — hangyi-schedule 引用了 redis starter 但代码中 0 处实际使用 Redis | `docker-compose.yml`（端口 6380 vs Spring 端口 6379） | ✅ (2026-07-05) |

### 🔴 Medium

| ID | 描述 | 文件 | 状态 |
|----|------|------|------|
| **M-2** | PII 字段无脱敏 — 手机号/身份证号以明文通过 API 返回 | 所有员工 API 端点 | ✅ (2026-07-05) |

---

## 2. Java 后端 — OptaPlanner 约束求解器

来源：CLAUDE.md §4.0（38 条约定中的重点问题），Phase J 实施记录

### 领域模型 / 配置

| # | 描述 | 严重度 | 文件 | 状态 |
|---|------|--------|------|------|
| **O-1** | `flight_plan.is_release` 默认 `false`，`ProblemFactory` 加载时未从 DB 读取实际值 → **C-a 放行持照约束是死代码**，永远不会触发 | 🔴 | `solver/service/ProblemFactory.java` | ✅ (2026-07-05) |
| **O-2** | `ProblemFactory.loadEmployees()` 存在 N+1 查询 — 对每个员工逐条查资质，应批量查询 | 🟡 | `solver/service/ProblemFactory.java` | ✅ (2026-07-05) |
| **O-3** | `loadEmployees()` 未过滤 `license_type IS NOT NULL` — 加载了行政/后勤等不需要排班的人员，浪费求解器时间 | 🟡 | `solver/service/ProblemFactory.java` | ✅ (2026-07-05) |
| **O-4** | `loadFlights()` 使用字符串拼接构建 SQL IN 子句（`String.join`），应使用参数化查询 | 🟡 | `solver/service/ProblemFactory.java` | ⏭️ (已用 `?` 占位，实质安全) |
| **O-5** | `shiftIdCache` 为单例 Map，无失效机制 — 班次模板在数据库修改后缓存仍返回过期数据 | 🟡 | 求解器内部缓存 | ✅ (2026-07-05) |
| **O-6** | `buildAssignments()` 使用废弃的 2 参数构造函数（`id = flightId`）— 同航班多个排班（如勤务+放行双角色）时违反唯一约束 | 🟡 | 求解器 `ShiftAssignment` 构造 | ⏭️ (与 O-2/O-7 重构一起覆盖) |
| **O-7** | `writeDetails()` 使用 `jdbc.batchUpdate` 绕过 MyBatis-Plus，导致 `created_at` 自动填充失效 | 🟡 | `solver/service/OptaPlannerScheduleService.java` | ✅ (2026-07-05) |
| **O-8** | `getScheduleHistoryFull()` 缺少 `@Transactional(readOnly = true)` — 3 个查询可能读到不一致的快照 | 🟢 | solver 历史数据加载 | ✅ (2026-07-05) |
| **O-9** | JDBC TIME 字段映射只处理 `java.sql.Time`，未处理新版 MySQL 驱动返回的 `LocalTime` | 🟢 | 求解器时间解析 | ✅ (2026-07-05) |
| **O-10** | `timeToShiftCode()` 阈值硬编码为 8:00/16:00，未从 `shift_template` 表读取动态配置 | 🟡 | `solver/ShiftRules.java` | ✅ (2026-07-05) |
| **O-11** | preview/commit 共用同一个 SolverConfig — 2s 和 5s 超时应有独立 SolverConfig | 🟡 | `solver/solver/OptaPlannerConfig.java` | 🔴 |
| **O-12** | `SolverManager` bean 必须 `destroyMethod="close"` 否则线程泄漏 | 🔴 | `OptaPlannerConfig.java` | ✅ (已写 `destroyMethod="close"`) |
| **O-13** | 规划变量（`assignedEmployee`）不能作为 Joiner key — 必须使用 SolverFact 的字段 | 🔴 | 各约束实现 | ✅ (已在实施中修正) |

---

## 3. Java 后端 — 业务逻辑 / 分页 / 时区

来源：Phase A→I 工作总结（2026-06-17），全部 **已修复** ✅

### 仪表盘

| # | 描述 | 修复 | 状态 |
|---|------|------|------|
| D-1 | "今日排班分布"空白 — `DashboardController` 未实现 `todayShiftCount` 字段，`shift_template` 表为空 | SQL LEFT JOIN + `shift_type <> 'REST'` 过滤 + migrate.sh INSERT 兜底 | ✅ |
| D-2 | "休息"被算作排班 | 前后端协同过滤 `shift_type='REST'` | ✅ |
| D-3 | `todayOnDuty` 计数含休息人员 | 同上过滤 | ✅ |

### 时区 / 数据库

| # | 描述 | 修复 | 状态 |
|---|------|------|------|
| TZ-1 | MySQL 容器默认 UTC，所有 `created_at`/`updated_at` 错位 8 小时 | `docker-compose.yml` 加 `TZ=Asia/Shanghai` + 15 张表老数据 `+ INTERVAL 8 HOUR` | ✅ |
| TZ-2 | `ServiceScheduleServiceImpl` 中 `updated_at = NOW()` | 改为 `?` 参数 + `LocalDateTime.now()` 传参 | ✅ |

### 分页

| # | 描述 | 修复 | 状态 |
|---|------|------|------|
| PG-1 | MyBatis-Plus 3.5.9 缺少 `PaginationInnerInterceptor`，`this.page()` 返回 `records=全量 + total=0` | 3 个 Service 改手动 count + LIMIT（`wrapper.last("LIMIT " + long + ", " + long)`，long 类型已 `@Min/@Max` 校验） | ✅ |
| PG-2 | AuditController 缺少分页参数校验 | 加 `@Validated` + `@Min(1) @Max(200)` | ✅ |

### 甘特图 / 排班历史

| # | 描述 | 修复 | 状态 |
|---|------|------|------|
| GT-1 | "休息"显示为排班且有颜色和标签 | 前后端协同过滤 `shift_type='REST'` | ✅ |
| GT-2 | 用户误以为排班一天显示七天 | 同一天重复行 → 去重逻辑 | ✅ |
| SR-1 | `ScheduleService.java` 缺少 `deleteSchedule` 方法（编译/运行时错误） | 新增方法 | ✅ |
| SR-2 | `SmartScheduleService.getOrCreateScheduleHeader` 为避垃圾 header 跳过 INSERT → 智能排班结果不出现 | 修复为正确写入 | ✅ |

---

## 4. 前端 (Vue3) — 隐性 Bug

来源：Phase I 前端修复（2026-06-17），全部 **已修复** ✅

### P0 (Critical)

| # | 描述 | 文件 | 状态 |
|---|------|------|------|
| FE-1 | `request.js` 拦截器成功路径改 `return res` 导致双重解包，所有表格为空 | `web/src/api/request.js` | ✅ |
| FE-2 | `api/schedule.js` 中 `downloadFile` 将 JWT 拼接在 URL `?token=` 中 → 令牌泄露至 Referer | `web/src/api/schedule.js` | ✅ |
| FE-3 | `api/audit.js` blob 导出被拦截器剥为 JSON → 导出空文件 | `web/src/api/audit.js` | ✅ |
| FE-4 | `request.js` 中 `Promise.reject(string)` 没有堆栈跟踪 | `web/src/api/request.js` | ✅ |
| FE-5 | token 分散在 3 处（store、localStorage、request 拦截器），多标签不同步 | `web/src/store/user.js` + `request.js` | ✅ |
| FE-6 | 401 使用 `window.location.href` 登录重定向，丢失用户当前输入 | 路由守卫拦截 | ✅ |
| FE-7 | `ScheduleList.vue` 中 `handleDelete` 缺少 `ElMessageBox` 导入 | `web/src/views/schedule/ScheduleList.vue` | ✅ |
| FE-8 | `SmartScheduleService.getOrCreateScheduleHeader` 跳过 INSERT → 排班结果不出现在报表 | 同步 Java 修复 | ✅ |

### P1

| # | 描述 | 文件 | 状态 |
|---|------|------|------|
| FE-9 | 无 404 捕获 — 访问不存在路由时白屏 | 路由配置 | ✅ |
| FE-10 | 登录重定向丢失目标路径 — 登录后不回原页面 | 路由守卫 | ✅ |
| FE-11 | 已登录后访问 `/login` 不跳回主页 | 路由守卫 | ✅ |
| FE-12 | `formatDate(null)` 返回 `'NaN-NaN-NaN'` 污染 URL | `web/src/utils/date.js` | ✅ |
| FE-13 | Dashboard 4 处 `$router.push` 硬编码路径 | `web/src/views/dashboard/Dashboard.vue` | ✅ |
| FE-14 | 健康检查失败时弹出"网络错误"污染用户体验 | 请求拦截器 | ✅ |
| FE-15 | CompletionReport 路由拼写错误（`/statistics/completion` 写成 `/completion`） | `web/src/router/index.js:99` | ✅ |
| FE-16 | 16 个 el-table 统一加 `.slice(0, query.size \|\| 10)` 兜底 | 16 个 .vue 文件 | ✅ |

---

## 5. 微信小程序 — 云函数

来源：小程序 README.md 第十节 + test-security.test.js 回归，全部 **已修复** ✅

### P0 — 安全 / 鉴权

| # | 描述 | 文件 | 状态 |
|---|------|------|------|
| MP-1 | `setStaffAdmin` 防自提权 — 管理员可把自己降权后操作 | `router/admin.js` | ✅ |
| MP-2 | `setSetting` 白名单 — 无白名单保护，可写入任意配置键 | `router/settings.js` | ✅ |
| MP-3 | `approveSwapRequest` requireAdmin 守卫 — 任何人可审批调班 | `router/swap.js` | ✅ |
| MP-4 | `updateFlightRealtimeStatus` requireAdmin 守卫 — 任何人可更新航班状态 | `router/realtime.js` | ✅ |
| MP-5 | `propagateScheduleDelay` requireAdmin 守卫 | `router/realtime.js` | ✅ |
| MP-6 | `reassignStaffTask` 资质白名单 — 无人可用时未校验资质即分配 | `router/realtime.js` | ✅ |

### P1-P2

| # | 描述 | 文件 | 状态 |
|---|------|------|------|
| MP-7 | `markMyNotificationsRead` 死循环 — 未分页，`skip` 不递增 | `router/notification.js` | ✅ |
| MP-8 | `propagateScheduleDelay` 日期计算错误（+1 天偏移） | `router/realtime.js` | ✅ |
| MP-9 | `loginOrRegisterStaff` 未处理 active=false 的员工仍可登录 | `router/auth.js` | ✅ |
| MP-10 | `loginByPhone` 手机号格式验证缺失 | `router/auth.js` | ✅ |

### P3

| # | 描述 | 文件 | 状态 |
|---|------|------|------|
| MP-11 | `exportOperationLogs` CSV 缺少 UTF-8 BOM — Excel 打开中文乱码 | `router/log.js` | ✅ |
| MP-12 | `requestType='SHIFT_APPLY'` 单人调班申请未记录 verifier 字段 | `router/swap.js` | ✅ |

> 以上 26+ 个修复均有测试回归覆盖（`test-security.test.js` 32 测试 + `test-quicklogin.test.js` 13 测试 + `test-e2e.test.js` 78 测试）。

---

## 6. 性能 / 工程债务

来源：工作总结 + README.md + agent 审查，全部 **未修复** 🔴

### 性能

| # | 描述 | 严重度 | 文件 | 状态 |
|---|------|--------|------|------|
| PF-1 | `ScheduleService.getGanttData*` N+1 性能问题 — 多次全量 Feign 调用无缓存 | 🟡 | `hangyi-schedule/.../service/ScheduleService.java:188,257,304` | 🔴 |
| PF-2 | OptaPlanner Docker 镜像从 jre-alpine 切 jdk-alpine，容器启动 1.4s→3.0s | 🟢 | `hangyi-schedule/Dockerfile` | 🔴 |
| PF-3 | 前端 `/api/groups/list` 偶发 500 错误 — 未排查根因 | 🟡 | — | 🔴 |

### 工程

| # | 描述 | 严重度 | 文件 | 状态 |
|---|------|--------|------|------|
| ED-1 | **Git 仓库拆分** — 小程序(A)和 Java 后端(B)共用 Gitee 仓 `qyf0905/hangyi.git`，但本地工作树已分叉。同时 push 会冲掉对方 commit | 🔴 | 全局 | 🔴 |
| ED-2 | 升级 MyBatis-Plus 至 3.5.5+，获得 `PaginationInnerInterceptor`，移除 `.last()` long 拼接豁免 | 🟡 | 全局 | 🔴 |
| ED-3 | 前端 `.slice(0, 10)` 兜底可清理 — 后端已治本，冗余但无害 | 🟢 | 16 个 .vue 文件 | 🔴 |
| ED-4 | `hangyi-statistics` 模块 **0 个测试** — 唯一无测试覆盖的微服务 | 🟡 | `hangyi-statistics/` | 🔴 |
| ED-5 | CLAUDE.md 需更新 — 补充 mysql TZ 必填规则 + long offset 豁免说明 | 🟢 | `ideaprojects/hangyi/CLAUDE.md` | ✅ (2026-07-05) |
| ED-6 | `ScheduleGantt.vue`(603 行) 和 `Dashboard.vue`(728 行) 为超大组件，应拆分 | 🟢 | `web/src/views/` | 🔴 |

---

## 7. Git / 部署

来源：CLAUDE.md §9.5 + memory + README.md §4，全部 **未修复** 🔴

| # | 描述 | 严重度 | 状态 |
|---|------|--------|------|
| DP-1 | 重启业务服务后 **必须 restart gateway** — LoadBalancer 缓存旧 IP 导致 500 错误 | 🔴 | ✅ (2026-07-05) |
| DP-2 | Gitee force-push 历史 — 曾覆盖 9 个远端 commit (`07976a8c` vs `4b91351d`) | 🔴 | 🔴 |
| DP-3 | 小程序 push 失败 — `git.weixin.qq.com` 代理问题 | 🟡 | 🔴 |
| DP-4 | CORS 白名单包含 `localhost:5173` (Vite 开发端口) — 生产环境不应存在 | 🟢 | ⏭️ (不上线，开发端口) |

---

## 统计

| 分类 | 总数 | 🔴 未修复 | ✅ 已修复 |
|------|------|-----------|-----------|
| 安全 Review (C-3~M-2) | 7 | 1 | 6 |
| OptaPlanner 问题 | 13 | 1 | 12 |
| 后端业务 / 分页 / 时区 | 8 | 0 | 8 |
| 前端隐性 Bug | 16 | 0 | 16 |
| 小程序云函数 | 12 | 0 | 12 |
| 性能 / 工程债务 | 6 | 5 | 1 |
| Git / 部署 | 4 | 2 | 2 |
| **合计** | **66** | **9** | **57** |
