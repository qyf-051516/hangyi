# 航翼排班系统 (HangYi) 单元测试设计方案

## 概述

为航翼排班系统（8 个 Maven 微服务模块）建立完整单元测试体系，覆盖 Mapper、Service、Controller 三层。

## 技术选型

| 依赖 | 用途 | Scope |
|------|------|-------|
| `spring-boot-starter-test` | JUnit5 + Mockito + AssertJ + JSON Path | test |
| `com.h2database:h2` | MySQL 兼容模式内存数据库 | test |
| `org.springframework.cloud:spring-cloud-starter-contract-stub-runner` | Feign 客户端 Mock | test |

## 测试架构

### 三层测试策略

```
Controller @WebMvcTest
    ├── Mock Service 层 (Mockito @MockBean)
    ├── 验证：HTTP 状态码、响应体(R)、参数校验、权限
    └── 模拟：SecurityContextHolder

Service @SpringBootTest + H2
    ├── 自动配置 H2 数据源（MySQL 兼容模式）
    ├── 验证：业务逻辑、事务回滚、异常
    ├── 模拟：Feign 客户端 (@MockBean)
    └── 清理：@Transactional 自动回滚

Mapper @SpringBootTest + H2 (或手动配置)
    ├── 自动配置 MyBatis-Plus + H2
    ├── 验证：CRUD、自定义 SQL、表映射
    └── 清理：@Transactional 自动回滚
```

### H2 数据库配置（MySQL 兼容模式）

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:test;MODE=MYSQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
  sql:
    init:
      schema-locations: classpath:db/01-schema.sql
      mode: always
```

### 测试基类

1. **AbstractMapperTest** — 加载 H2 + MyBatis-Plus 配置，导入表结构
2. **AbstractServiceTest** — @SpringBootTest + H2 + @Transactional 自动回滚
3. **AbstractControllerTest** — 通用 MockMvc 设置 + SecurityContext 辅助
4. **TestSecurityUtil** — 安全上下文工具，设置 X-User-Id / X-User-Roles

## 模块测试计划

### Module 1: hangyi-common (纯单元测试)

**测试内容：**
- `R.java` — 所有静态工厂方法（ok/fail/forbidden/unauthorized）
- `BusinessException` — 构造方法和 getter
- `GlobalExceptionHandler` — 每种异常处理器返回正确状态码和 R 结构
- `PageRequest` — getter/setter
- `MyMetaObjectHandler` — 自动填充逻辑
- `HeaderAuthFilter` / `HeaderSecurityContextRepository` — 认证过滤链

**方式：** 纯 Mockito + AssertJ，无需 Spring Context。

### Module 2: hangyi-auth

**Service 层 (@SpringBootTest + H2)：**
- `SysUserService.login()` — 成功登录返回 token，密码错误抛 BusinessException，用户不存在抛 BusinessException
- 模拟 `sysUserMapper.findRoleCodesByUserId()`

**Controller 层 (@WebMvcTest)：**
- `AuthController.login()` — 正常请求返回 R.ok，参数缺失返回 400
- `UserController.list/getById/getByUsername` — 正确返回用户数据

### Module 3: hangyi-gateway

**JWT 过滤器 (纯单元 + @WebMvcTest)：**
- `JwtAuthGlobalFilter` — 有效 token 放行、过期 token 返回 401、无 token 返回 401
- `JwtUtil` — 生成和解析 token
- `RateLimiterConfig` — 限流逻辑
- `CorsConfig` — CORS 配置

### Module 4: hangyi-employee

**Service 层 (@SpringBootTest + H2)：**
- `EmployeeService` — CRUD、按组查询、分页查询、统计
- `EmployeePreferenceService` — 偏好设置
- `AircraftTypeService / QualificationService / TeamGroupService` — 标准 CRUD

**Controller 层 (@WebMvcTest)：**
- `EmployeeController` — listByGroup/listAll/count/stats/page/get/create/update/delete
- `EmployeePreferenceController / AircraftTypeController / QualificationController / TeamGroupController`

### Module 5: hangyi-flight

**Service + Controller：**
- `FlightSyncService` — 航班同步逻辑
- `FlightPlanController` — 航班计划 CRUD

### Module 6: hangyi-leave

**Service + Controller：**
- `LeaveRequestController` — 请假申请 CRUD
- 注意边界：重复申请、状态校验

### Module 7: hangyi-schedule (复杂模块)

**Service 层：**
- `ScheduleService` — 排班 CRUD、甘特图数据组装、自动排班触发
- `ScheduleSolverService` — Timefold 求解器协调
- `ScheduleExportService` — Excel 导出
- Shift/Change/Rule CRUD

**约束测试 (最核心)：**
- `ScheduleConstraintProvider` — 5 个硬约束 + 3 个软约束的独立验证
  - 硬约束：人员可用性、资质匹配、班次重叠、工时上限、休息间隔
  - 软约束：偏好匹配、班次均衡、连续性偏好
- Timefold `@PlanningSolution` / `@PlanningEntity` 的评分验证

**Controller 层：**
- `ScheduleController` — 排班查询、自动排班、手动调整
- `ScheduleChangeController` — 换班审批
- `ScheduleExportController` — 导出
- `ShiftTemplateController` — 班次模板

### Module 8: hangyi-dashboard

- `DashboardController` — 聚合统计接口
- Mock Feign 客户端返回数据
- 验证数据聚合逻辑

## 测试数据管理

- **schema.sql** — 每个模块 test/resources 下存放建表 SQL（适配 H2 语法）
- **data.sql** — 共享的测试数据（如有需要）
- 每个测试类使用 `@TestMethodOrder` 或 `@Sql` 管理数据
- Service 层测试通过 `@Transactional` 自动回滚，测试间无污染

## 测试命名规范

```
// Mapper 测试
EmployeeMapperTest
├── testSelectById()
├── testFindRoleCodesByUserId()
└── testPageQuery()

// Service 测试
SysUserServiceTest
├── testLogin_Success()
├── testLogin_UserNotFound()
├── testLogin_WrongPassword()
└── testLogin_ReturnToken()

// Controller 测试
AuthControllerTest
├── testLogin_ValidRequest_ReturnOk()
├── testLogin_MissingUsername_Return400()
└── testLogin_InvalidBody_Return400()
```

## 非功能性要求

1. **测试隔离** — Service/Controller 层测试必须 `@Transactional` 回滚
2. **快速反馈** — H2 内存数据库保证单模块测试 < 30 秒
3. **CI 友好** — 无需外部服务（Nacos/MySQL/Redis），所有依赖 Mock 或 H2
4. **可维护性** — 每个测试独立，不依赖执行顺序

## 排除范围

- hangyi-ai 模块（已确认不测试）
- Vue 前端 / UniApp 移动端
- Docker 部署脚本
- db/ 目录下的 SQL 脚本本身（作为测试数据源使用）
