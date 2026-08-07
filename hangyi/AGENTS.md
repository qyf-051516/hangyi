# AGENTS.md — hangyi 微信小程序

> Codex / Claude Code 进入这个子项目时必读。完整文档见 `./README.md`。

---

## 0. 怎么知道你在对的地方

- 当前目录有 `cloudfunctions/` + `miniprogram/` + `project.config.json` + `project.private.config.json`
- 父目录有 `ideaprojects/`(Java 后端)
- 不要把这里跟 `ideaprojects/hangyi/` 搞混 —— **栈完全不同**(原生 WXML vs Spring Cloud)

---

## 1. 技术栈

| 层 | 选型 |
|----|------|
| 前端 | 微信小程序原生(WXML / WXSS / JS,**不是 Vue/React**) |
| 后端 | 微信云开发 · 云函数(Node.js,13 个 router) |
| 首管 | 独立云函数 `cloudfunctions/bootstrapAdmin/`(仅云开发控制台执行) |
| 定时 | 独立云函数 `cloudfunctions/syncToHangyi/`(每 5 分钟) |
| DB | 微信云开发 NoSQL(7 个集合,文档型,**不是 MySQL**) |
| 鉴权 | 微信 OPENID + Web 端 JWT 互通 |
| 缓存 | 非鉴权数据使用云函数实例级 Map 缓存(TTL)+ 本地 `wx.storage` 缓存(30s)；账号与管理员权限实时查库 |

---

## 2. 目录速查

```
hangyi/
├── miniprogram/
│   ├── app.js / app.json / app.wxss       # 全局入口 / 路由 / 主题 token
│   ├── pages/                              # 23 个页面
│   ├── utils/                              # api.js / cache.js / date.js / media.js / ui.js
│   └── images/                             # tabBar icons + 默认头像
├── cloudfunctions/
│   ├── quickstartFunctions/                # 主业务云函数(13 router)
│   │   ├── index.js                        # 入口,合并 13 router + try/catch
│   │   ├── router/                         # 业务模块(auth/schedule/flight/...)
│   │   ├── __test__/                       # 208 个单测
│   │   └── package.json                    # wx-server-sdk / qrcode / node-xlsx
│   ├── bootstrapAdmin/                     # 控制台专用首个管理员自举
│   └── syncToHangyi/                       # 定时增量同步
├── schedule.tsv                            # TSV 排班导入示例
├── uploadCloudFunction.sh                  # 云函数批量上传脚本
└── README.md                               # 完整项目文档
```

---

## 3. 怎么跑测试(脱离微信环境)

```bash
cd cloudfunctions/quickstartFunctions
npm install  # 一次性
node -r ./__test__/test-helper.js --test __test__/*.test.js
# 208 个测试,~100ms
```

**测试不用微信开发者工具**,mock 框架替换了 `wx-server-sdk` / `qrcode` / `node-xlsx`。改云函数业务代码前先跑一遍确认基线。

---

## 4. 改云函数的硬规则

### 4.1 新增端点要同步加测试

`__test__/test-e2e.test.js` 当前有 155 个 case，覆盖 `router/*.js` 的关键端点和页面源码契约。**新增 `router/<x>.js` 的导出函数,必须对应在 `test-e2e.test.js` 加 case**。否则下次重构会偷偷 break 业务。

### 4.2 跨端调用凭证不要写死

`hangyiApiUrl` / `hangyiApiKey` / `hangyiSyncEnabled` 与
`assistantApiUrl` / `assistantApiKey` / `assistantEnabled` 必须从云 DB
`settings` 集合读:

```js
const settings = await db.collection("settings")
  .where({ key: db.command.in(["hangyiApiUrl", "hangyiApiKey", "hangyiSyncEnabled"]) })
  .get();
```

参考 `cloudfunctions/quickstartFunctions/router/hangyi-sync.js` 的 `callHangyiService` 封装。

### 4.3 管理员权限校验统一在 router 层

写操作端点(`setStaffAdmin` / `setSetting` / `approveSwapRequest` / `updateFlightRealtimeStatus` / `propagateScheduleDelay`)必须调用 `requireAdmin(openid)` 守卫,见 `router/auth.js` 或各 router 顶部的 `requireAdmin` helper。**不要在业务逻辑里散落 `if (isAdmin)` 判断**。

### 4.4 管理员自举

当前代码**没有硬编码管理员账号**，登录只读取 `staff.isAdmin === true`。
首次创建管理员使用独立 `cloudfunctions/bootstrapAdmin/`：

- 先在小程序用目标工号登录，让该员工绑定 OPENID。
- 上传并部署 `bootstrapAdmin`。
- 在云开发控制台对它执行云端测试：
  `{"employeeNo":"GH001","confirmText":"CREATE_FIRST_ADMIN"}`。
- 回到“小程序 -> 我的 -> 管理员开通”刷新状态。

该函数同时校验 OPENID 与 SOURCE，拒绝小程序、开发者工具客户端、HTTP、
Web 客户端及其他云函数转调；目标员工必须 active 且已绑定微信。
系统已有可用管理员后会拒绝再次自举；若只残留未绑定或已停用的旧管理员，
会撤销这些失效权限后恢复首管。旧的
`bootstrapTestAdminEnabled` + `bootstrapTestAdminToken` 路由仅作兼容，
不再是推荐流程。禁止重新加入 `admin/admin/11111111111` 等按账号字段
自动提权的逻辑。

### 4.5 NoSQL 注入防护（2026-07-07 新增）⭐

所有从 `event.data` 取出的用户输入，在传入 `db.collection().where()` 查询条件或写入数据库前，必须做以下校验：

**字符串字段 — `typeof` 守卫**：
```js
if (typeof value !== "string") return fail("参数类型错误", 400);
```

**枚举字段 — 白名单校验**：
```js
const VALID_STATUS = ["PENDING", "APPROVED", "REJECTED"];
if (!VALID_STATUS.includes(status)) return fail("无效状态", 400);
```

**日期字段 — 正则格式校验**：
```js
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("日期格式错误", 400);
```

**自由文本字段 — 长度截断**：
```js
const safeText = String(text || "").trim().slice(0, 500);
```

**数组字段 — 类型+值域校验**：
```js
if (!Array.isArray(arr)) return fail("必须是数组", 400);
if (!arr.every(item => typeof item === "string")) return fail("数组元素格式错误", 400);
```

