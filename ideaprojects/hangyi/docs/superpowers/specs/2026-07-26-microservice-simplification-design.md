# 航翼排班系统 · 微服务精简架构设计

> **历史文档说明：** 本文保留设计阶段的端口草案。当前运行端口以根目录 `README.md` 和 `.env.example` 为准：前端开发 5173、前端预览 9003、Gateway 9000、Core 9001、Schedule 9002。
>
> 起草日期：2026-07-26
> 状态：设计中
> 关联 spec：`2026-06-19-hangyi-optaplanner-design.md`（智能排班算法）

---

## 1. 动机

当前 7 个微服务（gateway/auth/employee/schedule/flight/statistics + common）共享同一个 MySQL 库，本质是伪微服务架构。Spring Cloud Gateway + Nacos + OpenFeign + Redis 组合对于一个本地部署、不上线的内部管理系统来说过重。

本设计将 7 个模块精简为 **3 个独立服务**，保留微服务的关键价值（排班引擎独立部署、网关统一入口），去掉不必要的复杂度。

---

## 2. 决策汇总

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | 服务数量 | **3 个**：gateway + core + schedule | auth/employee/flight/statistics 都是标准 CRUD，拆开无收益 |
| 2 | 数据边界 | 一服务一套表，共享 MySQL 库，约定不跨写 | 避免分布式事务，表归属清晰即可后续拆库 |
| 3 | 服务间通信 | Feign 同步 + RabbitMQ 异步 | 核心查询走 Feign；事件通知（排班完成→通知）走 MQ |
| 4 | MQ 选型 | RabbitMQ | Spring amqp 生态成熟，本地 Docker 加一个容器即可 |
| 5 | 注册中心 | **保留 Nacos** | 后续可能扩展，去掉收益不大 |
| 6 | 鉴权模型 | Gateway 仅校验 JWT → Core 内部 Spring Security FilterChain | 标准做法，Gateway 去掉 MyBatis 依赖 |
| 7 | Gateway 治理 | 保留 + Sentinel 熔断限流 | 增加服务韧性 |
| 8 | SyncService | **本次不碰** | 单独处理 |
| 9 | 前端 | 保持 web/ 不变 | 仅改 API 代理配置 |

---

## 3. 服务拆分

### 3.1 目标架构

```
                    ┌─────────────┐
                    │   Nginx     │  :80 → frontend (web/)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Gateway   │  :8080
                    │ JWT校验     │  Sentinel 熔断/限流
                    │ 路由转发    │  无数据库依赖
                    └──┬──────┬──┘
                       │      │
              ┌────────▼──┐ ┌─▼──────────┐
              │   Core    │ │  Schedule   │
              │   :8081   │ │  :8083      │
              │           │ │             │
              │ auth      │ │ 排班引擎    │
              │ employee  │ │ OptaPlanner │
              │ flight    │ │ 换班/模板   │
              │ statistics│ │             │
              └─────┬─────┘ └──────┬──────┘
                    │              │
                    │   RabbitMQ   │  服务间异步通信
                    └──────┬───────┘
                           │
                    ┌──────▼──────┐
                    │   MySQL 8   │  hangyi_scheduling
                    │   :3306     │  单库，按服务分表归属
                    └─────────────┘
```

### 3.2 各服务职责

| 服务 | 端口 | 职责 | 模块来源 |
|------|------|------|----------|
| **gateway** | 8080 | JWT 校验、Sentinel 熔断限流、CORS、路由 | 原 hangyi-gateway（去掉 MyBatis/MySQL） |
| **core** | 8081 | 认证、人员、班组、资质、请假、航班、统计、审计、报表 | hangyi-auth + employee + flight + statistics |
| **schedule** | 8083 | 智能排班、换班、班次模板、甘特图 | 原 hangyi-schedule（保持独立） |

### 3.3 数据库表归属

每个服务只能读写自己归属的表，跨服务数据访问通过 API。

#### core 表

| 表名 | 说明 |
|------|------|
| sys_user | 系统用户 |
| sys_role | 角色 |
| sys_permission | 权限 |
| employee | 员工 |
| employee_qualification | 资质 |
| team_group | 班组 |
| aircraft_type | 机型 |
| employee_preference | 排班偏好 |
| leave_request | 请假申请 |
| flight_plan | 航班计划 |
| operation_log | 操作日志 |
| rpt_staff / rpt_flight / rpt_schedule / rpt_swap_request / rpt_sync_log | 报表（SyncService 保留） |

#### schedule 表

| 表名 | 说明 |
|------|------|
| schedule | 排班头 |
| schedule_detail | 排班明细 |
| schedule_change | 排班变更 |
| schedule_rule | 排班规则 |
| shift_template | 班次模板 |
| swap_request | 换班申请 |

---

## 4. 鉴权改造

### 4.1 现状

```
客户端 → Gateway(JwtAuthGlobalFilter: 查DB验用户→签发X-User-* header)
       → Core(HeaderAuthFilter: 验X-User-Sig→构造SecurityContext)
```

