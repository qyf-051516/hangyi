# 航翼排班系统 (HangYi Scheduling)

广西机场机务/地勤智能排班系统 — 微服务架构

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Spring Boot 3.3, Spring Cloud 2023, Spring Cloud Alibaba |
| 服务注册/配置 | Nacos |
| 网关 | Spring Cloud Gateway |
| 数据库 | MySQL 8.0, Redis 7 |
| ORM | MyBatis-Plus 3.5 |
| 排班引擎 | Timefold Solver (AI 约束求解) |
| AI 服务 | Spring AI + Ollama (Qwen2.5) |
| 前端 | Vue 3 + Vite (Web), UniApp (移动端) |
| 部署 | Docker Compose |

## 模块结构

```
├── hangyi-gateway      # API 网关 (8080)
├── hangyi-auth         # 认证/授权服务 (8081)
├── hangyi-employee     # 人员管理服务 (8082)
├── hangyi-schedule     # 排班核心服务 - Timefold 求解器 (8083)
├── hangyi-flight       # 航班信息服务 (8084)
├── hangyi-leave        # 请假审批服务 (8085)
├── hangyi-dashboard    # 仪表盘 & 数据看板 (8086)
├── hangyi-ai           # AI 智能助手 (8087)
├── hangyi-common       # 公共模块 (工具类、配置)
├── web                 # 管理后台前端 (Vue 3)
├── mobile              # 移动端 (UniApp)
├── db                  # 数据库脚本
└── deploy              # 部署脚本
```

## 快速开始

### 前置要求

- Docker & Docker Compose
- 推荐 8G+ 内存（如需启用 AI 服务）

### 一键启动

```bash
./start.sh
```

### 手动启动

```bash
docker compose up -d --build
# 启用 AI 服务（需要 GPU 或足够内存）：
docker compose --profile ai up -d --build
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端管理后台 | http://localhost:8089 |
| API 网关 | http://localhost:8080/api |
| Nacos 控制台 | http://localhost:8848/nacos |
| MySQL | localhost:3307 (root/hangyi123) |
| Redis | localhost:6380 |

### 默认管理员账号

- 用户名：`admin`
- 密码：`admin123`

## 功能概览

- 智能排班：基于 Timefold Solver 约束求解，自动生成最优排班方案
- 人员管理：员工信息、资质、技能标签管理
- 航班管理：航班计划、动态调整
- 请假管理：申请、审批、排班联动
- 数据看板：排班情况、出勤统计可视化
- AI 助手：基于本地大模型的排班建议与答疑
- 移动端：员工查看排班、签到、请假（UniApp）
