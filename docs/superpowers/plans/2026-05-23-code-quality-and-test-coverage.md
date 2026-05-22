# 代码质量与测试覆盖率改进方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐高优先级未覆盖测试，增加实体验证，改进测试质量

**Architecture:** 本计划分 4 个独立板块：(A) 核心算法/安全逻辑测试 (B) employee 模块剩余测试 (C) `@Valid` 与实体验证 (D) 测试质量与 CORS。各板块无依赖，可并行执行。

**Tech Stack:** JUnit5, AssertJ, Timefold ConstraintVerifier, Spring Cloud Gateway Test, MockMvc, WebTestClient

---

## 板块 A：核心算法/安全逻辑测试

### Task A1: 排班约束测试 — `ScheduleConstraintProvider`

**Files:**
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/solver/constraint/ScheduleConstraintProviderTest.java`

使用 Timefold 官方 `ConstraintVerifier` 对 5 个硬约束和 3 个软约束独立验证。

- [ ] **Step 1: 创建测试类并验证「不能连续夜班」约束**

```java
package com.qyf.hangyi.schedule.solver.constraint;

import ai.timefold.solver.test.api.score.stream.ConstraintVerifier;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import com.qyf.hangyi.schedule.solver.domain.Employee;
import com.qyf.hangyi.schedule.solver.domain.ScheduleSolution;
import com.qyf.hangyi.schedule.solver.domain.ShiftAssignment;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ScheduleConstraintProviderTest {

    @Autowired
    private ConstraintVerifier<ScheduleConstraintProvider, ScheduleSolution> constraintVerifier;

    private static ShiftTemplate nightShift() {
        ShiftTemplate s = new ShiftTemplate();
        s.setId(1L);
        s.setShiftCode("NIGHT");
        s.setShiftType("NIGHT");
        s.setStartTime(LocalTime.of(0, 0));
        s.setEndTime(LocalTime.of(8, 0));
        return s;
    }

    private static ShiftTemplate morningShift() {
        ShiftTemplate s = new ShiftTemplate();
        s.setId(2L);
        s.setShiftCode("MORNING");
        s.setShiftType("DAY");
        s.setStartTime(LocalTime.of(8, 0));
        s.setEndTime(LocalTime.of(16, 0));
        return s;
    }

    private static ShiftTemplate restShift() {
        ShiftTemplate s = new ShiftTemplate();
        s.setId(3L);
        s.setShiftCode("REST");
        s.setShiftType("REST");
        return s;
    }

    private static Employee employee(Long id) {
        Employee e = new Employee();
        e.setId(id);
        e.setName("test");
        e.setMaxHoursPerDay(java.math.BigDecimal.valueOf(8));
        e.setMaxHoursPerWeek(java.math.BigDecimal.valueOf(40));
        return e;
    }

    @Test
    void consecutiveNightShifts_shouldBePenalized() {
        Employee emp = employee(1L);
        ShiftAssignment day1 = new ShiftAssignment(1L, emp, LocalDate.of(2026, 6, 1), nightShift());
        ShiftAssignment day2 = new ShiftAssignment(2L, emp, LocalDate.of(2026, 6, 2), nightShift());

        var score = constraintVerifier.verifyThat(ScheduleConstraintProvider::noConsecutiveNightShifts)
                .given(emp, day1, day2, nightShift(), morningShift(), restShift())
                .scores();
        assertThat(score).isNotEmpty();
    }

    @Test
    void nightShiftThenMorningShift_shouldBePenalized() {
        Employee emp = employee(1L);
        ShiftAssignment day1 = new ShiftAssignment(1L, emp, LocalDate.of(2026, 6, 1), nightShift());
        ShiftAssignment day2 = new ShiftAssignment(2L, emp, LocalDate.of(2026, 6, 2), morningShift());

        var score = constraintVerifier.verifyThat(ScheduleConstraintProvider::nightThenMorning)
                .given(emp, day1, day2, nightShift(), morningShift(), restShift())
                .scores();
        assertThat(score).isNotEmpty();
    }

    @Test
    void singleNightShift_shouldNotBePenalized() {
        Employee emp = employee(1L);
        ShiftAssignment day1 = new ShiftAssignment(1L, emp, LocalDate.of(2026, 6, 1), nightShift());
        ShiftAssignment day2 = new ShiftAssignment(2L, emp, LocalDate.of(2026, 6, 2), restShift());

        var score = constraintVerifier.verifyThat(ScheduleConstraintProvider::noConsecutiveNightShifts)
                .given(emp, day1, day2, nightShift(), morningShift(), restShift())
                .scores();
        assertThat(score).isEmpty();
    }

    @Test
    void weekendShiftBalancing_shouldPenalizeUneven() {
        Employee emp1 = employee(1L);
        Employee emp2 = employee(2L);
        ShiftAssignment sat1 = new ShiftAssignment(1L, emp1, LocalDate.of(2026, 6, 6), morningShift());
        ShiftAssignment sun1 = new ShiftAssignment(2L, emp1, LocalDate.of(2026, 6, 7), morningShift());

        var score = constraintVerifier.verifyThat(ScheduleConstraintProvider::weekendBalance)
                .given(emp1, emp2, sat1, sun1, nightShift(), morningShift(), restShift())
                .scores();
        assertThat(score).isNotEmpty();
    }
}
```

- [ ] **Step 2: 运行测试确认可编译并执行**

Run: `./mvnw test -pl hangyi-schedule -Dtest="ScheduleConstraintProviderTest" -DfailIfNoTests=false`
Expected: 测试执行，可能因约束提供者方法签名不匹配需调整

- [ ] **Step 3: 根据实际 `ScheduleConstraintProvider` 方法签名调整测试**

调整约束方法引用匹配 `ConstraintProvider` 中的实际方法名。Timefold `ConstraintVerifier` 需与实际 `ConstraintProvider` 类中的 `@ConstraintWeight` 或惩罚方法匹配。

### Task A2: `ShiftAssignment` 领域方法测试

**Files:**
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/solver/domain/ShiftAssignmentTest.java`

