# 航翼 · 智能机务排班系统

基于微信小程序 + 微信云开发的机务维修排班、合规校验与审计追溯平台。

> 同源配套的 Java Spring Cloud 后端位于 `/Users/qyf/Desktop/航翼排班大创/ideaprojects/hangyi/`，负责
> Web 端员工档案、Spring Cloud Gateway 路由、JWT 鉴权、跨端数据同步。
> 本仓库只包含小程序 + 微信云函数侧。

## 一、核心功能

| 模块  | 说明 |
| ------ | ------|
| 总览  | 按角色展示常用入口、人员分配条、日期导航、高风险提醒、夜班在岗和分类审批待办；支持下拉刷新、骨架屏和失败重试 |
| 管理工作台 | 聚合当日人员、排班覆盖、调班/请假待办、请假冲突、资质风险和最近操作；按风险优先级跳转处理 |
| 人员管理 | 管理员按姓名、工号、班组、岗位和状态筛选人员；统一维护在职状态、管理员权限、班组、岗位、航司授权和机型资质 |
| 排班管理  | 手机卡片式全员排班，可切换日期，按姓名/工号/航班/机型搜索并按班组/班次/状态筛选；点击人员展开全部详情 |
| 管理员排班  | 手机卡片式编辑单日排班，支持搜索/状态筛选、批量改班、智能排班、疲劳优化、航班资料维护和导入导出；可生成人员排班总表打印版 |
| 勤务排班  | 勤务+放行双角色智能排班（`smartScheduleWithRoles`），先生成预览再人工复核发布；含甘特图、人务链、人员缺口、实时状态、延误传播和替班 |
| 我的排班  | 登录员工个人未来排班列表（按日期升序），含班次、航班、机型、发动机型号和预计到达时间 |
| 预警与审批  | 管理员调班审批队列、合格替班人员筛选、人员工时排行和疲劳度评分 |
| 排班统计  | 班组负荷对比、人员利用率排序+疲劳标签、各机型资质覆盖率、近7天夜班分布柱状图 |
| 完成状态  | 排班完成率看板：已发布/未发布/逾期等维度统计 |
| 调班申请  | 单人调班与双人互换；原因支持文字、图片或两者并用，提交和审批均自动校验资质、请假、时段、工时和休息间隔 |
| 请假管理  | 原因支持文字、图片或两者并用；提交时预检受影响排班，管理员审批后自动标记待改派 |
| 通知中心  | 聚合调班、代班和请假状态通知，支持全部/未读/调班/请假筛选、折叠详情、申请跳转和一键已读 |
| 资质管理  | 管理员查看全员资质到期预警，普通员工仅查看本人；按剩余天数排序分级（红<30天/黄<60天/绿正常） |
| 排班历史  | 发布时自动存档旧版本，支持按日期回溯、版本对比、发布时间线 |
| 操作日志  | 申请、撤回、审批、改派、航班资料变更和排班发布均记录操作人、前后状态与目标，支持筛选、分页和导出 CSV |
| 工号登录  | 工号+姓名+预登记手机号三项校验；生产环境禁止客户端自建员工或覆盖班组、岗位和资质 |
| 一键登录  | 微信动态手机号凭证登录；拒绝客户端明文手机号和过期凭证，微信资料登录仅适用于已绑定账号 |
| 管理员开通  | 首次部署由控制台专用 `bootstrapAdmin` 云函数安全创建首个管理员；小程序内可查看状态、复制参数并刷新权限 |
| 管理参数  | 管理员集中维护到位/收尾时间、岗位人数、休息间隔、连续夜班、日工时和疲劳阈值；危险演示开关单独确认 |
| 系统设置  | 员工可维护手机号、排班偏好和浅色/深色主题；班组、岗位、航司授权和机型资质只读，由管理员统一维护 |
| 个人中心  | 头像上传、身份二维码、资料查看、偏好设置和管理员功能入口 |
| 智能助手  | 排班制度与操作知识问答；未部署 Java 时使用内置知识，部署后自动升级为 RAG，支持分级引用、历史、反馈和配额 |

## 二、技术栈

- **前端**：微信小程序原生框架（WXML / WXSS / JS）
- **后端**：微信云开发 · 云函数（Node.js），按业务域拆分为 13 个 router 模块
- **管理员自举**：独立 `bootstrapAdmin` 云函数，仅允许云开发控制台执行
- **定时同步**：独立云函数 `syncToHangyi`（每 5 分钟增量推送）
- **数据库**：微信云开发数据库（文档型，7 个集合）
- **身份认证**：微信 OPENID 自动关联 / Web 端 JWT 验证
- **二维码**：`qrcode` 库生成 Base64 身份码
- **表格导出**：`node-xlsx` 生成 Excel，`Canvas` 渲染长图
- **缓存**：非鉴权数据使用云函数实例级内存缓存（Map + TTL），页面数据使用本地 `wx.storage` 缓存（30s TTL）；当前账号和管理员权限实时查库
- **跨端同步**：HTTP 推送至 Java Spring Cloud Gateway（`/api/sync/**` + `/api/auth/verify`）

## 三、项目结构

