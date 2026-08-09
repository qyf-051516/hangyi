# ✈️ 航翼排班系统 (Hangyi Scheduling System)

基于 Spring Cloud 微服务架构的航空公司机组人员智能排班系统，集成 OptaPlanner 约束求解引擎和可追溯的业务知识 RAG，支持自动排班、换班申请、员工与资质管理、航班同步和智能知识问答。

---

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | Spring Boot 3.3.7 · Spring Cloud 2023.0.4 · Spring Cloud Alibaba 2023.0.3.2 |
| **语言** | Java 17 |
| **API 网关** | Spring Cloud Gateway (Reactive) |
| **服务发现** | Nacos (支持 local 模式离线运行) |
| **认证授权** | Spring Security + JJWT (JWT 无状态认证) · RBAC 角色权限 |
| **ORM** | MyBatis-Plus 3.5.9 + MySQL |
| **排班引擎** | OptaPlanner 9.44.0.Final (HardSoftLong 约束评分) |
| **缓存/令牌** | Redis |
| **前端** | Vue 3 + Vite 6 + Pinia 3 + Element Plus 2 + Axios |
| **构建** | Maven (后端) · Vite (前端) |
| **工具库** | Hutool 5.8 · EasyExcel 4.0 · Lombok |
| **监控** | Micrometer + Prometheus (Actuator) |
| **知识问答** | Qdrant + Ollama/bge-m3 + 通义千问 OpenAI 兼容接口 |
| **测试** | JUnit 5 · Testcontainers · H2 · OptaPlanner Test |

---

## 🧱 系统架构

```
┌─────────────────────────────────────────────────┐
│              前端 (Vue 3 + Element Plus)         │
│                  localhost:5173                   │
└──────────────────────┬──────────────────────────┘
                       │ HTTP /api/**
┌──────────────────────▼──────────────────────────┐
│            Gateway :9000                         │
│   Spring Cloud Gateway · JWT 鉴权 · CORS · Redis │
└─────────┬───────────────────────────┬────────────┘
          │                           │
┌─────────▼──────────┐    ┌──────────▼──────────┐
│  Core :9001        │    │  Schedule :9002     │
│  ─────────────     │    │  ───────────────    │
│  · 认证/用户管理    │◄──►│  · 排班求解引擎     │
│  · 员工/资质管理    │    │  · 换班管理         │
│  · 团队/机型管理    │    │  · 班次模板         │
│  · 航班计划同步     │    │  · Excel 导出       │
│  · 统计/报表        │    │  · OptaPlanner      │
│  · 操作审计         │    │  · Prometheus 监控  │
│  · 休假管理         │    │                     │
└─────────┬──────────┘    └─────────────────────┘
          │
┌─────────▼──────────┐
│   MySQL            │
│   hangyi_scheduling│
│   ─────────────    │
│   · sys_user       │
│   · employee       │
│   · schedule       │
│   · flight_plan    │
│   · swap_request   │
│   · ...            │
└────────────────────┘

┌──────────┐  ┌──────────┐  ┌──────────┐
│  Redis   │  │  Nacos   │  │ 国创赛    │
│ Token 管 │  │ 服务发现  │  │ 外部系统  │
│ 理/缓存  │  │ 配置中心  │  │ 双向同步  │
└──────────┘  └──────────┘  └──────────┘
```

---

## 📁 项目结构

