# 国创赛功能同步实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将国创赛（微信小程序）的7个功能模块同步到 hangyi 微服务系统，新建5个微服务模块，扩展2个现有模块，清理 Web 前端冗余页面。

**Architecture:** 新建5个 Spring Boot 子模块（hangyi-swap/statistics/compliance/audit/service-schedule），每个模块含自己的 entity/mapper/service/controller 层，统一继承父 pom，依赖 hangyi-common。前端新增5个 Vue 页面，删除3个旧 AI 页面。

**Tech Stack:** Java 17, Spring Boot 3.3.5, MyBatis-Plus 3.5.9, MySQL 8.0, Vue 3 + Element Plus, Vite

---

## 文件结构规划

### 新建模块（每个模块结构一致）

```
hangyi-{module}/
├── pom.xml
├── src/main/java/com/qyf/hangyi/{module}/
│   ├── {Module}Application.java
│   ├── entity/
│   ├── mapper/
│   ├── service/ (接口)
│   ├── service/impl/ (实现)
│   └── controller/
└── src/main/resources/
    └── application.yml
```

### 前端文件

```
web/src/
├── api/
│   ├── swap.js        (新增)
│   ├── statistics.js  (新增)
│   ├── compliance.js  (新增)
│   ├── audit.js       (新增)
│   └── service-schedule.js (新增)
├── views/
│   ├── swap/SwapIndex.vue         (新增)
│   ├── statistics/StatisticsIndex.vue (新增)
│   ├── compliance/ComplianceIndex.vue (新增)
│   ├── audit/AuditIndex.vue       (新增)
│   └── service-schedule/ServiceScheduleIndex.vue (新增)
└── router/index.js    (修改)
```

---

### Task 1: 数据库迁移

**Files:**
- Create: `db/migration/V2__guochuang_sync.sql`

- [ ] **Step 1: 编写 SQL 迁移脚本**

```sql
-- V2__guochuang_sync.sql

-- 1. schedule_detail 表加字段
ALTER TABLE schedule_detail
    ADD COLUMN source VARCHAR(20) DEFAULT 'MANUAL' COMMENT '来源: SMART/MANUAL/ADMIN_ROLES',
    ADD COLUMN record_status VARCHAR(20) DEFAULT 'active' COMMENT '状态: active/archived',
    ADD COLUMN prep_time INT DEFAULT 30 COMMENT '准备时长(分钟)',
    ADD COLUMN wrap_time INT DEFAULT 15 COMMENT '收尾时长(分钟)';

-- 2. 新建 operation_log 表
CREATE TABLE operation_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(50) NOT NULL COMMENT '操作类型',
    detail VARCHAR(500) COMMENT '操作描述',
    target_type VARCHAR(50) COMMENT '目标类型',
    target_id VARCHAR(100) COMMENT '目标ID',
    operator_id BIGINT COMMENT '操作人ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作审计日志';

-- 3. 新建 swap_request 表
CREATE TABLE swap_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_type VARCHAR(20) DEFAULT 'SWAP' COMMENT 'SWAP/SHIFT_APPLY',
    source_schedule_id BIGINT COMMENT '原排班详情ID',
    target_schedule_id BIGINT COMMENT '目标排班详情ID',
    source_staff_id BIGINT COMMENT '申请人ID',
    target_staff_id BIGINT COMMENT '目标人ID',
    employee_no VARCHAR(20) COMMENT '工号',
    name VARCHAR(50) COMMENT '姓名',
    flight_no VARCHAR(20) COMMENT '航班号',
    start_time TIME COMMENT '调班开始时间',
    end_time TIME COMMENT '调班结束时间',
    reason VARCHAR(200) COMMENT '原因',
    status VARCHAR(20) DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED',
    verifier VARCHAR(50) COMMENT '验证方式',
    comment VARCHAR(200) COMMENT '审批备注',
    requester_id BIGINT COMMENT '申请人用户ID',
    approver_id BIGINT COMMENT '审批人用户ID',
    requester_read_at DATETIME COMMENT '申请人已读时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_requester (requester_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='调班申请';
```

- [ ] **Step 2: 执行迁移**

```bash
mysql -u root -p123456 aftercare < /Users/qyf/IdeaProjects/hangyi/db/migration/V2__guochuang_sync.sql
```

- [ ] **Step 3: 提交**

```bash
git add db/migration/V2__guochuang_sync.sql
git commit -m "feat: add V2 migration for guochuang sync - swap_request, operation_log, schedule_detail fields"
```

---

### Task 2: hangyi-audit 模块基础设施

**Files:**
- Create: `hangyi-audit/pom.xml`
- Create: `hangyi-audit/src/main/java/com/qyf/hangyi/audit/AuditApplication.java`
- Create: `hangyi-audit/src/main/java/com/qyf/hangyi/audit/entity/OperationLog.java`
- Create: `hangyi-audit/src/main/java/com/qyf/hangyi/audit/mapper/OperationLogMapper.java`
- Create: `hangyi-audit/src/main/java/com/qyf/hangyi/audit/service/OperationLogService.java`
- Create: `hangyi-audit/src/main/java/com/qyf/hangyi/audit/service/impl/OperationLogServiceImpl.java`
- Create: `hangyi-audit/src/main/java/com/qyf/hangyi/audit/controller/AuditController.java`
- Create: `hangyi-audit/src/main/resources/application.yml`
- Modify: `pom.xml` (parent, add module)

- [ ] **Step 1: 在父 pom 添加模块**

Edit `pom.xml` modules section, add `<module>hangyi-audit</module>`.