```
.
├── cloudfunctions/
│   ├── quickstartFunctions/                # 主业务云函数（按 event.type 分发）
│   │   ├── index.js                        # 入口：合并 13 个 router、统一 try/catch
│   │   ├── cache.js                        # 实例级 Map 缓存（支持 TTL、分类失效）
│   │   ├── utils.js                        # 集合名 / 设置键 / 响应包装 / 工具函数
│   │   ├── package.json                    # 依赖：wx-server-sdk, @cloudbase/node-sdk, qrcode, node-xlsx
│   │   ├── config.json                     # 超时 60s + openapi 权限
│   │   ├── router/
│   │   │   ├── bootstrap.js                # 初始化 / 重置 / seed 数据 / getOpenId
│   │   │   ├── auth.js                     # 身份 / 资料 / 头像 / 二维码 / 偏好 / 手机号登录
│   │   │   ├── schedule.js                 # 排班表 / 智能排班 / 发布 / 合规预检 / 优化 / 导入导出 / 统计
│   │   │   ├── flight.js                   # 航班主数据 / 人工 ETA / 风险中心 / 规则评分
│   │   │   ├── swap.js                     # 调班/代班申请与审批
│   │   │   ├── notification.js             # 通知列表 / 一键已读
│   │   │   ├── admin.js                    # 管理员角色、人员维护与管理工作台
│   │   │   ├── settings.js                 # 系统配置读写
│   │   │   ├── log.js                      # 操作日志查询 / 导出
│   │   │   ├── realtime.js                 # 实时航班状态 / 可用人员 / 替班 / 延误传播
│   │   │   ├── hangyi-sync.js              # Java 后端 HTTP 同步封装
│   │   │   ├── leave.js                    # 请假申请 / 撤回 / 审批
│   │   │   └── assistant.js                # Agent/RAG 助手 HTTPS 安全代理
│   │   └── __test__/                        # 单元测试 (脱离微信, 纯 Node 跑)
│   │       ├── test-helper.js              # wx-server-sdk 等 mock 框架
│   │       ├── test-security.test.js       # P0 安全 + 鉴权回归 (39 个)
│   │       ├── test-quicklogin.test.js     # 一键登录流程 (12 个)
│   │       ├── test-assistant-knowledge.test.js # 助手业务知识评测 (3 个)
│   │       └── test-e2e.test.js            # 端到端业务流 (165 个)
│   ├── bootstrapAdmin/                     # 控制台专用的首个管理员自举函数
│   │   ├── index.js                        # 校验控制台来源、员工绑定与唯一首管
│   │   ├── config.json                     # 20s 超时
│   │   └── package.json                    # 依赖：wx-server-sdk, @cloudbase/node-sdk
│   └── syncToHangyi/                       # 定时增量同步云函数（cron: 每 5 分钟）
│       ├── index.js                        # 增量查询 + 批量推送 + 游标推进
│       ├── config.json                     # 60s 超时 + timer 触发器
│       └── package.json                    # 依赖：wx-server-sdk
├── miniprogram/
│   ├── app.js                              # 入口 / 云开发初始化 / 网络监听 / 全局异常
│   ├── app.json                            # 23 个页面路由 + 4 个 TabBar
│   ├── app.wxss                            # 全局样式（CSS 变量主题）
│   ├── envList.js                          # 云环境列表
│   ├── sitemap.json                        # 站点地图
│   ├── components/
│   │   └── cloudTipModal/                  # 云开发提示弹窗组件
│   ├── utils/
│   │   ├── api.js                          # wx.cloud.callFunction 统一封装（loading / 错误处理）
│   │   ├── cache.js                        # 本地存储缓存（30s TTL）
│   │   ├── date.js                         # 日期 / 班次工具
│   │   ├── media.js                        # 申请图片选择、上传与预览
│   │   └── ui.js                           # 浅色/深色主题 + 班组中文映射
│   ├── pages/                              # 23 个页面
│   │   ├── index/                          #  总览（Tab）
│   │   ├── staffSchedule/                  #  排班管理（Tab）
│   │   ├── warnings/                       # ️ 预警监控（Tab）
│   │   ├── mine/                           #  个人中心（Tab）
│   │   ├── adminSchedule/                  # ️ 管理员排班编辑
│   │   ├── serviceSchedule/                # ️ 勤务排班甘特图
│   │   ├── mySchedules/                    #  我的排班
│   │   ├── swapRequest/                    #  调班申请
│   │   ├── notification/                   #  通知中心
│   │   ├── auth/                           #  登录注册（工号+姓名）
│   │   ├── quickLogin/                     #  一键登录（手机号 / 微信资料）
│   │   ├── settings/                       # ️ 系统设置
│   │   ├── completionStatus/               #  完成状态看板
│   │   ├── scheduleStats/                  #  排班统计
│   │   ├── qualificationWarnings/          #  资质到期预警
│   │   ├── auditLogs/                      #  操作审计日志
│   │   ├── scheduleHistory/                #  排班历史
│   │   ├── leave/                          # 请假申请 / 管理员审批
│   │   ├── bootstrapAdmin/                 # 首个管理员安全自举
│   │   ├── assistant/                      # Agent/RAG 智能助手
│   │   ├── adminCenter/                    # 管理员工作台
│   │   ├── staffManagement/                # 人员与权限管理
│   │   └── adminSettings/                  # 管理排班参数
│   └── images/                             # 图标 & 示例图片
├── schedule.tsv                            # TSV 航班排班导入示例（35 行演示数据）
├── uploadCloudFunction.sh                  # 三个云函数批量部署脚本
├── project.config.json                     # 小程序 appid / 编译设置
├── project.private.config.json             # 私有配置（不提交版本控制）
└── .gitignore
```

## 四、快速开始

### 准备工作

1. 用**微信开发者工具**导入项目根目录
2. 确认 `project.config.json` 中的 `appid` 已填好你自己的小程序 AppID
3. 打开云开发控制台 → 设置 → 环境设置，拿到你的**云环境 ID**
4. 在 `miniprogram/app.js` 中把 `env` 字段改成你的云环境 ID：
   ```js
   env: "<your-cloud-env-id>",  // 请填写你自己的云环境 ID
   ```

### 部署云函数

5. 在微信开发者工具里右键 `cloudfunctions/quickstartFunctions` → **上传并部署：云端安装依赖**
6. 同样右键 `cloudfunctions/bootstrapAdmin` → **上传并部署：云端安装依赖**
7. 同样右键 `cloudfunctions/syncToHangyi` → **上传并部署：云端安装依赖**

> 若页面提示“未知操作类型”，说明小程序源码已更新但 `quickstartFunctions`
> 仍是旧的云端版本，需要重新执行第 5 步。
   > 云函数依赖由云端自动安装，本地 `node_modules` 仅供 IDE 代码提示。

### 初始化数据库

8. 首次部署后，在微信开发者工具中对 `quickstartFunctions` 执行云端测试，
   入参使用 `{"type":"bootstrapData","data":{"confirmText":"INITIALIZE_DEMO_DATA"}}`。
   该端点只接受无 OPENID 的云端控制台调用，拒绝小程序客户端直接初始化。执行后会自动：
   - 创建全部 7 个集合（`staff` / `flights` / `schedules` / `swap_requests` / `leave_requests` / `settings` / `operation_logs`）
   - 写入 17 个系统配置项（详见下表）
   - 生成 60 名员工（GH001–GH060，8 个分组，~20 航司 × 15 机型资质组合）

   演示工具默认关闭。只有确需重建演示数据时，才临时将
   `settings.demoToolsEnabled` 设为字符串 `"true"`；演示完成后应立即改回 `"false"`。

### 启动体验

9. 微信开发者工具点击**编译**运行小程序
10. 进入 `quickLogin` 页面使用微信动态手机号凭证登录，或进入 `auth` 页面输入演示档案中的工号、姓名和手机号：
   | 工号 | 姓名 | 手机号 | 分组 | 资质示例 |
   |------|------|--------|------|----------|
   | GH001 | 张伟 | 13800000001 | A组 | A320, B737, B738 |
   | GH002 | 李强 | 13800000002 | B组 | A320, A321, B738 |
   | GH060 | 毛刚 | 13800000060 | D组 | A320, B38M, B738 |

### 创建首个管理员

系统不再内置或硬编码管理员账号。首次部署按以下步骤开通：