```
hangyi/
├── hangyi-common/          # 公共模块（异常处理、统一响应、Feign 拦截器、同步客户端）
│   └── src/main/java/com/qyf/hangyi/common/
│       ├── config/         # MyMetaObjectHandler、FeignConfig、MyBatisPlus 自动配置
│       ├── constant/       # AuthConstant 等常量
│       ├── dto/            # PageRequest 等通用 DTO
│       ├── exception/      # BusinessException、GlobalExceptionHandler
│       ├── result/         # R<T> 统一响应体
│       ├── serializer/     # MaskedSerializer 脱敏序列化器
│       └── sync/           # GuochuangSyncClient 国创赛同步客户端
│
├── hangyi-gateway/         # API 网关 (:9000)
│   └── src/main/java/com/qyf/hangyi/gateway/
│       ├── config/         # CorsConfig、JwtUtil
│       ├── filter/         # JwtAuthGlobalFilter 全局 JWT 鉴权过滤器
│       └── HangyiGatewayApplication.java
│
├── hangyi-core/            # 核心业务服务 (:9001)
│   └── src/main/java/com/qyf/hangyi/core/
│       ├── auth/           # 认证授权模块
│       │   ├── audit/      #   操作审计（controller/entity/mapper/service）
│       │   ├── controller/ #   AuthController、SyncController、UserController、ReportController
│       │   ├── dto/        #   LoginRequest/Response、WechatLoginRequest
│       │   ├── entity/     #   SysUser/Role/Permission、Schedule/Rpt 实体
│       │   ├── mapper/     #   对应的 MyBatis Mapper
│       │   ├── security/   #   JwtUtil、JwtAuthFilter (服务间)
│       │   ├── service/    #   业务逻辑与同步轮询
│       │   └── sync/       #   SyncPollingService 定时双向同步
│       ├── config/         # JwtAuthFilter 配置
│       ├── employee/       # 员工管理模块
│       │   ├── controller/ #   Employee/AircraftType/Preference/Qualification/TeamGroupController
│       │   ├── entity/     #   Employee、Qualification、Preference、AircraftType、TeamGroup
│       │   ├── leave/      #   休假管理（LeaveRequest）
│       │   ├── mapper/     #   对应的 MyBatis Mapper
│       │   └── service/    #   业务逻辑
│       ├── flight/         # 航班管理模块
│       │   ├── controller/ #   FlightPlanController
│       │   ├── entity/     #   FlightPlan
│       │   ├── mapper/     #   FlightPlanMapper
│       │   └── service/    #   FlightSyncService 航班同步
│       └── statistics/     # 统计模块
│           └── controller/ #   StatisticsController
│
├── hangyi-schedule/        # 排班服务 (:9002) ⭐ 核心
│   └── src/main/java/com/qyf/hangyi/schedule/
│       ├── controller/     # Schedule/ShiftTemplate/Change/ExportController
│       ├── dto/            # 各类排班请求/响应 VO
│       ├── entity/         # Schedule、ScheduleDetail、ScheduleChange
│       ├── mapper/         # 对应的 MyBatis Mapper
│       ├── service/        # 排班/智能排班服务
│       ├── solver/         # OptaPlanner 排班引擎 ⚙️
│       │   ├── constraint/ #   ScheduleConstraintProvider（8 条约朿规则）
│       │   ├── domain/     #   Employee、Flight、Shift、ShiftAssignment、SchedulePlan
│       │   ├── service/    #   OptaPlannerScheduleService、ProblemFactory
│       │   └── solver/     #   OptaPlannerConfig、SolverProperties、SolverMetrics
│       └── swap/           # 换班模块
│           ├── controller/ #   SwapController
│           ├── dto/        #   换班请求/申请 DTO
│           ├── entity/     #   SwapRequest
│           ├── mapper/     #   SwapRequestMapper
│           └── service/    #   SwapService
│
├── hangyi-assistant/       # 智能知识助手 (:9004)
│   └── src/main/java/com/qyf/hangyi/assistant/
│       ├── client/         # Qdrant、Ollama、Qwen REST 客户端
│       ├── config/         # JWT、内部密钥和助手参数
│       ├── controller/     # Web 与小程序 internal 双入口
│       ├── knowledge/      # 文档解析、切块、入库和 Recall@5 评测
│       ├── repository/     # 历史、反馈、配额、文档状态
│       └── service/        # Grounded RAG 编排与拒答
│
├── knowledge/
│   ├── business/           # 员工与管理员业务知识
│   └── evaluation/         # 30 道检索评测题
│
├── deploy/assistant/       # Qdrant 与 Ollama 本地 Compose
│
├── web/                    # 前端 (Vue 3 + Element Plus)
│   ├── src/
│   │   ├── api/            #   各模块 API 封装 (auth/employee/schedule/swap/...)
│   │   ├── layout/         #   MainLayout 主布局
│   │   ├── router/         #   Vue Router 路由配置
│   │   ├── store/          #   Pinia 状态管理
│   │   └── views/          #   页面组件
│   │       ├── login/      #     登录页
│   │       ├── dashboard/  #     仪表盘
│   │       ├── employee/   #     员工管理
│   │       ├── flight/     #     航班管理
│   │       ├── schedule/   #     排班管理
│   │       ├── shift/      #     班次管理
│   │       ├── swap/       #     换班管理
│   │       ├── leave/      #     休假管理
│   │       ├── audit/      #     审计日志
│   │       ├── statistics/ #     统计分析
│   │       └── service-schedule/ # 服务排班
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── nginx.conf          #   Nginx 部署配置
│   └── Dockerfile.server   #   Docker 构建
│
├── db/                     # 数据库脚本
│   ├── 01-schema.sql       #   完整建表 SQL
│   ├── 02-fix-audit-findings.sql # 审计修复增量迁移
│   ├── 03-assistant-rag.sql #  既有数据库助手增量迁移
│   └── 04-miniapp-sync-contract.sql # 小程序同步契约增量迁移
│
├── docs/                   # 设计文档
│   └── 智能知识助手部署与使用.md # RAG 助手部署/使用指南
│
└── tests/                  # 集成测试
```