- [ ] **Step 1: 编写领域方法测试**

```java
package com.qyf.hangyi.schedule.solver.domain;

import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class ShiftAssignmentTest {

    private ShiftTemplate shift(String type, LocalTime start, LocalTime end) {
        ShiftTemplate s = new ShiftTemplate();
        s.setShiftType(type);
        s.setStartTime(start);
        s.setEndTime(end);
        return s;
    }

    @Test
    void isRest_returnsTrueForRestType() {
        ShiftTemplate rest = shift("REST", null, null);
        ShiftAssignment a = new ShiftAssignment(1L, new Employee(), LocalDate.now(), rest);
        assertThat(a.isRest()).isTrue();
    }

    @Test
    void isNightShift_returnsTrueForNightType() {
        ShiftAssignment a = new ShiftAssignment(1L, new Employee(), LocalDate.now(),
                shift("NIGHT", LocalTime.of(0, 0), LocalTime.of(8, 0)));
        assertThat(a.isNightShift()).isTrue();
    }

    @Test
    void isNightShift_returnsFalseForDayType() {
        ShiftAssignment a = new ShiftAssignment(1L, new Employee(), LocalDate.now(),
                shift("DAY", LocalTime.of(8, 0), LocalTime.of(16, 0)));
        assertThat(a.isNightShift()).isFalse();
    }

    @Test
    void isWeekend_returnsTrueForSaturday() {
        // 2026-06-06 is Saturday
        ShiftAssignment a = new ShiftAssignment(1L, new Employee(), LocalDate.of(2026, 6, 6),
                shift("DAY", LocalTime.of(8, 0), LocalTime.of(16, 0)));
        assertThat(a.isWeekend()).isTrue();
    }

    @Test
    void isWeekend_returnsTrueForSunday() {
        ShiftAssignment a = new ShiftAssignment(1L, new Employee(), LocalDate.of(2026, 6, 7),
                shift("DAY", LocalTime.of(8, 0), LocalTime.of(16, 0)));
        assertThat(a.isWeekend()).isTrue();
    }

    @Test
    void isConsecutiveDay_returnsTrueForAdjacentDates() {
        ShiftAssignment a1 = new ShiftAssignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        ShiftAssignment a2 = new ShiftAssignment(2L, new Employee(), LocalDate.of(2026, 6, 2), null);
        assertThat(a1.isConsecutiveDay(a2)).isTrue();
    }

    @Test
    void isConsecutiveDay_returnsFalseForNonAdjacentDates() {
        ShiftAssignment a1 = new ShiftAssignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        ShiftAssignment a2 = new ShiftAssignment(2L, new Employee(), LocalDate.of(2026, 6, 3), null);
        assertThat(a1.isConsecutiveDay(a2)).isFalse();
    }

    @Test
    void getShiftDurationHours_crossesMidnight() {
        // Night shift 22:00-06:00 = 8 hours
        ShiftAssignment a = new ShiftAssignment(1L, new Employee(), LocalDate.now(),
                shift("NIGHT", LocalTime.of(22, 0), LocalTime.of(6, 0)));
        assertThat(a.getShiftDurationHours()).isEqualTo(8);
    }

    @Test
    void getShiftDurationHours_sameDay() {
        ShiftAssignment a = new ShiftAssignment(1L, new Employee(), LocalDate.now(),
                shift("DAY", LocalTime.of(8, 0), LocalTime.of(16, 0)));
        assertThat(a.getShiftDurationHours()).isEqualTo(8);
    }
}
```

