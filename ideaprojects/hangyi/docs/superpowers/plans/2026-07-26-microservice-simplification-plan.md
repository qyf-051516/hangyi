# 航翼微服务精简重构 · 实施计划

> **历史文档说明：** 本文记录重构实施时的端口草案（8080/8081/8083/8089），不再作为启动依据。当前端口矩阵以根目录 `README.md` 和 `.env.example` 为准：前端开发 5173、前端预览 9003、Gateway 9000、Core 9001、Schedule 9002。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 7 个模块精简为 3 个服务（gateway + core + schedule），合并 auth/employee/flight/statistics 入 core，Gateway 去掉 MyBatis 依赖，Spring Security FilterChain 替代 X-User-* 头透传，引入 RabbitMQ + Sentinel。

**Architecture:** gateway（JWT 校验 + Sentinel 路由）→ core（认证/人员/航班/统计，Spring Security FilterChain）← schedule（排班引擎，Feign 调用 core）。3 服务共享 MySQL 单库，按服务划分表归属。RabbitMQ 做异步事件通知。

**Tech Stack:** Java 17, Spring Boot 3.3.5, Spring Cloud Gateway 2023.0.4, Spring Security, Nacos 2.4.3, MyBatis-Plus 3.5.9, RabbitMQ 3.13, Sentinel, Redis 7, jjwt 0.12.6

**Spec:** `docs/superpowers/specs/2026-07-26-microservice-simplification-design.md`

---

## 文件结构总览

### 新建文件

| 文件 | 职责 |
|------|------|
| `hangyi-core/pom.xml` | 合并后 core 的 Maven 依赖 |
| `hangyi-core/src/main/java/com/qyf/hangyi/core/CoreApplication.java` | 启动类 |
| `hangyi-core/src/main/java/com/qyf/hangyi/core/config/CoreSecurityConfig.java` | Spring Security FilterChain（替代各模块分散 SecurityConfig） |
| `hangyi-core/src/main/java/com/qyf/hangyi/core/config/JwtAuthFilter.java` | OncePerRequestFilter，从 Authorization 头解析 JWT 构造 Authentication |
| `hangyi-core/src/main/java/com/qyf/hangyi/core/config/CoreMyBatisPlusConfig.java` | 合并各模块重复的 MyBatis-Plus 分页插件配置 |
| `hangyi-core/Dockerfile` | Core Docker 构建 |
| `hangyi-core/src/main/resources/application.yml` | Core 统一配置 |
| `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/config/GatewaySentinelConfig.java` | Sentinel 熔断/限流配置 |

### 删除文件

| 文件 | 原因 |
|------|------|
| `hangyi-common/src/main/java/com/qyf/hangyi/common/config/HeaderAuthFilter.java` | 不再用 X-User-* 透传 |
| `hangyi-common/src/main/java/com/qyf/hangyi/common/config/HeaderSecurityContextRepository.java` | 同上 |
| `hangyi-common/src/main/java/com/qyf/hangyi/common/security/UserContextSigner.java` | 不再需要 HMAC 签名 |
| `hangyi-common/src/main/java/com/qyf/hangyi/common/constant/AuthConstant.java` | X_USER_* 常量不再需要 |
| `hangyi-auth/` 整个模块 | 合并入 core |
| `hangyi-employee/` 整个模块 | 合并入 core |
| `hangyi-flight/` 整个模块 | 合并入 core |
| `hangyi-statistics/` 整个模块 | 合并入 core |

### 修改文件

| 文件 | 变更 |
|------|------|
| `pom.xml` | modules 列表：去掉 auth/employee/flight/statistics，加 core |
| `hangyi-gateway/pom.xml` | 去掉 mybatis-plus/mysql-connector-j，加 sentinel |
| `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/filter/JwtAuthGlobalFilter.java` | 去掉 X-User-* 头构造和 HMAC 签名，只做 JWT 校验 + 透传 Authorization 头 |
| `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/config/JwtUtil.java` | 去掉无用依赖 import |
| `hangyi-gateway/src/main/resources/application.yml` | 去掉 DB 配置，合并路由为 core + schedule 两条，加 sentinel |
| `hangyi-gateway/Dockerfile` | 去掉 auth/employee/flight/statistics 的 pom copy |
| `hangyi-common/pom.xml` | 去掉 sentinel-transport-simple（不当在这里），检查依赖 |
| `hangyi-common/src/main/java/com/qyf/hangyi/common/config/FeignConfig.java` | 改为携带 Authorization 头而非 X-User-* |
| `hangyi-schedule/pom.xml` | 加 rabbitmq starter |
| `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/client/*FeignClient.java` | 3 个 Feign 接口 name 改 hangyi-core，local URL 指向 core |
| `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/ScheduleSecurityConfig.java` | 适配新鉴权模型 |
| `hangyi-schedule/src/main/resources/application.yml` | local profile Feign URL 指向 core:8081 |
| `docker-compose.yml` | 3 服务 + RabbitMQ，去掉 auth/employee/flight/statistics |
| `web/nginx.conf` | API 代理不变（仍指向 gateway:8080） |

---

### Task 1: 创建 hangyi-core Maven 模块骨架

**Files:**
- Create: `hangyi-core/pom.xml`
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/CoreApplication.java`
- Create: `hangyi-core/src/main/resources/application.yml`
- Create: `hangyi-core/Dockerfile`
- Modify: `pom.xml`

- [ ] **Step 1: 创建 hangyi-core/pom.xml**

合并 auth/employee/flight/statistics 的依赖。需要 spring-boot-starter-web + security + validation + data-redis，mybatis-plus，mysql-connector-j，nacos-discovery，jjwt，hutool，lombok，hangyi-common。**不包含** openfeign（core 不主动调其他服务，只被调）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.qyf</groupId>
        <artifactId>hangyi</artifactId>
        <version>0.0.1-SNAPSHOT</version>
    </parent>
    <artifactId>hangyi-core</artifactId>
    <packaging>jar</packaging>
    <name>hangyi-core</name>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
        </dependency>
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>cn.hutool</groupId>
            <artifactId>hutool-all</artifactId>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>com.qyf</groupId>
            <artifactId>hangyi-common</artifactId>
            <version>${project.version}</version>
        </dependency>
    </dependencies>
</project>
```

- [ ] **Step 2: 创建 CoreApplication.java**

```java
package com.qyf.hangyi.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
@EnableDiscoveryClient
@EnableScheduling
public class CoreApplication {
    public static void main(String[] args) {
        SpringApplication.run(CoreApplication.class, args);
    }
}
```