1. 在小程序中使用准备设为管理员的员工工号完成登录，例如 `GH001 / 张伟`。
2. 进入“我的 → 管理员开通”，确认页面显示当前工号，并复制“云端测试参数”。
3. 打开云开发控制台的“云函数 → `bootstrapAdmin` → 云端测试”。
4. 使用页面复制的参数执行，例如：

   ```json
   {
     "employeeNo": "GH001",
     "confirmText": "CREATE_FIRST_ADMIN"
   }
   ```

5. 云端返回 `code: 0` 后回到小程序，点击“刷新管理员状态”。

这里的“云端测试”是函数管理页面的控制台测试，不是在小程序调试器中执行
`wx.cloud.callFunction`。

`bootstrapAdmin` 会同时校验 OPENID 与调用来源，拒绝小程序、开发者工具客户端、
HTTP、Web 客户端及其他云函数转调；目标员工必须已绑定微信。
系统存在已绑定且在职的可用管理员时会拒绝再次自举；若旧环境只残留未绑定
或已停用的管理员记录，函数会撤销这些失效权限并恢复首管。后续管理员由已有
管理员调用 `setStaffAdmin` 授权，不需要再次执行自举函数。

### 高频操作

- 首页根据当前身份显示员工或管理员快捷入口；左右切换日期，离开当天后可点“回到今天”。
- 管理员从“我的 → 管理中心”进入统一入口；优先处理顶部风险和审批待办，再进入排班、人员、统计、历史或日志。“我的”页不再重复铺开管理员工具。
- “管理员排班”中的本地修改必须先通过合规预检；高危项必须返回修正，中低风险需人工复核并再次确认。
- “勤务与放行排班”先点“自动排班”生成未发布预览；人员缺口为 0 且人务链复核无误后，“发布预览”才可点击。
- 人员班组、岗位、航司授权或机型资质变化若影响未来排班，系统会自动标记相关排班为待改派。
- 排班页点击日期可查看其他日期，搜索支持姓名、工号、航班和机型；点击人员卡片展开资质、工时、航司和停留时间。
- 通知页可按未读、调班、请假筛选；点击通知展开审批备注和申请详情。
- 管理员在“预警”页处理替班申请时，可搜索全部符合空闲与资质条件的人员，选择后再次确认。
- 首页、排班、预警和通知页均支持下拉刷新；加载失败时可在页面内直接重试。

### 本地开发（可选）

```bash
cd cloudfunctions/quickstartFunctions
npm install
npm test
```
> 本地装的 `wx-server-sdk` 仅作代码提示，实际运行仍需上传到云端。

### 生产前置：配置 Java 后端同步