---

## 🚀 快速开始

### 环境要求

| 组件 | 版本要求 |
|------|----------|
| JDK | 17+ |
| Maven | 3.8+ |
| MySQL | 8.0+ |
| Redis | 7.0+ |
| Nacos | 2.x（可选，local 模式无需启动） |
| Node.js | 20+（前端开发与 Vitest） |
| Docker | 可选，用于本地启动 Qdrant 与 Ollama |

### 1. 初始化数据库

```bash
# 创建数据库并导入表结构
mysql -u root -p < db/01-schema.sql
```

已有旧版数据库不要重复导入全量结构，先备份后执行一次增量脚本：

```bash
mysql -u root -p hangyi_scheduling < db/02-fix-audit-findings.sql
mysql -u root -p hangyi_scheduling < db/03-assistant-rag.sql
mysql -u root -p hangyi_scheduling < db/04-miniapp-sync-contract.sql
```

全新数据库的初始管理员为 `admin / 123456`，数据库内只保存 BCrypt 哈希；首次登录后应立即修改密码。

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少配置 JWT_SECRET、INTERNAL_API_KEY 和实际 Redis 连接信息
# 生成密钥: openssl rand -hex 32
```

关键环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `JWT_SECRET` | JWT 签名密钥（必填） | 无 |
| `INTERNAL_API_KEY` | 服务间接口密钥（必填） | 无 |
| `GATEWAY_PORT` | Gateway 端口 | `9000` |
| `CORE_PORT` | Core 端口 | `9001` |
| `SCHEDULE_PORT` | Schedule 端口 | `9002` |
| `ASSISTANT_PORT` | Assistant 端口 | `9004` |
| `VITE_DEV_PORT` | 前端开发端口 | `5173` |
| `VITE_PREVIEW_PORT` | 前端预览端口 | `9003` |
| `GATEWAY_HOST` | Gateway 主机名 | `localhost` |
| `CORE_HOST` | Core 主机名 | `localhost` |
| `SCHEDULE_HOST` | Schedule 主机名 | `localhost` |
| `ASSISTANT_HOST` | Assistant 主机名 | `localhost` |
| `VITE_API_TARGET` | 可选的前端代理完整地址覆盖 | 根据 Gateway 主机和端口生成 |
| `DB_PASSWORD` | MySQL 密码(必填,无默认) | 由 .env 注入 |
| `REDIS_PASSWORD` | Redis 密码(必填,无默认) | 由 .env 注入 |
| `REDIS_HOST` | Redis 地址 | `localhost` |
| `NACOS_ADDR` | Nacos 地址 | `localhost:8848` |
| `GUOCHUANG_SYNC_ENABLED` | 启用国创赛同步 | `false` |
| `WECHAT_LOGIN_ENABLED` | 启用微信小程序登录；启用后还需 AppID/Secret | `false` |
| `FLIGHT_SYNC_SIMULATION_ENABLED` | 允许生成模拟航班数据 | `false` |
| `FLIGHT_SYNC_AUTO_ENABLED` | 启用自动航班同步任务 | `false` |
| `ASSISTANT_ENGINE_ENABLED` | 完成知识入库与评测后启用问答 | `false` |
| `ASSISTANT_INTERNAL_KEY` | 小程序云函数调用助手的内部密钥 | 无 |
| `QDRANT_URL` | 向量库地址 | `http://localhost:6333` |
| `OLLAMA_URL` | embedding 服务地址 | `http://localhost:11434` |
| `QWEN_API_KEY` | 通义千问 API Key | 无 |