违反此规则会导致 NoSQL 注入（传入 `{"$regex":".*"}` 绕过查询过滤条件）。

---

## 5. 改前端的硬规则

### 5.1 WXSS 不要用 emoji 当图标

跨端(iOS 彩色 / Android 部分灰 / HarmonyOS 其他)渲染不一致,**全在 `miniprogram/pages/mine/index.wxml` 见到 `📅 ⚠️ 👤 🛩️ 🔄 📬 📋 ⚙️` 这种**。要改用:
- `images/icons/*.png` 已有(用于 tabBar)
- 建议引入 SVG 组件,内联 currentColor 跟随主题

### 5.2 主题走 app.wxss 的 CSS 变量

`miniprogram/app.wxss` 已经定义了:
- `--c-primary` / `--c-accent` / `--c-warn` / `--c-danger`(语义色)
- `--fs-body` / `--fs-meta` / `--fs-mini`(字号)
- `--r-card` / `--gap-card`(间距)
- `.t-display` / `.t-title` / `.t-section` / `.t-body` / `.t-meta` / `.t-mini`(类型类)

**所有页面的 `.page` / `.card` / `.theme-light` / `.theme-dark` 不要再各自定义** —— 直接继承基类。

### 5.3 emoji / em dash 限制

**不要在 WXSS / WXML / JS 注释里用 emoji 或 em dash(—)**。WXSS 注释里出现会显示成方块;WXML 里出现在 iOS 彩色 / Android 灰色不一致。

### 5.4 按钮触控区域 ≥ 64rpx

iOS HIG 推荐 44pt(微信 = 88rpx),Android 推荐 48dp。**所有 bindtap 的可点元素** min-height 至少 64rpx,date 切换箭头等小元素尤其注意(之前总览页的 ◀ ▶ 只有 28rpx,已修)。

### 5.5 排班表不要把全部 15 列塞进手机屏

`pages/staffSchedule/index.wxml` 表格 `min-width: 2500rpx` 需要横滑,**不要继续加列**。详情字段进 row 展开 card。

---

## 6. 常见坑

| 现象 | 原因 | 修法 |
|------|------|------|
| `wx.cloud.callFunction` 返回 `{result: null}` | `env` 不对或云函数没部署 | 检查 `app.js` 的 `env` + 微信开发者工具右键上传 |
| 演示数据初始化后 `bootstrap.js` 报 `staff` 集合已存在 | 重复 seed | 用 `resetDemoData` 端点(它会先 purge) |
| 跨端同步推不上去 | `settings.hangyiSyncEnabled` 不是 `"true"` 字符串 | 在云 DB settings 改;不是 `true` boolean |
| admin 守卫报 403 | 当前员工的 `isAdmin` 不是 `true` | 查询 `staff` 集合；首次部署按 §4.4 完成管理员自举 |
| `requireAdmin` 找不到 | 没在 `router/x.js` 顶部 import | 从 `router/auth.js` 引用 helper |

---

## 7. 推送 / 部署

```bash
# 云函数(在微信开发者工具里)
# 右键 cloudfunctions/quickstartFunctions → 上传并部署:云端安装依赖
# 右键 cloudfunctions/bootstrapAdmin → 上传并部署:云端安装依赖
# 右键 cloudfunctions/syncToHangyi → 上传并部署:云端安装依赖

# 代码 git
git status
git add -A
git commit -m "..."
# ⚠️ 远端跟 Java 后端共用,见 ../../AGENTS.md §1.1
```

---

## 8. 进一步阅读

- `./README.md` — 完整功能 / 数据模型 / 云函数接口清单(556 行)
- `../AGENTS.md` — 大创级规则(Git 远端冲突 / 子项目边界)
- `../航翼排班/航翼本次工作总结.md` — 业务历史 + 已修 bug 列表
- `../README.md` — 大创全景(三个子项目 + 跨端协议 + 待办)

---

## 9. 当前状态与待办（2026-07-26 探索记录）

### 当前状态

- 已确认当前目录为微信小程序子项目 `hangyi`，不是 `ideaprojects/hangyi` Java 后端。
- 技术入口：`miniprogram/app.js` 初始化云环境；`cloudfunctions/quickstartFunctions/index.js` 合并 11 个业务 router 并按 `event.type` 分发；另有定时云函数 `cloudfunctions/syncToHangyi/index.js`。
- 规模：19 个小程序页面、11 个业务 router、3 个测试文件；云函数源码 Node 语法检查通过。
- 当前分支：`master`，HEAD 与 `origin/master` 均为 `07976a8c`。工作区存在用户未提交改动：27 个已修改文件、2 个未跟踪文件（包含 `__test__/register-mock.js`），探索过程中未重置、暂存或提交。
- 基础验证：在 `cloudfunctions/quickstartFunctions` 执行 `node -r ./__test__/test-helper.js --test __test__/*.test.js`，129/129 通过；`git diff --check` 通过。
- 当前未提交改动主要集中在云函数输入校验/安全加固、`wx-server-sdk` 锁文件升级，以及小程序全局和多页面 WXSS/WXML 视觉调整。

### 待办

- 处理或确认当前 27 个已修改文件和 2 个未跟踪文件的归属，再决定是否拆分提交。
- 若继续改云函数：先复跑 129 个测试，并为新增端点同步补充 `test-e2e.test.js` case。
- 继续清理原有 WXML/WXSS/注释中的 emoji 与 em dash，遵守跨端渲染规则；本次探索仅记录问题，没有改动。
- 生产部署前确认 `miniprogram/app.js` 云环境、`settings` 中同步配置，以及测试 admin 硬编码块是否已移除。

---

## 10. 修复记录（2026-07-26 安全加固 + 跨端一致性）

### 10.1 已修复的问题

1. **生产安全风险**
   - `cloudfunctions/syncToHangyi/index.js` 关闭了 HTTPS 证书校验 (`rejectUnauthorized: false`)，已改为默认走 Node 受信 CA，自签证书需在 `settings.hangyiApiCaPem` 显式提供；同时对失败批次保留游标，避免失败后被静默跳过。
   - `cloudfunctions/quickstartFunctions/router/auth.js` 删除了 `isHardcodedTestAdmin` 三件套识别逻辑（`admin/admin/11111111111`），改为由 admin 字段唯一决定权限。
   - `cloudfunctions/quickstartFunctions/router/bootstrap.js` 取消 `seedStaffIfNeeded` 中硬编码测试 admin 的 `ADMIN` 种子；`bootstrapTestAdmin` 改为必须 `settings.bootstrapTestAdminEnabled=true` + `settings.bootstrapTestAdminToken=<token>`，并在成功后自动关闭开关、清空 token；如系统已有 admin 则强制要求调用方已是 admin。
   - 已同步更新 `test-security.test.js` 的硬编码 admin 用例与 `test-e2e.test.js` 的 60/61 员工数断言。

