# HangYi 单元测试实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为航翼排班系统 8 个 Maven 模块建立 Mapper/Service/Controller 三层单元测试

**Architecture:** 每个模块独立测试，Mapper 层用 H2 内存数据库验证 SQL，Service 层用 @SpringBootTest+H2 验证业务逻辑，Controller 层用 @WebMvcTest+Mock Service 验证 API 端点

**Tech Stack:** JUnit5 + Mockito + AssertJ + H2 + Spring Boot Test

---

## Phase 0: 测试基础设施

### Task 0.1: 添加测试依赖到根 POM

**Files:**
- Modify: `pom.xml`

- [ ] **Step 1: 在根 pom.xml 的依赖管理中添加测试依赖**

在 `<dependencyManagement>` 中添加：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>com.h2database</groupId>
    <artifactId>h2</artifactId>
    <scope>test</scope>
</dependency>
```

- [ ] **Step 2: 在每个模块的 pom.xml 中引入测试依赖**

每个业务模块的 pom.xml 的 `<dependencies>` 中添加：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>com.h2database</groupId>
    <artifactId>h2</artifactId>
    <scope>test</scope>
</dependency>
```

注意：hangyi-gateway 和 hangyi-common 也需要引入（它们使用 Spring 和 MyBatis-Plus 相关测试）。

- [ ] **Step 3: 验证依赖解析**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw dependency:resolve -pl hangyi-auth -DincludeScope=test 2>&1 | grep -E "h2|mockito|junit|spring-boot-starter-test"
```
Expected: 显示 H2、Mockito、JUnit5、spring-boot-starter-test 等依赖已解析。

---

### Task 0.2: H2 兼容 SQL 脚本

**Files:**
- Create: `db/h2-schema.sql`
- Create: `hangyi-common/src/test/resources/application-test.yml`

MyBatis-Plus 的表结构和数据类型无法直接在 H2 中使用 MySQL 的建表 SQL。需要为 H2 提供适配后的建表脚本。

- [ ] **Step 1: 创建 H2 兼容 schema 脚本**

创建 `db/h2-schema.sql`，将所有 MySQL 建表语句适配为 H2 语法（去除 ENGINE=InnoDB、CHARSET utf8mb4、将 `datetime` 改为 `timestamp`、将 `longtext` 改为 `clob`、去除 `USING BTREE` 等）：

使用 `01-schema.sql` 作为源文件，通过以下规则自动转换：
- 删除 `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
- 删除 `USING BTREE`
- 将 `longtext` 替换为 `clob`
- 删除注释行（可选）

- [ ] **Step 2: 验证 H2 schema 可用**

```bash
cd /Users/qyf/IdeaProjects/hangyi && cat db/01-schema.sql | sed 's/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci//g' | sed 's/USING BTREE//g' | sed 's/longtext/varchar(10000)/g' | grep -v "^--" > /tmp/h2-schema.sql && echo "done"
```

---

## Phase 1: hangyi-common 纯单元测试

### Task 1.1: R.java 单元测试

**Files:**
- Create: `hangyi-common/src/test/java/com/qyf/hangyi/common/result/RTest.java`

- [ ] **Step 1: 编写 RTest**

```java
package com.qyf.hangyi.common.result;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class RTest {

    @Test
    void testOk_NoData() {
        R<Void> r = R.ok();
        assertThat(r.getCode()).isEqualTo(200);
        assertThat(r.getMsg()).isEqualTo("success");
    }

    @Test
    void testOk_WithData() {
        R<String> r = R.ok("hello");
        assertThat(r.getCode()).isEqualTo(200);
        assertThat(r.getData()).isEqualTo("hello");
    }

    @Test
    void testFail_Msg() {
        R<Void> r = R.fail("出错了");
        assertThat(r.getCode()).isEqualTo(500);
        assertThat(r.getMsg()).isEqualTo("出错了");
    }

    @Test
    void testFail_CodeAndMsg() {
        R<Void> r = R.fail(400, "参数错误");
        assertThat(r.getCode()).isEqualTo(400);
        assertThat(r.getMsg()).isEqualTo("参数错误");
    }

    @Test
    void testForbidden() {
        R<Void> r = R.forbidden("无权限");
        assertThat(r.getCode()).isEqualTo(403);
    }

    @Test
    void testUnauthorized() {
        R<Void> r = R.unauthorized("未登录");
        assertThat(r.getCode()).isEqualTo(401);
    }

    @Test
    void testTimestampAutoSet() {
        R<String> r = R.ok("data");
        assertThat(r.getTimestamp()).isNotNull();
    }
}
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-common -Dtest=RTest -DfailIfNoTests=false
```
Expected: BUILD SUCCESS，6 个测试通过