默认端口调用链为：

```text
开发前端 :5173 ─┐
预览前端 :9003 ─┴─> Gateway :9000 ─┬─> Core :9001
                                      ├─> Schedule :9002
                                      └─> Assistant :9004
```

### 3. 启动后端服务

```bash
# 编译整个项目
./mvnw clean compile -DskipTests

# 每个后端终端都先加载根目录 .env
set -a
source .env
set +a

# 1. 核心服务 (:9001)，在项目根目录执行
./mvnw -pl hangyi-core spring-boot:run -Dspring-boot.run.profiles=local

# 2. 排班服务 (:9002)，在另一个已加载 .env 的终端执行
./mvnw -pl hangyi-schedule spring-boot:run -Dspring-boot.run.profiles=local

# 3. 助手服务 (:9004)，完成知识入库后在另一个终端执行
./mvnw -pl hangyi-assistant spring-boot:run -Dspring-boot.run.profiles=local

# 4. 网关服务 (:9000)，在另一个已加载 .env 的终端执行
./mvnw -pl hangyi-gateway spring-boot:run -Dspring-boot.run.profiles=local

# 或者一键启动全部（在项目根目录）
./mvnw -pl hangyi-core spring-boot:run -Dspring-boot.run.profiles=local &
./mvnw -pl hangyi-schedule spring-boot:run -Dspring-boot.run.profiles=local &
./mvnw -pl hangyi-assistant spring-boot:run -Dspring-boot.run.profiles=local &
./mvnw -pl hangyi-gateway spring-boot:run -Dspring-boot.run.profiles=local &
```

> **local 配置文件** 会禁用 Nacos 服务发现，使用本地直连方式，适合开发调试。
>
> MySQL 和 Redis 必须可用。JWT 撤销与黑名单检查采用失败关闭策略，Redis 不可用时登录后的受保护请求会被拒绝，避免已退出 Token 继续生效。

### 4. 启动前端

```bash
cd web
npm install
npm run dev
# 浏览器访问 http://localhost:5173

# 验证生产包（固定使用 http://localhost:9003，并继续代理到 :9000）
npm run build
npm run preview
```

> Vite 使用严格端口：如果 5173 或 9003 已被占用会直接报错，不再静默切换到其他端口。

---

## 🔐 认证与权限

- **认证方式**：JWT 无状态 Token，网关层统一校验
- **登录接口**：`POST /api/auth/login`（账号密码）· `POST /api/auth/wechat-login`（请求体传微信临时 `code`）
- **Token 刷新**：`POST /api/auth/refresh`；刷新后 Access Token 与 Refresh Token 都会轮换，旧 Refresh Token 立即撤销
- **角色体系**：RBAC — `ADMIN`、`BOSS`、`TEAM_LEADER`、`STAFF`
- **服务间调用**：通过 `X-Internal-API-Key` 头传递内部 API 密钥
- **微信登录**：默认关闭；启用时配置 `WECHAT_LOGIN_ENABLED=true`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`

---

## 🧠 排班引擎 (OptaPlanner)

### 约束规则

排班引擎基于 OptaPlanner 的 `HardSoftLongScore` 评分，定义了以下约束：

| ID | 约束 | 类型 | 说明 |
|----|------|------|------|
| R1 | 机型资质匹配 | Hard | 员工机型资质必须覆盖航班机型 |
| C-a | 放行人员持证 | Hard | 放行人员必须持有有效执照 |
| R3 | 跨班次最小间隔 | Hard | 晚班→次日早班至少间隔 8 小时 |
| R4 | 月工时上限 | Hard | 月工时不超过 176 小时 |
| R5 | 每日一班 | Hard | 每个员工每天最多一个排班 |
| C-b | 夜班频率限制 | Hard | 7 天内夜班不超过 3 次 |
| I15 | 休假冲突 | Hard | 已休假员工不参与排班 |
| S1 | 工作量均衡 | Soft | 员工间工时尽量均衡 |

### 求解配置

```yaml
hangyi:
  solver:
    preview-timeout-ms: 2000    # 预览求解超时
    commit-timeout-ms: 5000     # 提交求解超时
    move-thread-count: AUTO     # 求解线程数