- [ ] **Step 2: 创建 hangyi-audit/pom.xml**

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
    <artifactId>hangyi-audit</artifactId>
    <packaging>jar</packaging>
    <name>hangyi-audit</name>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
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

- [ ] **Step 3: 创建 Application 启动类**

```java
package com.qyf.hangyi.audit;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.qyf.hangyi")
@MapperScan("com.qyf.hangyi.audit.mapper")
public class AuditApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuditApplication.class, args);
    }
}
```

- [ ] **Step 4: 创建 application.yml**

```yaml
server:
  port: 8094
spring:
  application:
    name: hangyi-audit
  datasource:
    url: jdbc:mysql://localhost:3306/hangyi?useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true
    username: root
    password: 123456
    driver-class-name: com.mysql.cj.jdbc.Driver
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
mybatis-plus:
  global-config:
    db-config:
      id-type: auto
```

- [ ] **Step 5: 创建 OperationLog 实体**

```java
package com.qyf.hangyi.audit.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("operation_log")
public class OperationLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String action;
    private String detail;
    private String targetType;
    private String targetId;
    private Long operatorId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
```

- [ ] **Step 6: 创建 Mapper**

```java
package com.qyf.hangyi.audit.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.qyf.hangyi.audit.entity.OperationLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OperationLogMapper extends BaseMapper<OperationLog> {
}
```

- [ ] **Step 7: 创建 Service 接口和实现**

```java
package com.qyf.hangyi.audit.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.audit.entity.OperationLog;

public interface OperationLogService {
    void log(String action, String detail, String targetType, String targetId, Long operatorId);
    Page<OperationLog> query(int page, int size, String action, String startDate, String endDate);
    String exportCsv(String action, String startDate, String endDate);
}
```

```java
package com.qyf.hangyi.audit.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.audit.entity.OperationLog;
import com.qyf.hangyi.audit.mapper.OperationLogMapper;
import com.qyf.hangyi.audit.service.OperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.StringJoiner;

@Service
public class OperationLogServiceImpl implements OperationLogService {

    @Autowired
    private OperationLogMapper mapper;

    @Override
    public void log(String action, String detail, String targetType, String targetId, Long operatorId) {
        OperationLog log = new OperationLog();
        log.setAction(action);
        log.setDetail(detail);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setOperatorId(operatorId);
        mapper.insert(log);
    }

    @Override
    public Page<OperationLog> query(int page, int size, String action, String startDate, String endDate) {
        LambdaQueryWrapper<OperationLog> qw = new LambdaQueryWrapper<>();
        qw.eq(action != null && !action.isEmpty(), OperationLog::getAction, action);
        if (startDate != null && !startDate.isEmpty()) {
            qw.ge(OperationLog::getCreatedAt, LocalDate.parse(startDate).atStartOfDay());
        }
        if (endDate != null && !endDate.isEmpty()) {
            qw.le(OperationLog::getCreatedAt, LocalDate.parse(endDate).atTime(23, 59, 59));
        }
        qw.orderByDesc(OperationLog::getCreatedAt);
        return mapper.selectPage(new Page<>(page, size), qw);
    }

    @Override
    public String exportCsv(String action, String startDate, String endDate) {
        LambdaQueryWrapper<OperationLog> qw = new LambdaQueryWrapper<>();
        qw.eq(action != null && !action.isEmpty(), OperationLog::getAction, action);
        if (startDate != null && !startDate.isEmpty()) {
            qw.ge(OperationLog::getCreatedAt, LocalDate.parse(startDate).atStartOfDay());
        }
        if (endDate != null && !endDate.isEmpty()) {
            qw.le(OperationLog::getCreatedAt, LocalDate.parse(endDate).atTime(23, 59, 59));
        }
        qw.orderByDesc(OperationLog::getCreatedAt);
        List<OperationLog> logs = mapper.selectList(qw);
        StringJoiner sj = new StringJoiner("\n");
        sj.add("时间,操作类型,描述,目标类型,目标ID");
        for (OperationLog l : logs) {
            sj.add(String.format("%s,%s,%s,%s,%s",
                l.getCreatedAt(), l.getAction(), l.getDetail(),
                l.getTargetType(), l.getTargetId()));
        }
        return sj.toString();
    }
}
```

- [ ] **Step 8: 创建 AuditController**

```java
package com.qyf.hangyi.audit.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.audit.entity.OperationLog;
import com.qyf.hangyi.audit.service.OperationLogService;
import com.qyf.hangyi.common.result.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    @Autowired
    private OperationLogService service;

    @GetMapping("/logs")
    public R<Page<OperationLog>> queryLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return R.ok(service.query(page, size, action, startDate, endDate));
    }

    @GetMapping("/logs/export")
    public ResponseEntity<byte[]> exportLogs(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        String csv = service.exportCsv(action, startDate, endDate);
        byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=audit_logs.csv")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }
}
```

- [ ] **Step 9: 提交**

```bash
git add hangyi-audit/ pom.xml
git commit -m "feat: add hangyi-audit module - operation log query and export"
```

---

### Task 3: hangyi-swap 模块（调班 + 通知）