- [ ] **Step 3: 创建 hangyi-core/src/main/resources/application.yml**

合并 auth 的 core 配置 + employee/flight/statistics 的配置（端口 8081）：

```yaml
server:
  port: 8081

spring:
  application:
    name: hangyi-core
  datasource:
    url: jdbc:mysql://localhost:3306/hangyi_scheduling?serverTimezone=Asia/Shanghai
    username: root
    password: ${DB_PASSWORD:123456}
    driver-class-name: com.mysql.cj.jdbc.Driver
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848

mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml
  type-aliases-package: com.qyf.hangyi.core
  global-config:
    db-config:
      id-type: auto
  configuration:
    map-underscore-to-camel-case: true
    log-impl: ${MYBATIS_LOG_IMPL:org.apache.ibatis.logging.nologging.NoLoggingImpl}

jwt:
  secret: ${JWT_SECRET:?JWT_SECRET required in .env}
  expiration: ${JWT_EXPIRATION:86400000}

guochuang:
  sync:
    enabled: ${GUOCHUANG_SYNC_ENABLED:false}
    url: ${GUOCHUANG_SYNC_URL:}
    api-key: ${GUOCHUANG_API_KEY:}

logging:
  level:
    com.qyf.hangyi.core: debug

---
spring:
  config:
    activate:
      on-profile: local
  cloud:
    nacos:
      discovery:
        enabled: false
```

- [ ] **Step 4: 创建 hangyi-core/Dockerfile**

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /build

COPY pom.xml ./
COPY hangyi-common/pom.xml ./hangyi-common/pom.xml
COPY hangyi-core/pom.xml ./hangyi-core/pom.xml
COPY hangyi-gateway/pom.xml ./hangyi-gateway/pom.xml
COPY hangyi-schedule/pom.xml ./hangyi-schedule/pom.xml
COPY mvnw ./
COPY .mvn ./.mvn
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw dependency:resolve-plugins dependency:go-offline -B -q || true

COPY hangyi-common/src ./hangyi-common/src
COPY hangyi-core/src ./hangyi-core/src
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw clean package -DskipTests -pl hangyi-common,hangyi-core -am -B

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S hangyi && adduser -S hangyi -G hangyi
USER hangyi
WORKDIR /app
COPY --from=builder /build/hangyi-core/target/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
```

- [ ] **Step 5: 更新父 pom.xml 的 modules 列表**

编辑 `/Users/qyf/IdeaProjects/hangyi/pom.xml`，将：

```xml
<modules>
    <module>hangyi-common</module>
    <module>hangyi-gateway</module>
    <module>hangyi-auth</module>
    <module>hangyi-employee</module>
    <module>hangyi-schedule</module>
    <module>hangyi-flight</module>
    <module>hangyi-statistics</module>
</modules>
```

改为：

```xml
<modules>
    <module>hangyi-common</module>
    <module>hangyi-gateway</module>
    <module>hangyi-core</module>
    <module>hangyi-schedule</module>