- [ ] **Step 2: 运行测试确认全部通过**

Run: `./mvnw test -pl hangyi-schedule -Dtest="ShiftAssignmentTest" -DfailIfNoTests=false`

### Task A3: 网关 JWT 过滤器测试

**Files:**
- Create: `hangyi-gateway/src/test/java/com/qyf/hangyi/gateway/filter/JwtAuthGlobalFilterTest.java`
- Modify: `hangyi-gateway/src/test/resources/application.yml` (创建)

- [ ] **Step 1: 创建网关测试配置**

```yaml
# hangyi-gateway/src/test/resources/application.yml
spring:
  cloud:
    nacos:
      discovery:
        enabled: false
    gateway:
      enabled: true
jwt:
  secret: test-secret-key-for-unit-testing-at-least-32-chars-long
```

- [ ] **Step 2: 编写 JWT 过滤器测试**

```java
package com.qyf.hangyi.gateway.filter;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "jwt.secret=test-secret-key-for-unit-testing-at-least-32-chars-long",
                "spring.cloud.gateway.enabled=true"
        })
class JwtAuthGlobalFilterTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void permitAllPaths_shouldPassWithoutToken() {
        webTestClient.get().uri("/api/schedules/export/1")
                .exchange()
                .expectStatus().is5xxServerError(); // 路由不可达但不会被过滤器拦截
    }

    @Test
    void missingToken_shouldReturn401() {
        webTestClient.get().uri("/api/schedules/page")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void invalidToken_shouldReturn401() {
        webTestClient.get().uri("/api/schedules/page")
                .header("Authorization", "Bearer invalid-token")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    // 注意：需要先在 gateway 模块添加 test 依赖 spring-cloud-starter-gateway-test
}
```

- [ ] **Step 3: 调整 gateway pom.xml 添加测试依赖**

```xml
<!-- 在 hangyi-gateway/pom.xml <dependencies> 内添加 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway-test</artifactId>
    <scope>test</scope>
</dependency>
```

- [ ] **Step 4: 运行测试**

Run: `./mvnw test -pl hangyi-gateway -Dtest="JwtAuthGlobalFilterTest" -DfailIfNoTests=false`

### Task A4: FeignConfig 拦截器测试

**Files:**
- Create: `hangyi-common/src/test/java/com/qyf/hangyi/common/config/FeignConfigTest.java`

- [ ] **Step 1: 编写 Feign 拦截器测试**

```java
package com.qyf.hangyi.common.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = FeignConfig.class)
class FeignConfigTest {

    @Autowired
    private RequestInterceptor requestInterceptor;

    @Test
    void interceptor_shouldSetHeadersWhenAuthenticated() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("1", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        RequestTemplate template = new RequestTemplate();
        requestInterceptor.apply(template);

        assertThat(template.headers()).containsKey("X-User-Id");
        assertThat(template.headers().get("X-User-Id")).contains("1");
        assertThat(template.headers().get("X-User-Roles")).contains("ADMIN");
        SecurityContextHolder.clearContext();
    }

    @Test
    void interceptor_shouldNotFailWhenNoAuth() {
        SecurityContextHolder.clearContext();
        RequestTemplate template = new RequestTemplate();
        requestInterceptor.apply(template);
        assertThat(template.headers()).isEmpty();
    }
}
```

