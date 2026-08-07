# 航翼排班 · 上线前 BLOCKS 修复 TODO

> 上线前最后一关。**3 项 P0 BLOCKS 不修不能上线**；3 套回归脚本全绿才能发版。
> 项目根：`~/IdeaProjects/hangyi`，部署根：`~/hangyi-deploy`
> 配套回归脚本：`~/Desktop/航翼排班回归测试脚本.md`

---

## 🔴 P0 BLOCKS

### BLOCKS-H1 · 跑数据库迁移脚本，添加 `schedule_detail.source_key` 字段

- **不修后果**：甘特图直接 500；`SyncService` 内 `setSourceKey` 在生产 DB 上 NPE/字段不存在
- **现场**：`/Users/qyf/IdeaProjects/hangyi/db/02-fix-audit-findings.sql` line 8–10 已经写好了 `ALTER TABLE … ADD COLUMN source_key … ADD UNIQUE KEY uk_source_key`
- **操作**：
  ```bash
  mysqldump -u root -p hangyi > ~/hangyi-backup-$(date +%Y%m%d).sql
  mysql -u root -p hangyi < /Users/qyf/IdeaProjects/hangyi/db/02-fix-audit-findings.sql
  mysql -u root -p hangyi -e "DESCRIBE schedule_detail" | grep source_key
  ```
- **引用代码**：`hangyi-core/src/main/java/com/qyf/hangyi/core/auth/service/SyncService.java:313, 324`
- **回归脚本**：`REG-H1`

### BLOCKS-H2 · Docker 容器固化 `TZ=Asia/Shanghai`

- **不修后果**：源码全用 `LocalDate.now()`（按项目禁 NOW()/CURDATE() 规范），容器时区漂移到 UTC 会直接破坏排班/统计日期边界
- **现场**：项目主仓库**没有** start.sh/Dockerfile，部署根 `~/hangyi-deploy/` 也没有 —— 脚本已剥离到外层
- **操作**（二选一）：
  - **方案 A（推荐）**：`~/hangyi-deploy/docker-compose.override.yml` 给 core/schedule/gateway 加：
    ```yaml
    environment:
      TZ: Asia/Shanghai
      JAVA_TOOL_OPTIONS: ...  # 已有
    ```
  - **方案 B**：Dockerfile 加 `ENV TZ=Asia/Shanghai`
- **额外建议**：`application.yml` 加 `spring.jackson.time-zone: Asia/Shanghai` 双重保险
- **回归脚本**：`REG-H2`

### BLOCKS-H3 · 修复 LoadBalancer 缓存坑

- **不修后果**：`docker compose restart` 业务容器换 IP 后，gateway 缓存旧 IP 返回 500
- **现场排查**：项目内 0 命中 `caffeine|loadbalanc` —— 当前**没有自定义 LB 配置**，用的是 Spring Cloud 默认轮询（默认 TTL 35s 但易残留）
- **操作**：
  1. **立即修复**：在 `~/hangyi-deploy/` 加启动脚本，按 **"先 restart 业务 → 再 restart gateway"** 顺序
  2. **根治方案**：在 `hangyi-gateway` 加自定义配置：
     ```yaml
     spring:
       cloud:
         loadbalancer:
           cache:
             ttl: 5s
             capacity: 256
     ```
- **回归脚本**：`REG-H3`

---

## 🟡 P1 WARN · 建议修但不阻塞上线

### WARN-H4 · Jackson 时区双重保险
- 配合 H2：各模块 `application.yml` 加 `spring.jackson.time-zone: Asia/Shanghai`

### WARN-H5 · Gateway 加重试 + 熔断
- 当前 gateway 默认无 Sentinel/Resilience4j 集成，瞬时不可用直接 500
- 建议加 `spring.cloud.gateway.default-filters` 或 Sentinel

---

## 修复顺序建议

1. **BLOCKS-H1**（5 分钟）
2. **BLOCKS-H2 + BLOCKS-H3**（部署配置相关，可并行）
3. 全部修完跑 `~/Desktop/航翼排班回归测试脚本.md`

## 修复完成判定

- [ ] 3 项 BLOCKS 全部标记为 ✅
- [ ] 3 套回归脚本全绿
- [ ] WARN 项归档到 v1.1 计划
- [ ] 部署脚本更新到位（override.yml + 时区）