</modules>
```

- [ ] **Step 6: Commit**

```bash
git add pom.xml hangyi-core/
git commit -m "feat(core): create hangyi-core module skeleton (merge target for auth/employee/flight/statistics)"
```

---

### Task 2: 迁移 auth 模块代码到 core

**Files:**
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/auth/` （整个包树）
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/audit/` （审计日志）
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/sync/` （SyncService 不动）
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/rpt/` （报表实体）

- [ ] **Step 1: 拷贝 auth 的 Java 源码到 core**

```bash
# 拷贝 auth 模块下所有业务代码（保留包结构）
cp -r hangyi-auth/src/main/java/com/qyf/hangyi/auth/* \
      hangyi-core/src/main/java/com/qyf/hangyi/core/auth/
```

然后全局替换包声明：所有文件中的 `package com.qyf.hangyi.auth` → `package com.qyf.hangyi.core.auth`

```bash
find hangyi-core/src/main/java/com/qyf/hangyi/core/auth -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.auth;/package com.qyf.hangyi.core.auth;/' {} \;
find hangyi-core/src/main/java/com/qyf/hangyi/core/auth -name "*.java" -exec sed -i '' 's/import com\.qyf\.hangyi\.auth\./import com.qyf.hangyi.core.auth./g' {} \;
```

- [ ] **Step 2: 拷贝 auth 的 audit 子包到 core**

```bash
cp -r hangyi-auth/src/main/java/com/qyf/hangyi/auth/audit/* \
      hangyi-core/src/main/java/com/qyf/hangyi/core/auth/audit/
```

替换包声明：

```bash
find hangyi-core/src/main/java/com/qyf/hangyi/core/auth/audit -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.auth\.audit;/package com.qyf.hangyi.core.auth.audit;/' {} \;
find hangyi-core/src/main/java/com/qyf/hangyi/core/auth/audit -name "*.java" -exec sed -i '' 's/import com\.qyf\.hangyi\.auth\./import com.qyf.hangyi.core.auth./g' {} \;
```

- [ ] **Step 3: 移动 sync 和 rpt 到独立子包**

SyncService 及其相关类放到 `core/sync/` 包，Rpt* 实体和映射器放到 `core/rpt/` 包：

```bash
mkdir -p hangyi-core/src/main/java/com/qyf/hangyi/core/sync
mkdir -p hangyi-core/src/main/java/com/qyf/hangyi/core/rpt/entity
mkdir -p hangyi-core/src/main/java/com/qyf/hangyi/core/rpt/mapper
```

Sync 相关文件（SyncService, SyncPollingService, SyncController, ReportController）：
```bash
# 从 core/auth 移出 sync 相关文件
mv hangyi-core/src/main/java/com/qyf/hangyi/core/auth/service/SyncService.java \
   hangyi-core/src/main/java/com/qyf/hangyi/core/sync/
mv hangyi-core/src/main/java/com/qyf/hangyi/core/auth/sync/SyncPollingService.java \
   hangyi-core/src/main/java/com/qyf/hangyi/core/sync/
mv hangyi-core/src/main/java/com/qyf/hangyi/core/auth/controller/SyncController.java \
   hangyi-core/src/main/java/com/qyf/hangyi/core/sync/
mv hangyi-core/src/main/java/com/qyf/hangyi/core/auth/controller/ReportController.java \
   hangyi-core/src/main/java/com/qyf/hangyi/core/sync/
```

替换包名为 `com.qyf.hangyi.core.sync`：
```bash
find hangyi-core/src/main/java/com/qyf/hangyi/core/sync -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.core\.auth\.\(.*\);/package com.qyf.hangyi.core.sync;/' {} \;
find hangyi-core/src/main/java/com/qyf/hangyi/core/sync -name "*.java" -exec sed -i '' 's/import com\.qyf\.hangyi\.core\.auth\./import com.qyf.hangyi.core.auth./g' {} \;
```

Rpt* 实体和映射器：
```bash
# 移出 Rpt* 实体
for f in hangyi-core/src/main/java/com/qyf/hangyi/core/auth/entity/Rpt*.java; do
  mv "$f" hangyi-core/src/main/java/com/qyf/hangyi/core/rpt/entity/
done
# 移出 Rpt* 映射器
for f in hangyi-core/src/main/java/com/qyf/hangyi/core/auth/mapper/Rpt*.java; do
  mv "$f" hangyi-core/src/main/java/com/qyf/hangyi/core/rpt/mapper/
done
```

替换包名：
```bash
find hangyi-core/src/main/java/com/qyf/hangyi/core/rpt -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.core\.auth\.entity;/package com.qyf.hangyi.core.rpt.entity;/' {} \;
find hangyi-core/src/main/java/com/qyf/hangyi/core/rpt -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.core\.auth\.mapper;/package com.qyf.hangyi.core.rpt.mapper;/' {} \;
```

- [ ] **Step 4: 删除 auth 模块中与其他模块重复的实体和映射器**

auth 模块为 SyncService 维护了 Employee、EmployeeQualification、AircraftType、TeamGroup、FlightPlan、Schedule、ScheduleDetail、ScheduleChange 的副本实体和映射器。现在 core 会引入 employee/flight 模块的实体，auth 的这些副本需删除（保留 SyncService 中的引用，后续统一改为引用对应模块的实体）。

暂时保留这些重复实体不动（SyncService 强依赖它们），在 SyncService 独立重构时处理。在计划中标记为已知技术债务。

- [ ] **Step 5: 保留 auth 模块的 JwtUtil（Security 包）**

`hangyi-core/src/main/java/com/qyf/hangyi/core/auth/security/JwtUtil.java` 是唯一正确的 JwtUtil（支持 generateToken/revokeToken/refreshToken），保留它。Gateway 和 Core 各需 JwtUtil，但职责不同：
- Core JwtUtil：完整（生成 + 解析 + 吊销 + refresh）
- Gateway JwtUtil：仅解析 + 黑名单检查（当前已如此）

两个 JwtUtil 各自保留在各自模块，不做合并。

- [ ] **Step 6: Commit**

```bash
git add hangyi-core/src/
git commit -m "feat(core): migrate auth module code to core (auth/audit/sync/rpt packages)"
```

---

### Task 3: 迁移 employee 模块代码到 core

**Files:**
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/employee/` （整个包树）
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/leave/` （请假）

- [ ] **Step 1: 拷贝 employee 模块的 Java 源码到 core**

```bash
cp -r hangyi-employee/src/main/java/com/qyf/hangyi/employee/* \
      hangyi-core/src/main/java/com/qyf/hangyi/core/employee/
```

替换包声明：

```bash
find hangyi-core/src/main/java/com/qyf/hangyi/core/employee -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.employee;/package com.qyf.hangyi.core.employee;/' {} \;
find hangyi-core/src/main/java/com/qyf/hangyi/core/employee -name "*.java" -exec sed -i '' 's/import com\.qyf\.hangyi\.employee\./import com.qyf.hangyi.core.employee./g' {} \;
```

- [ ] **Step 2: 处理 leave 子包**

leave 在 `hangyi-employee/src/main/java/com/qyf/hangyi/employee/leave/` 下，拷贝后需单独处理：

```bash
# 确保 leave 子包拷贝正确（已在 Step1 的 cp -r 中处理）
find hangyi-core/src/main/java/com/qyf/hangyi/core/employee/leave -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.employee\.leave;/package com.qyf.hangyi.core.employee.leave;/' {} \;
```

- [ ] **Step 3: Commit**

```bash
git add hangyi-core/src/main/java/com/qyf/hangyi/core/employee/
git commit -m "feat(core): migrate employee module code to core"
```

---

### Task 4: 迁移 flight 和 statistics 模块代码到 core

**Files:**
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/flight/` （整个包树）
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/statistics/` （整个包树）

- [ ] **Step 1: 迁移 flight 模块**

```bash
cp -r hangyi-flight/src/main/java/com/qyf/hangyi/flight/* \
      hangyi-core/src/main/java/com/qyf/hangyi/core/flight/

find hangyi-core/src/main/java/com/qyf/hangyi/core/flight -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.flight;/package com.qyf.hangyi.core.flight;/' {} \;
find hangyi-core/src/main/java/com/qyf/hangyi/core/flight -name "*.java" -exec sed -i '' 's/import com\.qyf\.hangyi\.flight\./import com.qyf.hangyi.core.flight./g' {} \;
```

- [ ] **Step 2: 迁移 statistics 模块**

```bash
cp -r hangyi-statistics/src/main/java/com/qyf/hangyi/statistics/* \
      hangyi-core/src/main/java/com/qyf/hangyi/core/statistics/

find hangyi-core/src/main/java/com/qyf/hangyi/core/statistics -name "*.java" -exec sed -i '' 's/^package com\.qyf\.hangyi\.statistics;/package com.qyf.hangyi.core.statistics;/' {} \;
find hangyi-core/src/main/java/com/qyf/hangyi/core/statistics -name "*.java" -exec sed -i '' 's/import com\.qyf\.hangyi\.statistics\./import com.qyf.hangyi.core.statistics./g' {} \;
```

- [ ] **Step 3: Commit**

```bash
git add hangyi-core/src/main/java/com/qyf/hangyi/core/flight/ hangyi-core/src/main/java/com/qyf/hangyi/core/statistics/
git commit -m "feat(core): migrate flight and statistics modules to core"
```

---

### Task 5: 实现 Core 鉴权体系（JwtAuthFilter + CoreSecurityConfig）

**Files:**
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/config/JwtAuthFilter.java`
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/config/CoreSecurityConfig.java`
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/config/CoreMyBatisPlusConfig.java`

这是核心变更：废弃 X-User-* 头 + HMAC 签名模式，改为 Spring Security 标准 FilterChain。

- [ ] **Step 1: 创建 JwtAuthFilter.java**

```java
package com.qyf.hangyi.core.config;

import com.qyf.hangyi.core.auth.security.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Core 鉴权过滤器：从 Authorization 头解析 JWT，构造 SecurityContext。
 * 替代原来的 HeaderAuthFilter / HeaderSecurityContextRepository（X-User-* 头透传模式）。
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

    public JwtAuthFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);

        if (token != null && jwtUtil.isTokenValid(token)) {
            Long userId = jwtUtil.getUserId(token);
            String username = jwtUtil.getUsername(token);
            List<String> roles = jwtUtil.getRoles(token);

            List<SimpleGrantedAuthority> authorities = roles.stream()
                    .map(r -> new SimpleGrantedAuthority("ROLE_" + r.trim()))
                    .collect(Collectors.toList());

            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(userId, null, authorities);
            // 将 username 存入 details 供业务代码获取
            auth.setDetails(username);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        // 兼容 URL 参数 token（导出等场景）
        String tokenParam = request.getParameter("token");
        if (StringUtils.hasText(tokenParam)) {
            return tokenParam;
        }
        return null;
    }
}
```

- [ ] **Step 2: 创建 CoreSecurityConfig.java**

合并 auth/employee/flight/statistics 的 SecurityConfig 权限规则：

```java
package com.qyf.hangyi.core.config;

import com.qyf.hangyi.core.auth.security.JwtUtil;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class CoreSecurityConfig {

    @Bean
    public JwtAuthFilter jwtAuthFilter(JwtUtil jwtUtil) {
        return new JwtAuthFilter(jwtUtil);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                    JwtAuthFilter jwtAuthFilter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .authorizeHttpRequests(auth -> auth
                // === 公开端点 ===
                .requestMatchers("/api/auth/login", "/api/auth/register",
                    "/api/auth/wechat-login", "/api/auth/refresh",
                    "/api/auth/verify").permitAll()
                .requestMatchers("/api/sync/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()

                // === 审计日志：必须 ADMIN ===
                .requestMatchers("/api/audit/**").hasAuthority("ROLE_ADMIN")

                // === Employee PII 保护 ===
                .requestMatchers(HttpMethod.GET,
                    "/api/employees/list-all",
                    "/api/employees/list-by-group",
                    "/api/employees/{id}",
                    "/api/employees/list-by-ids",
                    "/api/employees/count",
                    "/api/employees/stats",
                    "/api/qualifications/page",
                    "/api/leaves/page"
                ).hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER", "ROLE_BOSS")

                // === Employee 字典类 GET ===
                .requestMatchers(HttpMethod.GET,
                    "/api/groups/list",
                    "/api/qualifications/employee/**",
                    "/api/qualifications/expiring",
                    "/api/qualifications/employee/batch",
                    "/api/aircraft-types/list**",
                    "/api/preferences/employee/**",
                    "/api/leaves/stats/pending"
                ).authenticated()

                // === Employee 写操作 ADMIN-only ===
                .requestMatchers(HttpMethod.POST, "/api/employees/**",
                    "/api/groups/**", "/api/qualifications/**",
                    "/api/aircraft-types/**", "/api/preferences/**",
                    "/api/leaves/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/employees/**",
                    "/api/groups/**", "/api/qualifications/**",
                    "/api/aircraft-types/**", "/api/preferences/**",
                    "/api/leaves/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/employees/**",
                    "/api/groups/**", "/api/qualifications/**",
                    "/api/aircraft-types/**").hasAuthority("ROLE_ADMIN")

                // === Flight / Statistics / Users GET ===
                .requestMatchers(HttpMethod.GET, "/api/flights/**",
                    "/api/statistics/**", "/api/dashboard/**",
                    "/api/users/**").authenticated()

                // === Flight / Statistics / Users 写操作 ===
                .requestMatchers(HttpMethod.POST, "/api/flights/**",
                    "/api/statistics/**", "/api/users/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/flights/**",
                    "/api/statistics/**", "/api/users/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/flights/**",
                    "/api/users/**").hasAuthority("ROLE_ADMIN")

                // === 其余 API ===
                .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                .anyRequest().authenticated()
            );
        return http.build();
    }
}
```

- [ ] **Step 3: 创建 CoreMyBatisPlusConfig.java**

合并各模块重复的 MyBatis-Plus 配置：

```java
package com.qyf.hangyi.core.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.qyf.hangyi.core")
public class CoreMyBatisPlusConfig {

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
```

- [ ] **Step 4: 删除 core 中各子模块独立的 SecurityConfig**

删除以下文件，统一由 CoreSecurityConfig 管理：
- `hangyi-core/src/main/java/com/qyf/hangyi/core/auth/security/AuthSecurityConfig.java`
- `hangyi-core/src/main/java/com/qyf/hangyi/core/employee/config/EmployeeSecurityConfig.java`
- `hangyi-core/src/main/java/com/qyf/hangyi/core/flight/config/FlightSecurityConfig.java`
- `hangyi-core/src/main/java/com/qyf/hangyi/core/statistics/config/StatisticsSecurityConfig.java`

```bash
rm hangyi-core/src/main/java/com/qyf/hangyi/core/auth/security/AuthSecurityConfig.java
rm hangyi-core/src/main/java/com/qyf/hangyi/core/employee/config/EmployeeSecurityConfig.java
rm hangyi-core/src/main/java/com/qyf/hangyi/core/flight/config/FlightSecurityConfig.java
# statistics 的 SecurityConfig 路径可能略有不同，检查后删除
find hangyi-core -name "*SecurityConfig.java" -not -path "*/config/CoreSecurityConfig.java" -delete
```

- [ ] **Step 5: Commit**

```bash
git add hangyi-core/src/main/java/com/qyf/hangyi/core/config/
git add -u
git commit -m "feat(core): implement JwtAuthFilter + CoreSecurityConfig, delete per-module SecurityConfigs"
```

---

### Task 6: 清理 common 模块（删除 X-User-* 相关代码）

**Files:**
- Delete: `hangyi-common/src/main/java/com/qyf/hangyi/common/config/HeaderAuthFilter.java`
- Delete: `hangyi-common/src/main/java/com/qyf/hangyi/common/config/HeaderSecurityContextRepository.java`
- Delete: `hangyi-common/src/main/java/com/qyf/hangyi/common/security/UserContextSigner.java`
- Modify: `hangyi-common/src/main/java/com/qyf/hangyi/common/config/FeignConfig.java`
- Modify: `hangyi-common/src/main/java/com/qyf/hangyi/common/constant/AuthConstant.java`

- [ ] **Step 1: 删除 HeaderAuthFilter 和 HeaderSecurityContextRepository**

```bash
rm hangyi-common/src/main/java/com/qyf/hangyi/common/config/HeaderAuthFilter.java
rm hangyi-common/src/main/java/com/qyf/hangyi/common/config/HeaderSecurityContextRepository.java
rm hangyi-common/src/main/java/com/qyf/hangyi/common/security/UserContextSigner.java
```

- [ ] **Step 2: 简化 FeignConfig — 改为透传 Authorization 头**

编辑 `hangyi-common/src/main/java/com/qyf/hangyi/common/config/FeignConfig.java`，替换为：

```java
package com.qyf.hangyi.common.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Feign 请求拦截器：透传当前请求的 Authorization 头到下游服务。
 * 下游 JwtAuthFilter 自行解析 JWT 建立 SecurityContext。
 */