问题：
- Gateway 依赖 MyBatis 查数据库（反模式）
- 下游信任 X-User-* 头，依赖 HMAC 签名防伪造
- Gateway 和 Auth 各有一套 JwtUtil（代码重复）

### 4.2 目标

```
客户端 → Gateway(JwtAuthGlobalFilter: 仅解析JWT→验证签名+过期+黑名单→透传Authorization头)
       → Core(JwtAuthFilter: OncePerRequestFilter→解析JWT→构造Authentication→SecurityContextHolder)
```

关键改动：
1. Gateway 的 JwtAuthGlobalFilter **不再查数据库**，只做 JWT 签名校验 + 过期检查 + Redis 黑名单检查
2. Gateway **去掉 MyBatis-Plus 和 MySQL 驱动依赖**
3. Gateway 透传原始 `Authorization: Bearer <token>` 头给下游
4. Core 新增 `JwtAuthFilter extends OncePerRequestFilter`，从 Authorization 头解析 JWT，构造 `UsernamePasswordAuthenticationToken` 写入 `SecurityContextHolder`
5. Core 的 Controller 使用 `@PreAuthorize` 做细粒度权限控制
6. 删除 `HeaderAuthFilter` 和 `HeaderSecurityContextRepository`（不再需要 X-User-* 头透传）
7. 删除 `UserContextSigner`（不再需要 HMAC 签名）
8. Feign 调用时通过 `FeignConfig` 的 `RequestInterceptor` 自动携带当前请求的 Authorization 头