需要让小程序与 Java 后端互通时，在云 DB `settings` 集合改以下三个键（详见[九、云函数与 Java 后端同步](#九云函数与-java-后端同步)）：
- `hangyiApiUrl` → Java `hangyi-gateway` 公网 HTTPS origin
- `hangyiApiKey` → 内部接口 `X-Internal-API-Key` 头值
- `hangyiSyncEnabled` → 字符串 `"true"` 启用

### 已有云环境升级注意

- 重新上传 `quickstartFunctions`、`bootstrapAdmin` 和 `syncToHangyi`；前者再用带 `INITIALIZE_DEMO_DATA` 确认文本的参数执行一次 `bootstrapData`，只补缺失集合和配置，不会覆盖现有业务数据。
- Java 既有数据库先备份，并依次执行 `db/02-fix-audit-findings.sql`、`db/03-assistant-rag.sql`、`db/04-miniapp-sync-contract.sql`，再部署最新 Core/Schedule/Assistant。
- 检查并补齐 `settings.demoToolsEnabled="false"`；生产环境保持关闭。
- 代码已删除旧的同步地址和密钥默认值，但 `bootstrapData` 不会覆盖数据库中的旧值。若旧环境仍保存旧密钥，需在 Java 端轮换后更新云 DB。
- 旧版 `SHIFT_APPLY` 若没有 `sourceScheduleId`，新审批流程会要求驳回并由员工从本人真实排班重新提交。

### 客户演示前检查单

1. 微信开发者工具右上角保持已登录，点击“编译”，确认调试器没有编译错误或 `access_token expired`。
2. 用“云端安装依赖”方式重新部署 `quickstartFunctions`、`bootstrapAdmin`、`syncToHangyi`，避免源码与云端端点版本不一致。
3. 新环境先在云端控制台执行带 `INITIALIZE_DEMO_DATA` 确认文本的 `bootstrapData`，再用 `GH001 / 张伟 / 13800000001` 完成首次绑定和管理员自举。
4. 先验证普通员工“登录 -> 我的排班 -> 调班/请假 -> 图片预览 -> 撤回 -> 通知”，再验证管理员“管理中心 -> 人员 -> 排班预览/发布 -> 审批 -> 统计/历史/审计”。
5. 专门验证“普通账号退出 -> GH001 管理员登录”，确认管理中心仍可进入且管理端点不返回 403。
6. 智能助手在 `assistantEnabled="false"` 时仍可使用内置知识。建议演示提问：“调班申请怎么提交图片？”“系统如何校验资质和工时冲突？”“谁可以修改预计到达时间？”；未知问题应明确提示无依据，不编造答案。
7. 只有 Java Assistant 公网 HTTPS、知识入库、30 题检索评测和密钥配置全部验收后，才将 `assistantEnabled` 改为字符串 `"true"`；否则保持内置知识模式，避免现场依赖外网服务。
8. 客户演示和生产环境都保持 `demoToolsEnabled="false"`。演示结束后复查管理员权限、同步开关和内部密钥未出现在界面或日志中。

> 自动化测试通过不等同于真实云环境已部署。正式演示前必须至少完成一次同一微信账号、同一云环境、同一云函数版本下的真机或开发者工具冒烟测试。

## 五、核心数据模型

### staff（人员）
```js
{
  employeeNo, name, groupId,           // 工号、姓名、所属分组（A-H）
  active, onLeave,                     // 在职状态、今天是否休假的快照
  authorizedAirlines,                  // 授权航司列表
  authorizedAircraftTypes,             // 授权机型列表（归一化后，如 A320, B737）
  tags,                                // 技能标签
  phone, avatarFileID,                 // 手机号、头像云文件ID
  isAdmin,                             // 是否管理员（手动或通过 admin 接口设置）
  isTestAdmin,                         // 测试管理员标记
  openid,                              // 微信 OPENID
  roleType,                            // 角色：SERVICE | RELEASE | BOTH（勤务/放行/双岗）
  qualifications: [{                   // 资质列表（结构化，含证书与有效期）
    aircraftType, certNo,
    issueDate, validUntil,
    status                             // VALID | EXPIRING | EXPIRED
  }],
  preferences: {                       // 排班偏好
    preferredShifts,                   // 偏好班次
    preferredRestDays,                 // 偏好休息日
    maxMonthlyWorkHours                // 月工时上限
  },
  createdAt, updatedAt
}
```

### flights（航班）
```js
{
  key,                                 // flightNo + scheduleDate 唯一标识
  flightNo,                            // 兼容航班号
  inboundFlightNo, outboundFlightNo,   // 进港、出港航班号
  airline,                             // 航司
  aircraftRegistration,                // 机号
  aircraftType, engineModel,           // 机型、发动机型号
  scheduledArrivalTime,                // 计划到达时间
  estimatedArrivalTime,                // 预计到达时间，可由管理员人工录入
  estimatedArrivalSource,              // MANUAL | IMPORT
  estimatedArrivalUpdatedAt,
  estimatedArrivalUpdatedBy,
  actualArrivalTime,                   // 实际到达时间
  scheduledDepartureTime,              // 计划离港时间
  arrivalTime, departureTime,          // 兼容旧数据字段
  scheduleDate,                        // 排班日期（YYYY-MM-DD）
  stayHours,                           // 兼容的停留小时数
  createdAt, updatedAt
}
```

### schedules（排班）
```js
{
  flightId, flightNo,                  // 关联航班
  inboundFlightNo, outboundFlightNo,   // 进港、出港航班号快照
  airline,                             // 航司快照
  aircraftRegistration,                // 机号快照
  aircraftType, engineModel,           // 机型、发动机型号快照
  scheduledArrivalTime,                // 计划到达
  estimatedArrivalTime,                // 预计到达，人工更新时同步
  estimatedArrivalSource,              // MANUAL | IMPORT
  scheduledDepartureTime,              // 计划离港
  flightKey,                           // flightNo + scheduleDate 组合 key
  scheduleDate, shiftCode,             // 排班日期、班次：MORNING | AFTERNOON | NIGHT
  startTime, endTime,                  // 任务起止时间
  staffId, staffName, staffEmployeeNo, // 排班人员
  groupId, openid,                     // 分组、OPENID
  roleType,                            // SERVICE | RELEASE | BOTH
  status, source,                      // 状态：ASSIGNED | SWAPPED | IN_PROGRESS | COMPLETED
  needsReassignment, leaveRequestId,   // 请假冲突与关联申请
  previousStaffId, swapRequestId,      // 改派前人员与关联调班申请
  realtimeStatus, realtimeRemark,      // 实时状态：ON_TIME | DELAYED | CANCELLED | ARRIVED
  workedHours,                         // 该班次工时
  aircraftQualifications,              // 快照：排班时人员资质
  createdAt, updatedAt
}
```

### swap_requests（调班/代班申请）
```js
{
  requestType,                         // SWAP（双人代班互换） | SHIFT_APPLY（单人调班）
  // SWAP 字段
  sourceScheduleId, targetScheduleId,  // 双方排班记录 ID
  sourceStaffId, targetStaffId,        // 双方人员 ID
  verifier,                            // AUTO_COMPLIANCE（自动合规校验）
  // SHIFT_APPLY 字段
  sourceScheduleId, sourceStaffId,      // 只能关联申请人本人的真实排班
  employeeNo, name, flightNo,          // 服务端从 OPENID 绑定员工和排班生成
  scheduleDate, startTime, endTime,     // 排班快照
  replacementStaffId, replacementName, // 审批时指定的替班人员
  // 公共
  reason, reasonText,                  // 文字原因，可为空
  reasonImages,                        // 云存储图片 fileID，最多 6 张
  reasonMode,                          // TEXT | IMAGE | BOTH
  validationSnapshot, validatedAt,     // 资质、请假、时段、工时、休息间隔校验快照
  auditTrail,                          // 提交、审批、撤回时间线
  status,                              // PENDING | APPROVED | REJECTED | CANCELLED
  requesterOpenid, approverOpenid,     // 申请人/审批人 OPENID
  comment,                             // 审批备注
  requesterReadAt,                     // 已读时间
  createdAt, updatedAt
}
```

### leave_requests（请假申请）
```js
{
  employeeNo, name, openid,
  type, typeText,                      // SICK | PERSONAL | TRAINING | ANNUAL | OTHER
  startDate, endDate, totalDays,
  reason, reasonText,
  reasonImages,                        // 云存储图片 fileID，最多 6 张
  reasonMode,                          // TEXT | IMAGE | BOTH
  validationSnapshot, validatedAt,     // 受影响排班与预计工时快照
  auditTrail,                          // 提交、审批、撤回时间线
  status,                              // PENDING | APPROVED | REJECTED | CANCELLED
  approverOpenid, approver,
  approvedAt, comment, cancelledAt,
  createdAt, updatedAt
}
```

排班可用性以 `leave_requests` 中 `APPROVED` 的日期区间为准，
`staff.onLeave` 仅是当天快照。批准请假后，区间内尚未完成的排班会标记为待改派。

### operation_logs（审计日志）
```js
{
  action,                              // 操作类型：申请、审批、改派、航班变更等
  detail,                              // 操作详情
  operatorOpenid,                      // 操作人
  target,                              // 结构化目标，含 before / after / 关联 ID
  createdAt
}
```

### settings（系统设置）
所有键名见下表，结构为 `{ key, value, remark }`：

| 键  | 默认值 | 含义 |
| ---- | --------|------|
| `fatigueMaxContinuousDays`  | 3 | 连续工作天数阈值 |
| `servicePrepTimeMinutes`  | 30 | 勤务提前到位时间（分钟） |
| `serviceWrapTimeMinutes`  | 15 | 勤务收尾返回时间（分钟） |
| `releasePrepTimeMinutes`  | 20 | 放行提前到位时间（分钟） |
| `releaseWrapTimeMinutes`  | 10 | 放行收尾返回时间（分钟） |
| `serviceRequiredCount`  | 2 | 每航班勤务人数（双人制） |
| `releaseRequiredCount`  | 1 | 每航班放行人数 |
| `minRestIntervalMinutes`  | 30 | 最小休息间隔 |
| `maxConsecutiveNightShifts`  | 2 | 连续夜班上限 |
| `maxDailyWorkHours`  | 12 | 单人日工时上限 |
| `hangyiApiUrl`  | `""` | Java `hangyi-gateway` 公网 HTTPS origin（部署后配置） |
| `hangyiApiKey`  | `""` | Java 内部 API 密钥（部署后配置） |
| `hangyiSyncEnabled`  | `"false"` | 是否启用 Java 数据同步 |
| `assistantApiUrl`  | `""` | 智能助手公网 HTTPS 网关地址 |
| `assistantApiKey`  | `""` | 智能助手内部 API 密钥 |
| `assistantEnabled`  | `"false"` | 是否启用联网 RAG；关闭时仍可使用云函数内置业务知识 |
| `demoToolsEnabled`  | `"false"` | 是否允许管理员使用重建/模拟演示数据工具 |

## 六、云函数接口一览

`type` 即 `wx.cloud.callFunction` 入参的 `event.type`，登录标记的接口要求调用前已 `loginOrRegisterStaff` / `loginByPhone` / `loginByWechatProfile` 成功。

### 初始化 / 身份

| type  | 说明 | 需登录 |
| ------ | ------|--------|
| `bootstrapData`  | 控制台确认后初始化种子数据（60名员工 + 17项系统配置）；小程序端不可调用 | |
| `resetDemoData`  | 重建演示数据；需管理员且 `demoToolsEnabled="true"`，保留当前管理员与配置 | (管理员) |
| `getOpenId`  | 获取当前用户 OPENID | |
| `loginOrRegisterStaff`  | 按工号+姓名+预登记手机号验证并绑定；客户端不允许自助创建员工 | |
| `loginByPhone`  | 用微信动态 `phoneCode` 换取可信手机号后登录 | |
| `loginByWechatProfile`  | 微信资料登录 | |
| `logoutStaff`  | 退出登录 | |
| `getMyProfile`  | 实时获取当前绑定员工与管理员权限 | |
| `updateMyProfile`  | 更新本人允许修改的个人信息；业务身份字段由管理员维护 | |
| `updateMyAvatar`  | 上传头像（云文件ID） | |
| `generateMyProfileQrCode`  | 生成身份二维码（Base64） | |
| `updateMyPreferences`  | 更新排班偏好 | |

### 排班

| type  | 说明 | 需登录 |
| ------ | ------|--------|
| `getStaffScheduleTable`  | 全员排班表查询（含工时统计） | |
| `getServiceScheduleTable`  | 勤务排班表数据查询 | |
| `getMySchedules`  | 我的排班列表（未来 20 条） | |
| `publishScheduleEdits`  | 发布排班编辑（管理员） | (管理员) |
| `publishServiceSchedule`  | 发布勤务排班（管理员） | (管理员) |
| `completeSchedule`  | 本人确认当日/历史执行态排班完成；未来、请假冲突和归档排班不可操作 | (登录员工) |
| `preflightComplianceCheck`  | 排班合规预检（7 项规则） | |
| `smartSchedule`  | 智能排班入口（自动判定单航班/多航班） | |
| `smartScheduleSingle`  | 单航班智能排班（预览/确认模式） | |
| `smartScheduleMultiDay`  | 多日滚动智能排班（跨天状态跟踪） | |
| `smartScheduleWithRoles`  | 勤务+放行双角色智能排班（甘特图数据） | |
| `optimizeStaffSchedule`  | 智能优化排班（疲劳检测→自动替班→重分配） | |
| `importScheduleFromTSV`  | TSV 文件导入排班 | |
| `exportSchedule`  | 导出标准 Excel 或 `PRINT` 打印版排班总表（云存储 → wx.openDocument） | (管理员) |
| `getScheduleStatistics`  | 排班统计看板（班组/利用率/资质/夜班） | |
| `getCompletionStatus`  | 完成状态统计看板 | |

### 航班 / 合规 / 风险

| type  | 说明 | 需登录 |
| ------ | ------|--------|
| `updateFlightOperationalData`  | 维护机型、发动机型号、机号和人工预计到达时间，并同步相关排班 | (管理员) |
| `getWarningAnalytics`  | 人员工作负荷排行 | |
| `getRiskCenterDashboard`  | 风险中心看板（待改派/资质异常/工时超限/可用人员/机型航司占比） | |
| `getMaintenanceForecast`  | 维护量预测（按日期汇总航班工作量） | |
| `getFatigueScores`  | 员工疲劳度评分（基于工时的规则评分） | |
| `getQualificationStatus`  | 资质到期状态；管理员看全员，普通员工仅看本人 | (登录员工) |

### 调班 / 代班 / 通知

| type  | 说明 | 需登录 |
| ------ | ------|--------|
| `createSwapRequest`  | 提交代班互换申请；原因可用文字或图片，自动校验双方资质与工时冲突 | (登录员工) |
| `createSwapApplication`  | 从本人未完成真实排班提交调班申请；原因可用文字或图片 | (登录员工) |
| `listMySwapRequests`  | 查询本人调班/代班申请（可按状态筛选） | |
| `withdrawSwapRequest`  | 撤回本人待审批调班/代班申请 | |
| `listSwapRequests`  | 管理员审批队列 | (管理员) |
| `approveSwapRequest`  | 审批调班/代班；系统再次校验替班人的资质、请假、时段、日工时和休息间隔 | (管理员) |
| `createLeaveRequest`  | 提交请假申请；原因可用文字或图片，并预检受影响排班 | (登录员工) |
| `withdrawLeaveRequest`  | 撤回本人待审批请假 | |
| `listMyLeaveRequests`  | 查询本人请假记录 | |
| `listPendingLeaveRequests`  | 管理员按状态查询请假申请 | (管理员) |
| `approveLeaveRequest`  | 管理员批准/驳回请假 | (管理员) |
| `listMyNotifications`  | 聚合本人调班、代班和请假通知（含未读标记） | |
| `markMyNotificationsRead`  | 标记全部申请通知已读 | |

### 实时调班

| type  | 说明 | 需登录 |
| ------ | ------|--------|
| `updateFlightRealtimeStatus`  | 更新航班实时状态（ON_TIME/DELAYED/CANCELLED/ARRIVED） | (管理员) |
| `getFlightRealtimeStatuses`  | 获取指定日期的航班实时状态 | (管理员) |
| `getAvailableStaff`  | 按日期、请假、资质和排班冲突查询可用人员 | (管理员) |
| `reassignStaffTask`  | 一键替班（把任务改派给其他人） | (管理员) |
| `propagateScheduleDelay`  | 延误传播（自动调整后续任务时间） | (管理员) |

### 配置 / 审计 / 跨端

| type  | 说明 | 需登录 |
| ------ | ------|--------|
| `getSchedulingConfig`  | 获取排班配置（疲劳阈值等，含缓存） | |
| `updateSchedulingConfig`  | 更新排班配置 | (管理员) |
| `setSetting`  | 单条白名单配置写入 | (管理员) |
| `queryOperationLogs`  | 分页查询操作日志 | (管理员) |
| `exportOperationLogs`  | 导出操作日志为 CSV | (管理员) |
| `getBootstrapStatus`  | 查询当前账号、管理员数量和首管开通步骤 | |
| `getAdminDashboard` | 聚合管理工作台指标、风险和最近操作 | (管理员) |
| `listStaffForAdmin` | 搜索、筛选并分页查询人员目录 | (管理员) |
| `updateStaffForAdmin` | 更新人员状态、权限、岗位、班组和资质并标记受影响排班 | (管理员) |
| `setStaffAdmin`  | 设置/取消某员工管理员 | (管理员) |
| `setAllStaffAdmin`  | 将所有人员设为管理员，仅演示环境可用 | (管理员 + `demoToolsEnabled`) |
| `bootstrapTestAdmin`  | 旧版 settings + Token 自举兼容入口 | |
| `migrateStaffRoles`  | 迁移人员角色（SERVICE/RELEASE/BOTH） | (管理员) |
| `verifyHangyiToken`  | 验证 Web 端 JWT 令牌 | |
| `syncDataToHangyi`  | 主动触发全量同步到 Java 后端 | |

首个管理员使用独立云函数 `cloudfunctions/bootstrapAdmin`，它不经过
`event.type` 路由，也不能由小程序端直接调用。具体操作见
[创建首个管理员](#创建首个管理员)。

### 智能助手

| type  | 说明 | 需登录 |
| ------ | ------|--------|
| `getAssistantStatus` | 检查内置知识或联网 RAG 状态 | 是 |
| `askAssistant` | 提交知识问答，问题最多 500 字 | 是 |
| `listAssistantHistory` | 查询最多 50 条服务端历史 | 是 |
| `submitAssistantFeedback` | 提交 `UP` / `DOWN` 反馈 | 是 |

智能助手默认提供内置业务知识，可直接回答稳定的系统流程；`assistantEnabled`
只控制联网 RAG。公网服务未配置、未启用或短时不可达时会自动降级，不再禁用输入框。
部署步骤、HTTPS 要求和后续 RAG 实施计划见
[`航翼Agent+RAG双端落地计划.md`](./航翼Agent+RAG双端落地计划.md)；
部署、启停和员工操作见
[`航翼Agent+RAG使用说明.html`](./航翼Agent+RAG使用说明.html)。

Java 端已在 `hangyi-assistant:9004` 完成 Markdown/TXT 增量入库、
Ollama `bge-m3` embedding、Qdrant 检索、通义千问 grounded generation、
无依据拒答、引用校验、EMPLOYEE/ADMIN 可见级别、服务端历史、反馈、原子配额
和 30 道 Recall@5 评测。正式启用联网 RAG 前仍需按说明部署依赖、导入知识并完成评测。
内置模式不读取实时数据库，也不会执行审批或修改排班。

## 七、设计亮点

- **浅色/深色主题**：全局 `utils/ui.js` 统一管理主题状态，所有页面联动切换
- **环形图可视化**：CSS `conic-gradient` 动态渲染排班占比、机型/航司分布
- **云函数缓存**：非鉴权数据使用实例级 Map 缓存 + TTL；账号绑定和管理员权限实时查库，避免多实例账号切换读到旧身份
- **本地存储缓存**：`wx.storage` 缓存页面数据（30s TTL），切 Tab 秒开无需重复请求
- **多场景智能排班**：单航班 / 多日滚动 / 双角色（勤务+放行）共用一套规则引擎
- **智能优化排班**：疲劳检测 → 自动匹配有资质的空闲替班人选 → 重新分配；无法替班时标记风险供人工处理
- **多维度疲劳评分**：6 维加权（工时 30% + 今日负荷 20% + 连续工作 15% + 班次类型 15% + 休息间隔 10% + 类型分布 10%）
- **合规预检 7 项**：资质匹配、重复排班、连续工作超限、日工时超限、最小休息间隔、连续夜班上限、同组集中；分级 HIGH/MEDIUM/LOW 弹窗提示
- **申请自动复核**：调班提交与审批均校验航司/机型资质、批准请假、时段重叠、单日工时和最小休息间隔；高风险直接阻断
- **多媒体申请凭证**：调班和请假原因可选文字、图片或两者组合，图片上传云存储，列表与审批端均可预览
- **甘特图可视化**：勤务排班横向滚动时间轴、固定左侧人员标签、彩色任务条（蓝=勤务 / 绿=放行 / 金=双资质）、间隙条、当前时间红线、任务点击弹窗详情
- **实时航班状态**：正常/延误/取消/已到达 4 态，延误传播自动调整后续任务时间，一键替班
- **航班运行资料**：进出港航班、机号、机型、发动机型号、计划/预计到达时间结构化存储；管理员可人工维护 ETA 并同步全部关联排班
- **排班总表打印**：生成带标题、生成时间、筛选范围和打印友好列宽的 Excel 总表，可在微信文档预览中直接打印或转发
- **TSV 导入**：解析 TSV 航班表（自动识别列名）→ 航司/机型/发动机/ETA 归一化 → 资质匹配 → 批量排班写入
- **资质分级预警**：结构化资质管理（证书编号、有效期），按剩余天数红/黄/绿分级；人员页面角标提醒
- **排班偏好设置**：员工可设置偏好班次/休息日/月工时上限，保存后写入个人配置
- **航司名称标准化**：全称  简写双向映射（如"中国南方航空"  "南航" / "CZ"），兼容种子数据与前端输入
- **多资质自定义**：设置页支持标签式多选机型 + 自定义输入任意机型代号，自动归一化存储
- **通知闭环**：提交申请 → 待审批 → 审批（通过/驳回）→ 未读标记 → 一键已读，全流程追踪
- **审计可追溯**：申请提交、撤回、审批、改派、航班资料变更、登录、发布和配置变更均落 `operation_logs`，申请本身另带 `auditTrail`；支持筛选和 CSV 导出
- **种子数据**：由云端控制台确认后生成 60 名员工（A-H 组 × ~20 航司组合 × ~15 机型组合），客户端不能直接初始化或重建
- **跨端登录互通**：登录时若云 DB 无此工号，主动 `GET /api/sync/employee/{employeeNo}` 从 Java 后端拉取并本地 upsert
- **定时增量同步**：`syncToHangyi` 云函数每 5 分钟把云 DB 增量变更（按 `updatedAt >= lastSync` 游标）批量推送到 Java 后端

## 八、演示账号

初始化后可使用以下演示工号登录：

| 工号  | 姓名 | 手机号 | 分组 | 资质示例 |
| ------ | ------|--------|------|----------|
| GH001  | 张伟 | 13800000001 | A组 | A320, B737, B738 |
| GH002  | 李强 | 13800000002 | B组 | A320, A321, B738 |
| GH003  | 王磊 | 13800000003 | C组 | B738, B38M, A320 |
| …  | … | … | … | … |
| GH060  | 毛刚 | 13800000060 | D组 | B38M, A320, B737 |

> 在 `auth` 页面输入工号 + 姓名 + 预登记手机号登录。生产环境禁止员工端自建档案；
> 分组、角色和维修资质由管理员维护。演示手机号用于工号验证，不代表微信本机号码；
> “手机号一键登录”只会使用微信动态凭证返回的真实本机号码。
> 上述账号初始化后均为普通员工，没有默认管理员密码。首次管理员按
> [创建首个管理员](#创建首个管理员) 执行 `bootstrapAdmin`，后续由已有管理员调用
> `setStaffAdmin` 授权。

## 九、云函数与 Java 后端同步

本仓库的小程序 + 云函数与同源的 **Spring Cloud 微服务后端**（位于 `/Users/qyf/Desktop/航翼排班大创/ideaprojects/hangyi/`，模块 `hangyi-gateway` / `hangyi-core` / `hangyi-schedule` / `hangyi-assistant`）按下面的协议互通。

业务数据的持续同步方向是 **微信云数据库 → Java**。Java 员工查询仅用于云 DB 尚无该工号时的首次可信导入，不会把 Java 后续编辑自动反向覆盖到微信云数据库；管理员权限始终由云 DB 独立维护。因此这里不是两个可写数据源之间的自动双向复制。

### 同步端点（Java 端预期路径）

| 方法  | 路径 | 触发方 | 用途 |
| ------ | ------|--------|------|
| `POST`  | `/api/sync/staff` | 云函数 → Java | 增量推送员工档案 |
| `POST`  | `/api/sync/flights` | 云函数 → Java | 增量推送航班数据 |
| `POST`  | `/api/sync/schedules` | 云函数 → Java | 增量推送排班记录 |
| `POST`  | `/api/sync/leave-requests` | 云函数 → Java | 增量推送请假申请、图片凭证、校验快照与审计轨迹；Java 兼容旧下划线路径 |
| `POST`  | `/api/sync/operation-logs` | 云函数 → Java | 增量推送操作审计日志；Java 兼容旧下划线路径 |
| `POST`  | `/api/sync/swap-requests` | 云函数 → Java | 增量推送调班/代班申请 |
| `GET`   | `/api/sync/employee/{employeeNo}` | Java → 云函数 | 小程序登录时按工号从 Web 端拉员工 |
| `GET`   | `/api/auth/verify` | 云函数 → Java | 验证 Web 端签发的 JWT 令牌 |

部署本批功能时需同时更新 `quickstartFunctions` 和 `syncToHangyi`；既有 Java 数据库先备份并依次执行
`db/02-fix-audit-findings.sql`、`db/03-assistant-rag.sql`、`db/04-miniapp-sync-contract.sql`，再开启 `hangyiSyncEnabled`。全新数据库直接导入最新 `db/01-schema.sql`。

云函数侧三个出口调用点：

- `cloudfunctions/syncToHangyi/index.js` - **定时批量同步**（见下）
- `cloudfunctions/quickstartFunctions/router/auth.js` - 登录时按工号 `GET /api/sync/employee/{employeeNo}`
- `cloudfunctions/quickstartFunctions/router/hangyi-sync.js` - 验证 Web 端 token `GET /api/auth/verify` + 主动 `syncDataToHangyi`

### 同步方式

- **云函数 → Java（定时）**：`cloudfunctions/syncToHangyi/` 独立云函数，触发器 `0 */5 * * * * *`（每 5 分钟一次）：
  1. 读云 DB `settings.hangyiSyncEnabled` 开关，关闭则直接返回 `{ code: 0, message: "sync disabled" }`
  2. 读 `sync_state.last_sync_time` 作为增量起点；首次没有游标时分页全量同步，不能遗漏启用同步前已存在的数据
  3. 对 `staff` / `flights` / `schedules` / `swap_requests` / `leave_requests` / `operation_logs` 六个集合按稳定端点映射分页推送；后续按 `updatedAt >= lastSync` 增量查询（`BATCH_SIZE = 30`）
  4. 推送成功后更新 `last_sync_time` 游标；任一批次失败立即停止该集合后续批次，整体继续到下一集合
  5. 失败判定：响应体可被 `JSON.parse` 且 `statusCode` 在 `[200, 300)` 才算成功；否则 `reject` 终止该集合同步
- **云函数 → Java（即时）**：单条排班发布、调班和请假创建通过 `callHangyiServiceChecked` 立即推送；HTTP 或 Java 业务失败会写明确错误日志但不回滚微信端主业务，后续由定时同步补偿
- **Java → 云函数（拉取）**：员工登录时云函数主动 `GET /api/sync/employee/{employeeNo}`，解包 Java 统一 `R.data` 后同步班组、岗位、航司、机型和结构化资质；小程序管理员权限不信任 Java 返回值，始终默认为 `false`

### 凭证配置（**全部从云 DB 动态读取**）

同步所需的三个键 `hangyiApiUrl` / `hangyiApiKey` / `hangyiSyncEnabled` **不在代码里写死**，运行时统一从云 DB `settings` 集合读取：

- `hangyiApiUrl` - Java `hangyi-gateway` 公网 HTTPS origin（可含端口，不允许路径、账号、私网地址或 HTTP）
- `hangyiApiKey` - 内部接口 `X-Internal-API-Key` 头值
- `hangyiSyncEnabled` - 字符串 `"true"` / `"false"` 开关

代码内 `seedSettingsIfNeeded()` 仅创建空地址、空密钥和关闭状态，不包含可用凭证：

| 键  | seed 默认值 | 备注 |
| ---- | ------------|------|
| `hangyiApiUrl`  | `""` | 填入 Java 网关公网 HTTPS origin |
| `hangyiApiKey`  | `""` | 填入与 Java 网关一致的新密钥 |
| `hangyiSyncEnabled`  | `"false"` | 默认关闭，配置好前置项后再手动改为 `"true"` |

> **生产部署前**：在云开发控制台的 `settings` 集合写入线上地址和新密钥，
> 验证连通后再将 `hangyiSyncEnabled` 改为字符串 `"true"`。若旧密钥曾进入版本历史，
> 必须在 Java 端轮换，不能继续使用。

### 配对的 Java 后端项目

- 仓库目录：`/Users/qyf/Desktop/航翼排班大创/ideaprojects/hangyi/`
- 模块：`hangyi-gateway`、`hangyi-core`、`hangyi-schedule`、`hangyi-assistant`
- `/api/sync/**` 虽在 Gateway 跳过 Web JWT，但 Core 每个同步端点仍强制校验 `X-Internal-API-Key`

## 十、测试与质量保证

云函数业务逻辑**完全脱离微信环境**也能跑:用 mock 框架替换 `wx-server-sdk` / `qrcode` / `node-xlsx` 等依赖, 在纯 Node 18+ 下 `node --test` 直接跑, ~100ms 出结果。

### 跑测试

```bash
cd cloudfunctions/quickstartFunctions

# 跑全部 4 个测试文件（当前 225 个测试）
npm test

# 跑单个文件
node -r ./__test__/test-helper.js --test __test__/test-security.test.js
node -r ./__test__/test-helper.js --test __test__/test-quicklogin.test.js
node -r ./__test__/test-helper.js --test __test__/test-assistant-knowledge.test.js
node -r ./__test__/test-helper.js --test __test__/test-e2e.test.js
```

### 测试矩阵

| 文件  | 数量 | 覆盖内容 |
| ------ | ------|---------|
| `test-security.test.js`  | 40 | P0 安全 + 鉴权回归（含敏感 settings 审计脱敏、admin 自提权、setSetting 白名单、跨端 HTTPS 和即时同步失败可观测性等） |
| `test-quicklogin.test.js`  | 12 | 微信动态手机号凭证/微信资料登录（拒绝明文手机号、失效 code、停用员工和未登记员工） |
| `test-assistant-knowledge.test.js` | 3 | 30 道客户演示业务问题逐题校验、未知问题拒答、管理员知识隔离 |
| `test-e2e.test.js`  | 170 | 云函数端点业务逻辑（含管理员工作台、人员权限、同步部分失败、首次全量游标、Java `R.data` 解包、排班预览发布、图片申请凭证、自动合规校验、审计、首管自举、Agent/RAG 契约与页面源码检查） |
| **合计**  | **225** | 全量回归通过 |

生产依赖审计结果：Web 为 0 个漏洞；三个云函数均为 1 moderate、5 high、0 critical。
云函数剩余项来自当前最新版微信/CloudBase SDK 固定的 axios 与 lodash 传递依赖，
`npm audit fix --force` 会建议不兼容降级，禁止直接执行。当前已使用 SDK 最新锁定版本，
并通过公网 HTTPS、输入白名单、内部密钥、超时和 1 MB 响应上限降低暴露面，后续需随
微信/CloudBase SDK 新版本继续升级复测。

### Mock 框架 (`__test__/test-helper.js`)

mock 替换了:
- `wx-server-sdk`（cloud.init / database / getWXContext / openapi.phonenumber / uploadFile）
- `qrcode` (toDataURL → 桩 base64)
- `node-xlsx` (build → 桩 Buffer)

`buildCollection` 支持:
- 命令构造: `eq/neq/in/and/or/gt/gte/lt/lte/exists` (与真实 SDK 签名一致)
- `where().limit().skip().orderBy().field()` 链式调用
- `count()` 应用 `where` 条件
- `doc().get()` 返回单数对象
- `update()` 支持点号嵌套字段 (`a.b.c`)

### P0-P3 修复回归覆盖

| 修复  | 状态 | 测试 |
| ------ | ------|------|
| P0-1: `setStaffAdmin` 防自提权 (加 `requireAdmin`)  | | test-security 中 2 个 test |
| 首个管理员：独立 `bootstrapAdmin` 仅控制台可用、可恢复失效旧管理员、已有可用管理员后拒绝再次自举 | | test-e2e 中 5 个 test |
| P0-2: `setSetting` 必须 admin + 白名单  | | test-security 中 3 个 test |
| P0-3: `approveSwapRequest` 加 admin 守卫  | | test-security 1 个 test |
| P0-4: `updateFlightRealtimeStatus` / `propagateScheduleDelay` admin 守卫  | | test-security 中 3 个 test (含 delayMinutes 范围校验) |
| P1-5/6/7: 既有员工登录不能覆盖管理员维护的 groupId/roleType/资质，资质白名单含 B738/B38M | | test-security + test-e2e |
| P1-8: `preflightComplianceCheck` 工时估算 8h (原 4h bug)  | | 源码断言 |
| P1-9: `smartScheduleMultiDay` 月工时从 DB 真实加载  | | 源码断言 |
| P1-10: `propagateScheduleDelay` 调整全部后续任务  | | test-e2e 1 个 test |
| P2-11: `hasQualification` 航司+机型归一化  | | test-e2e 1 个 test |
| P2-13: `publishScheduleEdits` 新记录 `recordStatus: "active"`  | | test-e2e 集成测试 |
| P2-14: `markMyNotificationsRead` 分页 (含 `skip()`, 150+ 通知不卡)  | | test-security 1 个 test (跨页) |
| P2-15: `smartScheduleWithRoles` 硬编码 30min → `minRestInterval` 配置  | | 源码断言 |
| P2-17: `purgeCollection` 用 `Promise.allSettled` 容错  | | test-security 1 个 test |
| P2-18: `bootstrap` seed 8 个分组 (A-H)  | | test-security + test-e2e |
| P2-19: `parseTime` 死代码 (优先级 bug)  | | 源码断言 |
| P2-20: `callHangyiService` 返回结构化结果 `{ok, statusCode, body}`  | | 源码断言 |
| P2: 额外修 `matchAirline` "南航" 误判为 "海南航空"  | | test-e2e 1 个 test |
| P3-22: `exportOperationLogs` CSV 加 UTF-8 BOM  | | 源码断言 |
| P3-23: `callBackend` 错误带 code  | | 源码断言 |
| 登录绑定：关闭可猜工号的扫码绑定端点，已绑定其他微信的账号不能被工号登录抢占 | | test-security + test-e2e |
| 手机号登录：只接受微信动态 `phoneCode`，拒绝客户端明文手机号、失效凭证与号码异常 | | test-quicklogin + test-e2e |
| 初始化隔离：`bootstrapData` 只接受带确认文本的控制台调用，OPENID 按单次调用上下文隔离 | | test-e2e |
| 助手业务知识：30 道演示题逐题命中，未知问题拒绝猜测，普通员工不能看到管理员专属答案 | | test-assistant-knowledge |
| 申请图片与留痕：调班/请假支持图片或文字，保存校验快照与 `auditTrail` | | test-e2e 图片凭证、非法文件与审计断言 |
| 自动合规：替班审批阻断资质、请假、时段、日工时和休息间隔冲突 | | test-e2e 单日工时超限阻断 |
| 航班主数据：发动机型号、机号、人工 ETA 同步排班并记录操作日志 | | test-e2e 航班运行资料更新 |
| 排班总表：`PRINT` 模式生成打印版 Excel | | test-e2e 打印导出标记与云文件 |

### 端到端集成测试 (test-e2e.test.js)

覆盖一条完整业务流:

```
admin 登录 (getMyProfile 验证 isAdmin)
  → admin 发布排班 (publishScheduleEdits)
  → 验证排班被创建, recordStatus="active" (P2-13)
  → 员工提交调班申请 (createSwapApplication)
  → 员工查看通知 (listMyNotifications, 1 条未读)
  → admin 审批通过 (approveSwapRequest, 需 admin)
  → 员工再次查看通知 (状态变 APPROVED, 仍未读)
  → 员工标记已读 (markMyNotificationsRead)
  → 再次查看 (0 未读)
```

### 模拟数据与时区

- 测试默认用 `resetMockState` 设置 `openid`, 用 `seedStaff` / `seedFlight` 等 helper 种数据
- `setOpenid(openid)` 只切 openid 不清空状态 (集成测试场景用)
- mock 默认按本地时区 (`Asia/Shanghai`) 处理 `Date`, 避免 toISOString() UTC 偏移