- [ ] **Step 2: 创建 common 模块测试配置**

```yaml
# hangyi-common/src/test/resources/application.yml
spring:
  cloud:
    nacos:
      discovery:
        enabled: false
```

- [ ] **Step 3: 运行测试**

Run: `./mvnw test -pl hangyi-common -Dtest="FeignConfigTest" -DfailIfNoTests=false`

### Task A5: Auth JwtUtil 测试

**Files:**
- Create: `hangyi-auth/src/test/java/com/qyf/hangyi/auth/security/JwtUtilTest.java`

- [ ] **Step 1: 编写 JWT 生成测试**

```java
package com.qyf.hangyi.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class JwtUtilTest {

    @Autowired
    private JwtUtil jwtUtil;

    @Test
    void generateToken_shouldReturnValidToken() {
        String token = jwtUtil.generateToken(1L, "admin", "ADMIN");
        assertThat(token).isNotBlank();
        assertThat(token.split("\\.")).hasSize(3); // JWT has 3 parts
    }

    @Test
    void generateToken_differentUsers_differentTokens() {
        String token1 = jwtUtil.generateToken(1L, "admin", "ADMIN");
        String token2 = jwtUtil.generateToken(2L, "user", "USER");
        assertThat(token1).isNotEqualTo(token2);
    }
}
```

- [ ] **Step 2: 运行测试**

Run: `./mvnw test -pl hangyi-auth -Dtest="JwtUtilTest" -DfailIfNoTests=false`

---

## 板块 B：employee 模块剩余测试

### Task B1: AircraftTypeControllerTest

**Files:**
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/controller/AircraftTypeControllerTest.java`
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/service/AircraftTypeServiceTest.java`

- [ ] **Step 1: 编写 AircraftTypeControllerTest**

```java
package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.AircraftType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class AircraftTypeControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/aircraft-types"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCreate() throws Exception {
        AircraftType type = new AircraftType();
        type.setTypeCode("B738");
        type.setTypeName("波音737-800");
        type.setManufacturer("波音");
        type.setStatus(1);

        mockMvc.perform(post("/api/aircraft-types")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(type)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testDelete() throws Exception {
        mockMvc.perform(delete("/api/aircraft-types/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
```

- [ ] **Step 2: 编写 AircraftTypeServiceTest**

```java
package com.qyf.hangyi.employee.service;

import com.qyf.hangyi.employee.entity.AircraftType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class AircraftTypeServiceTest {

    @Autowired
    private AircraftTypeService aircraftTypeService;

    @Test
    void testListActive() {
        List<AircraftType> result = aircraftTypeService.listActive();
        assertThat(result).isNotEmpty();
        assertThat(result).allMatch(t -> t.getStatus() == 1);
    }
}
```

### Task B2: EmployeePreference 测试

**Files:**
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/controller/EmployeePreferenceControllerTest.java`
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/service/EmployeePreferenceServiceTest.java`

- [ ] **Step 1: 编写 EmployeePreferenceControllerTest**

```java
package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.EmployeePreference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class EmployeePreferenceControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/employee-preferences"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCreate() throws Exception {
        EmployeePreference pref = new EmployeePreference();
        pref.setEmployeeId(1L);
        pref.setPreferenceType("SHIFT");
        pref.setPreferenceValue("MORNING");
        pref.setStatus(1);

        mockMvc.perform(post("/api/employee-preferences")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(pref)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
```

- [ ] **Step 2: 编写 EmployeePreferenceServiceTest**

```java
package com.qyf.hangyi.employee.service;

import com.qyf.hangyi.employee.entity.EmployeePreference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class EmployeePreferenceServiceTest {

    @Autowired
    private EmployeePreferenceService employeePreferenceService;

    @Test
    void testListByEmployee() {
        List<EmployeePreference> result = employeePreferenceService.listByEmployee(1L);
        assertThat(result).isNotNull();
    }
}
```

### Task B3: Qualification 测试

**Files:**
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/controller/QualificationControllerTest.java`
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/service/QualificationServiceTest.java`

- [ ] **Step 1: 编写 QualificationControllerTest**

测试 list、page、create、expiring 端点：