### 4.3 Core SecurityConfig

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class CoreSecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, JwtAuthFilter jwtAuthFilter) {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/login", "/api/auth/wechat-login", "/api/auth/register").permitAll()
                .requestMatchers("/api/sync/**").permitAll()  // 暂保留，后续加 API Key
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

---

## 5. Maven 模块结构

```
hangyi/
├── pom.xml                     # 父 POM（Spring Boot 3.3.5 + Spring Cloud 2023.0.4）
├── hangyi-common/              # 共享：R/DTO/异常/BusinessException/FeignConfig
├── hangyi-gateway/             # 网关（精简后，去掉 MyBatis）
├── hangyi-core/                # ★ 新建：合并 auth+employee+flight+statistics
├── hangyi-schedule/            # 排班（保持独立）
├── web/                        # 前端（不变）
├── db/                         # SQL 脚本
└── docker-compose.yml          # 3 服务 + RabbitMQ + MySQL + Nacos + Redis
```

### 5.1 hangyi-core 内部包结构

```
com.qyf.hangyi.core/
├── CoreApplication.java            # @SpringBootApplication
├── config/
│   ├── CoreSecurityConfig.java     # Spring Security FilterChain
│   ├── JwtAuthFilter.java          # OncePerRequestFilter
│   └── CoreMyBatisPlusConfig.java  # MyBatis-Plus 分页插件（合并各模块重复配置）
├── auth/
│   ├── controller/  (AuthController, UserController)
│   ├── dto/         (LoginRequest, LoginResponse, WechatLoginRequest)
│   ├── entity/      (SysUser, SysRole, SysPermission)
│   ├── mapper/
│   ├── security/    (JwtUtil — 合并后只保留一份)
│   └── service/     (SysUserService)
├── employee/
│   ├── controller/  (EmployeeController, TeamGroupController, QualificationController, AircraftTypeController, EmployeePreferenceController)
│   ├── entity/      (Employee, TeamGroup, EmployeeQualification, AircraftType, EmployeePreference)
│   ├── mapper/
│   ├── service/
│   └── leave/       (LeaveRequestController, LeaveRequest, LeaveRequestMapper)
├── flight/
│   ├── controller/  (FlightPlanController)
│   ├── entity/      (FlightPlan)
│   ├── mapper/
│   └── service/     (FlightSyncService)
├── statistics/
│   ├── controller/  (StatisticsController, DashboardController)
│   └── service/
├── audit/
│   ├── controller/  (AuditController)
│   ├── entity/      (OperationLog)
│   ├── mapper/
│   └── service/
├── sync/            # SyncService 原样搬入（不动）
│   ├── SyncService.java
│   ├── SyncPollingService.java
│   ├── SyncController.java
│   └── ReportController.java
└── rpt/             # 报表实体和映射器（原 auth 的 Rpt* 类）
    ├── entity/
    └── mapper/
```

### 5.2 删除和清理

| 删除项 | 说明 |
|--------|------|
| hangyi-auth 模块 | 合并入 core |
| hangyi-employee 模块 | 合并入 core |
| hangyi-flight 模块 | 合并入 core |
| hangyi-statistics 模块 | 合并入 core |
| `hangyi-common/config/HeaderAuthFilter.java` | 不再使用 X-User-* 头透传 |
| `hangyi-common/config/HeaderSecurityContextRepository.java` | 同上 |
| `hangyi-common/security/UserContextSigner.java` | 不再需要 HMAC 签名 |
| `hangyi-common/constant/AuthConstant.java` | 不再需要（如有） |
| Gateway 的 MyBatis-Plus / MySQL 依赖 | Gateway 不再查库 |
| auth/employee/flight/statistics 各模块的 SecurityConfig | 统一为 CoreSecurityConfig |
| auth/employee/flight/statistics 各模块的 MyBatisPlusConfig | 统一为 CoreMyBatisPlusConfig |
| 重复的 JwtUtil（auth 和 gateway 各一套） | Core 保留一套，Gateway 保留简化版（只解析不查库） |
| 重复的 Employee/TeamGroup/等实体（auth 和 employee 各一套） | 只保留一份 |

---

## 6. 服务间通信

### 6.1 同步调用（Feign）

schedule → core：

```
EmployeeFeignClient     GET  /api/employees/list-by-ids?ids=...
                        GET  /api/employees/list-by-group?groupId=...
QualificationFeignClient GET /api/qualifications/employee/{employeeId}
                         POST /api/qualifications/employee/batch
FlightFeignClient       GET  /api/flights/page?page=&size=&date=
```

Feign 配置通过 `FeignConfig` 的 `RequestInterceptor` 自动携带当前请求的 `Authorization` 头。

### 6.2 异步消息（RabbitMQ）

| 事件 | 生产者 | 消费者 |
|------|--------|--------|
| schedule.created | schedule | core（统计更新） |
| schedule.published | schedule | core（通知推送） |
| swap.approved | schedule | core（统计更新） |

### 6.3 RabbitMQ 配置

- Exchange: `hangyi.events` (topic)
- Queue: `core.schedule-events`
- Routing key: `schedule.*`
- Docker: `rabbitmq:3.13-management-alpine`
- 管理面板: `http://localhost:15672`

---

## 7. 基础设施变更

### 7.1 docker-compose.yml 变更

| 变更 | 说明 |
|------|------|
| 新增 `rabbitmq` 服务 | RabbitMQ 3.13-management-alpine，端口 5672/15672 |
| 删除 `auth-service` | 合并入 core |
| 删除 `employee-service` | 合并入 core |
| 删除 `flight-service` | 合并入 core |
| 删除 `statistics-service` | 合并入 core |
| 新增 `core-service` | 合并后的 core，端口 8081 |
| 保留 `gateway` | 去掉 MySQL/Redis 依赖声明 |
| 保留 `schedule-service` | 不变 |
| 保留 `mysql` | 不变 |
| 保留 `redis` | 不变 |
| 保留 `nacos` | 不变 |
| 保留 `migration` | 不变 |

### 7.2 端口映射

| 服务 | 宿主机端口 | 容器端口 |
|------|-----------|----------|
| gateway | 8080 | 8080 |
| core | —（仅内网） | 8081 |
| schedule | —（仅内网） | 8083 |
| frontend | 8089 | 80 |
| mysql | 3307 | 3306 |
| redis | 6380 | 6379 |
| rabbitmq | 5672 / 15672 | 5672 / 15672 |
| nacos | 8848 | 8848 |

---

## 8. 实施内容

### 8.1 In Scope（本轮做）

1. 新建 `hangyi-core` Maven 模块，合并 auth/employee/flight/statistics 代码
2. 合并各模块重复的实体/映射器/配置（JwtUtil、MyBatisPlusConfig、SecurityConfig）
3. 删除 `HeaderAuthFilter`、`HeaderSecurityContextRepository`、`UserContextSigner`
4. Core 实现 `JwtAuthFilter extends OncePerRequestFilter` + `CoreSecurityConfig`
5. Gateway 去掉 MyBatis-Plus/MySQL 依赖，JwtAuthGlobalFilter 简化为纯 JWT 校验
6. Gateway 加 Sentinel 熔断/限流
7. 加入 RabbitMQ：docker-compose + core/schedule 的消息配置
8. Core Feign 接口调整（schedule → core 的调用）
9. 更新 `docker-compose.yml`：3 服务 + RabbitMQ
10. 更新 Gateway 路由配置
11. 前端 Nginx 配置更新（/api 代理到 gateway）
12. 编译验证 + 启动验证 + 冒烟测试

### 8.2 Out of Scope（本轮不做）

- SyncService / Rpt* / `/api/sync/**` 重构
- 数据库拆分（表归属只是约定，物理上仍在同一库）
- Sentinel 控制台部署（仅代码层熔断）
- CI / CD 流水线
- hangyi-single 同步
- 前端重构（Dashboard 拆分等）
- 安全漏洞修复（H-1~H-3、M-2）

---

## 9. 风险与回滚

- **风险**：core 部署包变大（合并 4 个模块），启动时间增加
- **回滚**：git revert 整个 commit 即可，恢复原 7 模块结构
- **并行**：不新建独立工程，直接在 hangyi 仓库内重构
