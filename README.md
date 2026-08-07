# 航翼排班系统 · 大创项目

> 广西机场(集团)机务/地勤智能排班系统 — 三个端到端可运行项目 + 一套完整文档

本仓库是「大创项目」的总入口,聚合微信小程序 + Web 后台 + 教学版单体三份代码,以及所有设计文档和工作交接记录。新接手这个项目的人(人类或 AI)建议从本 README 开始读,再按需进入子项目。

---

## 一、项目是什么

**业务定位** — 面向航空公司机务/地勤一线人员的智能排班管理平台

- **4 类角色**:`ADMIN`(系统管理员) / `BOSS`(站领导) / `TEAM_LEADER`(班组长) / `STAFF`(普通员工)
- **核心实体**:员工、班组、排班、换班申请、请假、航班、资质证书
- **排班算法**:OptaPlanner 9.44.0 嵌入式约束求解器(5 业务硬约束 + 3 CCAR-145 民航合规硬约束 + 2 软约束,共 10 条)
- **业务规模**:80 名员工 × 8 个班组(A-H) × ~20 航司 × ~15 机型

---

## 二、子项目一览

| # | 项目 | 本仓库路径 | 用途 | 入口 |
|---|------|----------|------|------|
| **A** | 微信小程序 | `./hangyi/` | 移动端,面向一线机务/班组长 | `hangyi/miniprogram/app.json` |
| **B** | Java 多模块后端 | `./ideaprojects/hangyi/` | Web 后台,6 微服务 + Vue3 前端,**主用** | `ideaprojects/hangyi/start.sh` |
| **C** | 课程设计版(单体) | 不在仓内 | 教学/展示用,Spring Boot 单体,公开 Gitee | `https://gitee.com/qyf0905/hangyi-single` |

### A. 微信小程序 `./hangyi/`
- **栈**:原生 WXML/WXSS + 11 个云函数 router + 微信云开发 NoSQL(6 个集合)
- **规模**:19 个页面 / 45 个 JS 文件 / 39 个 WXML/WXSS
- **测试**:129 个单测(`hangyi/cloudfunctions/quickstartFunctions/__test__/`),脱离微信环境跑,~230ms
- **开发**:微信开发者工具导入 → 上传云函数 → 首页"初始化演示数据"
- **关键文档**:`./hangyi/README.md`(556 行,完整功能/技术栈/数据模型/云函数接口/同步协议)

### B. Java 多模块后端 `./ideaprojects/hangyi/`
- **栈**:Spring Boot 3.3.5 + Spring Cloud 2023 + MyBatis-Plus 3.5.9 + Nacos + Docker
- **8 个组件**(6 微服务 + 1 公共 + 1 前端):
  - `hangyi-gateway:8080` — 网关(JWT + X-User-* 头注入)
  - `hangyi-auth:8081` — 登录 + JWT + **上帝服务 SyncService(540 行,待拆)**
  - `hangyi-employee:8082` — 人员/资质/班组/请假
  - `hangyi-schedule:8083` — 排班/换班 + **OptaPlanner 智能求解**
  - `hangyi-flight:8084` — 航班计划
  - `hangyi-statistics:8095` — 仪表盘
  - `hangyi-common` — 共享 DTO/异常/Feign 接口(无端口)
  - `web/` — Vue 3 + Element Plus 前端(端口 8089,Nginx 反代)
- **基础设施**:MySQL 8.0(3307)/ Redis 7(6380,死依赖)/ Nacos 2.4.3(8848)
- **DB**:`hangyi_scheduling` 库,16 张表(详见 `ideaprojects/hangyi/db/`)
- **规模**:156 个 Java 主源文件 + 20 个 Vue 文件 + 44 个 JUnit 测试
- **关键文档**:
  - `./ideaprojects/hangyi/CLAUDE.md`(207 行,项目必读)
  - `./ideaprojects/hangyi/AGENTS.md`(162 行,Codex 入口)
  - `./ideaprojects/hangyi/SESSION_SUMMARY.md`(136 行,历史会话摘要)
  - `./ideaprojects/hangyi/README.md`(微服务架构 + 启动)

### C. 课程设计版(单体) — Gitee 公开
- 7 微服务合 1,去 Spring Cloud / Nacos / Redis / OpenFeign,鉴权改 Spring Security + JJWT
- 端口:app 8080 / DB 3308(`hangyi_scheduling` 库)
- 2026-06-21 整体移除数据同步层(`rpt_*` / `GuochuangSync` / `FlightSync` / `/api/sync/**`)
- B 工程所有修复同步到 C
- 拉取:`git clone https://gitee.com/qyf0905/hangyi-single.git`

---