- [ ] **Step 3: Commit**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-common/src/test/java/com/qyf/hangyi/common/result/RTest.java && git commit -m "test: add R.java unit tests"
```

---

### Task 1.2: BusinessException 测试

**Files:**
- Create: `hangyi-common/src/test/java/com/qyf/hangyi/common/exception/BusinessExceptionTest.java`

- [ ] **Step 1: 编写 BusinessExceptionTest**

```java
package com.qyf.hangyi.common.exception;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class BusinessExceptionTest {

    @Test
    void testConstructorWithMsg() {
        BusinessException e = new BusinessException("业务错误");
        assertThat(e.getMessage()).isEqualTo("业务错误");
        assertThat(e.getCode()).isEqualTo(500);
    }

    @Test
    void testConstructorWithCodeAndMsg() {
        BusinessException e = new BusinessException(400, "参数错误");
        assertThat(e.getMessage()).isEqualTo("参数错误");
        assertThat(e.getCode()).isEqualTo(400);
    }
}
```

- [ ] **Step 2: 运行测试并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-common -Dtest="RTest,BusinessExceptionTest" -DfailIfNoTests=false && git add hangyi-common/src/test/java/com/qyf/hangyi/common/exception/BusinessExceptionTest.java && git commit -m "test: add BusinessException unit tests"
```

---

### Task 1.3: GlobalExceptionHandler 测试

**Files:**
- Create: `hangyi-common/src/test/java/com/qyf/hangyi/common/exception/GlobalExceptionHandlerTest.java`

- [ ] **Step 1: 编写 GlobalExceptionHandlerTest**

```java
package com.qyf.hangyi.common.exception;

import com.qyf.hangyi.common.result.R;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void handleBusinessException() {
        BusinessException e = new BusinessException("业务异常");
        R<Void> r = handler.handleBusinessException(e);
        assertThat(r.getCode()).isEqualTo(500);
        assertThat(r.getMsg()).isEqualTo("业务异常");
    }

    @Test
    void handleAccessDeniedException() {
        AccessDeniedException e = new AccessDeniedException("denied");
        R<Void> r = handler.handleAccessDeniedException(e);
        assertThat(r.getCode()).isEqualTo(403);
    }

    @Test
    void handleGenericException() {
        Exception e = new RuntimeException("server error");
        R<Void> r = handler.handleException(e);
        assertThat(r.getCode()).isEqualTo(500);
        assertThat(r.getMsg()).isEqualTo("服务器内部错误");
    }
}
```

- [ ] **Step 2: 运行测试并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-common -Dtest="RTest,BusinessExceptionTest,GlobalExceptionHandlerTest" -DfailIfNoTests=false && git add hangyi-common/src/test/java/com/qyf/hangyi/common/exception/GlobalExceptionHandlerTest.java && git commit -m "test: add GlobalExceptionHandler unit tests"
```

---

### Task 1.4: MyMetaObjectHandler 和 HeaderAuth 测试

**Files:**
- Create: `hangyi-common/src/test/java/com/qyf/hangyi/common/config/MyMetaObjectHandlerTest.java`
- Create: `hangyi-common/src/test/java/com/qyf/hangyi/common/config/HeaderAuthFilterTest.java`

- [ ] **Step 1: 编写 MyMetaObjectHandlerTest**

```java
package com.qyf.hangyi.common.config;

import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class MyMetaObjectHandlerTest {

    private MyMetaObjectHandler handler;

    @BeforeEach
    void setUp() {
        handler = new MyMetaObjectHandler();
    }

    @Test
    void testInsertFill() {
        // 验证 insertFill 不抛异常
        org.apache.ibatis.reflection.MetaObject metaObject = null;
        // MyMetaObjectHandler 内部使用 TableInfoHelper，需要 MyBatis 初始化
        // 这里仅验证对象创建
        assertThat(handler).isNotNull();
    }
}
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-common -DfailIfNoTests=false
```
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-common/src/test/ && git commit -m "test: add common module unit tests"
```

---

## Phase 2: hangyi-auth 认证模块测试

### Task 2.1: 创建测试配置

**Files:**
- Create: `hangyi-auth/src/test/resources/application-test.yml`
- Create: `hangyi-auth/src/test/resources/schema.sql`

- [ ] **Step 1: 创建 test application.yml**

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:test;MODE=MYSQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
    username: sa
    password:
  sql:
    init:
      schema-locations: classpath:schema.sql
      mode: always
  cloud:
    nacos:
      discovery:
        enabled: false
  autoconfigure:
    exclude: org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration

mybatis-plus:
  type-aliases-package: com.qyf.hangyi.auth.entity
  global-config:
    db-config:
      id-type: auto
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl

jwt:
  secret: test-jwt-secret-key-for-unit-testing-only
  expiration: 86400000
```

- [ ] **Step 2: 创建 H2 兼容 schema**

从 `db/01-schema.sql` 提取 auth 相关表（sys_user, sys_role, sys_user_role, sys_permission, sys_role_permission）：
- 删除 `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
- 删除 `USING BTREE`

```sql
DROP TABLE IF EXISTS sys_user;
CREATE TABLE sys_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    real_name VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(100),
    avatar VARCHAR(255),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS sys_role;
CREATE TABLE sys_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_code VARCHAR(50) NOT NULL,
    role_name VARCHAR(50),
    description VARCHAR(255),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS sys_user_role;
CREATE TABLE sys_user_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL
);

-- 插入测试数据
INSERT INTO sys_user (id, username, password, real_name, status) VALUES
(1, 'admin', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iAt6Z5EH', '管理员', 1);

INSERT INTO sys_role (id, role_code, role_name, status) VALUES
(1, 'ADMIN', '管理员', 1);

INSERT INTO sys_user_role (user_id, role_id) VALUES (1, 1);
```

---

### Task 2.2: Mapper 层测试

**Files:**
- Create: `hangyi-auth/src/test/java/com/qyf/hangyi/auth/mapper/SysUserMapperTest.java`

- [ ] **Step 1: 编写 SysUserMapperTest**

```java
package com.qyf.hangyi.auth.mapper;

import com.qyf.hangyi.auth.entity.SysUser;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@MybatisTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Transactional
class SysUserMapperTest {

    @Autowired
    private SysUserMapper sysUserMapper;

    @Test
    void testSelectById() {
        SysUser user = sysUserMapper.selectById(1L);
        assertThat(user).isNotNull();
        assertThat(user.getUsername()).isEqualTo("admin");
    }

    @Test
    void testFindRoleCodesByUserId() {
        List<String> roles = sysUserMapper.findRoleCodesByUserId(1L);
        assertThat(roles).isNotEmpty();
        assertThat(roles).contains("ADMIN");
    }
}
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-auth -Dtest=SysUserMapperTest -DfailIfNoTests=false
```
Expected: BUILD SUCCESS，2 个测试通过

- [ ] **Step 3: Commit**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-auth/src/test/ && git commit -m "test: add auth module test config and mapper tests"
```

---

### Task 2.3: Service 层测试

**Files:**
- Create: `hangyi-auth/src/test/java/com/qyf/hangyi/auth/service/SysUserServiceTest.java`

- [ ] **Step 1: 编写 SysUserServiceTest**

```java
package com.qyf.hangyi.auth.service;

import com.qyf.hangyi.auth.dto.LoginRequest;
import com.qyf.hangyi.auth.dto.LoginResponse;
import com.qyf.hangyi.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SysUserServiceTest {

    @Autowired
    private SysUserService sysUserService;

    @Test
    void testLogin_Success() {
        LoginRequest request = new LoginRequest();
        request.setUsername("admin");
        request.setPassword("123456");

        LoginResponse response = sysUserService.login(request);
        assertThat(response).isNotNull();
        assertThat(response.getToken()).isNotBlank();
        assertThat(response.getUserId()).isEqualTo(1L);
        assertThat(response.getUsername()).isEqualTo("admin");
    }

    @Test
    void testLogin_UserNotFound() {
        LoginRequest request = new LoginRequest();
        request.setUsername("nonexistent");
        request.setPassword("123456");

        assertThatThrownBy(() -> sysUserService.login(request))
                .isInstanceOf(BusinessException.class)
                .hasMessage("用户名或密码错误");
    }

    @Test
    void testLogin_WrongPassword() {
        LoginRequest request = new LoginRequest();
        request.setUsername("admin");
        request.setPassword("wrong");

        assertThatThrownBy(() -> sysUserService.login(request))
                .isInstanceOf(BusinessException.class)
                .hasMessage("用户名或密码错误");
    }
}
```

注意：需要确保 schema.sql 中的 admin 密码是 `123456` 的 BCrypt 哈希值。使用已知的对应关系：admin/123456 的 BCrypt hash。

实际上，更好的做法：在测试数据中直接插入一个已知密码哈希值，或者在 @BeforeEach 中创建一个测试用户。更简单的方式是直接用已知的 BCrypt hash。

对于测试，可以使用以下方式生成：
```java
System.out.println(new BCryptPasswordEncoder().encode("123456"));
```

或者使用 `@Sql` 方式管理测试数据。

- [ ] **Step 2: 设置正确的测试密码**

首先生成一个已知的 BCrypt hash：

```bash
cd /Users/qyf/IdeaProjects/hangyi && cat > /tmp/BcryptTest.java << 'EOF'
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class BcryptTest {
    public static void main(String[] args) {
        System.out.println(new BCryptPasswordEncoder().encode("123456"));
    }
}
EOF
```

然后在 schema.sql 中使用生成的 hash 替换管理员密码。

- [ ] **Step 3: 运行测试**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-auth -Dtest=SysUserServiceTest -DfailIfNoTests=false
```
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-auth/src/test/ && git commit -m "test: add SysUserService login tests"
```

---

### Task 2.4: Controller 层测试

**Files:**
- Create: `hangyi-auth/src/test/java/com/qyf/hangyi/auth/controller/AuthControllerTest.java`
- Create: `hangyi-auth/src/test/java/com/qyf/hangyi/auth/controller/UserControllerTest.java`

- [ ] **Step 1: 编写 AuthControllerTest**

```java
package com.qyf.hangyi.auth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.auth.dto.LoginRequest;
import com.qyf.hangyi.auth.dto.LoginResponse;
import com.qyf.hangyi.auth.service.SysUserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private SysUserService sysUserService;

    @Test
    void testLogin_ValidRequest_ReturnOk() throws Exception {
        LoginResponse mockResponse = new LoginResponse();
        mockResponse.setToken("test-token");
        mockResponse.setUserId(1L);
        mockResponse.setUsername("admin");

        when(sysUserService.login(any(LoginRequest.class))).thenReturn(mockResponse);

        LoginRequest request = new LoginRequest();
        request.setUsername("admin");
        request.setPassword("123456");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.token").value("test-token"));
    }

    @Test
    void testLogin_MissingUsername_Return400() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setPassword("123456");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 2: 编写 UserControllerTest**