2. **跨端 emoji / em dash 清理**
   - 全仓脚本化移除 `Extended_Pictographic` 字符和 `—`，再按 WXML 元素填充中文占位（`班` `勤` `调` `信` `资` `设` `编` `史` `记` `!` `审` `查` `表` `图` `文` `TSV` `排`）。
   - `app.wxss` 的页面装饰 `🛫🛬` 改为半透明圆形装饰，保留跨端稳定。
   - `adminSchedule` / `serviceSchedule` / `auditLogs` / `scheduleHistory` / `mySchedules` 等页面的占位节点都已填入可见字符。
   - SVG `arrow.svg` 内含的 `☀ iOS/☀ 图标/...` 标题/ID 已清理为纯文本。

3. **文档与统计漂移**
   - `README.md` 中“60 名员工 / 12 个配置项 / 129 个测试”已统一，与现有测试输出对齐；`bootstrapData` 表格注释亦同步刷新。
   - `AGENTS.md` §4.4、§9 中关于硬编码测试 admin 的描述已更新为新流程。

### 10.2 验证

- `node --check` 通过：`cloudfunctions/quickstartFunctions/router/auth.js` `bootstrap.js` `admin.js` `cloudfunctions/syncToHangyi/index.js`。
- `node --check` 通过：所有 `miniprogram/**/*.js`。
- `cd cloudfunctions/quickstartFunctions && node -r ./__test__/test-helper.js --test __test__/*.test.js` 输出 `tests 129 / pass 129 / fail 0`，耗时 ~70ms。

### 10.3 待办

- 本条记录中的 settings + Token 流程已被 §21 的独立 `bootstrapAdmin` 取代，仅保留为旧版兼容入口。
- Java 后端的 `hangyiApiCaPem` 默认无需设置；若使用自签 HTTPS，再配置。
- 重新生成 `schedule.tsv` / 种子航班时确认使用的是 `60` 名员工 + 12 个配置项。

## 11. Agent + RAG 双端落地计划

- 路径：`./航翼Agent+RAG双端落地计划.md`（v2.1）
- v2.1 已纠正 8086 端口冲突、云函数不可访问 localhost、settings 应按 `key` 查询、NL2SQL 过早进入 MVP 四个问题。
- 小程序云函数模块：`cloudfunctions/quickstartFunctions/router/assistant.js`。
- settings 新增 `assistantApiUrl` / `assistantApiKey` / `assistantEnabled`，默认全部不可用或关闭。
- 当前进度：P0-P3 已在 §28 完成；知识入库、RAG、历史、反馈、配额和评测均已实现，
  等待真实环境部署和业务资料验收。

## 12. P0 功能缺口修复（2026-07-27）

按探索结论的 P0 清单修复 3 项高频缺口，新增 21 个云函数测试（129 → 150）。

### 12.1 已新增

| 模块 | 文件 | 端点 | 备注 |
|---|---|---|---|
| 请假申请 | `router/leave.js` (12.5 KB) | `createLeaveRequest` `withdrawLeaveRequest` `listMyLeaveRequests` `listPendingLeaveRequests` `approveLeaveRequest` | 输入校验、时段冲突检测、覆盖今日时同步 `staff.onLeave` |
| 调班撤销 | `router/swap.js` | `withdrawSwapRequest` | 仅本人 + 仅 PENDING → CANCELLED |
| 管理员引导 | `router/admin.js` | `getBootstrapStatus` | 返回脱敏状态 + 步骤文案 + 示例调用 |

### 12.2 已新增前端

| 页面 | 路径 | 用途 |
|---|---|---|
| 请假申请 | `pages/leave/index.{js,json,wxml,wxss}` | 员工提交 + 撤回 + 列表；admin 模式可审批 |
| 管理员开通 | `pages/bootstrapAdmin/index.{js,json,wxml,wxss}` | 显示当前状态 + 控制台参数 + 权限刷新 |

### 12.3 测试

- `cloudfunctions/quickstartFunctions/__test__/test-e2e.test.js` 加 21 个 case（leave 17 + swap.withdraw 3 + admin.getBootstrapStatus 1）
- 全量 150/150 通过，~80ms

### 12.4 数据集合变更

- 新增 `leave_requests` 集合（已在 `utils.js COLLECTIONS` 中）
- 字段：`employeeNo, name, openid, type, typeText, startDate, endDate, totalDays, reason, status, approverOpenid, approver, approvedAt, comment, cancelledAt, createdAt, updatedAt`
- 状态机：PENDING → APPROVED | REJECTED | CANCELLED

### 12.5 待办（用户视角）

- 本条记录中的 settings + Token 流程已被 §21 的独立 `bootstrapAdmin` 取代；新部署不要再手工创建这两个配置。
- 部署后：`bootstrapData` 会自动 ensureCollection 创建 `leave_requests` 集合（已在 router/leave.js 中调用）
- 部署后：系统已有可用 admin 时，"管理员开通"页面会提示联系现有管理员授权

## 13. 功能闭环优化（2026-07-27）

### 13.1 已完成

- 修复 `pages/leave/index.js` 与 `pages/bootstrapAdmin/index.js` 的工具引用层级错误，两个新页面可正常加载。
- 请假页面补齐 `mode=approval` 管理员模式：按状态筛选、批准、填写原因后驳回、下拉刷新。
- 新增 `listMySwapRequests` 端点；调班页面可查看本人申请记录、状态和审批备注，并撤回 `PENDING` 申请。
- 调班提交后留在当前页面并立即刷新记录，不再跳到预警页。
- 通知中心聚合 `swap_requests` 与 `leave_requests`，支持 `CANCELLED` 状态，并可跨两个集合一键已读。
- 调班、请假和通知页面启用下拉刷新；相关可点击按钮触控区域不低于 64rpx。
- 新增 4 个回归用例，覆盖本人调班列表、NoSQL 类型拦截、请假通知聚合、跨集合一键已读及页面入口源码检查。

### 13.2 验证