**Files:**
- Create: `hangyi-swap/pom.xml`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/SwapApplication.java`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/entity/SwapRequest.java`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/mapper/SwapRequestMapper.java`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/dto/CreateSwapRequestDTO.java`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/dto/CreateSwapApplicationDTO.java`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/service/SwapService.java`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/service/impl/SwapServiceImpl.java`
- Create: `hangyi-swap/src/main/java/com/qyf/hangyi/swap/controller/SwapController.java`
- Create: `hangyi-swap/src/main/resources/application.yml`
- Modify: `pom.xml` (add module)

- [ ] **Step 1: 添加模块到父 pom，创建 pom.xml**（同 Task 2 模式，artifactId=hangyi-swap, port=8093）

- [ ] **Step 2: 创建 SwapRequest 实体**

```java
package com.qyf.hangyi.swap.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("swap_request")
public class SwapRequest {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String requestType;  // SWAP / SHIFT_APPLY
    private Long sourceScheduleId;
    private Long targetScheduleId;
    private Long sourceStaffId;
    private Long targetStaffId;
    private String employeeNo;
    private String name;
    private String flightNo;
    private LocalTime startTime;
    private LocalTime endTime;
    private String reason;
    private String status;        // PENDING / APPROVED / REJECTED
    private String verifier;
    private String comment;
    private Long requesterId;
    private Long approverId;
    private LocalDateTime requesterReadAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
```

- [ ] **Step 3: 创建 DTO**

```java
package com.qyf.hangyi.swap.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateSwapRequestDTO {
    @NotNull private Long sourceScheduleId;
    @NotNull private Long targetScheduleId;
    private String reason;
}

@Data
public class CreateSwapApplicationDTO {
    @NotNull private String employeeNo;
    @NotNull private String name;
    @NotNull private String flightNo;
    @NotNull private String startTime;  // HH:mm
    @NotNull private String endTime;    // HH:mm
    @NotNull private String reason;
}
```

- [ ] **Step 4: 创建 Mapper**

```java
package com.qyf.hangyi.swap.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.qyf.hangyi.swap.entity.SwapRequest;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SwapRequestMapper extends BaseMapper<SwapRequest> {
}
```

- [ ] **Step 5: 创建 Service 接口和实现**（含资质检查、通知逻辑）

```java
package com.qyf.hangyi.swap.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.swap.dto.*;
import com.qyf.hangyi.swap.entity.SwapRequest;
import java.util.Map;

public interface SwapService {
    Map<String, Object> createSwapRequest(Long userId, CreateSwapRequestDTO dto);
    Map<String, Object> createSwapApplication(Long userId, CreateSwapApplicationDTO dto);
    Page<SwapRequest> listRequests(String status, int page, int size);
    Map<String, Object> approve(Long userId, Long requestId, String decision, String comment);
    Map<String, Object> listMyNotifications(Long userId);
    void markMyNotificationsRead(Long userId);
}
```

```java
package com.qyf.hangyi.swap.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.swap.dto.*;
import com.qyf.hangyi.swap.entity.SwapRequest;
import com.qyf.hangyi.swap.mapper.SwapRequestMapper;
import com.qyf.hangyi.swap.service.SwapService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Service
public class SwapServiceImpl implements SwapService {

    @Autowired
    private SwapRequestMapper mapper;

    @Override
    @Transactional
    public Map<String, Object> createSwapRequest(Long userId, CreateSwapRequestDTO dto) {
        // 检查是否有重复的 PENDING 申请
        Long count = mapper.selectCount(new LambdaQueryWrapper<SwapRequest>()
                .eq(SwapRequest::getSourceScheduleId, dto.getSourceScheduleId())
                .eq(SwapRequest::getTargetScheduleId, dto.getTargetScheduleId())
                .eq(SwapRequest::getStatus, "PENDING"));
        if (count > 0) throw new BusinessException("该代班申请已在审批中");

        SwapRequest req = new SwapRequest();
        req.setRequestType("SWAP");
        req.setSourceScheduleId(dto.getSourceScheduleId());
        req.setTargetScheduleId(dto.getTargetScheduleId());
        req.setReason(dto.getReason() != null ? dto.getReason() : "临时代班");
        req.setStatus("PENDING");
        req.setVerifier("MANUAL");
        req.setRequesterId(userId);
        mapper.insert(req);

        Map<String, Object> result = new HashMap<>();
        result.put("requestId", req.getId());
        result.put("status", "PENDING");
        return result;
    }

    @Override
    @Transactional
    public Map<String, Object> createSwapApplication(Long userId, CreateSwapApplicationDTO dto) {
        LocalTime start = LocalTime.parse(dto.getStartTime());
        LocalTime end = LocalTime.parse(dto.getEndTime());
        if (!start.isBefore(end)) throw new BusinessException("结束时间需晚于开始时间");

        SwapRequest req = new SwapRequest();
        req.setRequestType("SHIFT_APPLY");
        req.setEmployeeNo(dto.getEmployeeNo());
        req.setName(dto.getName());
        req.setFlightNo(dto.getFlightNo());
        req.setStartTime(start);
        req.setEndTime(end);
        req.setReason(dto.getReason());
        req.setStatus("PENDING");
        req.setRequesterId(userId);
        mapper.insert(req);

        Map<String, Object> result = new HashMap<>();
        result.put("requestId", req.getId());
        return result;
    }

    @Override
    public Page<SwapRequest> listRequests(String status, int page, int size) {
        return mapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<SwapRequest>()
                        .eq(status != null, SwapRequest::getStatus, status)
                        .orderByDesc(SwapRequest::getCreatedAt));
    }