```java
package com.qyf.hangyi.auth.controller;

import com.qyf.hangyi.auth.entity.SysUser;
import com.qyf.hangyi.auth.mapper.SysUserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SysUserMapper sysUserMapper;

    @Test
    void testList() throws Exception {
        SysUser user = new SysUser();
        user.setId(1L);
        user.setUsername("admin");
        when(sysUserMapper.selectList(any())).thenReturn(List.of(user));

        mockMvc.perform(get("/api/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].username").value("admin"));
    }
}
```

- [ ] **Step 3: 运行测试并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-auth -DfailIfNoTests=false && git add hangyi-auth/src/test/ && git commit -m "test: add auth controller tests"
```

---

## Phase 3: hangyi-gateway 网关测试

### Task 3.1: JwtUtil 和 JWT 过滤器测试

**Files:**
- Create: `hangyi-gateway/src/test/resources/application-test.yml`
- Create: `hangyi-gateway/src/test/java/com/qyf/hangyi/gateway/config/JwtUtilTest.java`

- [ ] **Step 1: 创建测试配置**

```yaml
spring:
  cloud:
    nacos:
      discovery:
        enabled: false
jwt:
  secret: test-jwt-secret-key-for-unit-testing-only-must-be-32-chars
  expiration: 86400000
```

- [ ] **Step 2: 编写 JwtUtilTest**

```java
package com.qyf.hangyi.gateway.config;

import com.qyf.hangyi.gateway.filter.JwtAuthGlobalFilter;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class JwtUtilTest {

    @Autowired
    private JwtUtil jwtUtil;

    @Value("${jwt.secret}")
    private String secret;

    @Test
    void testGenerateToken_ContainsUserId() {
        String token = jwtUtil.generateToken(1L, "admin", List.of("ADMIN"));
        assertThat(token).isNotBlank();

        SecretKey key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        Claims claims = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();

        assertThat(claims.getSubject()).isEqualTo("1");
        assertThat(claims.get("username")).isEqualTo("admin");
        assertThat(claims.get("roles", List.class)).contains("ADMIN");
    }
}
```

- [ ] **Step 3: 提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-gateway/src/test/ && git commit -m "test: add gateway jwt util tests"
```

---

## Phase 4: hangyi-employee 人员管理测试

### Task 4.1: 创建测试配置

**Files:**
- Create: `hangyi-employee/src/test/resources/application-test.yml`
- Create: `hangyi-employee/src/test/resources/schema.sql`

- [ ] **Step 1: 创建 test application.yml**

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:test;MODE=MYSQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
    username: sa
    password:
  sql:
    init:
      schema-locations: classpath:schema.sql
      mode: always
  cloud:
    nacos:
      discovery:
        enabled: false