- 所有相关 JavaScript 文件通过 `node --check`。
- `node -r ./__test__/test-helper.js --test __test__/*.test.js`：154/154 通过，0 失败。
- `git diff --check` 通过。

### 13.3 待办

- 在微信开发者工具中分别实机预览员工请假、管理员审批、调班撤回和通知已读交互。
- 部署时同时上传 `quickstartFunctions`，否则小程序端新增的 `listMySwapRequests` 调用不可用。

## 14. Agent + RAG P0 基建（2026-07-27）

### 14.1 已完成

- 新增 `router/assistant.js` 四个端点：状态、问答、历史和反馈。
- 云函数从 OPENID 绑定的 active staff 生成下游身份；客户端不能传可信 openid。
- Java 地址和 internal key 只从 settings 读取；仅允许公网 HTTPS，含 25 秒超时和 1 MB 响应上限。
- 新增 `pages/assistant` 及"我的 -> 智能助手"入口，本地缓存最近 20 条、TTL 7 天。
- `bootstrapData` 补齐 3 个原来漏 seed 的排班设置，并新增 3 个助手设置；当前再加 `demoToolsEnabled`，共 18 项。
- 双端方案已在 §28 升级为 v3.0；Java Assistant 固定 9004，Qdrant/Ollama 只走内部网络。

### 14.2 验证

- 云函数测试 165/165 通过。
- 新增 Java `hangyi-assistant` Controller 测试 7/7 通过。

### 14.3 待办

- 不要提前打开 `assistantEnabled`。先完成公网 HTTPS、P1 入库和 P2 RAG 验收。
- 已初始化过的云环境需再运行一次 `bootstrapData`，或手工补齐 3 个 assistant setting。
- 在微信开发者工具中验证输入区、长消息、引用和深浅主题。
- P1 实现 ingestion 时补 dry-run、增量删除、全量重建和 Recall@5 评测。

## 15. Agent + RAG 使用说明（2026-07-27）

- 路径：`./航翼Agent+RAG使用说明.html`。
- 内容：当前 P0 边界、首次部署、云 DB 配置、小程序员工操作、日常启停、
  测试验收、故障排查、安全回滚和文件索引。
- 文档明确要求 P1/P2 完成前保持
  `ASSISTANT_ENGINE_ENABLED=false`、`assistantEnabled="false"`。

## 16. 版本控制交付（2026-07-28）

### 16.1 当前状态

- 本批功能、安全、界面及 Agent + RAG P0 改动已整理到
  `codex/agent-rag-foundation` 分支，基线为 `origin/master@07976a8c`。
- 提交前完整云函数测试为 165/165 通过。
- 所有小程序与云函数 JavaScript 文件均通过 `node --check`，
  `git diff --check` 通过。
- 管理员规则已统一为一次性 Token 自举，不再存在硬编码管理员账号。

### 16.2 待办

- 代码评审通过后再合并到 `master`。
- 合并部署时上传 `quickstartFunctions`，并在微信开发者工具完成实机验证。
- P1/P2 未验收前继续保持两端助手开关关闭。

## 17. 小程序 P0 业务闭环修复（2026-07-28）

### 17.1 已完成

- 演示数据重建、长停模拟和流量模拟改为管理员专用，并受
  `settings.demoToolsEnabled="true"` 双重控制；默认关闭。
- `resetDemoData` 不再清空 settings，并保留当前管理员；首页和风险中心不再自动生成演示数据。
- 删除 bootstrap 中写死的 Hangyi 地址和 internal key，新环境默认写入空值。
- 调班/代班申请统一使用 OPENID 绑定员工身份；单人调班必须选择本人真实排班。
- 单人调班审批必须选择符合资质、未请假且当天无排班冲突的替班人，并实际改写 schedule。
- 互换审批增加人员状态、请假和同日排班冲突复核；审批队列及可用人员列表仅管理员可读。
- 请假申请身份改为服务端派生；批准请假后标记区间内未完成排班为待改派。
- 排班可用性以 `leave_requests` 的已批准日期区间为准，`staff.onLeave` 仅作当天快照。
- 排班完成增加本人、状态、归档、日期和请假冲突校验，且写入完成审计日志。
- 首页审批待办拆分调班/请假，权限相关缓存不再跨账号复用；调班、请假、我的排班页面同步优化。
- `updateSchedulingConfig` 补管理员守卫，`setSetting` 拒绝对象型配置值。

### 17.2 验证

- 全部小程序和云函数 JavaScript 文件通过 `node --check`。
- 云函数全量测试 `177/177` 通过，0 失败。
- `git diff --check` 通过；本次涉及的 WXML/WXSS/JS 未新增 emoji 或 em dash。
- 全仓已移除历史硬编码服务地址和内部密钥字面量。

### 17.3 当前状态与待办

- 当前仍在 `codex/agent-rag-foundation` 分支，本批修改尚未提交或推送。
- 部署时上传 `quickstartFunctions`，然后再执行一次 `bootstrapData` 补齐
  `demoToolsEnabled`；生产环境保持为 `"false"`。
- 已初始化环境不会被 bootstrap 覆盖旧同步配置，必须在 Java 端轮换旧 key，
  再手工更新 `hangyiApiUrl` / `hangyiApiKey`。
- 旧版缺少 `sourceScheduleId` 的 `SHIFT_APPLY` 不能直接审批，应驳回并让员工重新提交。
- 仍需在微信开发者工具实机验证：首页权限切换、调班选择替班人、请假冲突提示和完成按钮状态。

## 18. 高频路径使用体验优化（2026-07-28）

### 18.1 已完成

- 首页按员工/管理员身份显示不同快捷入口；补齐骨架屏、页面内错误重试、
  更新时间、回到今天和下拉刷新。
- 首页三组环形图改为紧凑的人员分配条，审批待办继续区分调班和请假。
- 全员排班从 `2500rpx` 的 16 列横向表改为手机卡片列表；支持选择日期、
  姓名/工号/航班/机型搜索、班组/班次/状态筛选和人员详情展开。
- 排班卡片保留资质、工时、休假、航班、航司、机型、进出港和停留时间，
  请假冲突与待改派状态有独立提醒。
- 通知中心增加全部/未读/调班/请假筛选；通知默认展示摘要，点击后展开原因、
  审批备注和对应申请入口。
- 替班审批从最多 6 人的 ActionSheet 改为完整候选人弹窗，可按姓名、工号、
  班组和资质搜索，选择后再次确认；互换与批量通过也增加确认步骤。