    @Override
    @Transactional
    public Map<String, Object> approve(Long userId, Long requestId, String decision, String comment) {
        SwapRequest req = mapper.selectById(requestId);
        if (req == null) throw new BusinessException("申请不存在");
        if (!"PENDING".equals(req.getStatus())) throw new BusinessException("该申请已处理");

        String newStatus = "APPROVE".equals(decision) ? "APPROVED" : "REJECTED";
        req.setStatus(newStatus);
        req.setApproverId(userId);
        req.setComment(comment);
        req.setUpdatedAt(LocalDateTime.now());
        mapper.updateById(req);

        Map<String, Object> result = new HashMap<>();
        result.put("requestId", requestId);
        result.put("status", newStatus);
        return result;
    }

    @Override
    public Map<String, Object> listMyNotifications(Long userId) {
        List<SwapRequest> list = mapper.selectList(new LambdaQueryWrapper<SwapRequest>()
                .eq(SwapRequest::getRequesterId, userId)
                .orderByDesc(SwapRequest::getUpdatedAt));

        Map<String, Integer> statusMap = Map.of("PENDING", 0, "APPROVED", 1, "REJECTED", 2);
        int unreadCount = 0;
        List<Map<String, Object>> notifications = new ArrayList<>();
        for (SwapRequest item : list) {
            boolean unread = item.getRequesterReadAt() == null
                    || item.getRequesterReadAt().isBefore(item.getUpdatedAt());
            if (unread) unreadCount++;

            Map<String, Object> n = new HashMap<>();
            n.put("id", item.getId());
            n.put("requestType", item.getRequestType());
            n.put("employeeNo", item.getEmployeeNo() != null ? item.getEmployeeNo() : "");
            n.put("name", item.getName() != null ? item.getName() : "");
            n.put("flightNo", item.getFlightNo() != null ? item.getFlightNo() : "");
            n.put("reason", item.getReason() != null ? item.getReason() : "");
            n.put("status", item.getStatus());
            n.put("comment", item.getComment() != null ? item.getComment() : "");
            n.put("unread", unread);
            n.put("createdAt", item.getCreatedAt());
            n.put("updatedAt", item.getUpdatedAt());
            notifications.add(n);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("notifications", notifications);
        result.put("unreadCount", unreadCount);
        return result;
    }

    @Override
    @Transactional
    public void markMyNotificationsRead(Long userId) {
        List<SwapRequest> list = mapper.selectList(new LambdaQueryWrapper<SwapRequest>()
                .eq(SwapRequest::getRequesterId, userId));
        LocalDateTime now = LocalDateTime.now();
        for (SwapRequest item : list) {
            item.setRequesterReadAt(now);
            mapper.updateById(item);
        }
    }
}
```

- [ ] **Step 6: 创建 SwapController**

```java
package com.qyf.hangyi.swap.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.swap.dto.*;
import com.qyf.hangyi.swap.entity.SwapRequest;
import com.qyf.hangyi.swap.service.SwapService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SwapController {

    @Autowired
    private SwapService swapService;

    private Long getUserId() {
        return Long.parseLong(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    @PostMapping("/swap/requests")
    public R<Map<String, Object>> createSwapRequest(@Valid @RequestBody CreateSwapRequestDTO dto) {
        return R.ok(swapService.createSwapRequest(getUserId(), dto));
    }

    @PostMapping("/swap/applications")
    public R<Map<String, Object>> createSwapApplication(@Valid @RequestBody CreateSwapApplicationDTO dto) {
        return R.ok(swapService.createSwapApplication(getUserId(), dto));
    }

    @GetMapping("/swap/requests")
    public R<Page<SwapRequest>> listSwapRequests(
            @RequestParam(defaultValue = "PENDING") String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        return R.ok(swapService.listRequests(status, page, size));
    }

    @PostMapping("/swap/requests/{id}/approve")
    public R<Map<String, Object>> approveSwapRequest(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return R.ok(swapService.approve(getUserId(), id,
                body.getOrDefault("decision", "APPROVE"),
                body.getOrDefault("comment", "")));
    }

    @GetMapping("/notifications")
    public R<Map<String, Object>> listMyNotifications() {
        return R.ok(swapService.listMyNotifications(getUserId()));
    }

    @PutMapping("/notifications/read")
    public R<Void> markMyNotificationsRead() {
        swapService.markMyNotificationsRead(getUserId());
        return R.ok();
    }
}
```

- [ ] **Step 7: 创建 application.yml**（port=8093, db=hangyi）

- [ ] **Step 8: 提交**

---

### Task 4: hangyi-schedule 扩展（智能排班 API）

**Files:**
- Create: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/dto/SmartScheduleRequest.java`
- Create: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/dto/MultiDayScheduleRequest.java`
- Create: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/dto/RoleScheduleRequest.java`
- Create: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/dto/ScheduleImportDTO.java`
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/controller/ScheduleController.java`
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/service/ScheduleService.java`
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/service/impl/ScheduleServiceImpl.java` (or wherever the service impl is)

- [ ] **Step 1: 创建 SmartScheduleRequest DTO**

```java
package com.qyf.hangyi.schedule.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class SmartScheduleRequest {
    @NotNull private LocalDate scheduleDate;
    @NotNull private List<Long> flightIds;
}

@Data
public class SmartScheduleSingleRequest {
    private String flightNo;
    private String airline;
    private String aircraftType;
    private LocalDate scheduleDate;
}

@Data
public class MultiDayScheduleRequest {
    @NotNull private LocalDate startDate;
    @NotNull private LocalDate endDate;
    private List<Long> flightIds;
}

@Data
public class RoleScheduleRequest {
    @NotNull private LocalDate scheduleDate;
    @NotNull private List<RoleAssignment> assignments;

    @Data
    public static class RoleAssignment {
        private String flightNo;
        private String airline;
        private String aircraftType;
        private String taskType;  // SERVICE / RELEASE
        private int requiredCount;
    }
}
```

- [ ] **Step 2: 在 ScheduleController 添加智能排班端点**

Add these methods to the existing `ScheduleController`:

```java
@PostMapping("/smart")
public R<Map<String, Object>> smartSchedule(@Valid @RequestBody SmartScheduleRequest req) {
    return R.ok(scheduleService.smartSchedule(req));
}

@PostMapping("/smart-multi-day")
public R<Map<String, Object>> smartScheduleMultiDay(@Valid @RequestBody MultiDayScheduleRequest req) {
    return R.ok(scheduleService.smartScheduleMultiDay(req));
}

@PostMapping("/smart-roles")
public R<Map<String, Object>> smartScheduleWithRoles(@Valid @RequestBody RoleScheduleRequest req) {
    return R.ok(scheduleService.smartScheduleWithRoles(req));
}

@PostMapping("/optimize")
public R<Map<String, Object>> optimizeStaffSchedule(@RequestBody Map<String, Object> payload) {
    return R.ok(scheduleService.optimizeStaffSchedule(payload));
}

@PostMapping("/import-tsv")
public R<Map<String, Object>> importScheduleFromTSV(@RequestBody Map<String, String> body) {
    return R.ok(scheduleService.importFromTSV(body.get("tsvContent"), body.get("scheduleDate")));
}

@PostMapping("/{id}/complete")
public R<Void> completeSchedule(@PathVariable Long id) {
    scheduleService.completeSchedule(id);
    return R.ok();
}

@GetMapping("/history")
public R<List<Map<String, Object>>> getScheduleHistory(
        @RequestParam String scheduleDate) {
    return R.ok(scheduleService.getScheduleHistory(scheduleDate));
}
```

- [ ] **Step 3: 在 ScheduleService 接口添加方法签名**（添加对应的接口方法）

- [ ] **Step 4: 新建 SmartScheduleService 实现智能排班**

```java
package com.qyf.hangyi.schedule.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.schedule.dto.*;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.mapper.ScheduleMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;

@Service
public class SmartScheduleService {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ScheduleDetailMapper detailMapper;
    @Autowired private ScheduleMapper scheduleMapper;

    private static final int FATIGUE_MAX_DAYS = 3;
    private static final String[] SHIFTS = {"MORNING", "AFTERNOON", "NIGHT"};

    @Transactional
    public Map<String, Object> smartSchedule(SmartScheduleRequest req) {
        LocalDate date = req.getScheduleDate();
        List<Long> flightIds = req.getFlightIds();

        // 1. 查航班
        String inClause = flightIds.stream().map(String::valueOf).reduce((a,b)->a+","+b).orElse("");
        List<Map<String,Object>> flights = jdbc.queryForList(
            "SELECT f.* FROM flight_plan f WHERE f.id IN (" + inClause + ")");
        if (flights.isEmpty()) throw new RuntimeException("未找到对应航班");

        // 2. 查在职员工及其资质
        List<Map<String,Object>> staff = jdbc.queryForList(
            "SELECT e.*, eq.aircraft_types, eq.airlines FROM employee e " +
            "LEFT JOIN employee_qualification eq ON e.id = eq.employee_id " +
            "WHERE e.status = 'ACTIVE' AND e.on_leave = 0");

        // 3. 查询当月排班 → 月度工时
        String monthStart = date.withDayOfMonth(1).toString();
        String nextDay = date.plusDays(1).toString();
        List<Map<String,Object>> monthScheds = jdbc.queryForList(
            "SELECT sd.employee_id, COUNT(*) cnt FROM schedule_detail sd " +
            "WHERE sd.work_date >= ? AND sd.work_date < ? GROUP BY sd.employee_id",
            monthStart, nextDay);
        Map<Long,Integer> monthlyHours = new HashMap<>();
        for (Map<String,Object> row : monthScheds) {
            Long eid = ((Number)row.get("employee_id")).longValue();
            int cnt = ((Number)row.get("cnt")).intValue();
            monthlyHours.put(eid, cnt * 8);
        }

        // 4. 查近30天排班 → 连续工作天数
        LocalDate thirtyAgo = date.minusDays(30);
        List<Map<String,Object>> recentScheds = jdbc.queryForList(
            "SELECT sd.employee_id, sd.work_date FROM schedule_detail sd " +
            "WHERE sd.work_date >= ? AND sd.work_date <= ?", thirtyAgo, date);
        // employeeId -> set of worked dates
        Map<Long,Set<LocalDate>> workDates = new HashMap<>();
        for (Map<String,Object> row : recentScheds) {
            Long eid = ((Number)row.get("employee_id")).longValue();
            LocalDate d = ((java.sql.Date)row.get("work_date")).toLocalDate();
            workDates.computeIfAbsent(eid, k -> new HashSet<>()).add(d);
        }

        // 今天已工作员工
        Set<Long> todayWorked = new HashSet<>();
        for (Long eid : workDates.keySet()) {
            if (workDates.get(eid).contains(date)) todayWorked.add(eid);
        }

        // 辅助: 查员工连续工作天数
        java.util.function.Function<Long,Integer> getContinuous = (eid) -> {
            Set<LocalDate> dates = workDates.getOrDefault(eid, Set.of());
            int count = 0;
            for (int i = 1; i <= 10; i++) {
                if (dates.contains(date.minusDays(i))) count++;
                else break;
            }
            return count;
        };

        // 5. 为每个航班分配员工
        List<Map<String,Object>> assignments = new ArrayList<>();
        Set<Long> usedStaff = new HashSet<>();
        Set<Long> localWorked = new HashSet<>(todayWorked);

        for (int fi = 0; fi < flights.size(); fi++) {
            Map<String,Object> flight = flights.get(fi);
            String shiftCode = SHIFTS[fi % SHIFTS.length];
            String airline = (String)flight.getOrDefault("airline","");
            String aircraftType = (String)flight.getOrDefault("aircraft_type","");

            // 筛选有资质的候选人
            List<Map<String,Object>> candidates = staff.stream()
                .filter(s -> {
                    Long sid = ((Number)s.get("id")).longValue();
                    if (usedStaff.contains(sid)) return false;
                    if (localWorked.contains(sid)) return false; // 今天已排
                    if (getContinuous.apply(sid) >= FATIGUE_MAX_DAYS) return false;
                    // 检查资质
                    String airlines = (String)s.getOrDefault("airlines","");
                    String types = (String)s.getOrDefault("aircraft_types","");
                    if (airlines == null || types == null) return false;
                    return airlines.contains(airline) && types.contains(aircraftType);
                })
                .sorted((a,b) -> {
                    Long aid = ((Number)a.get("id")).longValue();
                    Long bid = ((Number)b.get("id")).longValue();
                    int cmp = Integer.compare(
                        localWorked.contains(aid)?1:0, localWorked.contains(bid)?1:0);
                    if (cmp != 0) return cmp;
                    cmp = Integer.compare(getContinuous.apply(aid), getContinuous.apply(bid));
                    if (cmp != 0) return cmp;
                    return Integer.compare(
                        monthlyHours.getOrDefault(aid,0), monthlyHours.getOrDefault(bid,0));
                })
                .toList();

            Map<String,Object> chosen = candidates.isEmpty() ? null : candidates.get(0);
            Map<String,Object> result = new HashMap<>();
            result.put("flightNo", flight.get("flight_no"));
            result.put("airline", airline);
            result.put("aircraftType", aircraftType);
            result.put("shiftCode", shiftCode);

            if (chosen == null) {
                result.put("staffId", null);
                result.put("staffName", "");
                result.put("warning", "无人可用：" + airline + " " + aircraftType);
            } else {
                Long chosenId = ((Number)chosen.get("id")).longValue();
                usedStaff.add(chosenId);
                localWorked.add(chosenId);
                workDates.computeIfAbsent(chosenId, k -> new HashSet<>()).add(date);

                // 写 schedule_detail
                ScheduleDetail detail = new ScheduleDetail();
                detail.setEmployeeId(chosenId);
                detail.setWorkDate(date);
                detail.setShiftGroup(shiftCode);
                detail.setScheduleType("SMART");
                detail.setFlightId(((Number)flight.get("id")).longValue());
                detailMapper.insert(detail);

                result.put("staffId", chosenId);
                result.put("staffName", chosen.getOrDefault("name",""));
                result.put("continuousDays", getContinuous.apply(chosenId));
            }
            assignments.add(result);
        }

        Map<String,Object> resp = new HashMap<>();
        resp.put("scheduleDate", date);
        resp.put("assignments", assignments);
        resp.put("totalFlights", flights.size());
        resp.put("assignedCount", assignments.stream().filter(a->a.get("staffId")!=null).count());
        return resp;
    }
    // smartScheduleMultiDay, smartScheduleWithRoles 类似扩展
}
```

- [ ] **Step 5: 实现 TSV 导入**（解析 TSV 格式：flightNo, airline, aircraftType, arrival, departure, staffAssignments）

- [ ] **Step 6: 实现 completeSchedule 和 getScheduleHistory**（更新 schedule_detail 状态为 COMPLETED，查询某日所有版本包括 archived）

- [ ] **Step 7: 提交**

---

### Task 5: hangyi-statistics 模块

**Files:**
- Create: `hangyi-statistics/pom.xml`
- Create: `hangyi-statistics/src/main/java/com/qyf/hangyi/statistics/StatisticsApplication.java`
- Create: `hangyi-statistics/src/main/java/com/qyf/hangyi/statistics/service/StatisticsService.java`
- Create: `hangyi-statistics/src/main/java/com/qyf/hangyi/statistics/service/impl/StatisticsServiceImpl.java`
- Create: `hangyi-statistics/src/main/java/com/qyf/hangyi/statistics/controller/StatisticsController.java`
- Create: `hangyi-statistics/src/main/resources/application.yml`
- Modify: `pom.xml`

- [ ] **Step 1: 创建模块骨架**（同 Task 2 模式，port=8095）

- [ ] **Step 2: 创建 StatisticsService**

```java
package com.qyf.hangyi.statistics.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.*;

@Service
public class StatisticsServiceImpl implements StatisticsService {

    @Autowired private JdbcTemplate jdbc;

    @Override
    public Map<String, Object> getScheduleStatistics(String scheduleDate) {
        String today = scheduleDate != null ? scheduleDate : LocalDate.now().toString();
        String weekAgo = LocalDate.parse(today).minusDays(7).toString();

        // 1. 班组负荷对比
        List<Map<String,Object>> groupStats = jdbc.queryForList(
            "SELECT e.group_id, COUNT(DISTINCT e.id) as staff_count, " +
            "COUNT(sd.id) as task_count " +
            "FROM employee e LEFT JOIN schedule_detail sd ON e.id = sd.employee_id " +
            "AND sd.work_date = ? WHERE e.status = 'ACTIVE' GROUP BY e.group_id", today);

        // 2. 人员利用率
        List<Map<String,Object>> staffUtil = jdbc.queryForList(
            "SELECT e.id, e.name, e.employee_no, COUNT(sd.id) as task_count, " +
            "(SELECT COUNT(*) FROM schedule_detail WHERE employee_id = e.id " +
            "AND work_date >= ?) as week_count " +
            "FROM employee e LEFT JOIN schedule_detail sd ON e.id = sd.employee_id " +
            "AND sd.work_date = ? WHERE e.status = 'ACTIVE' " +
            "GROUP BY e.id ORDER BY task_count DESC", weekAgo, today);

        // 3. 资质覆盖
        List<Map<String,Object>> qualStats = jdbc.queryForList(
            "SELECT eq.aircraft_types, COUNT(DISTINCT eq.employee_id) as qualified_count, " +
            "(SELECT COUNT(*) FROM employee WHERE status = 'ACTIVE') as total_staff " +
            "FROM employee_qualification eq GROUP BY eq.aircraft_types");

        // 4. 近7天夜班分布
        List<Map<String,Object>> nightDist = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            String d = LocalDate.parse(today).minusDays(i).toString();
            List<Map<String,Object>> dayData = jdbc.queryForList(
                "SELECT shift_group, COUNT(*) cnt FROM schedule_detail " +
                "WHERE work_date = ? GROUP BY shift_group", d);
            Map<String,Object> entry = new HashMap<>();
            entry.put("date", d);
            int total = 0, night = 0;
            for (Map<String,Object> row : dayData) {
                int c = ((Number)row.get("cnt")).intValue();
                total += c;
                if ("NIGHT".equals(row.get("shift_group"))) night = c;
            }
            entry.put("total", total);
            entry.put("night", night);
            entry.put("nightRate", total > 0 ? Math.round(night * 100.0 / total) : 0);
            nightDist.add(entry);
        }

        Map<String,Object> result = new HashMap<>();
        result.put("groupStats", groupStats);
        result.put("staffUtilization", staffUtil);
        result.put("qualificationStats", qualStats);
        result.put("nightDistribution", nightDist);
        return result;
    }

    @Override
    public Map<String, Object> getStatusOverview(Long groupId, String startDate, String endDate) {
        String start = startDate != null ? startDate : LocalDate.now().minusDays(30).toString();
        String end = endDate != null ? endDate : LocalDate.now().toString();

        StringBuilder sql = new StringBuilder(
            "SELECT sd.work_date, COUNT(*) total, " +
            "SUM(CASE WHEN sd.status = 2 THEN 1 ELSE 0 END) completed " +
            "FROM schedule_detail sd ");
        if (groupId != null) {
            sql.append("JOIN employee e ON sd.employee_id = e.id AND e.group_id = ")
               .append(groupId).append(" ");
        }
        sql.append("WHERE sd.work_date BETWEEN '").append(start).append("' AND '")
           .append(end).append("' GROUP BY sd.work_date ORDER BY sd.work_date");

        List<Map<String,Object>> dailyBreakdown = jdbc.queryForList(sql.toString());
        long total = 0, completed = 0;
        for (Map<String,Object> row : dailyBreakdown) {
            long t = ((Number)row.get("total")).longValue();
            long c = ((Number)row.get("completed")).longValue();
            total += t; completed += c;
            row.put("pending", t - c);
        }

        Map<String,Object> result = new HashMap<>();
        result.put("dateRange", Map.of("start", start, "end", end));
        result.put("groupId", groupId);
        result.put("total", total);
        result.put("completed", completed);
        result.put("pending", total - completed);
        result.put("completedRate", total > 0 ? String.format("%.1f", completed * 100.0 / total) : "0.0");
        result.put("dailyBreakdown", dailyBreakdown);
        return result;
    }
}
```

- [ ] **Step 3: 创建 StatisticsController**

```java
@RestController
@RequestMapping("/api/statistics")
public class StatisticsController {
    @GetMapping("/schedules")
    public R<Map<String, Object>> getScheduleStatistics(
            @RequestParam(required = false) String scheduleDate) { ... }

    @GetMapping("/status-overview")
    public R<Map<String, Object>> getScheduleStatusOverview(
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) { ... }
}
```

- [ ] **Step 4: 提交**

---

### Task 6: hangyi-compliance 模块

**Files:**
- Create: `hangyi-compliance/pom.xml`
- Create: `hangyi-compliance/src/main/java/com/qyf/hangyi/compliance/ComplianceApplication.java`
- Create: `hangyi-compliance/src/main/java/com/qyf/hangyi/compliance/service/ComplianceService.java`
- Create: `hangyi-compliance/src/main/java/com/qyf/hangyi/compliance/service/impl/ComplianceServiceImpl.java`
- Create: `hangyi-compliance/src/main/java/com/qyf/hangyi/compliance/controller/ComplianceController.java`
- Create: `hangyi-compliance/src/main/resources/application.yml`
- Modify: `pom.xml`

- [ ] **Step 1: 创建模块骨架**（port=8096）

- [ ] **Step 2: 实现 ComplianceService**

```java
// 四项检查（与国创赛 preflightComplianceCheck 一致）：
// 1. CONCURRENT_SCHEDULE: 同一人同班次多次排班
// 2. EXCEED_CONTINUOUS: 连续工作超阈值（默认3天）
// 3. EXCEED_WORK_HOURS: 当日工时超上限（默认12h）
// 4. SAME_GROUP_CONCENTRATION: 同航班同班组≥2人

// 输入: scheduleDate + edits[] (List<{staffId, employeeNo, flightNo, shiftCode}>)
// 输出: { passed: boolean, violations: [{type, severity, staffId, staffName, description, suggestion}], summary }
```

- [ ] **Step 3: 创建 ComplianceController**

```java
@RestController
@RequestMapping("/api/compliance")
public class ComplianceController {
    @PostMapping("/preflight-check")
    public R<Map<String, Object>> preflightCheck(@RequestBody Map<String, Object> payload) { ... }
}
```

- [ ] **Step 4: 提交**

---

### Task 7: hangyi-service-schedule 模块

**Files:**
- Create: `hangyi-service-schedule/pom.xml`
- Create: `hangyi-service-schedule/src/main/java/com/qyf/hangyi/serviceschedule/ServiceScheduleApplication.java`
- Create: `hangyi-service-schedule/src/main/java/com/qyf/hangyi/serviceschedule/service/ServiceScheduleService.java`
- Create: `hangyi-service-schedule/src/main/java/com/qyf/hangyi/serviceschedule/service/impl/ServiceScheduleServiceImpl.java`
- Create: `hangyi-service-schedule/src/main/java/com/qyf/hangyi/serviceschedule/controller/ServiceScheduleController.java`
- Create: `hangyi-service-schedule/src/main/resources/application.yml`
- Modify: `pom.xml`

- [ ] **Step 1: 创建模块骨架**（port=8097）

- [ ] **Step 2: 实现 ServiceScheduleService**

```java
// getServiceScheduleTable: 查询 schedule_detail WHERE scheduleDate=? AND task_type IS NOT NULL AND record_status='active'
//   按 flightNo+taskType 分组返回 { tasks: [{flightNo, airline, aircraftType, taskType, taskStart, taskEnd, staff[]}] }

// publishServiceSchedule: 
//   1. 归档旧记录 (set record_status='archived')
//   2. 写入新排班 (source='ADMIN_ROLES', record_status='active', task_type)
```

- [ ] **Step 3: 创建 ServiceScheduleController**

```java
@RestController
@RequestMapping("/api/service-schedules")
public class ServiceScheduleController {
    @GetMapping
    public R<Map<String, Object>> getTable(@RequestParam(required = false) String scheduleDate) { ... }
    @PostMapping("/publish")
    public R<Map<String, Object>> publish(@RequestBody Map<String, Object> payload) { ... }
}
```

- [ ] **Step 4: 提交**

---

### Task 8: 前端清理和新增

**Files to remove:**
- `web/src/views/ai/Suggestion.vue`
- `web/src/views/ai/ConflictDetection.vue`
- `web/src/views/ai/AiQuery.vue`
- `web/src/api/ai.js`

**Files to create:**
- `web/src/api/swap.js`
- `web/src/api/statistics.js`
- `web/src/api/compliance.js`
- `web/src/api/audit.js`
- `web/src/api/serviceSchedule.js`
- `web/src/views/swap/SwapIndex.vue`
- `web/src/views/statistics/StatisticsIndex.vue`
- `web/src/views/compliance/ComplianceIndex.vue`
- `web/src/views/audit/AuditIndex.vue`
- `web/src/views/service-schedule/ServiceScheduleIndex.vue`

**Files to modify:**
- `web/src/router/index.js` (remove AI routes, add new routes)
- `web/src/views/dashboard/Dashboard.vue` (对接新的统计 API)
- `web/src/views/schedule/ScheduleList.vue` (增加智能排班、TSV导入入口)

- [ ] **Step 1: 删除旧 AI 页面和路由**

从 `router/index.js` 删除三个 AI 路由（/ai/suggestions, /ai/query, /ai/conflicts）。
删除 `views/ai/` 目录和 `api/ai.js`。

- [ ] **Step 2: 创建前端 API 模块**

`api/swap.js`:
```js
import request from './request'
export const createSwapRequest = (data) => request.post('/swap/requests', data)
export const createSwapApplication = (data) => request.post('/swap/applications', data)
export const listSwapRequests = (params) => request.get('/swap/requests', { params })
export const approveSwapRequest = (id, data) => request.post(`/swap/requests/${id}/approve`, data)
export const listNotifications = () => request.get('/notifications')
export const markNotificationsRead = () => request.put('/notifications/read')
```

`api/statistics.js`, `api/compliance.js`, `api/audit.js`, `api/serviceSchedule.js` 类似模式。

- [ ] **Step 3: 创建 SwapIndex.vue 页面**（调班管理：两栏布局，左侧申请列表+右侧审批操作）

- [ ] **Step 4: 创建 StatisticsIndex.vue**（排班统计：班组负荷/人员利用率/资质覆盖/夜班分布 四个图表）

- [ ] **Step 5: 创建 ComplianceIndex.vue**（合规检查：日期选择 + 排班编辑 + 检查结果列表）

- [ ] **Step 6: 创建 AuditIndex.vue**（审计日志：筛选条件 + 分页表格 + 导出按钮）

- [ ] **Step 7: 创建 ServiceScheduleIndex.vue**（勤务排班：日期选择 + 按航班分组表格 + 发布按钮）

- [ ] **Step 8: 更新路由** 添加5个新页面的路由配置

- [ ] **Step 9: 扩展 ScheduleList.vue**（增加"智能排班"和"导入TSV"按钮）

- [ ] **Step 10: 提交**

```
git add web/src/
git commit -m "feat: sync frontend - remove AI pages, add swap/statistics/compliance/audit/service-schedule views"
```

---

## 实施顺序

按依赖关系执行：Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8
