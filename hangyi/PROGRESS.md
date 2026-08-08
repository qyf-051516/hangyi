# PROGRESS.md — 航翼排班小程序·项目进度

> 本文件是**每次动手前必读**的进度账本:记录项目当前状态、最近每一轮干了什么、遗留什么。
> 维护约定:**每轮改动完成后,在下方"最近改动"顶部追加一条记录,并同步更新"当前状态/待办/部署状态"**。

最后更新:2026-08-08

---

## 1. 项目一句话

微信小程序 + 云函数(quickstartFunctions)的机场机务排班系统,覆盖员工(看班/调班/请假/资质)与管理员(智能排班/发布/审批/审计)双端;Java 后端在独立仓库 ideaprojects/hangyi(本轮未涉及)。

## 2. 当前状态(2026-08-08)

- 云函数测试 **244/244 全绿**(命令:`cd cloudfunctions/quickstartFunctions && node -r ./__test__/test-helper.js --test __test__/*.test.js`)
- 前端全量 `node --check` 通过
- Git:三仓库工作区干净(仅 `project.private.config.json` 工具私有配置未提交);本地与远端已同步
- 权限模型:已引入 **BOSS(领导)角色**(`isBoss` 字段 + `requireBossOrAdmin` 守卫),领导可只读审计日志

## 3. 最近改动(倒序,2026-08 起)

### 2026-08-08 · 三视角使用报告完善 + 部署尝试
- 核实三视角报告:方向成立(权限二态/审计锁 ADMIN/审批分散/无导出/无进度可视化),2 处失实排除(roleType 已中文映射、settings 无资质阈值)
- 实施:①BOSS 只读审计(log.js `requireBossOrAdmin`、auth.js 5 处返回 `isBoss`、ui.js `loadRole/getCachedRole`、auditLogs 页放行)②adminCenter 统一收件箱(待审批数 badge)③index 页 admin 30s 轮询 + 员工未来 3 天预览 ④智能排班应用前 `preflightComplianceCheck` ⑤资质到期一键申请培训假(预填 TRAINING)⑥STAFF 导出 ICS ⑦换班三步进度可视化
- 删除双人互换死代码(`createSwapRequest`/`respondToSwapRequest`,swap.js -257 行 + 测试同步)
- 推送:Gitee `miniapp` 7653ff33..364cc837(5 提交)、GitHub `master` merge 远端后 c76d5e32..9ffbc265
- **部署**:云函数 CLI 尝试受微信 CLI EISDIR 缺陷阻塞(router/ 子目录无法打包上传),仅顶层文件 utils.js/cache.js/config.json 已增量上传;**router/*.js 待微信开发者工具 GUI 右键"上传并部署:云端安装依赖"**

### 2026-08-07 · 双视角深度审查报告修复(60+ 问题)
- 核实:约 90% 属实,误报 4 条(员工 A2/B6/D1/E1),行号准确
- 修复:adminSchedule 17 项(发布锁/TSV 航司错位/导出 loading/一键改班锁等)、serviceSchedule/completionStatus 10 项、管理页 9 项、云函数 5 项(当日排班禁止调班 `<`→`<=`、新增 `cancelLeaveRequest` 撤销审批、avatarUrl 白名单/归属校验、登录错误码细分)、员工端 15 项(退出防重入/主题广播 themeVersion/removeCache 封装等)
- 提交:17cbf03c(cloud)+ e6eee3dd(miniapp)+ df9dea14(根目录镜像)

### 2026-08-07 · 管理员端精简(第一轮 UI 优化)
- adminSchedule 工具栏 7 按钮收拢为「智能排班 + 更多」菜单
- 勤务放行并入排班编制,adminCenter 11 项 → 10 项
- 员工端"我的"页曾误删 4 个重复入口,**已全部恢复**(通知未读角标保留)
- 提交:e6eee3dd(含在上一条)

### 2026-08-07 · 敏感信息清理(重要)
- 发现并清除 git 历史中的生产 INTERNAL_API_KEY(64 位 hex)与服务器 IP
- 三个仓库历史重写(filter-branch)+ force-push(Gitee miniapp、GitHub master)
- **密钥本身未改动**(服务器 .env / 云 DB settings 保持原值,因确认无人 clone)
- 遗留:`master` 共享基线历史文档中有已失效默认 key `sync-key-2026`(低风险,未动)

## 4. 待办 / 遗留项(按优先级)

| 优先级 | 事项 | 说明 |
|---|---|---|
| P0 | 云函数 GUI 上传 | router/ 核心改动(swap/leave/auth/log.js)需开发者工具右键上传,云端仍是旧代码 |
| P1 | BOSS KPI 仪表盘 | isBoss 已就位,缺 `getDashboardSummary` 云函数聚合(KPI 派生指标) |
| P1 | 乐观锁版本控制 | updateStaffForAdmin/updateSchedulingConfig/publishServiceSchedule 并发覆盖 |
| P2 | 订阅消息推送 | 需微信模板 ID(当前 30s 轮询兜底) |
| P2 | 审计日志反向钻取 | 日志→班次/人员可点击 |
| P3 | AI 驾驶舱 | assistant BOSS 专属问答 |
| - | 根目录仓 AGENTS.md | merge 时被远端删除(重写历史遗留),如需恢复:`git checkout 31149a9b -- AGENTS.md` |

## 5. 部署状态

- **代码**:已 push(Gitee `miniapp`、GitHub 根目录 `master`),两远端 0 领先
- **云函数**:顶层文件已 CLI 增量上传;router/ 待 GUI(微信 CLI EISDIR bug:`cli cloud functions deploy` 与 `inc-deploy --file router/xxx` 均无法处理子目录)
- **Java 后端**(101.42.37.127:9003):本轮 0 改动,无需部署
- **小程序前端**:待 GUI 上传体验版/正式版

## 6. 关键命令速查

```bash
# 云函数测试(脱离微信环境)
cd cloudfunctions/quickstartFunctions && node -r ./__test__/test-helper.js --test __test__/*.test.js

# 全量语法
find miniprogram -name "*.js" -exec node --check {} \;

# 云函数上传(顶层文件,router 需 GUI)
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions inc-deploy -e cloud1-9gayi6o47d35ea3b -n quickstartFunctions --project . --file <顶层文件>
```

## 7. 维护约定(给未来的自己/Agent)

1. **动手前**先读本文件 §2(当前状态)与 §4(待办),接着读 AGENTS.md(硬规则)
2. **每轮改动完成后**:在 §3 顶部追加一条(日期 + 干了什么 + commit),同步 §2/§4/§5
3. 云函数改动:跑 §6 测试,新增端点必须在 `__test__/test-e2e.test.js` 加 case
4. 涉及部署:按 §5 状态更新,云函数 GUI 上传是人工步骤,记得提醒用户
5. 跨会话事实(用户偏好、全局规则)用 memory 系统,本文件只记项目进度