- 全局按钮最小高度统一为 `64rpx`，高频页面补齐 `hover-class` 按压反馈、
  安全区底部间距以及一致的加载、空数据和失败状态。

### 18.2 验证

- 全部小程序和云函数 JavaScript 文件通过 `node --check`。
- 高频页面 WXML 标签平衡与页面 JSON 解析检查通过。
- 云函数全量测试 `178/178` 通过，0 失败；新增 1 个高频页面交互源码回归用例。
- `git diff --check` 通过；涉及的 WXML/WXSS/JS 未新增 emoji 或 em dash。

### 18.3 当前状态与待办

- 本轮体验优化与前一批 P0 修复归入 `codex/agent-rag-foundation` 分支交付。
- 需在微信开发者工具重点实机检查：小屏筛选区、长姓名/长资质换行、候选人弹窗滚动、
  深浅主题、下拉刷新和 iOS 底部安全区。
- 微信开发者工具预览编译已通过；部署前仍建议完成上述实机检查，并同步上传
  `quickstartFunctions`。

## 19. 退出登录链路修复（2026-07-28）

### 19.1 已完成

- `logoutStaff` 会清除当前微信关联的全部历史员工绑定，不再只解绑查询到的第一条。
- 登录、手机号登录和扫码绑定统一保证一个 OPENID 只对应一个员工，防止切换账号后形成重复绑定。
- 退出时立即失效云函数 `PROFILE` 缓存，避免数据库已解绑但页面在 60 秒内仍拿到旧资料。
- 小程序退出时清理全部 `data_cache_` 账号缓存，包括个人资料、管理员状态和助手历史，
  保留外观设置，并跳转到快速登录页。
- 重复调用退出接口按幂等成功处理；退出按钮增加提交中禁用和按压反馈。

### 19.2 验证

- 云函数全量测试 `182/182` 通过，0 失败；新增重复绑定、缓存失效、幂等退出、
  切换账号和前端退出交互 4 个回归用例。
- 全部小程序和云函数 JavaScript 文件通过 `node --check`。
- `git diff --check` 通过；本次涉及的 WXML/JS 未新增 emoji 或 em dash。

### 19.3 待办

- 部署时必须重新上传 `quickstartFunctions`，否则云端仍会保留旧的退出逻辑。
- 在微信开发者工具或真机验证“我的 → 设置 → 退出登录”，确认跳到快速登录页，
  再次进入“我的”时不再显示旧账号资料。

## 20. 首页快捷标签自适应修复（2026-07-28）

### 20.1 已完成

- 首页管理员和员工共用的 4 个“常用操作”标签不再依赖
  `width: calc(50% - 6rpx)`，改为按 `280rpx` 基准宽度弹性伸缩和自动换行。
- 标准手机宽度稳定显示为 2 列 2 行；容器更窄时可自动降为单列。
- 标题和说明增加最大宽度、行高与长文本换行，避免长文案撑破卡片。

### 20.2 验证

- 高频页面源码回归增加首页弹性布局断言。
- 云函数全量测试 `182/182` 通过，全部 JavaScript 文件通过 `node --check`。
- `git diff --check` 通过；本次 WXSS 未新增 emoji 或 em dash。

### 20.3 待办

- 在微信开发者工具切换不同设备尺寸，重点确认首页“常用操作”在小屏手机上为
  2 列 2 行，长标题不会溢出。

## 21. 首个管理员开通闭环（2026-07-28）

### 21.1 已完成

- 新增独立 `cloudfunctions/bootstrapAdmin/`，上传后会作为单独云函数显示，
  不再要求用户手工拼装 `quickstartFunctions` 路由调用。
- 函数只接受云开发控制台调用；来自小程序、开发者工具客户端、HTTP、Web
  客户端或其他云函数的请求会因 OPENID / SOURCE 校验被拒绝。
- 仅在系统没有可用管理员时生效，目标员工必须 active 且已登录绑定微信；
  可撤销未绑定或已停用的旧管理员，不创建硬编码账号，不改写员工业务角色。
- “我的 -> 管理员开通”会显示当前工号、当前权限和管理员数量，自动生成并可复制
  云端测试参数；执行成功后强制刷新个人资料缓存。
- `uploadCloudFunction.sh`、README 和部署说明已加入 `bootstrapAdmin`。
- 旧的 settings + Token 自举保留为兼容入口，不再作为新部署推荐方案。

### 21.2 验证

- 新增控制台成功自举、小程序端拒绝、未绑定员工拒绝、失效旧管理员恢复、
  已有可用管理员拒绝和资料强制刷新 6 个回归用例。
- 云函数全量测试 `188/188` 通过，0 失败。
- 全部 JavaScript 通过 `node --check`，页面 JSON 与 WXML 结构检查通过，
  `git diff --check` 通过。

### 21.3 部署与验收

- 同时上传 `quickstartFunctions` 和新增的 `bootstrapAdmin`，两者缺一不可。
- 先用目标工号登录，再在云开发控制台对 `bootstrapAdmin` 执行：
  `{"employeeNo":"目标工号","confirmText":"CREATE_FIRST_ADMIN"}`。
- 返回“小程序 -> 我的 -> 管理员开通”点击刷新，确认当前权限显示为“管理员”。

## 22. 登录成功跳转修复（2026-07-29）

### 22.1 已完成

- 工号注册登录、手机号登录和微信资料登录成功后统一使用 `wx.switchTab`
  直接进入“我的”页，不再依赖 `wx.navigateBack`。
- 跳转前清理 `data_cache_` 账号缓存，确保“我的”页在 `onShow` 时加载当前
  登录员工资料，不会短暂展示上一个账号。
- 修复从“快速登录 -> 工号注册”完成登录后，被页面栈带回快速登录页的问题。

### 22.2 验证

- 新增登录成功跳转源码回归用例。
- 云函数全量测试 `189/189` 通过，0 失败。
- 全部小程序和云函数 JavaScript 文件通过 `node --check`。

### 22.3 待办

- 在微信开发者工具分别验证工号注册、手机号和微信资料三个登录入口，确认成功后
  均直接显示“我的”页及当前账号资料。

## 23. 管理员全链路优化（2026-07-29）

### 23.1 已完成

- 新增“管理工作台”，聚合人员、排班覆盖、调班/请假待办、请假冲突、资质风险
  和最近操作，作为管理员统一入口。