```

---

## 🔄 数据同步

系统支持与国创赛外部系统的双向数据同步：

- **拉模式**：`SyncPollingService` 每 60 秒从国创赛拉取变更数据
- **推模式**：Controller 写操作后通过内存队列暂存，定时批量推送到国创赛
- **开关控制**：通过 `guochuang.sync.enabled` 配置控制启用/禁用

微信小程序通过带 `X-Internal-API-Key` 的 `/api/sync/**` 与 Core 互通：

- 小程序只允许连接公网 HTTPS Gateway，Java 端所有同步和员工查询接口都校验内部密钥。
- `GET /api/sync/employee/{empNo}` 使用统一 `R.data` 返回员工姓名、完整手机号、班组、在职/请假状态、岗位、航司、机型和结构化资质，供云函数完成首次可信绑定。
- staff、flights、schedules、swap、leave 和 operation logs 均支持微信云 `_id` 幂等同步；排班以稳定 `source_key` 更新，`AFTERNOON` 映射为中班，归档与撤回状态不会复活。
- 请假支持 `/api/sync/leave-requests` 和旧 `/leave_requests`；图片凭证、校验快照、审计轨迹及待改派排班标记会保存到业务表。
- 发动机型号、航空器注册号和人工预计到达时间会同步到 `flight_plan` 与报表快照。
- `employee.status` 始终保持 `1=在职、0=离职`；请假只写入 `rpt_staff.on_leave` 和请假业务表，不能把请假员工误标为离职。
- 小程序管理员权限不从 Java 员工响应同步，仍由微信云数据库的 `staff.isAdmin` 独立控制。
- 持续数据流以微信云数据库推送到 Java 为主；Java 员工接口仅用于云端档案不存在时的首次导入，不应理解为两个可写数据源的自动双向复制。

---

## 智能知识问答

`hangyi-assistant` 已实现完整的知识问答闭环：

- 扫描 Markdown/TXT，按章节切块，使用 Ollama `/api/embed` 批量生成向量。
- Qdrant 增量更新、删除同步和需二次确认的全量重建。
- 仅依据召回资料调用通义千问；无足够依据时确定性拒答。
- 引用由服务端根据检索结果生成，并删除回答中的无效引用编号。
- EMPLOYEE 与 ADMIN 两级知识过滤。
- Web JWT 与小程序内部密钥双入口，账号历史和反馈严格按身份隔离；小程序 internal 请求还必须携带 HMAC-SHA256 身份签名和短时间戳，Java 不再只信任可伪造的身份 header。
- MySQL 原子每日配额，普通员工默认 20 次，管理员默认 100 次；Redis 还会按可信身份限制突发提问（默认员工 10 次/60 秒、管理员 30 次/60 秒），限流服务不可用时拒绝请求，避免失去外部模型保护。
- 小程序请求使用 `requestId` 幂等回放与端到端 deadline，避免重试重复扣配额或前端超时后继续生成；历史返回反馈状态，反馈失败不会伪报成功。
- 30 道业务题 Recall@5 评测，默认上线门槛为 0.85。

首次部署、增量入库、小程序配置和验收命令见
[智能知识助手部署与使用](docs/智能知识助手部署与使用.md)。

---

## 📊 API 路由

全部请求通过 Gateway (:9000) 统一入口：

| 路径前缀 | 路由到 | 模块 |
|----------|--------|------|
| `/api/auth/**` | Core :9001 | 认证登录 |
| `/api/users/**` | Core :9001 | 用户管理 |
| `/api/employees/**` | Core :9001 | 员工管理 |
| `/api/groups/**` | Core :9001 | 团队管理 |
| `/api/qualifications/**` | Core :9001 | 资质管理 |
| `/api/aircraft-types/**` | Core :9001 | 机型管理 |
| `/api/leaves/**` | Core :9001 | 休假管理 |
| `/api/preferences/**` | Core :9001 | 偏好设置 |
| `/api/flights/**` | Core :9001 | 航班管理 |
| `/api/sync/**` | Core :9001 | 同步管理 |
| `/api/reports/**` | Core :9001 | 报表管理 |
| `/api/audit/**` | Core :9001 | 审计日志 |
| `/api/statistics/**` | Core :9001 | 统计分析 |
| `/api/dashboard/**` | Core :9001 | 仪表盘 |
| `/api/schedules/**` | Schedule :9002 | 排班管理 |
| `/api/schedule-changes/**` | Schedule :9002 | 排班变更 |
| `/api/shifts/**` | Schedule :9002 | 班次模板 |
| `/api/schedule-rules/**` | Schedule :9002 | 排班规则 |
| `/api/swap/**` | Schedule :9002 | 换班管理 |
| `/api/notifications/**` | Schedule :9002 | 通知管理 |
| `/api/service-schedules/**` | Schedule :9002 | 服务排班 |
| `/api/assistant/**` | Assistant :9004 | 智能知识问答、历史和反馈 |

---

## 🧪 运行测试

```bash
# 运行全部后端测试（包含有明确时间上限的求解器性能测试）
./mvnw test

# 运行特定模块测试
./mvnw test -pl hangyi-schedule

# 运行助手及公共模块测试
./mvnw -pl hangyi-assistant -am test

# 运行排班求解器约束测试
./mvnw test -pl hangyi-schedule -Dtest="ScheduleConstraintProvider*"

# 运行排班端到端测试（需 Testcontainers/Docker）
./mvnw verify -pl hangyi-schedule -Dtest="SolverEndToEndTest"

# 前端单元测试、依赖审计与生产构建
cd web
npm test
npm audit --registry=https://registry.npmjs.org
npm run build
```

---

## 🐳 Docker 部署

### 前端 Nginx 部署

```bash
cd web

# 构建生产包
npm run build

# Docker 构建（使用 nginx 托管）
docker build -f Dockerfile.server -t hangyi-web .
docker run --rm -p 9003:80 \
  -e GATEWAY_HOST=host.docker.internal \
  -e GATEWAY_PORT=9000 \
  hangyi-web
```

Linux 主机运行时再增加 `--add-host=host.docker.internal:host-gateway`；若前后端位于同一 Docker 网络，将 `GATEWAY_HOST` 设置为 Gateway 的服务名。

---

## 📈 监控

排班服务集成了 Micrometer + Prometheus 监控：

- **端点**：`GET /actuator/prometheus`（read_only 访问）
- **健康检查**：`GET /actuator/health`
- **自定义指标**：`SolverMetrics` 记录求解次数、耗时、约束评分等

---

## 🗄️ 数据库表概览

| 模块 | 表名 | 说明 |
|------|------|------|
| 认证 | `sys_user` / `sys_role` / `sys_permission` | 用户、角色、权限（RBAC） |
| 认证 | `sys_user_role` / `sys_role_permission` | 关联表 |
| 员工 | `employee` | 员工基本信息 |
| 员工 | `employee_qualification` | 员工资质（机型） |
| 员工 | `employee_preference` | 员工排班偏好 |
| 员工 | `aircraft_type` | 机型字典 |
| 员工 | `team_group` | 团队/班组 |
| 员工 | `leave_request` | 休假申请 |
| 排班 | `schedule` | 排班计划 |
| 排班 | `schedule_detail` | 排班详情 |
| 排班 | `schedule_change` | 排班变更记录 |
| 换班 | `swap_request` | 换班申请 |
| 航班 | `flight_plan` | 航班计划 |
| 审计 | `operation_log` | 操作日志 |
| 报表 | `rpt_staff` / `rpt_schedule` / `rpt_flight` / `rpt_sync_log` / `rpt_swap_request` | 同步报表 |
| 助手 | `assistant_session` / `assistant_message` | 会话、回答、引用与反馈 |
| 助手 | `assistant_daily_quota` / `assistant_document` | 每日配额与知识入库状态 |

---

## 📝 开发规范

- 统一响应格式 `R<T>`：`{ code, msg, data, timestamp }`
- 异常统一由 `GlobalExceptionHandler` 处理
- `BusinessException` 用于业务异常（code 可自定义）
- 敏感字段（手机号等）使用 `MaskedSerializer` 脱敏
- Git 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范

---

## 📄 License

本项目为内部项目，仅供学习和团队内部使用。