@Configuration
@ConditionalOnClass(RequestInterceptor.class)
public class FeignConfig {

    @Bean
    public RequestInterceptor authorizationInterceptor() {
        return (RequestTemplate request) -> {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest httpRequest = attrs.getRequest();
                String authHeader = httpRequest.getHeader("Authorization");
                if (authHeader != null && authHeader.startsWith("Bearer ")) {
                    request.header("Authorization", authHeader);
                }
            }
        };
    }
}
```

- [ ] **Step 3: 更新 AuthConstant — 移除 X-User-* 常量**

编辑 `hangyi-common/src/main/java/com/qyf/hangyi/common/constant/AuthConstant.java`：

```java
package com.qyf.hangyi.common.constant;

public interface AuthConstant {
    String AUTHORIZATION_HEADER = "Authorization";
    String BEARER_PREFIX = "Bearer ";
    String TOKEN_PARAM = "token";

    interface Role {
        String ADMIN = "ADMIN";
        String BOSS = "BOSS";
        String TEAM_LEADER = "TEAM_LEADER";
        String STAFF = "STAFF";
    }
}
```

核心变更：删除 `X_USER_ID`、`X_USER_ROLES`、`X_USER_NAME` 三个常量。

- [ ] **Step 4: Commit**

```bash
git add hangyi-common/src/main/java/com/qyf/hangyi/common/
git add -u
git commit -m "refactor(common): remove X-User-* header auth, simplify FeignConfig to pass Authorization header"
```

---

### Task 7: 精简 Gateway（去掉 MyBatis + 简化 JWT 过滤）

**Files:**
- Modify: `hangyi-gateway/pom.xml`
- Modify: `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/filter/JwtAuthGlobalFilter.java`
- Modify: `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/config/JwtUtil.java`
- Modify: `hangyi-gateway/src/main/resources/application.yml`
- Delete: `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/config/GatewaySecurityConfig.java`

- [ ] **Step 1: 更新 hangyi-gateway/pom.xml — 去掉 MyBatis-Plus 和 MySQL**

编辑 `hangyi-gateway/pom.xml`，删除以下依赖块：

```xml
<!-- 删除这两段 -->
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    <version>${mybatis-plus.version}</version>
</dependency>
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <scope>runtime</scope>
</dependency>
```

添加 Sentinel 依赖：

```xml
<!-- 新增 -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-alibaba-sentinel-gateway</artifactId>
</dependency>
```

父 pom.xml 的 dependencyManagement 已经有 sentinel（通过 spring-cloud-alibaba-dependencies BOM），版本自动管理。

- [ ] **Step 2: 简化 JwtAuthGlobalFilter — 去掉 X-User-* 构造 + HMAC 签名，只透传 Authorization**

编辑 `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/filter/JwtAuthGlobalFilter.java`：

```java
package com.qyf.hangyi.gateway.filter;