- 新增“人员管理”和“管理参数”页面；支持搜索筛选、在职/管理员权限、班组、
  岗位、航司授权、机型资质及完整排班规则维护。
- 管理员排班改为手机卡片式编辑，补齐搜索、状态筛选、批量改班、编辑放弃、
  合规预检和发布闭环；高危违规禁止绕过。
- 勤务与放行排班改成“生成预览 -> 人员缺口和人务链复核 -> 发布”；
  自动排班不再直接写库，未生成新预览时不能重复发布旧排班。
- 完成状态、排班统计、历史、操作日志、请假审批、调班审批和资质预警统一补齐
  强制管理员权限刷新、移动端状态页、日期筛选、错误重试和下拉刷新。
- 实时状态、替班和延误传播增加管理员守卫、参数校验、请假/角色/资质/时段冲突
  检查、缓存失效与审计日志。
- 全员管理员端点增加 `demoToolsEnabled="true"` 双重限制；生产默认拒绝执行。
- 既有员工登录和个人设置不能再自行覆盖班组、岗位或资质；这些字段统一由
  管理员维护，员工端只读展示。

### 23.2 验证

- 云函数全量测试 `202/202` 通过，0 失败。
- 全部小程序与云函数 JavaScript 通过 `node --check`，35 个页面/云函数 JSON
  解析通过，25 个 WXML 页面结构检查通过。
- 全仓相关 WXML/WXSS/JS 未发现 emoji 或 em dash，WXML 未发现模板方法调用，
  `git diff --check` 通过。

### 23.3 部署与实机验收

- 必须重新上传 `quickstartFunctions`；首次管理员环境还要上传 `bootstrapAdmin`。
- 生产环境保持 `settings.demoToolsEnabled="false"`。
- 微信开发者工具重点验证：小屏排班卡片、勤务预览切日期提示、人员编辑弹窗滚动、
  高危合规阻断、审批候选人搜索、深浅主题和 iOS 底部安全区。

## 24. 参考图主界面重设计（2026-07-29）

### 24.1 已完成

- 按参考图统一浅色主题为冰蓝背景、白色信息面和皇家蓝主操作色，同步更新导航栏、
  TabBar 动态主题与全局卡片阴影、边框、圆角和语义色。
- 总览页改为蓝色“排班指挥舱”，日期、星期、更新时间和刷新操作集中展示；
  常用操作保持 2 列自适应，人员分配、运行关注和待办信息改为紧凑数据面板。
- 全员排班页把日期与四项统计合并成排班概览卡，搜索与三组筛选改为紧凑横排，
  人员排班卡继续保留状态、航班、进出港、资质和详情展开。
- 预警页增加风险监控主视觉与风险指标条，保留长停预警、调班审批、流量趋势和
  人员负荷；“我的”页改为蓝色身份卡、四项身份信息条、二维码横幅和带说明的
  功能列表，管理员工具仍按权限展示。
- 首页日期新增星期显示；“我的”资料增加岗位文案装饰；二维码弹窗补齐内容区
  事件拦截，避免点击二维码时误关闭。
- 新增 29 个本地 SVG 线性图标；“我的”页原有“号、组、岗、班、调、假、信”
  等文字占位已全部替换，总览、排班、预警页的快捷入口、日期、搜索、筛选箭头、
  风险、待办与状态占位也统一改为图标。

### 24.2 验证

- 微信开发者工具 iPhone 12/13 模拟器已检查总览、排班、预警和“我的”四页，
  均正常编译显示，调试器为 0 个错误。
- 云函数与源码契约全量测试 `202/202` 通过，0 失败。
- 全部小程序和云函数 JavaScript 通过 `node --check`；本次 4 个 WXML 结构、
  页面 JSON、模板方法调用、emoji/em dash 与 `git diff --check` 均检查通过。

### 24.3 当前状态与待办

- 本轮重设计位于 `codex/agent-rag-foundation`，当前改动尚未提交或推送。
- 当前开发者工具已用 `GH001 / 张伟` 验证管理员身份卡和管理入口显示。
  管理工作台路由可以打开，但已部署云函数返回“未知操作类型: getAdminDashboard”，
  表明云端 `quickstartFunctions` 仍是旧版本。
- 真机发布前重点复核 iOS 底部安全区、Android 字体差异、深色主题和超长姓名。

## 25. 普通账号切换管理员权限修复（2026-07-29）

### 25.1 根因与修复

- 微信开发者工具已执行普通账号退出、`GH001 / 张伟` 管理员登录和管理工作台访问。
  旧问题具有偶发性，命中不同云函数热实例时才会出现，并会随 60 秒缓存过期自愈。
- 根因是 `getMyProfile` 曾按 OPENID 缓存当前员工和 `isAdmin`。云函数实例间内存
  不共享，账号解绑或重新绑定只能清理当前实例，其他旧实例仍可能返回普通账号资料。
- `getMyProfile` 已改为每次实时查询 `staff`，不再缓存账号绑定和管理员权限。
  其他排班配置等非鉴权数据仍保留实例级缓存。
- 总览、“我的”、设置、请假、调班和统一管理员判断在读取身份时显式请求刷新；
  `loadIsAdmin(true)` 现在会把 `forceRefresh` 传给云函数，兼容尚未升级的旧云端版本。

### 25.2 验证与部署

- 新增跨云函数实例切换身份模拟，确保普通员工资料不会覆盖新登录管理员。
- 账号切换回归同时验证旧 OPENID 解绑、新管理员绑定和 `isAdmin=true`。
- 云函数全量测试 `202/202` 通过，全部小程序和云函数 JavaScript 通过语法检查。
- 修复后的前端在开发者工具中已识别 `GH001 / 张伟` 为管理员，并显示管理员首页入口。
- 部署时必须重新上传 `quickstartFunctions`，否则云端仍会保留旧的 PROFILE 缓存逻辑。
  当前云端还缺少 `getAdminDashboard`，上传后才能完成管理工作台数据验收。

## 26. 合规申请、航班主数据与打印总表（2026-07-29）

### 26.1 已完成

- 长停预警业务已下线：删除 `warningFlights` 页面和小程序路由，移除长停阈值、
  查询、模拟与风险预测端点；风险中心改为待改派、资质异常、工时超限和可用人员。
- 调班与请假原因支持纯文字、纯图片或图文组合；最多上传 6 张云存储图片。
  云函数拒绝客户端外链和对象型参数，并保存 `reasonMode`、校验快照和申请内审计轨迹。