```java
package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.EmployeeQualification;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class QualificationControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/qualifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testPage() throws Exception {
        mockMvc.perform(get("/api/qualifications/page")
                        .param("page", "1").param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCreate() throws Exception {
        EmployeeQualification q = new EmployeeQualification();
        q.setEmployeeId(1L);
        q.setQualificationType("TYPE_RATING");
        q.setQualificationCode("B737");
        q.setIssueDate(LocalDate.now());
        q.setExpiryDate(LocalDate.now().plusYears(1));
        q.setStatus(1);

        mockMvc.perform(post("/api/qualifications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(q)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testExpiring() throws Exception {
        mockMvc.perform(get("/api/qualifications/expiring"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
```

- [ ] **Step 2: 编写 QualificationServiceTest**

```java
package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.employee.entity.EmployeeQualification;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class QualificationServiceTest {

    @Autowired
    private QualificationService qualificationService;

    @Test
    void testPageQuery() {
        Page<EmployeeQualification> result = qualificationService.pageQuery(1, 20, null);
        assertThat(result.getRecords()).isNotEmpty();
    }

    @Test
    void testListByEmployee() {
        List<EmployeeQualification> result = qualificationService.listByEmployee(1L);
        assertThat(result).isNotNull();
    }
}
```

### Task B4: TeamGroupControllerTest

**Files:**
- Create: `hangyi-employee/src/test/java/com/qyf/hangyi/employee/controller/TeamGroupControllerTest.java`

- [ ] **Step 1: 编写 TeamGroupControllerTest**

```java
package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.TeamGroup;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class TeamGroupControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/team-groups"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void testList_WithGroupType() throws Exception {
        mockMvc.perform(get("/api/team-groups")
                        .param("groupType", "FLIGHT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCreate() throws Exception {
        TeamGroup group = new TeamGroup();
        group.setGroupName("测试班组");
        group.setGroupType("FLIGHT");
        group.setStatus(1);

        mockMvc.perform(post("/api/team-groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(group)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
```

---

## 板块 C：@Valid 与实体验证

### Task C1: 实体关键字段添加验证注解

**Files:**
- Modify: `hangyi-employee/src/main/java/com/qyf/hangyi/employee/entity/Employee.java`
- Modify: `hangyi-employee/src/main/java/com/qyf/hangyi/employee/entity/TeamGroup.java`
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/entity/ShiftTemplate.java`
- Modify: `hangyi-flight/src/main/java/com/qyf/hangyi/flight/entity/FlightPlan.java`
- Modify: `hangyi-leave/src/main/java/com/qyf/hangyi/leave/entity/LeaveRequest.java`

- [ ] **Step 1: 给 Employee 添加验证注解**

```java
// Employee.java — 关键字段添加注解
@NotBlank(message = "员工编号不能为空")
private String empNo;

@NotBlank(message = "员工姓名不能为空")
private String name;  // 注意是 name 不是 realName

@NotNull(message = "班组ID不能为空")
private Long groupId;
```

- [ ] **Step 2: 给 ShiftTemplate 添加验证注解**

```java
@NotBlank(message = "班次编码不能为空")
private String shiftCode;

@NotBlank(message = "班次名称不能为空")
private String shiftName;

@NotNull(message = "开始时间不能为空")
private LocalTime startTime;

@NotNull(message = "结束时间不能为空")
private LocalTime endTime;
```

- [ ] **Step 3: 给 FlightPlan、LeaveRequest、TeamGroup 添加验证注解**

参照 Employee 模式，在各自的必填字段上加 `@NotBlank` / `@NotNull`。

### Task C2: 控制器 POST/PUT 添加 @Valid

**Files:**
- Modify: `hangyi-employee/controller/EmployeeController.java` — `create()` 和 `update()` 的 `@RequestBody` 加 `@Valid`
- Modify: `hangyi-employee/controller/AircraftTypeController.java`
- Modify: `hangyi-employee/controller/EmployeePreferenceController.java`
- Modify: `hangyi-employee/controller/QualificationController.java`
- Modify: `hangyi-employee/controller/TeamGroupController.java`
- Modify: `hangyi-schedule/controller/ShiftTemplateController.java`
- Modify: `hangyi-schedule/controller/ScheduleChangeController.java`
- Modify: `hangyi-flight/controller/FlightPlanController.java`
- Modify: `hangyi-leave/controller/LeaveRequestController.java`

- [ ] **Step 1: 在每个 POST/PUT 方法的 `@RequestBody` 前加 `@Valid`**

```java
// 示例：EmployeeController.create()
public R<Void> create(@Valid @RequestBody Employee employee) { ... }

