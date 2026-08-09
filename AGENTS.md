# AGENTS.md — 航翼大创 · AI 助手入口

> Codex / Claude Code 等 AI 助手进入这个仓库时必读。本文件是「如何不被绊倒」的精简版,完整文档见 `./README.md`。

---

## 0. 先判断你在哪个子项目

```
航翼排班大创/
├── hangyi/                  ← 微信小程序(原生 WXML + 微信云开发)
├── ideaprojects/hangyi/     ← Java Spring Cloud 多模块后端(主用)
└── 航翼排班/                ← 4 份文档(工作总结 / LLM RAG 规划 / 系统说明书)
```

**重要:每个子项目都有自己的 AGENTS.md / CLAUDE.md,先 cd 进去读那个,再做事。**

| 子项目 | 入口 AGENTS.md | 完整项目必读 |
|--------|----------------|--------------|
| A. 小程序 | `./hangyi/AGENTS.md` | `./hangyi/README.md`(556 行) |
| B. Java 后端 | `./ideaprojects/hangyi/AGENTS.md` | `./ideaprojects/hangyi/CLAUDE.md`(207 行) |
| C. 单体版(教学,Gitee) | 不在仓内,见 Gitee `qyf0905/hangyi-single` | 同上 |

---

## 1. 跨项目硬规则(违反就会出事)

### 1.1 Git 远端冲突 ⚠️

小程序(A)和 Java 后端(B)**共用同一个 Gitee 仓** `git@gitee.com:qyf0905/hangyi.git`,但本地工作树已分叉:

- A 最新:`07976a8c`,工作区 21 modified / 1 untracked
- B 最新:`4b91351d`,工作区 clean

**绝对不要同时 push 两边**。本仓最近的 force-push 已经覆盖了 9 个远程 commit(`ideaprojects/hangyi/CLAUDE.md` §9.5)。

修复路径:Gitee 拆出独立仓 `hangyi-miniprogram` / `hangyi-backend` → 各自 reset remote。

### 1.2 不要动 `航翼排班/` 目录

`航翼排班/飞机机队工程技术管理系统说明书.doc` 是 **2023 年另一个大创**的文档(SSM 故障处理系统),不属于当前航翼排班大创。**只读**,别误删。

### 1.3 不要新增 `ideaprojects/` 子目录

`ideaprojects/` 已重构,只保留 `hangyi/`(多模块后端)。其他 13 个练手/刷题项目已删。新增大创无关项目请放到别的位置。

### 1.4 推送前必读

```bash
# B. Java 后端推送
cd ideaprojects/hangyi
git fetch && git log --oneline HEAD..origin/master  # 有远程 commit 别 force
mvn -DskipTests clean install                       # 8 组件编译过再推
```

小程序 git 推送相对自由(微信开发者工具自己管),但仍建议先看 `git status`。

---

## 2. 大创级业务背景(高频问题速查)

- **业务**:广西机场(集团)机务/地勤智能排班,4 角色(ADMIN/BOSS/TEAM_LEADER/STAFF)
- **排班算法**:OptaPlanner 9.44.0,10 条约束(5 业务硬 + 3 CCAR-145 民航硬 + 2 软)
- **跨端协议**:小程序(云开发 NoSQL)↔ Java 后端(MySQL),凭证从云 DB `settings` 集合动态读
- **关键路径(出 bug 必查)**:
  - `hangyi-schedule/.../solver/...` — OptaPlanner 求解器
  - `hangyi-auth/.../service/SyncService.java` — 540 行上帝服务(待拆 C-3)
  - `ideaprojects/hangyi/hangyi-schedule/.../service/ScheduleService.java:188,257,304` — N+1 性能问题
  - `web/src/store/user.js` — JWT 存 localStorage(XSS 风险,H-3)
  - `hangyi/web/.../api/request.js` — 拦截器 `return data` 业务层约定

---

## 3. 怎么跑测试

```bash
# A. 小程序云函数 129 个测试,~230ms
cd hangyi/cloudfunctions/quickstartFunctions
npm install  # 一次性
node -r ./__test__/test-helper.js --test __test__/*.test.js

# B. Java 后端 44 JUnit + 1 Playwright e2e
cd ideaprojects/hangyi
mvn -DskipTests clean install          # 8 组件整体编译(快速验证)
mvn test                               # 全量单元测试
npx playwright test tests/e2e/         # e2e(需先启动后端)
```

---

## 4. 不要做这些事

- **不要删 `ideaprojects/hangyi-single/`** — 已经在仓内时也不要恢复(Gitee 有 public 镜像,需要时 `git clone`)
- **不要把 `hangyi-single` Gitee 仓内容 push 到主 Gitee 仓** — 远程会冲突
- **不要在小程序里改云函数时不更新测试** — `__test__/test-e2e.test.js` 必须跟 `router/*.js` 同步加 case
- **不要在 Java 后端用 `wrapper.last("LIMIT " + offset + "," + size)` 字符串拼接** — 见 CLAUDE.md §4.4(已加豁免但要升级 MP)
- **不要往小程序 `.wxss` 里写 emoji 当图标** — 跨端渲染不一致,改 SVG/PNG
- **不要在 Spring Boot 代码里抛 `RuntimeException`** — 用 `BusinessException`,见 CLAUDE.md §4.3
- **不要在 Vue 路由 hardcode 路径** — 用 `router.push({name: 'xxx'})`

---

## 5. 进一步阅读

- `./README.md` — 完整大创全景(323 行,9 章节)
- `./航翼排班/航翼本次工作总结.md` — Phase A→J 完整工作交接(694 行,**接手必读**)
- `./航翼排班/航翼LLM_RAG实施规划.md` — 计划新增第 7 个微服务 `hangyi-assistant`,**未实施**
- `~/.claude/memory/` — 个人经验沉淀(6 条项目相关)