- 调班互换在提交时校验双方资质、请假、时段、日工时和最小休息间隔；
  单人调班审批选定替班人后再次校验，任何高风险项都会阻断改派。
- 请假提交时预检区间内受影响的排班和预计工时；批准后自动标记对应排班待改派。
- 航班结构新增进出港航班号、机号、发动机型号、计划/预计/实际到达时间和
  计划离港时间；管理员可人工更新 ETA，并同步全部关联排班。
- 管理员排班页新增航班资料编辑弹窗和“打印排班总表”；打印版 Excel 包含标题、
  生成时间、合规结果、发动机型号和 ETA，适合微信文档预览后打印或转发。
- 申请提交、撤回、审批、改派和航班资料更新均写入结构化 `operation_logs`，
  申请记录另有最多 20 条 `auditTrail`。
- 定时同步现已覆盖调班、请假和操作日志；审计日志补齐 `updatedAt`，Java 端可按
  增量游标接收申请凭证、校验快照与完整操作留痕。
- `schedule.tsv` 示例已加入“发动机型号”和“预计到达”列，旧数据字段仍兼容读取。

### 26.2 验证

- 云函数全量测试 `207/207` 通过，0 失败；新增图片凭证、非法文件、工时阻断、
  航班运行资料同步、打印版导出和旧长停入口移除回归。
- 全部小程序和云函数 JavaScript 通过 `node --check`。
- `git diff --check` 通过。

### 26.3 部署与待办

- 必须重新上传并部署 `quickstartFunctions` 与 `syncToHangyi`，否则云端不会识别
  `updateFlightOperationalData`，也不会执行新的申请校验、打印导出和完整增量同步逻辑。
- 申请图片使用云存储，需确认小程序云环境已开通存储且当前登录用户可上传与读取。
- 删除的是功能入口与代码，不会主动清理云数据库中历史 `warningFlag` 或旧
  `longStayWarningHours` 文档；如需清理生产数据，应先备份并单独确认。
- 微信开发者工具重点验证：相机/相册权限、6 图上传与预览、审批时工时阻断、
  人工 ETA 清空与改写、打印版 Excel 在真机微信中的打开和打印。

## 27. 预警页功能精简（2026-07-29）

### 27.1 已完成

- 删除小程序“航翼风险监控中心”页面、页面路由和预警页入口。
- 预警页删除风险指标、自动合规摘要和维修流量趋势图；管理员端只保留
  “调班审批队列”和“人员工作负荷”，普通员工仅展示人员工作负荷。
- 删除趋势图 Canvas、尺寸计算、绘图状态与风险看板请求；人员负荷请求显式传入
  `includeFlowTrend: false`，云函数不再为该页面查询航班流量。
- `getWarningAnalytics` 默认兼容旧客户端，只有显式关闭时才省略
  `maintenanceFlowTrend`，并增加参数类型校验。
- README 已同步为 23 个页面和精简后的预警功能。

### 27.2 验证与部署

- 云函数全量测试 `208/208` 通过，0 失败。
- 全部小程序和云函数 JavaScript 通过 `node --check`，相关 JSON、WXML 结构和
  `git diff --check` 通过。
- 部署时需重新上传 `quickstartFunctions`，然后在微信开发者工具重新编译小程序；
  否则前端虽不显示趋势图，旧云函数仍会执行不必要的航班流量查询。

## 28. 智能知识助手 RAG 闭环（2026-07-31）

### 28.1 已完成

- Java 最新微服务架构新增独立 `hangyi-assistant:9004`，Gateway 路由
  `/api/assistant/**`；Web 再验 JWT，小程序 internal 入口使用独立内部密钥。
- 完成 Markdown/TXT 业务资料解析、章节切块、Ollama `bge-m3` embedding、
  Qdrant 增量/删除/需确认全量重建和通义千问 grounded generation。
- 无足够检索依据时确定性拒答；引用由服务端生成，并清理回答中的越界引用编号。
- 知识支持 EMPLOYEE/ADMIN 两级可见范围；小程序由云函数传递服务端派生的管理员状态。
- MySQL 保存会话、问题、回答、引用和反馈；历史与反馈按账号隔离，每日配额原子扣减。
- Java `knowledge/business/` 新增 6 份系统业务资料，评测集新增 30 道 Recall@5 题。
- 小程序会加载服务端历史，显示引用章节、剩余配额和反馈状态；本地仍保留最近
  20 条、7 天缓存。
- 双端计划、HTML 使用说明、Java README、环境模板、数据库迁移和部署文档已更新。

### 28.2 部署前待办

- Java 数据库执行 `db/03-assistant-rag.sql`。
- 配置并启动 Qdrant、Ollama 和 Qwen；先 dry-run，再 incremental +
  evaluation，Recall@5 达到 0.85 后才能打开 `ASSISTANT_ENGINE_ENABLED`。
- 上传新版 `quickstartFunctions`，在云 DB 配置公网 HTTPS Gateway origin 和内部
  key，最后把 `assistantEnabled` 改为字符串 `"true"`。
- 当前真实企业 SOP 尚未提供。内置资料只描述系统已实现业务，后续应补充经过确认和
  脱敏的排班制度、勤务/放行程序、资质规则、审批口径和真实员工问法。

## 29. 助手可用性与管理员入口收拢（2026-07-31）

### 29.1 已完成

- 云函数新增 `router/assistant-local.js` 内置业务知识。当 Java RAG 未启用、配置不完整、
  地址不安全或请求失败时，已登录员工仍可直接问排班、调班、请假、资质、航班字段、
  管理员权限和审计流程。
- `getAssistantStatus` 会把内置模式标记为可用；小程序不再因
  `assistantEnabled="false"` 禁用输入框，并显示“内置知识”或“联网知识库”状态。
- 助手空状态增加三个常用问题，内置回答包含业务文档与章节依据；本地消息仍进入
  7 天设备缓存，内置反馈按幂等成功处理。
- “我的”页删除勤务排班、人员权限、请假审批、排班编辑、排班参数、排班历史和
  操作日志等重复管理员入口，只保留一个“进入管理中心”入口。
- 管理中心集中 11 项工具：排班编制、勤务放行、调班审批、请假审批、人员管理、
  资质预警、完成统计、排班分析、发布历史、操作审计和排班参数；文字占位已替换为
  SVG 线性图标。

### 29.2 验证与部署

- 云函数全量测试 `211/211` 通过，0 失败；新增内置知识、非法地址降级、公网故障降级
  和管理入口唯一性回归。