import com.qyf.hangyi.common.constant.AuthConstant;
import com.qyf.hangyi.gateway.config.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

@Component
public class JwtAuthGlobalFilter implements GlobalFilter, Ordered {

    private static final List<String> WHITE_LIST = List.of(
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/wechat-login",
            "/api/auth/refresh",
            "/api/auth/verify",
            "/api/sync/",
            "/v3/api-docs",
            "/swagger-ui"
    );

    @Autowired
    private JwtUtil jwtUtil;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        boolean isWhiteListed = WHITE_LIST.stream().anyMatch(path::startsWith);
        if (isWhiteListed) {
            return chain.filter(exchange);
        }

        // 提取 token
        String token = null;
        HttpHeaders headers = exchange.getRequest().getHeaders();
        String authHeader = headers.getFirst(AuthConstant.AUTHORIZATION_HEADER);
        if (authHeader != null && authHeader.startsWith(AuthConstant.BEARER_PREFIX)) {
            token = authHeader.substring(7);
        }

        // 导出接口支持 URL 参数传递 token
        if (token == null && path.startsWith("/api/schedules/export")) {
            token = exchange.getRequest().getQueryParams().getFirst(AuthConstant.TOKEN_PARAM);
        }

        if (token == null || !jwtUtil.isTokenValid(token)) {
            ServerHttpResponse response = exchange.getResponse();
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return response.setComplete();
        }