## 三、跨端协议(小程序 ↔ Java 后端)

小程序和 Java 后端通过 HTTP JSON 互通,**凭证从云 DB `settings` 集合动态读取**,不写死代码。

### 同步端点(Java 端 Spring Cloud Gateway 路径)

| 方法 | 路径 | 触发方 | 用途 |
|------|------|--------|------|
| `POST` | `/api/sync/staff` | 云函数 → Java | 增量推送员工档案 |
| `POST` | `/api/sync/flights` | 云函数 → Java | 增量推送航班数据 |
| `POST` | `/api/sync/schedules` | 云函数 → Java | 增量推送排班记录 |
| `POST` | `/api/sync/operation_logs` | 云函数 → Java | 增量推送操作审计日志 |
| `POST` | `/api/sync/swap-requests` | 云函数 → Java | 增量推送调班/代班申请 |
| `GET`  | `/api/sync/employee/{employeeNo}` | 云函数 → Java | 小程序登录时按工号从 Web 端拉员工 |
| `GET`  | `/api/auth/verify` | 云函数 → Java | 验证 Web 端签发的 JWT 令牌 |

### 触发方式

- **定时同步**:`./hangyi/cloudfunctions/syncToHangyi/` 独立云函数,触发器 `0 */5 * * * * *`(每 5 分钟)
  1. 读 `settings.hangyiSyncEnabled`,关闭则直接返回
  2. 读 `settings.sync_state.last_sync_time` 作增量起点(首次回溯 30 天)
  3. 对 4 个集合按 `updatedAt >= lastSync` 增量查询并推送
  4. 批次成功更新游标;失败立即停止该集合后续批次,继续下一集合
- **即时同步**:单条排班发布、审批、调班等操作通过 `callHangyiService("/api/sync/...")` 立即推送,失败仅 `console.error` 不阻塞业务
- **拉取**:员工登录时云函数主动 `GET /api/sync/employee/{employeeNo}`,命中则本地 upsert

### 凭证配置(全部从云 DB 动态读取)

| 键 | seed 默认值 | 备注 |
|----|------------|------|
| `hangyiApiUrl` | `http://<your-backend-host>:<port>` | Java 网关实际地址 |
| `hangyiApiKey` | `<your-internal-api-key>` | 与 `hangyi-gateway` 侧 `INTERNAL_API_KEY` 一致 |
| `hangyiSyncEnabled` | `"false"` | 默认关闭,配置好前置项后再改 `"true"` |

### Gateway 白名单

`ideaprojects/hangyi/hangyi-gateway/src/main/java/.../filter/JwtAuthGlobalFilter.java:25-26` 与 `ideaprojects/hangyi/hangyi-auth/src/main/java/.../security/AuthSecurityConfig.java:24` 把 `/api/sync/**` 和 `/api/auth/verify` 加入白名单,免 JWT 校验。

### 鉴权头约定

- 内部调用:HTTP header `X-Internal-API-Key: <hangyiApiKey 值>`
- Web 端调用:`Authorization: Bearer <JWT>`,网关注入 `X-User-Id` / `X-User-Roles` / `X-User-Name` 给下游(客户端传入值会先 strip,见 CLAUDE.md §4.5)

---

## 四、Git 仓库

| 项目 | 远端 | 用途 |
|------|------|------|
| 小程序(A) | `git@gitee.com:qyf0905/hangyi.git` | 私有(主仓) |
| 小程序(A) | `https://git.weixin.qq.com/wx_wxa2187338fc140cac/test1.git` | 微信官方代码托管(只读镜像) |
| Java 后端(B) | `git@gitee.com:qyf0905/hangyi.git` | **与小程序共用同一 Gitee 仓**(见下 ⚠️) |
| 课程设计版(C) | `https://gitee.com/qyf0905/hangyi-single.git` | public(教学公开) |

### ⚠️ 已知问题:远端仓库冲突

小程序(A)和 Java 后端(B)目前都指向 Gitee 同一个仓库 `qyf0905/hangyi.git`,但本地工作树已经分叉:

| 项目 | 最新 commit | 工作区 |
|------|------------|--------|
| A. 小程序 | `07976a8c feat(seed): 固定测试 admin 账户` | 21 modified / 1 untracked |
| B. Java 后端 | `4b91351d fix(review): address 47 review findings` | clean |

近期有 force-push 历史(`SESSION_SUMMARY.md` §9.5)。后续应该:
1. 在 Gitee 拆出独立仓库 `hangyi-miniprogram` / `hangyi-backend`
2. 各自 reset remote
3. **当前不要同时 push 两边**(会冲掉对端的 commit)

### 推荐推送流程(Java 后端)