- 必须重新上传并部署 `quickstartFunctions`，否则云端仍会返回旧的助手关闭状态，
  也无法使用最新管理中心数据接口。
- 联网 RAG 仍按 §28.2 部署；内置模式只回答稳定流程，不查询实时排班或执行写操作。

## 30. 客户演示前全量审计与修复（2026-08-01）

### 30.1 已修复

- 手机号一键登录改为只接受微信动态 `phoneCode`，由云函数调用
  `phonenumber.getPhoneNumber` 换取可信号码；删除开发者工具固定手机号旁路、
  客户端明文手机号和旧 `cloudID` 路径。
- 工号登录改为工号、姓名、预登记手机号三项匹配；已绑定其他 OPENID 的账号拒绝
  被抢占，客户端禁止自建员工或覆盖班组、岗位、资质；缺少预登记手机号的旧档案
  也不能被首次登录任意占用。
- 移除可猜工号的 `bindStaffByScanCode`、内部航班 upsert 和维修流量模拟公共端点；
  `getWarningAnalytics` 不再生成或返回已经下线的维修流量趋势。
- `bootstrapData` 仅允许无 OPENID 的云端控制台调用，必须传
  `confirmText="INITIALIZE_DEMO_DATA"`；主云函数使用 `AsyncLocalStorage` 隔离每次
  调用的 OPENID 和 SOURCE，避免热实例混合来源时复用旧上下文。
- 云函数异常统一返回通用消息，堆栈仅写服务端日志；头像路径、排班偏好、日期、
  枚举和自由文本补齐白名单与长度校验。
- 演示员工补齐固定手机号 `13800000001` 到 `13800000060`，不会覆盖已有真实号码；
  资质到期种子改为确定性生成，重复演示结果稳定。
- 内置助手扩展为 30 类细分业务知识，未知问题明确拒绝猜测，普通员工过滤管理员
  专属操作；新增 30 题逐题主题命中评测。
- 云函数 SDK 升级并锁定为 `wx-server-sdk 4.0.2`，主函数和首管函数显式锁定
  `@cloudbase/node-sdk 3.18.3`；三个云函数都有 lockfile。批量部署脚本已补上
  `syncToHangyi`。
- README、Agent/RAG 计划和 HTML 使用说明已同步新的登录、初始化、助手和演示流程。
- 修复 Java 员工查询统一 `R.data` 未解包导致跨端登录永远不命中的问题；Java 现在
  返回班组、岗位、航司、机型和结构化资质，扩展字段在 `rpt_staff` 完整保留。
- 修复 Java 同步把“请假”写成员工状态 2、停用写成 3 的语义错误；员工表统一
  `1=在职、0=离职`，请假只保留在快照和业务表。
- Hangyi 主同步和定时同步只允许公网 HTTPS origin，拒绝 HTTP、私网、带路径或
  凭证的地址，并限制响应体为 1 MB，避免内部密钥明文传输和异常大响应。

### 30.2 验证结果

- 云函数全量测试 `219/219` 通过；其中助手客户演示题 `30/30` 命中。
- 小程序 23 个页面文件齐全，58 个前端 action 均有云端路由，19 个导航目标均存在，
  72 个公共端点无重复；WXML handler、页面 JSON 和全部 JavaScript 静态检查通过。
- Java 当前 Maven 模块共 192 个测试：189 通过、3 跳过、0 失败；Web Vitest 25/25 通过，
  生产构建成功，生产依赖审计 0 漏洞。
- 云函数生产依赖审计剩余 6 个上游传递漏洞（1 moderate、5 high、0 critical），
  来自最新版微信/CloudBase SDK 固定的 axios 和 lodash 子依赖；禁止用
  `npm audit fix --force` 降级 SDK，等待上游发布兼容修复并保持输入校验、HTTPS、
  1 MB 响应限制和内部密钥等补偿控制。

### 30.3 演示前剩余必做

- 微信开发者工具当前账号 `access_token expired`，必须右上角扫码重新登录后重新编译。
- 登录后需上传并部署三个云函数，再在同一云环境完成普通员工、账号切换管理员、
  排班发布、调班/请假图片、审计、打印和助手问答的逐页冒烟测试。
- 上传云函数属于真实外部变更，执行前必须获得用户当次明确确认。
- 联网 RAG 仍需完成 Java 公网 HTTPS、数据库迁移、Qdrant/Ollama/Qwen、知识入库和
  Recall@5 验收；客户演示可稳定使用内置知识模式，不应在未验收时打开联网开关。

## 31. 小程序与 Java 同步契约收口（2026-08-03）

### 31.1 已完成

- 请假、操作日志使用标准连字符端点，Java 保留旧下划线路径兼容；手动同步部分失败
  返回 `502`，即时同步通过 `callHangyiServiceChecked` 记录 HTTP/业务失败。
- `syncToHangyi` 首次无游标时执行分页全量同步，六个集合全部成功才推进游标。
- 助手在 Java 引擎关闭或不可达时自动降级内置知识；问答使用
  `requestId + deadlineAt`，反馈失败真实返回失败，历史恢复 feedback，页面沿用最新会话。
- Java 已补齐请假同步、云字符串 ID、稳定排班键、AFTERNOON、归档/撤回、A-H 班组、
  机型授权/执照、发动机型号/机号/人工 ETA、操作日志幂等和请假待改派字段。
- 既有 Java 数据库升级必须执行 `db/04-miniapp-sync-contract.sql`；持续业务数据方向为
  微信云数据库到 Java，Java 员工查询只用于云端无档案时的首次导入，不是自动双写。

### 31.2 验证与待办

- 云函数全量测试 `225/225` 通过，所有小程序和云函数 JavaScript 通过 `node --check`。
- Java 当前 Reactor 全量 `185` 项：`182` 通过、`3` 跳过、`0` 失败；真实 MySQL
  尚未执行 `04` 迁移，真实 CloudBase、公网
  Gateway、Qdrant/Ollama/Qwen 尚未联调。
- Java `schedule_rule` 动态规则尚未注入 OptaPlanner；当前 Java 监管约束与小程序可调
  参数各自生效。若要求两端修改一处立即统一，需单独设计版本化规则契约。
- 助手当前联网能力仍是业务知识 RAG，不开放实时排班查询或写操作；客户演示可使用
  内置知识，生产开启联网前继续完成 Recall@5 与真实依赖验收。
