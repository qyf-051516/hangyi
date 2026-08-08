# 航翼排班系统 · 大创项目

> 广西机场(集团)机务/地勤智能排班系统 — 微信小程序 + Spring Cloud 后端 + Web 后台,monorepo 单仓管理

本仓库是「航翼排班大创」的总入口,聚合微信小程序、Java 多模块后端与全部设计文档。新接手的人(人类或 AI)建议从本 README 开始读,再按需进入子项目。

---

## 一、项目是什么

**业务定位** — 面向航空公司机务/地勤一线人员的智能排班管理平台

- **4 类角色**:`ADMIN`(系统管理员) / `BOSS`(站领导) / `TEAM_LEADER`(班组长) / `STAFF`(普通员工)
- **核心实体**:员工、班组、排班、换班申请、请假、航班、资质证书
- **排班算法**:OptaPlanner 9.44.0 嵌入式约束求解器(8 条约束,见 `ideaprojects/hangyi/README.md`)
- **业务规模**:80 名员工 × 8 个班组(A-H) × ~20 航司 × ~15 机型

---

## 二、仓库结构

| 路径 | 内容 | 入口 |
|------|------|------|
| `./hangyi/` | 微信小程序(原生 WXML/WXSS + 4 个云函数) | `hangyi/miniprogram/app.json` |
| `./ideaprojects/hangyi/` | Java 多模块后端 + Vue3 Web 后台(**主用**) | `ideaprojects/hangyi/start.sh` |
| 根目录 | 总 README / AGENTS / bugfix 记录 / 系统说明书 docx | — |

### A. 微信小程序 `./hangyi/`

- **栈**:原生 WXML/WXSS + 4 个云函数(`quickstartFunctions` / `bootstrapAdmin` / `syncToHangyi` / `configSettings`)+ 微信云开发 NoSQL
- **规模**:23 个页面 / 13 个 router 模块
- **测试**:235 个单测(脱离微信环境跑,~230ms)
- **开发**:微信开发者工具导入 → 上传 4 个云函数 → 首页"初始化演示数据"
- **关键文档**:`./hangyi/README.md`(757 行,完整功能/技术栈/数据模型/云函数接口/同步协议)

### B. Java 多模块后端 `./ideaprojects/hangyi/`

- **栈**:Spring Boot 3.3.7 + Spring Cloud 2023 + MyBatis-Plus 3.5.9 + Nacos + Docker
- **5 个模块 + 前端**:
  - `hangyi-gateway:9000` — 网关(JWT + X-User-* 头注入)
  - `hangyi-core:9001` — 核心业务(auth / employee / flight / statistics 已合并于此)
  - `hangyi-schedule:9002` — 排班/换班 + **OptaPlanner 智能求解**
  - `hangyi-assistant:9004` — 智能知识助手(RAG,内置知识库)
  - `hangyi-common` — 共享 DTO/异常/Feign 接口(无端口)
  - `web/` — Vue 3 + Element Plus 前端(端口 8089,Nginx 反代)
- **基础设施**:MySQL 8.0 / Redis 7 / Nacos(端口见 `ideaprojects/hangyi/README.md`)
- **DB**:`hangyi_scheduling` 库,24 张表(详见 `ideaprojects/hangyi/db/`)
- **规模**:228 个 Java 主源文件 + 47 个 JUnit 测试
- **关键文档**:
  - `./ideaprojects/hangyi/README.md`(微服务架构 + 启动方式)
  - `./ideaprojects/hangyi/AGENTS.md`(AI 助手入口)
  - `./ideaprojects/hangyi/docs/智能知识助手部署与使用.md`(RAG 助手)

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

- **定时同步**:`./hangyi/cloudfunctions/syncToHangyi/` 独立云函数,每 5 分钟增量推送
- **即时同步**:单条排班发布、审批、调班等操作通过 `callHangyiService("/api/sync/...")` 立即推送,失败仅记录不阻塞业务
- **拉取**:员工登录时云函数主动 `GET /api/sync/employee/{employeeNo}`,命中则本地 upsert

### 鉴权头约定

- 内部调用:HTTP header `X-Internal-API-Key: <hangyiApiKey 值>`
- Web 端调用:`Authorization: Bearer <JWT>`,网关注入 `X-User-Id` / `X-User-Roles` / `X-User-Name` 给下游

---

## 四、Git 仓库

| 仓库 | 远端 | 内容 |
|------|------|------|
| GitHub(monorepo) | `git@github.com:qyf-051516/hangyi.git` | 整个大创(master) |
| Gitee 后端 | `git@gitee.com:qyf0905/hangyi.git` | `codex/rag-business-assistant` 分支 |
| Gitee 小程序 | `git@gitee.com:qyf0905/hangyi.git` | `miniapp` 分支 |
| 微信代码托管 | `https://git.weixin.qq.com/wx_wxa2187338fc140cac/test1.git` | 小程序(官方托管) |

> ⚠️ Gitee 主仓 `qyf0905/hangyi.git` 同时承载小程序(`miniapp`)与后端(`codex/rag-business-assistant`)两个分支,推送时**不要交叉覆盖**(见 `hangyi/AGENTS.md` 与 `ideaprojects/hangyi/AGENTS.md`)。

---

## 五、快速开始

### A. 跑小程序

```bash
# 1. 微信开发者工具导入 ./hangyi/
# 2. hangyi/miniprogram/app.js 改 env 为你的云环境 ID
# 3. 上传并部署 4 个云函数:quickstartFunctions / bootstrapAdmin / syncToHangyi / configSettings(云端安装依赖)
# 4. 首页"初始化演示数据"
# 5. 工号+姓名登录(测试 admin: 工号=admin 名称=admin 电话=11111111111)
```

### B. 跑 Java 后端

```bash
cd ideaprojects/hangyi
./start.sh                                # 一键启动,等价 docker compose up -d --build

# 等待约 90s 所有容器 healthcheck 通过:
# 前端:        http://localhost:8089
# API 网关:    http://localhost:9000/api
# 默认账号: admin / 123456
```

---

## 六、测试

### A. 小程序云函数:235 个测试,~230ms

```bash
cd hangyi/cloudfunctions/quickstartFunctions
npm install
node -r ./__test__/test-helper.js --test __test__/*.test.js
```

覆盖:P0 安全 + 鉴权回归 / 一键登录 / 端到端业务流 / 智能助手知识库。

### B. Java 后端:47 个 JUnit

```bash
cd ideaprojects/hangyi
mvn -DskipTests clean install          # 5 模块整体编译(快速验证)
mvn test                               # 全量单元测试
```

JUnit 分布在 `ideaprojects/hangyi/hangyi-*/src/test/java/` 下,覆盖 controller / service / mapper / security / solver 各层。

---

## 七、待办

- Git 仓拆分独立远端(小程序/后端各自独立仓库),消除 Gitee 共用一仓的分叉风险
- 升级 MyBatis-Plus 3.5.5+ 带 `PaginationInnerInterceptor`,去掉 `.last()` long 拼接豁免
- `ScheduleService.getGanttData*` N+1 性能优化(多次全量 Feign 调用无缓存)

---

## 八、维护者

- **项目**:航翼排班系统 · 大创项目
- **远端账号**:Gitee `qyf0905`(主用)/ GitHub `qyf-051516` / 微信代码托管 `wx_wxa2187338fc140cac`