        // 直接透传 Authorization 头给下游（Core/Schedule 自行解析 JWT）
        // 不再构造 X-User-* header，不再需要 HMAC 签名
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
```

- [ ] **Step 3: JwtUtil 保持现状（不需修改）**

Gateway 的 JwtUtil 只做 parseToken + isTokenValid + 黑名单检查，逻辑正确且不需要改。

- [ ] **Step 4: 更新 Gateway application.yml — 路由精简为 2 条 + 去掉 DB 配置 + 加 Sentinel**

编辑 `hangyi-gateway/src/main/resources/application.yml`：

```yaml
server:
  port: 8080

spring:
  application:
    name: hangyi-gateway
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
    gateway:
      routes:
        - id: core-service
          uri: http://core-service:8081
          predicates:
            - Path=/api/auth/**, /api/users/**, /api/employees/**, /api/groups/**, /api/qualifications/**, /api/aircraft-types/**, /api/leaves/**, /api/preferences/**, /api/flights/**, /api/sync/**, /api/reports/**, /api/audit/**, /api/statistics/**, /api/dashboard/**
          filters:
            - StripPrefix=0

        - id: schedule-service
          uri: http://schedule-service:8083
          predicates:
            - Path=/api/schedules/**, /api/schedule-changes/**, /api/shifts/**, /api/schedule-rules/**, /api/swap/**, /api/notifications/**, /api/service-schedules/**
          filters:
            - StripPrefix=0

      default-filters:
        - name: RequestRateLimiter
          args:
            redis-rate-limiter:
              replenishRate: 100
              burstCapacity: 200
              requestedTokens: 1

    sentinel:
      transport:
        dashboard: ${SENTINEL_DASHBOARD:localhost:8080}
      eager: true
      filter:
        enabled: true

  data:
    redis:
      host: localhost
      port: 6379
      timeout: 5000

jwt:
  secret: ${JWT_SECRET:?JWT_SECRET required in .env}

logging:
  level:
    com.qyf.hangyi.gateway: debug

---
spring:
  config:
    activate:
      on-profile: local
  cloud:
    gateway:
      routes:
        - id: core-service
          uri: lb://hangyi-core
        - id: schedule-service
          uri: lb://hangyi-schedule
```

- [ ] **Step 5: 删除 GatewaySecurityConfig（不再需要 WebFlux Security 兜底）**

Gateway 的 Security 兜底功能有限，JwtAuthGlobalFilter 已在 -100 顺序做 JWT 校验，不需要额外的 SecurityWebFilterChain。

```bash
rm hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/config/GatewaySecurityConfig.java
```

- [ ] **Step 6: 更新 Gateway Dockerfile — 去掉已删除模块的 pom 拷贝**

编辑 `hangyi-gateway/Dockerfile`：

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /build

COPY pom.xml ./
COPY hangyi-common/pom.xml ./hangyi-common/pom.xml
COPY hangyi-core/pom.xml ./hangyi-core/pom.xml
COPY hangyi-gateway/pom.xml ./hangyi-gateway/pom.xml
COPY hangyi-schedule/pom.xml ./hangyi-schedule/pom.xml
COPY mvnw ./
COPY .mvn ./.mvn
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw dependency:resolve-plugins dependency:go-offline -B -q || true

COPY hangyi-common/src ./hangyi-common/src
COPY hangyi-gateway/src ./hangyi-gateway/src
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw clean package -DskipTests -pl hangyi-common,hangyi-gateway -am -B

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S hangyi && adduser -S hangyi -G hangyi
USER hangyi
WORKDIR /app
COPY --from=builder /build/hangyi-gateway/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

- [ ] **Step 7: Commit**

```bash
git add hangyi-gateway/
git commit -m "refactor(gateway): remove MyBatis/MySQL deps, simplify JWT filter to pass-through, add Sentinel, merge routes"
```

---

### Task 8: Schedule 模块适配

**Files:**
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/client/EmployeeFeignClient.java`
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/client/FlightFeignClient.java`
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/client/QualificationFeignClient.java`
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/ScheduleSecurityConfig.java`
- Modify: `hangyi-schedule/src/main/resources/application.yml`
- Modify: `hangyi-schedule/Dockerfile`
- Modify: `hangyi-schedule/pom.xml`

- [ ] **Step 1: 更新 3 个 Feign 客户端 — name 改为 hangyi-core**

编辑 `EmployeeFeignClient.java`：
```java
@FeignClient(name = "hangyi-core", path = "/api/employees")
```

编辑 `FlightFeignClient.java`：
```java
@FeignClient(name = "hangyi-core", path = "/api/flights")
```

编辑 `QualificationFeignClient.java`：
```java
@FeignClient(name = "hangyi-core", contextId = "qualificationFeignClient", path = "/api/qualifications")
```

- [ ] **Step 2: 更新 ScheduleSecurityConfig — 适配新的鉴权模型**

当前 `ScheduleSecurityConfig` 依赖 `HeaderSecurityContextRepository`。改为使用自己的 `JwtAuthFilter` 解析 Authorization 头（与 Core 相同模式）。

在 schedule 模块中创建自己的 `JwtAuthFilter`（可以复用 common 的 jjwt 依赖，但不能直接依赖 core 的 JwtUtil）。

实际上，schedule 可以直接在 `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/` 下添加一个简单的 JwtAuthFilter + 自己的 JwtUtil bean。

**最小改动方案**：在 schedule 的 application.yml 中排除 SecurityAutoConfiguration，然后在 ScheduleSecurityConfig 中新增一个类似的 JwtAuthFilter。

编辑 `ScheduleSecurityConfig.java`：

```java
package com.qyf.hangyi.schedule.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class ScheduleSecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                    ScheduleJwtAuthFilter jwtAuthFilter) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**").permitAll()
                .requestMatchers("/api/schedules/export/**").hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER", "ROLE_BOSS")
                .requestMatchers(HttpMethod.POST, "/api/schedules/auto", "/api/schedules/smart",
                    "/api/schedules/smart-multi-day", "/api/schedules/smart-roles")
                    .hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER")
                .requestMatchers(HttpMethod.POST, "/api/swap/**").authenticated()
                .requestMatchers(HttpMethod.PUT, "/api/swap/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/shifts/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/shifts/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/shifts/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/schedule-changes/*/approve")
                    .hasAnyAuthority("ROLE_ADMIN", "ROLE_TEAM_LEADER")
                .requestMatchers(HttpMethod.POST, "/api/schedules/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/schedules/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/schedules/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                .anyRequest().authenticated());
        return http.build();
    }
}
```

- [ ] **Step 3: 创建 ScheduleJwtAuthFilter**

在 `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/ScheduleJwtAuthFilter.java` 新建：

```java
package com.qyf.hangyi.schedule.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class ScheduleJwtAuthFilter extends OncePerRequestFilter {

    @Value("${jwt.secret}")
    private String secret;

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    @SuppressWarnings("unchecked")
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);

        if (token != null) {
            try {
                Claims claims = Jwts.parser()
                        .verifyWith(getSigningKey())
                        .build()
                        .parseSignedClaims(token)
                        .getPayload();

                Long userId = Long.parseLong(claims.getSubject());
                String username = claims.get("username", String.class);
                List<String> roles = claims.get("roles", List.class);

                List<SimpleGrantedAuthority> authorities = roles.stream()
                        .map(r -> new SimpleGrantedAuthority("ROLE_" + r.trim()))
                        .collect(Collectors.toList());

                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(userId, null, authorities);
                auth.setDetails(username);
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (Exception e) {
                // token 无效 → SecurityContext 为空（等同于未认证）
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        String tokenParam = request.getParameter("token");
        if (StringUtils.hasText(tokenParam)) {
            return tokenParam;
        }
        return null;
    }
}
```

- [ ] **Step 4: 更新 schedule application.yml — local profile Feign URL 指向 core**

编辑 `hangyi-schedule/src/main/resources/application.yml` 的 local profile 部分：

```yaml
---
spring:
  config:
    activate:
      on-profile: local
  cloud:
    nacos:
      discovery:
        enabled: false
    openfeign:
      client:
        config:
          hangyi-core:
            url: http://localhost:8081

internal:
  api-key: ${INTERNAL_API_KEY:}
```

需要为 schedule 加 jwt.secret 配置：

```yaml
jwt:
  secret: ${JWT_SECRET:?JWT_SECRET required in .env}
```

- [ ] **Step 5: 更新 schedule pom.xml — 加 jjwt 依赖**

schedule 原来通过 common 模块间接获得 jjwt，但 common 不直接依赖 jjwt（它只是配置层）。schedule 需要显式添加 jjwt 依赖用于 JwtAuthFilter 解析 token：

在 `hangyi-schedule/pom.xml` 的 `<dependencies>` 中添加：

```xml
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <scope>runtime</scope>
</dependency>
```

- [ ] **Step 6: 更新 schedule Dockerfile — 去掉已删除模块的 pom 拷贝**

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /build

COPY pom.xml ./
COPY hangyi-common/pom.xml ./hangyi-common/pom.xml
COPY hangyi-core/pom.xml ./hangyi-core/pom.xml
COPY hangyi-gateway/pom.xml ./hangyi-gateway/pom.xml
COPY hangyi-schedule/pom.xml ./hangyi-schedule/pom.xml
COPY mvnw ./
COPY .mvn ./.mvn
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw dependency:resolve-plugins dependency:go-offline -B -q || true

COPY hangyi-common/src ./hangyi-common/src
COPY hangyi-schedule/src ./hangyi-schedule/src
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw clean package -DskipTests -pl hangyi-common,hangyi-schedule -am -B

FROM eclipse-temurin:21-jdk-alpine
RUN addgroup -S hangyi && adduser -S hangyi -G hangyi
USER hangyi
WORKDIR /app
COPY --from=builder /build/hangyi-schedule/target/*.jar app.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "app.jar"]
```

注意：schedule 的运行时镜像从 `jre-alpine` 改为 `jdk-alpine`（OptaPlanner Drools 编译器需要 tools.jar）。

- [ ] **Step 7: Commit**

```bash
git add hangyi-schedule/
git commit -m "refactor(schedule): adapt Feign clients to core, add JwtAuthFilter, update config"
```

---

### Task 9: 引入 RabbitMQ

**Files:**
- Modify: `hangyi-core/pom.xml`
- Modify: `hangyi-schedule/pom.xml`
- Create: `hangyi-core/src/main/java/com/qyf/hangyi/core/config/RabbitMQConfig.java`
- Create: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/RabbitMQConfig.java`
- Modify: `docker-compose.yml`
- Modify: `hangyi-core/src/main/resources/application.yml`
- Modify: `hangyi-schedule/src/main/resources/application.yml`

- [ ] **Step 1: 添加 RabbitMQ 依赖到 core 和 schedule pom.xml**

在 `hangyi-core/pom.xml` 和 `hangyi-schedule/pom.xml` 的 `<dependencies>` 中添加：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>
```

- [ ] **Step 2: 创建 core 的 RabbitMQConfig**

`hangyi-core/src/main/java/com/qyf/hangyi/core/config/RabbitMQConfig.java`：

```java
package com.qyf.hangyi.core.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String EXCHANGE = "hangyi.events";
    public static final String QUEUE_SCHEDULE_EVENTS = "core.schedule-events";
    public static final String ROUTING_KEY_SCHEDULE = "schedule.*";

    @Bean
    public TopicExchange hangyiExchange() {
        return new TopicExchange(EXCHANGE);
    }

    @Bean
    public Queue scheduleEventsQueue() {
        return new Queue(QUEUE_SCHEDULE_EVENTS, true);
    }

    @Bean
    public Binding scheduleEventsBinding() {
        return BindingBuilder.bind(scheduleEventsQueue())
                .to(hangyiExchange())
                .with(ROUTING_KEY_SCHEDULE);
    }
}
```

- [ ] **Step 3: 创建 schedule 的 RabbitMQConfig**

`hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/RabbitMQConfig.java`：

```java
package com.qyf.hangyi.schedule.config;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String EXCHANGE = "hangyi.events";

    @Bean
    public TopicExchange hangyiExchange() {
        return new TopicExchange(EXCHANGE);
    }

    @Bean
    public ScheduleEventPublisher scheduleEventPublisher(RabbitTemplate rabbitTemplate) {
        return new ScheduleEventPublisher(rabbitTemplate);
    }
}
```

创建 `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/ScheduleEventPublisher.java`：

```java
package com.qyf.hangyi.schedule.config;

import org.springframework.amqp.rabbit.core.RabbitTemplate;

public class ScheduleEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    public ScheduleEventPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void publishScheduleCreated(Long scheduleId) {
        rabbitTemplate.convertAndSend("hangyi.events", "schedule.created", scheduleId);
    }

    public void publishSchedulePublished(Long scheduleId) {
        rabbitTemplate.convertAndSend("hangyi.events", "schedule.published", scheduleId);
    }

    public void publishSwapApproved(Long swapId) {
        rabbitTemplate.convertAndSend("hangyi.events", "swap.approved", swapId);
    }
}
```

- [ ] **Step 4: 更新 core 和 schedule 的 application.yml 添加 RabbitMQ 配置**

在 `hangyi-core/src/main/resources/application.yml` 添加：

```yaml
spring:
  rabbitmq:
    host: ${RABBITMQ_HOST:localhost}
    port: ${RABBITMQ_PORT:5672}
    username: ${RABBITMQ_USER:guest}
    password: ${RABBITMQ_PASS:guest}
```

在 `hangyi-schedule/src/main/resources/application.yml` 做同样添加。

- [ ] **Step 5: 更新 docker-compose.yml 添加 RabbitMQ 服务**

在 `docker-compose.yml` 的 `services:` 中添加：

```yaml
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: hangyi-rabbitmq
    restart: unless-stopped
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
```

在 volumes 中添加 `rabbitmq-data:`。

- [ ] **Step 6: Commit**

```bash
git add hangyi-core/pom.xml hangyi-core/src/main/java/com/qyf/hangyi/core/config/RabbitMQConfig.java
git add hangyi-schedule/pom.xml hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/config/
git add hangyi-core/src/main/resources/application.yml hangyi-schedule/src/main/resources/application.yml
git add docker-compose.yml
git commit -m "feat(mq): add RabbitMQ support with schedule event publishing"
```

---

### Task 10: 重构 docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 重写 docker-compose.yml**

完整替换为 3 服务 + 5 基础设施：

```yaml
services:

  # ===== 数据库 =====
  mysql:
    image: mysql:8.0
    container_name: hangyi-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD:-hangyi123}
      MYSQL_DATABASE: hangyi_scheduling
      TZ: Asia/Shanghai
    ports:
      - "3307:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./db/01-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./db/charset.cnf:/etc/mysql/conf.d/charset.cnf:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_PASSWORD:-hangyi123}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: hangyi-redis
    restart: unless-stopped
    ports:
      - "6380:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: hangyi-rabbitmq
    restart: unless-stopped
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

  nacos:
    image: nacos/nacos-server:v2.4.3
    container_name: hangyi-nacos
    restart: unless-stopped
    ports:
      - "8848:8848"
      - "9848:9848"
    environment:
      MODE: standalone
      PREFER_HOST_MODE: hostname
    depends_on:
      mysql:
        condition: service_healthy

  migration:
    image: mysql:8.0
    container_name: hangyi-migration
    restart: "no"
    entrypoint: sh /migrations/migrate.sh
    volumes:
      - ./db/migrate.sh:/migrations/migrate.sh:ro
    depends_on:
      mysql:
        condition: service_healthy

  # ===== 3 个应用服务 =====

  gateway:
    build:
      context: .
      dockerfile: hangyi-gateway/Dockerfile
    container_name: hangyi-gateway
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "8080:8080"
    environment:
      SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR: nacos:8848
      SPRING_DATA_REDIS_HOST: redis
      TZ: Asia/Shanghai
    depends_on:
      nacos:
        condition: service_started
      redis:
        condition: service_healthy
      migration:
        condition: service_completed_successfully

  core-service:
    build:
      context: .
      dockerfile: hangyi-core/Dockerfile
    container_name: hangyi-core
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "8081"
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/hangyi_scheduling?serverTimezone=Asia/Shanghai
      SPRING_DATASOURCE_USERNAME: root
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD:-hangyi123}
      SPRING_DATA_REDIS_HOST: redis
      SPRING_RABBITMQ_HOST: rabbitmq
      SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR: nacos:8848
      TZ: Asia/Shanghai
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      nacos:
        condition: service_started

  schedule-service:
    build:
      context: .
      dockerfile: hangyi-schedule/Dockerfile
    container_name: hangyi-schedule
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "8083"
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/hangyi_scheduling?serverTimezone=Asia/Shanghai
      SPRING_DATASOURCE_USERNAME: root
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD:-hangyi123}
      SPRING_RABBITMQ_HOST: rabbitmq
      SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR: nacos:8848
      TZ: Asia/Shanghai
    depends_on:
      mysql:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      nacos:
        condition: service_started

  frontend:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: hangyi-frontend
    restart: unless-stopped
    ports:
      - "8089:80"
    depends_on:
      - gateway

volumes:
  mysql-data:
  redis-data:
  rabbitmq-data:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "refactor(compose): simplify to 3 services (gateway+core+schedule), add RabbitMQ"
```

---

### Task 11: 删除旧模块目录 + 更新其他 Dockerfile

**Files:**
- Delete: `hangyi-auth/` （整个模块）
- Delete: `hangyi-employee/` （整个模块）
- Delete: `hangyi-flight/` （整个模块）
- Delete: `hangyi-statistics/` （整个模块）

- [ ] **Step 1: 删除旧模块目录**

```bash
git rm -r hangyi-auth/
git rm -r hangyi-employee/
git rm -r hangyi-flight/
git rm -r hangyi-statistics/
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor: remove old auth/employee/flight/statistics modules (merged into core)"
```

---

### Task 12: 编译验证 + 修复编译错误

**Files:** 各模块中可能受包名变更影响的 import 语句

- [ ] **Step 1: 编译 core 模块**

```bash
cd /Users/qyf/IdeaProjects/hangyi
mvn compile -pl hangyi-common,hangyi-core -am -DskipTests
```

修复所有编译错误：
- 包名引用错误（import com.qyf.hangyi.auth.xxx → com.qyf.hangyi.core.auth.xxx）
- SyncService 中引用 Employee 等实体（保留 auth 模块的旧 import 时注意路径）
- MyBatis MapperScan 范围不足导致未扫描到 Mapper

遍历错误日志逐一修复。

- [ ] **Step 2: 编译 gateway 和 schedule 模块**

```bash
mvn compile -pl hangyi-common,hangyi-core,hangyi-gateway,hangyi-schedule -DskipTests
```

修复剩余编译错误。

- [ ] **Step 3: 全量编译验证**

```bash
mvn compile -DskipTests
```

预期：BUILD SUCCESS。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve compilation errors after module merge"
```

---

### Task 13: Docker 构建 + 冒烟测试

**Files:** 无新建，仅验证

- [ ] **Step 1: 清理旧容器和镜像**

```bash
docker compose down -v
```

- [ ] **Step 2: 启动所有服务**

```bash
docker compose up -d --build
```

- [ ] **Step 3: 检查各服务健康状态**

```bash
docker compose ps
```

预期输出：所有服务 `Up`（healthy / running）。

- [ ] **Step 4: 冒烟测试 — 登录**

```bash
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

预期：返回 `code: 200`，包含 `token` 和 `refreshToken`。

- [ ] **Step 5: 冒烟测试 — 用 token 访问受保护资源**

```bash
TOKEN="<Step4 获取到的 token>"
curl -s http://localhost:8080/api/employees/list-all \
  -H "Authorization: Bearer $TOKEN"
```

预期：返回员工列表。

- [ ] **Step 6: 冒烟测试 — 未认证请求被拒绝**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/employees/list-all
```

预期：`401`

- [ ] **Step 7: 冒烟测试 — 访问 schedule 端点**

```bash
curl -s http://localhost:8080/api/schedules/page?page=1\&size=10 \
  -H "Authorization: Bearer $TOKEN"
```

预期：返回排班列表。

- [ ] **Step 8: 冒烟测试 — 访问前端**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8089
```

预期：`200`（返回 index.html）

- [ ] **Step 9: 检查 RabbitMQ 管理面板可访问**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:15672
```

预期：`200`

---

## 验证清单

实施完成后，逐项确认：

- [ ] `mvn compile -DskipTests` 全量通过
- [ ] `docker compose up -d --build` 无错误启动
- [ ] `docker compose ps` 所有服务 healthy
- [ ] `/api/auth/login` — 登录成功返回 token
- [ ] `/api/employees/list-all` — 带 token 返回 200；无 token 返回 401
- [ ] `/api/schedules/page` — 带 token 返回 200
- [ ] `/api/flights/page` — 带 token 返回 200
- [ ] `/api/statistics/schedules` — 带 token 返回 200
- [ ] 前端 `http://localhost:8089` 可访问
- [ ] RabbitMQ 管理面板 `http://localhost:15672` 可访问
- [ ] Gateway 日志中无 MyBatis/MySQL 相关错误
- [ ] Core 日志中 JwtAuthFilter 正常工作
- [ ] Nacos 控制台可看到 3 个服务（hangyi-gateway, hangyi-core, hangyi-schedule）