// 示例：ShiftTemplateController.create()
public R<Void> create(@Valid @RequestBody ShiftTemplate shift) { ... }

// 示例：FlightPlanController.update()
public R<Void> update(@Valid @RequestBody FlightPlan flight) { ... }
```

- [ ] **Step 2: 运行全模块测试确认未破坏现有功能**

Run: `./mvnw test -pl hangyi-employee,hangyi-schedule,hangyi-flight,hangyi-leave -DfailIfNoTests=false`

---

## 板块 D：测试质量与配置改进

### Task D1: CORS 配置收紧

**Files:**
- Modify: `hangyi-gateway/src/main/java/com/qyf/hangyi/gateway/config/CorsConfig.java`

- [ ] **Step 1: 修改 CORS 允许来源为可配置**

```java
// 从 allowCredentials(false) + allowedOriginPatterns("*")
// 改为配置属性注入：
@Value("${cors.allowed-origins:*}") 
private String allowedOrigins;

// 或保留当前宽松配置但添加 TODO 注释说明生产需要修改
```

### Task D2: 现有测试断言增强

**Files:**
- Modify: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/service/ScheduleServiceTest.java`

- [ ] **Step 1: 增强 `countOnDutyToday` 断言**

将：
```java
assertThat(count).isBetween(0, 10);
```
改为基于测试数据的具体断言。测试数据中 schedule 1 的日期范围是 2026-05-18 ~ 2026-05-24，状态已发布：
```java
// 今天的日期由系统决定，至少验证逻辑正确返回非负值
// 更精确：传入固定日期验证行为
@Test
void testCountOnDutyToday_WithFixedDate() {
    // 该日期在已发布排班范围内
    int count = scheduleService.countOnDutyToday(LocalDate.of(2026, 5, 20));
    // 没有当天明细数据，返回0
    assertThat(count).isEqualTo(0);
}
```

- [ ] **Step 2: 增强 `pageQuery` 分组过滤器断言**

将：
```java
assertThat(result.getRecords()).isNotEmpty();
```
改为验证过滤器实际生效：
```java
@Test
void testPageQuery_WithGroupFilter() {
    Page<Schedule> result = scheduleService.pageQuery(1, 20, 1L, null);
    assertThat(result.getRecords()).isNotEmpty();
    assertThat(result.getRecords()).allMatch(s -> {
        Long gid = s.getGroupId();
        return gid != null && gid.equals(1L);
    });
}
```

### Task D3: ScheduleExportControllerTest

**Files:**
- Create: `hangyi-schedule/src/test/java/com/qyf/hangyi/schedule/controller/ScheduleExportControllerTest.java`

- [ ] **Step 1: 编写导出控制器测试**

```java
package com.qyf.hangyi.schedule.controller;

import com.qyf.hangyi.schedule.client.EmployeeFeignClient;
import com.qyf.hangyi.schedule.client.QualificationFeignClient;
import com.qyf.hangyi.schedule.service.export.ScheduleExportService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ScheduleExportController.class)
class ScheduleExportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ScheduleExportService scheduleExportService;

    @Test
    void testExportSchedule() throws Exception {
        mockMvc.perform(get("/api/schedules/export/schedule/1"))
                .andExpect(status().isOk());
    }

    @Test
    void testExportDaily() throws Exception {
        mockMvc.perform(get("/api/schedules/export/daily")
                        .param("date", "2026-05-23"))
                .andExpect(status().isOk());
    }
}
```

---

## 执行顺序

| 顺序 | 板块 | 任务 | 说明 |
|------|------|------|------|
| 1 | A | A1, A2 | 求解器约束测试，独立无依赖 |
| 2 | A | A3 | 网关过滤器测试，需添加 test 依赖 |
| 3 | A | A4, A5 | FeignConfig + Auth JwtUtil 测试 |
| 4 | B | B1-B4 | Employee 模块 7 个测试类，可并行 |
| 5 | C | C1, C2 | @Valid 注解，涉及多文件修改 |
| 6 | D | D1-D3 | CORS、断言增强、导出测试 |

板块间无依赖，可按任意顺序执行。推荐按上表自然顺序从 A 到 D 推进。