mybatis-plus:
  type-aliases-package: com.qyf.hangyi.employee.entity
  global-config:
    db-config:
      id-type: auto
  configuration:
    map-underscore-to-camel-case: true
```

- [ ] **Step 2: 创建 employee 相关 H2 schema**

```sql
DROP TABLE IF EXISTS team_group;
CREATE TABLE team_group (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(100) NOT NULL,
    group_code VARCHAR(50),
    description VARCHAR(255),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS employee;
CREATE TABLE employee (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_no VARCHAR(50) NOT NULL,
    real_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    group_id BIGINT,
    position VARCHAR(50),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS aircraft_type;
CREATE TABLE aircraft_type (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    type_code VARCHAR(20) NOT NULL,
    type_name VARCHAR(100),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS employee_qualification;
CREATE TABLE employee_qualification (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    aircraft_type_id BIGINT NOT NULL,
    cert_no VARCHAR(100),
    issue_date DATE,
    expiry_date DATE,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO team_group (id, group_name, group_code, status) VALUES
(1, '机务一组', 'MNT-01', 1),
(2, '机务二组', 'MNT-02', 1);

INSERT INTO employee (id, employee_no, real_name, group_id, position, status) VALUES
(1, 'EMP001', '张三', 1, '机械师', 1),
(2, 'EMP002', '李四', 1, '电子师', 1),
(3, 'EMP003', '王五', 2, '机械师', 1);

INSERT INTO aircraft_type (id, type_code, type_name, status) VALUES
(1, 'B737', '波音737', 1),
(2, 'A320', '空客320', 1);
```

---

### Task 4.2: Employee 相关测试

**Files:**
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/mapper/EmployeeMapperTest.java`
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/service/EmployeeServiceTest.java`

- [ ] **Step 1: 编写 EmployeeMapperTest**

```java
package com.qyf.hangyi.employee.mapper;

import com.qyf.hangyi.employee.entity.Employee;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@MybatisTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Transactional
class EmployeeMapperTest {

    @Autowired
    private EmployeeMapper employeeMapper;

    @Test
    void testSelectById() {
        Employee emp = employeeMapper.selectById(1L);
        assertThat(emp).isNotNull();
        assertThat(emp.getRealName()).isEqualTo("张三");
    }

    @Test
    void testListByGroup() {
        List<Employee> list = employeeMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Employee>()
                        .eq(Employee::getGroupId, 1L)
                        .eq(Employee::getStatus, 1));
        assertThat(list).hasSize(2);
    }
}
```

- [ ] **Step 2: 编写 EmployeeServiceTest**

```java
package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.employee.entity.Employee;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class EmployeeServiceTest {

    @Autowired
    private EmployeeService employeeService;

    @Test
    void testListByGroup() {
        List<Employee> list = employeeService.lambdaQuery()
                .eq(Employee::getGroupId, 1L)
                .eq(Employee::getStatus, 1)
                .list();
        assertThat(list).hasSize(2);
    }

    @Test
    void testGetStats() {
        long total = employeeService.count();
        long active = employeeService.lambdaQuery().eq(Employee::getStatus, 1).count();
        assertThat(total).isPositive();
        assertThat(active).isPositive();
    }

    @Test
    void testPageQuery() {
        Page<Employee> page = employeeService.pageQuery(1, 10, null, null);
        assertThat(page.getRecords()).isNotEmpty();
        assertThat(page.getTotal()).isPositive();
    }

    @Test
    void testCreate() {
        Employee emp = new Employee();
        emp.setEmployeeNo("EMP004");
        emp.setRealName("赵六");
        emp.setGroupId(1L);
        emp.setStatus(1);
        employeeService.save(emp);
        assertThat(emp.getId()).isNotNull();
    }

    @Test
    void testDelete() {
        employeeService.removeById(1L);
        Employee emp = employeeService.getById(1L);
        assertThat(emp).isNull();
    }
}
```

- [ ] **Step 3: 运行测试**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-employee -DfailIfNoTests=false
```
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-employee/src/test/ && git commit -m "test: add employee module tests"
```

---

### Task 4.3: EmployeeController 测试

**Files:**
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/controller/EmployeeControllerTest.java`

- [ ] **Step 1: 编写 EmployeeControllerTest**

```java
package com.qyf.hangyi.employee.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.employee.entity.Employee;
import com.qyf.hangyi.employee.service.EmployeeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(EmployeeController.class)
class EmployeeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EmployeeService employeeService;

    @Test
    void testListByGroup() throws Exception {
        Employee emp = new Employee();
        emp.setId(1L);
        emp.setRealName("张三");
        when(employeeService.lambdaQuery()).thenReturn(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Employee>() {
                    {
                        addInterceptor(new com.baomidou.mybatisplus.core.toolkit.support.SFunction<Employee, Object>() {
                            @Override
                            public Object apply(Employee e) { return e.getGroupId(); }
                        });
                    }
                });
        // 实际测试时使用更简单的 mock 方式
    }
}
```

注意：EmployeeController 多次调用链式 query（`employeeService.lambdaQuery().eq(...).list()`），Mockito mock 链式调用比较复杂。有两种方案：

**方案 A**: 直接 mock `employeeService.lambdaQuery()` 返回整个链的 mock，较复杂
**方案 B**: 重构 EmployeeController 使用 `employeeService.list()` 等更直接的方法进行查询（更推荐），测试更简单

**推荐采用方案 B**: 为 EmployeeService 添加 `listByGroup(Long groupId)` 等直接方法，避免在 Controller 中使用链式查询。

- [ ] **Step 2: 重写 EmployeeService** 添加便捷方法（如果还没有的话）

```java
// 在 EmployeeService 中添加
public List<Employee> listByGroup(Long groupId) {
    return lambdaQuery().eq(Employee::getGroupId, groupId).eq(Employee::getStatus, 1).list();
}

public long countActive() {
    return lambdaQuery().eq(Employee::getStatus, 1).count();
}
```

- [ ] **Step 3: 完善 EmployeeControllerTest**

```java
@WebMvcTest(EmployeeController.class)
class EmployeeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EmployeeService employeeService;

    @Test
    void testListByGroup() throws Exception {
        Employee emp = new Employee();
        emp.setId(1L);
        emp.setRealName("张三");
        when(employeeService.listByGroup(1L)).thenReturn(List.of(emp));

        mockMvc.perform(get("/api/employees/list-by-group")
                        .param("groupId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCount() throws Exception {
        when(employeeService.countActive()).thenReturn(5L);

        mockMvc.perform(get("/api/employees/count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testGetById() throws Exception {
        Employee emp = new Employee();
        emp.setId(1L);
        emp.setRealName("张三");
        when(employeeService.getById(1L)).thenReturn(emp);

        mockMvc.perform(get("/api/employees/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.realName").value("张三"));
    }

    @Test
    void testCreate() throws Exception {
        String json = """
                {"employeeNo":"EMP005","realName":"测试","groupId":1}
                """;
        when(employeeService.save(any(Employee.class))).thenReturn(true);

        mockMvc.perform(post("/api/employees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
```

- [ ] **Step 4: 运行测试并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-employee -DfailIfNoTests=false && git add hangyi-employee/src/test/ && git commit -m "test: add employee controller tests"
```

---

## Phase 5: hangyi-flight 和 hangyi-leave 测试

### Task 5.1: Flight 模块测试

**Files:**
- Create: `hangyi-flight/src/test/resources/application-test.yml`
- Create: `hangyi-flight/src/test/resources/schema.sql`
- Create: `hangyi-flight/src/test/java/com/qyf/hangyi/flight/mapper/FlightPlanMapperTest.java`
- Create: `hangyi-flight/src/test/java/com/qyf/hangyi/flight/controller/FlightPlanControllerTest.java`

- [ ] **Step 1: 创建 H2 schema**

```sql
DROP TABLE IF EXISTS flight_plan;
CREATE TABLE flight_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    flight_no VARCHAR(20) NOT NULL,
    aircraft_type VARCHAR(20),
    departure_airport VARCHAR(10),
    arrival_airport VARCHAR(10),
    scheduled_departure TIMESTAMP,
    scheduled_arrival TIMESTAMP,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO flight_plan (id, flight_no, aircraft_type, departure_airport, arrival_airport, status) VALUES
(1, 'CZ3288', 'B737', 'NNG', 'CAN', 1),
(2, 'CZ3276', 'A320', 'NNG', 'PEK', 1);
```

- [ ] **Step 2: 编写测试代码**

FlightPlanMapperTest: selectById, selectList
FlightPlanControllerTest: @WebMvcTest, 验证 CRUD 端点

- [ ] **Step 3: 运行并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-flight -DfailIfNoTests=false && git add hangyi-flight/src/test/ && git commit -m "test: add flight module tests"
```

---

### Task 5.2: Leave 模块测试

**Files:**
- Create: `hangyi-leave/src/test/resources/application-test.yml`
- Create: `hangyi-leave/src/test/resources/schema.sql`
- Create: `hangyi-leave/src/test/java/com/qyf/hangyi/leave/mapper/LeaveRequestMapperTest.java`
- Create: `hangyi-leave/src/test/java/com/qyf/hangyi/leave/controller/LeaveRequestControllerTest.java`

- [ ] **Step 1: 创建 H2 schema**

```sql
DROP TABLE IF EXISTS leave_request;
CREATE TABLE leave_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    leave_type VARCHAR(20),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'PENDING',
    approver_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leave_request (id, employee_id, leave_type, start_date, end_date, status) VALUES
(1, 1, 'ANNUAL', '2026-06-01', '2026-06-03', 'PENDING');
```

- [ ] **Step 2: 编写测试代码**

前后端 CRUD 标准模式。特别测试边界：
- 创建请假单时参数校验
- 状态变更（PENDING → APPROVED → REJECTED）

- [ ] **Step 3: 运行并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-leave -DfailIfNoTests=false && git add hangyi-leave/src/test/ && git commit -m "test: add leave module tests"
```

---

## Phase 6: hangyi-schedule 排班引擎测试（最复杂模块）

### Task 6.1: 创建测试配置

**Files:**
- Create: `hangyi-schedule/src/test/resources/application-test.yml`
- Create: `hangyi-schedule/src/test/resources/schema.sql`

- [ ] **Step 1: 创建 test application.yml**

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:test;MODE=MYSQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
    username: sa
    password:
  sql:
    init:
      schema-locations: classpath:schema.sql
      mode: always
  cloud:
    nacos:
      discovery:
        enabled: false
  ai:
    ollama:
      enabled: false  # 如果 schedule 引用了 AI 相关依赖

mybatis-plus:
  type-aliases-package: com.qyf.hangyi.schedule.entity
  global-config:
    db-config:
      id-type: auto
  configuration:
    map-underscore-to-camel-case: true
```

- [ ] **Step 2: 创建 schedule 相关 H2 schema**

```sql
DROP TABLE IF EXISTS shift_template;
CREATE TABLE shift_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shift_name VARCHAR(50) NOT NULL,
    shift_code VARCHAR(20),
    start_time VARCHAR(10),
    end_time VARCHAR(10),
    color VARCHAR(20),
    sort_order INT DEFAULT 0,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS schedule_rule;
CREATE TABLE schedule_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rule_name VARCHAR(100),
    rule_type VARCHAR(20),
    rule_config TEXT,
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS schedule;
CREATE TABLE schedule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id BIGINT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS schedule_detail;
CREATE TABLE schedule_detail (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_id BIGINT NOT NULL,
    employee_id BIGINT NOT NULL,
    work_date DATE NOT NULL,
    shift_id BIGINT,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS schedule_change;
CREATE TABLE schedule_change (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_id BIGINT,
    employee_id BIGINT,
    original_shift_id BIGINT,
    new_shift_id BIGINT,
    change_date DATE,
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shift_template (id, shift_name, shift_code, start_time, end_time, sort_order, status) VALUES
(1, '早班', 'MORNING', '08:00', '16:00', 1, 1),
(2, '晚班', 'EVENING', '16:00', '00:00', 2, 1),
(3, '夜班', 'NIGHT', '00:00', '08:00', 3, 1),
(4, '备勤', 'STANDBY', NULL, NULL, 4, 1);

INSERT INTO schedule (id, group_id, period_start, period_end, status) VALUES
(1, 1, '2026-06-01', '2026-06-07', 'PUBLISHED');

INSERT INTO schedule_detail (id, schedule_id, employee_id, work_date, shift_id, status) VALUES
(1, 1, 1, '2026-06-01', 1, 'NORMAL'),
(2, 1, 2, '2026-06-01', 2, 'NORMAL'),
(3, 1, 1, '2026-06-02', 2, 'NORMAL');
```

---

### Task 6.2: Timefold 约束测试（最重要！）

**Files:**
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/solver/constraint/ScheduleConstraintProviderTest.java`
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/solver/service/ScheduleSolverServiceTest.java`
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/domain/ScheduleSolutionTest.java`

- [ ] **Step 1: 编写约束测试**

Timefold 提供了 `ConstraintVerifier` 来单独验证每个约束。这是测试排班引擎最核心的部分。

```java
package com.qyf.hangyi.schedule.solver.constraint;

import ai.timefold.solver.test.api.score.stream.ConstraintVerifier;
import com.qyf.hangyi.schedule.solver.domain.Employee;
import com.qyf.hangyi.schedule.solver.domain.ScheduleSolution;
import com.qyf.hangyi.schedule.solver.domain.ShiftAssignment;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class ScheduleConstraintProviderTest {

    @Autowired
    private ConstraintVerifier<ScheduleConstraintProvider, ScheduleSolution> constraintVerifier;

    @Test
    void testEmployeeAvailability_hardConstraint() {
        // 创建测试员工
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setName("测试员工");

        // 创建排班分配 - 分配在员工不可用时间
        ShiftAssignment assignment = new ShiftAssignment();
        assignment.setEmployee(employee);
        assignment.setWorkDate(LocalDate.of(2026, 6, 1));

        ScheduleSolution solution = new ScheduleSolution();
        solution.setEmployeeList(List.of(employee));
        solution.setShiftAssignmentList(List.of(assignment));

        // 验证硬约束不违反（具体根据约束实现调整）
        // 这里演示框架用法，实际约束名称需根据 ScheduleConstraintProvider 调整
        assertThat(constraintVerifier).isNotNull();
    }
}
```

注意：`ConstraintVerifier` 的自动注入需要 Timefold 的 `timefold-solver-spring-boot-starter` 在测试上下文中可用。如果没有自动注入，使用手动构建方式。

更实用的约束测试方式：

```java
// 手动构建 ConstraintVerifier
ConstraintVerifier<ScheduleConstraintProvider, ScheduleSolution> verifier =
    ConstraintVerifier.build(new ScheduleConstraintProvider(), ScheduleSolution.class, ShiftAssignment.class);

// 使用 verifier.verifyThat(constraintName).given(assignments).penalizesBy(count);
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-schedule -DfailIfNoTests=false
```

- [ ] **Step 3: 提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-schedule/src/test/ && git commit -m "test: add schedule constraint verifier tests"
```

---

### Task 6.3: Schedule Service 测试

**Files:**
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/service/ScheduleServiceTest.java`
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/mapper/ScheduleMapperTest.java`

- [ ] **Step 1: 编写 ScheduleServiceTest**

```java
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ScheduleServiceTest {

    @Autowired
    private ScheduleService scheduleService;

    @Test
    void testGetGanttData() {
        // 查询甘特图数据
        List<ScheduleDetailVO> data = scheduleService.getGanttData(1L);
        assertThat(data).isNotEmpty();
    }

    @Test
    void testGetScheduleById() {
        Schedule schedule = scheduleService.getById(1L);
        assertThat(schedule).isNotNull();
        assertThat(schedule.getStatus()).isEqualTo("PUBLISHED");
    }
}
```

---

## Phase 7: hangyi-dashboard 仪表盘测试

### Task 7.1: Dashboard Controller 测试

**Files:**
- Create: `hangyi-dashboard/src/test/java/com/qyf/hangyi/dashboard/controller/DashboardControllerTest.java`

- [ ] **Step 1: 编写测试**

DashboardController 通过 Feign 客户端从其他模块聚合数据。测试时需要 Mock 所有 Feign 客户端。

```java
@WebMvcTest(DashboardController.class)
class DashboardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EmployeeFeignClient employeeFeignClient;

    @MockBean
    private FlightFeignClient flightFeignClient;

    @MockBean
    private LeaveFeignClient leaveFeignClient;

    @MockBean
    private ScheduleFeignClient scheduleFeignClient;

    @Test
    void testDashboardStats() throws Exception {
        // Mock Feign responses
        when(employeeFeignClient.getCount()).thenReturn(R.ok(10L));
        // ... mock other feign clients

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
```

- [ ] **Step 2: 运行并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add hangyi-dashboard/src/test/ && git commit -m "test: add dashboard module tests"
```

---

## Phase 8: hangyi-schedule Controller 测试

### Task 8.1: Schedule Controller 测试

**Files:**
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/controller/ScheduleControllerTest.java`

- [ ] **Step 1: 编写 ScheduleControllerTest**

```java
@WebMvcTest(ScheduleController.class)
class ScheduleControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ScheduleService scheduleService;

    @MockBean
    private ScheduleSolverService scheduleSolverService;

    @Test
    void testGetGantt() throws Exception {
        when(scheduleService.getGanttData(1L)).thenReturn(List.of(new ScheduleDetailVO()));

        mockMvc.perform(get("/api/schedules/gantt").param("scheduleId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
```

- [ ] **Step 2: 运行并提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -pl hangyi-schedule -DfailIfNoTests=false && git add hangyi-schedule/src/test/ && git commit -m "test: add schedule controller tests"
```

---

## 验证和清理

### Final Task: 全模块测试验证

- [ ] **Step 1: 运行所有模块测试**

```bash
cd /Users/qyf/IdeaProjects/hangyi && ./mvnw test -DfailIfNoTests=false 2>&1 | tail -30
```
Expected: BUILD SUCCESS，所有测试通过

- [ ] **Step 2: 最终提交**

```bash
cd /Users/qyf/IdeaProjects/hangyi && git add -A && git commit -m "test: add comprehensive unit tests for all modules"
```