```bash
cd ideaprojects/hangyi
git fetch && git log --oneline HEAD..origin/master  # 有远程 commit 别 force,pull --rebase
mvn -DskipTests clean install                       # 8 组件能编译再推
```

---

## 五、文档索引

### 5.1 根目录

| 文件 | 行数 | 内容 |
|------|------|------|
| `./航翼排班/航翼LLM_RAG实施规划.md` | 493 | 计划新增第 7 个微服务 `hangyi-assistant`(LangChain4j + Qdrant + qwen-turbo),Week 1 起步,**未实施** |
| `./航翼排班/航翼本次工作总结.md` | 694 | Phase A→J 完整工作交接,27+ bug 修复 + OptaPlanner 实施详情,**接手必读** |
| `./航翼排班/航翼智能排班管理系统说明书.docx` | — | Web 后台(B)使用说明书 V1.0(2026-06) |
| `./航翼排班/飞机机队工程技术管理系统说明书.doc` | — | 旧 SSM 系统(2023),不同大创,仅作历史档案 |

### 5.2 小程序 `./hangyi/`

| 文件 | 行数 | 内容 |
|------|------|------|
| `./hangyi/README.md` | 556 | 完整功能 / 技术栈 / 数据模型 / 云函数接口 / 同步协议 |

### 5.3 Java 后端 `./ideaprojects/hangyi/`

| 文件 | 行数 | 内容 |
|------|------|------|
| `./ideaprojects/hangyi/README.md` | 89 | 微服务架构 + 启动方式 |
| `./ideaprojects/hangyi/CLAUDE.md` | 207 | **项目必读** — §4 关键约定(密码明文/.env 注入/异常处理/分页)+ §6 已知坑 |
| `./ideaprojects/hangyi/AGENTS.md` | 162 | 同上,面向 Codex 助手 |
| `./ideaprojects/hangyi/SESSION_SUMMARY.md` | 136 | 历史会话摘要 |

### 5.4 设计文档 `./ideaprojects/hangyi/docs/superpowers/`

#### Specs(设计)

| 文档 | 行数 | 内容 |
|------|------|------|
| `specs/2026-05-15-ui-gantt-improvement-design.md` | — | 甘特图 UI 改进设计 |
| `specs/2026-05-22-unit-testing-design.md` | — | 单元测试框架设计 |
| `specs/2026-05-29-guochuang-sync-design.md` | — | 国创赛数据同步设计 |
| `specs/2026-06-02-bidirectional-sync-design.md` | — | 双向同步详细设计 |
| `specs/2026-06-19-hangyi-optaplanner-design.md` | **454** | OptaPlanner 排班算法设计 |
| `specs/2026-06-20-hangyi-single-monolith-design.md` | — | 单体版架构设计 |

#### Plans(实施)

| 文档 | 行数 | 内容 |
|------|------|------|
| `plans/2026-05-15-ui-gantt-improvement.md` | — | 甘特图 UI 实施 |
| `plans/2026-05-22-unit-testing-plan.md` | — | 单元测试实施 |
| `plans/2026-05-23-code-quality-and-test-coverage.md` | — | 代码质量 + 测试覆盖 |
| `plans/2026-05-29-guochuang-sync-plan.md` | — | 国创赛同步实施 |
| `plans/2026-06-02-bidirectional-sync-plan.md` | — | 双向同步实施 |
| `plans/2026-06-19-hangyi-optaplanner-implementation.md` | **2683** | OptaPlanner 实施 plan(24 task) |

### 5.5 个人 memory(`~/.claude/memory/`)

> 工作经验和约定沉淀,关键 6 条:

| 名称 | 主题 |
|------|------|
| `project_hangyi_current` | 项目当前状态 |
| `project_hangyi_docker_quirks` | Docker / Nacos / mysql TZ 坑 |
| `project_restart_lb_cache` | restart 业务服务必须 restart gateway |
| `feedback_long_offset_safe` | MP 3.5.9 缺分页插件,long 类型拼接安全 |
| `feedback_time_query_from_app` | SQL 时间条件用 `LocalDate.now()` 传参 |
| `feedback_chart_pagination_10` | 所有图表/报表/明细查询 pageSize=10 |

---

## 六、快速开始

### A. 跑小程序

```bash
# 1. 微信开发者工具导入 ./hangyi/
# 2. hangyi/miniprogram/app.js 改 env 为你的云环境 ID
# 3. 右键 hangyi/cloudfunctions/quickstartFunctions → 上传并部署:云端安装依赖
# 4. 同样上传 hangyi/cloudfunctions/syncToHangyi
# 5. 首页"初始化演示数据"
# 6. 工号+姓名登录(测试 admin: 工号=admin 名称=admin 电话=11111111111)
```

### B. 跑 Java 后端

```bash
cd ideaprojects/hangyi
./start.sh                                # 一键启动,等价 docker compose up -d --build

# 等待约 90s 所有容器 healthcheck 通过:
# 前端:        http://localhost:8089
# API 网关:    http://localhost:8080/api
# Nacos 控制台: http://localhost:8848/nacos (nacos/nacos)
# MySQL:       localhost:3307 (root/hangyi123)
# Redis:       localhost:6380

# 默认账号: admin / 123456(密码明文,见 CLAUDE.md §4.1)
```

### C. 跑课程设计版(单体)

```bash
git clone https://gitee.com/qyf0905/hangyi-single.git
cd hangyi-single
mysql -uroot -p < db/schema.sql
mvn spring-boot:run                       # 后端 8080
cd web && npm install && npm run dev      # 前端 5174
```

---

## 七、测试

### A. 小程序云函数:129 个测试,~230ms

```bash
cd hangyi/cloudfunctions/quickstartFunctions
npm install
node -r ./__test__/test-helper.js --test __test__/*.test.js
```

| 文件 | 数量 | 覆盖 |
|------|------|------|
| `__test__/test-security.test.js` | 38 | P0 安全 + 鉴权回归(防自提权 / setSetting 白名单 / admin 守卫 / 资质白名单等) |
| `__test__/test-quicklogin.test.js` | 13 | 一键登录流程(手机号 cloudID 解密 / 微信资料登录) |
| `__test__/test-e2e.test.js` | 78 | 65 个云函数端点业务逻辑(端到端:admin 登录→发布→调班→审批→通知) |
| **合计** | **129** | 5 次连续运行无 flakes |

### B. Java 后端:44 个 JUnit + 1 个 Playwright e2e

```bash
cd ideaprojects/hangyi
mvn -DskipTests clean install          # 8 组件整体编译(快速验证)
mvn test                               # 全量单元测试
```

JUnit 分布在 `ideaprojects/hangyi/hangyi-*/src/test/java/` 下(44 个 Test 文件),覆盖 controller / service / mapper / security / sync 各层。

端到端 Playwright(1 个 spec):

```bash
cd ideaprojects/hangyi
npx playwright test tests/e2e/optaplanner.spec.ts
# 流程:浏览器登录 admin/123456 → 跳勤务排班页 → 调网关 /api/schedules/smart
# 断言:响应 solver.engine 含 "optaplanner" 且 feasible=true
```

---

## 八、待办

### Java 后端 P0-P2 修(7 项未修,源自 review)

| # | 等级 | 描述 |
|---|------|------|
| **C-3** | Critical | `hangyi-auth` 是上帝服务(`SyncService.java` 540 行写跨服务表)— 拆 4 个子服务 |
| **H-1** | High | `/api/users` `/api/employees/list-all` permitAll — 未登录能拿全员手机/身份证 |
| **H-2** | High | 微信登录 openid 不验真伪 |
| **H-3** | High | JWT 无 refresh / 无 jti / 24h 不过期 |
| **H-5** | High | schedule 服务 7 处 `throw new RuntimeException` 绕开 BusinessException |
| **H-6** | High | Redis 端口不一致 + 死依赖(0 处实际使用) |
| **M-2** | Medium | PII 字段无脱敏 |

### 性能 / 算法

- `ScheduleService.getGanttData*` N+1 性能问题(多次全量 Feign 调用无缓存)
- OptaPlanner preview/commit 双 SolverConfig(目前共用 5s 超时)
- Web 前端 `.slice(0, 10)` 兜底可以清理(后端已治本,前端冗余但无害)
- `hangyi-schedule` Dockerfile 切 JDK 镜像后容器启动从 1.4s → 3.0s

### 文档 / 工程

- **Git 仓拆 `hangyi-miniprogram` / `hangyi-backend` 独立远端**(见 §四 ⚠️)
- 升级 MyBatis-Plus 3.5.5+ 带 `PaginationInnerInterceptor`,去掉 `.last()` long 拼接豁免
- 引入 LLM RAG 助手(见 `航翼排班/航翼LLM_RAG实施规划.md`,Week 1 起步)

---

## 九、维护者

- **项目**:航翼排班系统 · 大创项目
- **远端账号**:
  - Gitee `qyf0905`(主用,推项目仓)
  - GitHub `qyf-051516`(个人)
  - 微信代码托管 `wx_wxa2187338fc140cac`(只读镜像)
- **工作流**:Claude Code 主力 + Codex 辅助,经验沉淀在 `~/.claude/memory/`
- **最后工作日期**:2026-06-29(本 README 创建)
