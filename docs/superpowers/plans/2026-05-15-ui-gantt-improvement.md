# UI 美化 & 甘特图可视化升级 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade login page animations and rewrite Gantt chart with weekly view + interactive features for competition demo.

**Architecture:** Backend adds a date-range Gantt endpoint; frontend rewrites ScheduleGantt.vue with weekly scrollable timeline, tooltips, and stats panel; Login.vue gets CSS animations only.

**Tech Stack:** Spring Boot 3.3 + MyBatis-Plus (backend), Vue 3 + Element Plus (frontend), no new dependencies.

---

### Task 1: Backend — Add gantt-range endpoint

**Files:**
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/service/ScheduleService.java` (after line 148, before the `getGanttData` method)
- Modify: `hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/controller/ScheduleController.java` (after existing `gantt` endpoint)

- [ ] **Step 1: Add getGanttDataRange method to ScheduleService**

Insert this method before the existing `getGanttData` method (around line 148):

```java
/**
 * 获取日期范围内的甘特图数据
 */
@SuppressWarnings("unchecked")
public List<ScheduleDetailVO> getGanttDataRange(LocalDate startDate, LocalDate endDate, Long groupId) {
    // 1. 获取日期范围内所有排班明细
    List<ScheduleDetail> details;
    if (groupId != null) {
        var empResponse = employeeFeignClient.getEmployeesByGroup(groupId);
        List<Long> empIds = empResponse.getData() != null
                ? empResponse.getData().stream().map(m -> ((Number) m.get("id")).longValue()).collect(Collectors.toList())
                : List.of();
        if (empIds.isEmpty()) return List.of();
        details = detailMapper.selectList(new LambdaQueryWrapper<ScheduleDetail>()
                .ge(ScheduleDetail::getWorkDate, startDate)
                .le(ScheduleDetail::getWorkDate, endDate)
                .in(ScheduleDetail::getEmployeeId, empIds)
                .orderByAsc(ScheduleDetail::getEmployeeId, ScheduleDetail::getWorkDate));
    } else {
        details = detailMapper.selectList(new LambdaQueryWrapper<ScheduleDetail>()
                .ge(ScheduleDetail::getWorkDate, startDate)
                .le(ScheduleDetail::getWorkDate, endDate)
                .orderByAsc(ScheduleDetail::getEmployeeId, ScheduleDetail::getWorkDate));
    }
    if (details.isEmpty()) return List.of();

    // 2. 缓存员工数据
    Map<Long, Map<String, Object>> empMap = new HashMap<>();
    try {
        var empResp = employeeFeignClient.listAll();
        if (empResp.getCode() == 200 && empResp.getData() != null) {
            for (Map<String, Object> e : empResp.getData()) {
                Object id = e.get("id");
                if (id != null) empMap.put(((Number) id).longValue(), e);
            }
        }
    } catch (Exception ignored) {}

    // 3. 缓存班次数据
    Map<Long, Map<String, Object>> shiftMap = new HashMap<>();
    try {
        List<ShiftTemplate> shifts = shiftTemplateMapper.selectList(null);
        for (ShiftTemplate s : shifts) {
            Map<String, Object> m = new HashMap<>();
            m.put("shiftCode", s.getShiftCode());
            m.put("shiftName", s.getShiftName());
            m.put("startTime", s.getStartTime());
            m.put("endTime", s.getEndTime());
            m.put("color", s.getColor());
            m.put("shiftType", s.getShiftType());
            shiftMap.put(s.getId(), m);
        }
    } catch (Exception ignored) {}

    // 4. 缓存所有员工的资质
    Map<Long, List<Map<String, Object>>> qualMap = new HashMap<>();
    for (Long empId : empMap.keySet()) {
        try {
            var qualResp = qualificationFeignClient.listByEmployee(empId);
            if (qualResp.getCode() == 200 && qualResp.getData() != null) {
                qualMap.put(empId, qualResp.getData());
            }
        } catch (Exception ignored) {}
    }

    // 5. 组装结果
    List<ScheduleDetailVO> result = new ArrayList<>();
    for (ScheduleDetail d : details) {
        result.add(ScheduleDetailVO.from(
                d,
                empMap.get(d.getEmployeeId()),
                shiftMap.get(d.getShiftId()),
                List.of(),
                qualMap.getOrDefault(d.getEmployeeId(), List.of())
        ));
    }
    return result;
}
```

- [ ] **Step 2: Add gantt-range endpoint to ScheduleController**

Insert before the `publish` endpoint (around line 80):

```java
/**
 * 甘特图数据（日期范围）
 */
@GetMapping("/gantt-range")
public R<List<ScheduleDetailVO>> ganttRange(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        @RequestParam(required = false) Long groupId) {
    return R.ok(scheduleService.getGanttDataRange(startDate, endDate, groupId));
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/qyf/IdeaProjects/hangyi && ./mvnw compile -pl hangyi-schedule -am -q`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/service/ScheduleService.java hangyi-schedule/src/main/java/com/qyf/hangyi/schedule/controller/ScheduleController.java
git commit -m "feat(schedule): add gantt-range API for weekly Gantt view"
```

---

### Task 2: Frontend — Add getGanttRange API

**Files:**
- Modify: `web/src/api/schedule.js`

- [ ] **Step 1: Add getGanttRange function**

Add before the `publishSchedule` export (around line 18):

```javascript
export function getGanttRange(params) {
  return request.get('/schedules/gantt-range', { params })
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -c /Users/qyf/IdeaProjects/hangyi/web/src/api/schedule.js`
Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add web/src/api/schedule.js
git commit -m "feat(web): add getGanttRange API"
```

---

### Task 3: Frontend — Rewrite ScheduleGantt.vue

**Files:**
- Overwrite: `web/src/views/schedule/ScheduleGantt.vue`

This is the largest task. The new Gantt chart features:
- Week view with scrollable time axis
- Left fixed column (employee names grouped)
- Hover tooltips with shift + employee details
- Stats panel at top (total staff, per-shift counts, assignment days)
- Export screenshot includes stats panel

- [ ] **Step 1: Write the new ScheduleGantt.vue**

Replace the entire file with:

```vue
<template>
  <div>
    <h3 class="page-heading">排班甘特图</h3>

    <!-- 查询条件 -->
    <el-card shadow="hover" style="margin-bottom: 16px">
      <el-form :inline="true">
        <el-form-item label="班组">
          <el-select v-model="query.groupId" placeholder="选择班组" clearable style="width: 160px">
            <el-option v-for="g in groups" :key="g.id" :label="g.groupName" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="周">
          <el-date-picker
            v-model="query.weekStart"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择周起始日"
            style="width: 160px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">查询</el-button>
          <el-button @click="prevWeek">← 上周</el-button>
          <el-button @click="nextWeek">下周 →</el-button>
          <el-button type="success" @click="exportGantt">导出图片</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 排班指标面板 -->
    <el-row :gutter="16" style="margin-bottom: 16px" v-if="stats.totalDays > 0">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ stats.totalEmployees }}</div>
          <div class="stat-label">排班人数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ stats.totalDays }}</div>
          <div class="stat-label">排班天数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ stats.avgShiftPerDay }}</div>
          <div class="stat-label">日均班次</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value" style="color: #2ecc71">{{ stats.constraintRate }}%</div>
          <div class="stat-label">排班完成率</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 班次分布 -->
    <el-card shadow="hover" style="margin-bottom: 16px" v-if="shiftStats.length > 0">
      <div style="display: flex; gap: 24px; align-items: center;">
        <span style="font-size: 13px; color: #5f7391; font-weight: 500;">班次分布：</span>
        <div v-for="s in shiftStats" :key="s.name" style="display: flex; align-items: center; gap: 6px;">
          <span :style="{ width: '12px', height: '12px', borderRadius: '3px', background: s.color, display: 'inline-block' }"></span>
          <span style="font-size: 13px; color: #5f7391;">{{ s.name }}</span>
          <span style="font-size: 13px; color: #10294d; font-weight: 600;">{{ s.count }}</span>
        </div>
      </div>
    </el-card>

    <!-- 甘特图主体 -->
    <el-card shadow="hover">
      <div v-if="rows.length === 0" style="text-align: center; color: #999; padding: 60px">
        请选择班组和周起始日期查询排班数据
      </div>
      <div v-else ref="ganttWrapper" class="gantt-wrapper">
        <!-- 表头：日期 -->
        <div class="gantt-header">
          <div class="gantt-header-left">人员 / 日期</div>
          <div class="gantt-header-days">
            <div
              v-for="day in dateHeaders"
              :key="day.date"
              class="gantt-day-col"
              :class="{ 'gantt-day-weekend': day.isWeekend }"
            >
              <div class="gantt-day-week">{{ day.weekday }}</div>
              <div class="gantt-day-date">{{ day.month }}/{{ day.day }}</div>
            </div>
          </div>
        </div>
        <!-- 数据行 -->
        <div class="gantt-body">
          <div v-for="row in rows" :key="row.empId" class="gantt-row">
            <div class="gantt-row-left" :title="row.position">
              <div class="gantt-row-name">{{ row.name }}</div>
            </div>
            <div class="gantt-row-cells">
              <div
                v-for="(cell, idx) in row.cells"
                :key="idx"
                class="gantt-cell"
                :class="{ 'gantt-cell-rest': cell.isRest }"
                :style="cell.isRest ? {} : { background: cell.color }"
                @mouseenter="showTooltip($event, cell)"
                @mouseleave="hideTooltip"
              >
                <span v-if="!cell.isRest" class="gantt-cell-label">{{ cell.label }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- 汇总行 -->
        <div class="gantt-footer">
          <div class="gantt-footer-left">在岗人数</div>
          <div class="gantt-footer-cells">
            <div v-for="(count, idx) in dailyCounts" :key="idx" class="gantt-footer-cell">
              {{ count }}
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- Tooltip -->
    <teleport to="body">
      <div
        v-show="tooltip.visible"
        class="gantt-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="gantt-tooltip-title">{{ tooltip.employeeName }}</div>
        <div class="gantt-tooltip-row">
          <span class="gantt-tooltip-label">日期</span>
          <span>{{ tooltip.date }}</span>
        </div>
        <div class="gantt-tooltip-row">
          <span class="gantt-tooltip-label">班次</span>
          <span>{{ tooltip.shiftName }}</span>
        </div>
        <div class="gantt-tooltip-row" v-if="tooltip.shiftTime">
          <span class="gantt-tooltip-label">时间</span>
          <span>{{ tooltip.shiftTime }}</span>
        </div>
        <div class="gantt-tooltip-row" v-if="tooltip.position">
          <span class="gantt-tooltip-label">岗位</span>
          <span>{{ tooltip.position }}</span>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { getGanttRange } from '../../api/schedule'
import { getGroupList } from '../../api/employee'
import { ElMessage } from 'element-plus'

const ganttWrapper = ref(null)
const groups = ref([])
const rows = ref([])
const dateHeaders = ref([])
const dailyCounts = ref([])

const tooltip = reactive({
  visible: false, x: 0, y: 0,
  employeeName: '', date: '', shiftName: '', shiftTime: '', position: ''
})

const query = reactive({
  groupId: null,
  weekStart: ''
})

const shiftStats = ref([])
const stats = reactive({
  totalEmployees: 0, totalDays: 0, avgShiftPerDay: 0, constraintRate: 0
})

onMounted(async () => {
  const gRes = await getGroupList()
  groups.value = gRes.data
  // Default to current Monday
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  query.weekStart = monday.toISOString().slice(0, 10)
})

function getDateRange() {
  const start = new Date(query.weekStart)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const ds = d.toISOString().slice(0, 10)
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    dates.push({
      date: ds,
      weekday: weekdays[d.getDay()],
      month: d.getMonth() + 1,
      day: d.getDate(),
      isWeekend: d.getDay() === 0 || d.getDay() === 6
    })
  }
  return dates
}

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function prevWeek() {
  const d = new Date(query.weekStart)
  d.setDate(d.getDate() - 7)
  query.weekStart = d.toISOString().slice(0, 10)
  fetchData()
}

function nextWeek() {
  const d = new Date(query.weekStart)
  d.setDate(d.getDate() + 7)
  query.weekStart = d.toISOString().slice(0, 10)
  fetchData()
}

async function fetchData() {
  if (!query.weekStart) return
  query.weekStart = getMonday(query.weekStart)
  const endDate = new Date(query.weekStart)
  endDate.setDate(endDate.getDate() + 6)
  const endStr = endDate.toISOString().slice(0, 10)

  const res = await getGanttRange({
    startDate: query.weekStart,
    endDate: endStr,
    groupId: query.groupId || undefined
  })
  const data = res.data || []
  if (data.length === 0) {
    rows.value = []
    dateHeaders.value = []
    dailyCounts.value = []
    shiftStats.value = []
    stats.totalDays = 0
    return
  }

  dateHeaders.value = getDateRange()

  // Group by employee
  const empMap = {}
  for (const d of data) {
    if (!empMap[d.employeeId]) empMap[d.employeeId] = { name: d.employeeName, position: d.employeePosition, days: {} }
    empMap[d.employeeId].days[d.workDate] = d
  }

  const employeeIds = Object.keys(empMap)
  const builtRows = employeeIds.map(empId => {
    const emp = empMap[empId]
    const cells = dateHeaders.value.map(dh => {
      const detail = emp.days[dh.date]
      if (detail) {
        return {
          isRest: false,
          color: detail.shiftColor || '#409EFF',
          label: detail.shiftName || '班次',
          shiftName: detail.shiftName || '',
          shiftTime: (detail.shiftStartTime || '') + ' - ' + (detail.shiftEndTime || ''),
          date: dh.date,
          employeeName: emp.name,
          position: emp.position || ''
        }
      }
      return { isRest: true, color: '#f5f5f5', label: '', shiftName: '休息', shiftTime: '', date: dh.date, employeeName: emp.name, position: emp.position || '' }
    })
    return { empId, name: emp.name, position: emp.position || '', cells }
  })

  rows.value = builtRows

  // Daily counts
  dailyCounts.value = dateHeaders.value.map(dh => {
    return builtRows.filter(r => r.cells.some(c => c.date === dh.date && !c.isRest)).length
  })

  // Shift stats
  const shiftCount = {}
  for (const d of data) {
    const name = d.shiftName || '其他'
    if (!shiftCount[name]) shiftCount[name] = { name, count: 0, color: d.shiftColor || '#409EFF' }
    shiftCount[name].count++
  }
  shiftStats.value = Object.values(shiftCount)

  // Overall stats
  stats.totalEmployees = employeeIds.length
  stats.totalDays = dateHeaders.value.length
  const totalShiftCells = data.length
  const totalCells = employeeIds.length * dateHeaders.value.length
  stats.avgShiftPerDay = Math.round(totalShiftCells / dateHeaders.value.length)
  stats.constraintRate = totalCells > 0 ? Math.round((totalShiftCells / totalCells) * 100) : 0
}

function showTooltip(event, cell) {
  tooltip.visible = true
  tooltip.x = event.clientX + 12
  tooltip.y = event.clientY + 8
  tooltip.employeeName = cell.employeeName
  tooltip.date = cell.date
  tooltip.shiftName = cell.shiftName
  tooltip.shiftTime = cell.shiftTime
  tooltip.position = cell.position
}

function hideTooltip() {
  tooltip.visible = false
}

async function exportGantt() {
  const el = ganttWrapper.value
  if (!el) return
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff' })
  const link = document.createElement('a')
  link.download = '排班甘特图.png'
  link.href = canvas.toDataURL()
  link.click()
}
</script>

<style scoped>
.gantt-wrapper {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.gantt-header {
  display: flex;
  background: #f5f7fa;
  border-bottom: 2px solid #ebeef5;
}
.gantt-header-left {
  width: 120px;
  min-width: 120px;
  padding: 10px 8px;
  font-weight: 600;
  font-size: 13px;
  color: #5f7391;
  border-right: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gantt-header-days {
  display: flex;
  flex: 1;
}
.gantt-day-col {
  flex: 1;
  text-align: center;
  padding: 8px 4px;
  border-right: 1px solid #ebeef5;
}
.gantt-day-weekend {
  background: rgba(249, 250, 251, 0.8);
}
.gantt-day-week {
  font-size: 12px;
  color: #97b7dc;
  margin-bottom: 2px;
}
.gantt-day-date {
  font-size: 14px;
  font-weight: 600;
  color: #10294d;
}
.gantt-body {
  max-height: 600px;
  overflow-y: auto;
}
.gantt-row {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
}
.gantt-row:nth-child(even) {
  background: #fafbfc;
}
.gantt-row:hover {
  background: rgba(64, 158, 255, 0.04);
}
.gantt-row-left {
  width: 120px;
  min-width: 120px;
  padding: 8px;
  border-right: 1px solid #ebeef5;
  display: flex;
  align-items: center;
}
.gantt-row-name {
  font-size: 13px;
  color: #10294d;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gantt-row-cells {
  display: flex;
  flex: 1;
}
.gantt-cell {
  flex: 1;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #f0f0f0;
  cursor: pointer;
  transition: opacity 0.15s;
  font-size: 12px;
  position: relative;
}
.gantt-cell:hover {
  opacity: 0.85;
}
.gantt-cell-rest {
  background: #fafafa;
  cursor: default;
}
.gantt-cell-label {
  color: #fff;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,0.15);
  font-size: 11px;
}
.gantt-footer {
  display: flex;
  background: #f5f7fa;
  border-top: 2px solid #ebeef5;
}
.gantt-footer-left {
  width: 120px;
  min-width: 120px;
  padding: 8px;
  font-weight: 600;
  font-size: 13px;
  color: #245090;
  border-right: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gantt-footer-cells {
  display: flex;
  flex: 1;
}
.gantt-footer-cell {
  flex: 1;
  text-align: center;
  padding: 8px 4px;
  font-size: 14px;
  font-weight: 700;
  color: #245090;
  border-right: 1px solid #ebeef5;
}
/* Tooltip */
.gantt-tooltip {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  min-width: 180px;
  pointer-events: none;
}
.gantt-tooltip-title {
  font-weight: 600;
  color: #10294d;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0f0f0;
}
.gantt-tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  padding: 2px 0;
}
.gantt-tooltip-label {
  color: #97b7dc;
}
/* Stat card */
.stat-card {
  text-align: center;
}
.stat-card :deep(.el-card__body) {
  padding: 16px !important;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #245090;
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: #5f7391;
  margin-top: 4px;
}
</style>
```

- [ ] **Step 2: Verify syntax**

Run: `node -c /Users/qyf/IdeaProjects/hangyi/web/src/views/schedule/ScheduleGantt.vue`
Expected: no error

- [ ] **Step 3: Commit**

```bash
git add web/src/views/schedule/ScheduleGantt.vue
git commit -m "feat(web): rewrite Gantt chart with weekly view and stats panel"
```

---

### Task 4: Frontend — Login page animation upgrade

**Files:**
- Overwrite: `web/src/views/login/Login.vue`

- [ ] **Step 1: Update Login.vue with animations**

Replace the template and style sections:

```vue
<template>
  <div class="login-container">
    <!-- 动态航线背景 -->
    <div class="login-bg-planes"></div>
    <div class="login-bg-routes">
      <svg class="login-routes-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <path class="route-line" d="M0,400 Q300,100 600,300 T1200,200" />
        <path class="route-line route-line-2" d="M0,600 Q400,800 800,500 T1200,600" />
        <path class="route-line route-line-3" d="M200,0 Q400,300 600,100 T1100,400" />
      </svg>
    </div>
    <div class="login-glow"></div>
    <div class="login-particles">
      <div v-for="i in 20" :key="i" class="login-particle" :style="particleStyle(i)"></div>
    </div>

    <!-- 登录卡片 -->
    <transition name="login-fade" appear>
      <div class="login-card">
        <div class="login-logo">
          <div class="login-logo-icon">
            <el-icon size="28" color="#fff"><Aim /></el-icon>
          </div>
          <h2 class="login-title">航翼排班</h2>
          <p class="login-subtitle">智能排班管理系统</p>
        </div>
        <el-form ref="formRef" :model="form" :rules="rules" label-width="0">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" size="large" :prefix-icon="User" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="密码" size="large" :prefix-icon="Lock" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" style="width: 100%; font-weight: 600; letter-spacing: 2px" :loading="loading" @click="handleLogin">
              <span v-if="!loading">登 录</span>
            </el-button>
          </el-form-item>
        </el-form>
        <div class="login-footer">
          <span>v1.0.0</span>
          <span>演示账号：admin / 123456</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../store/user'
import { login } from '../../api/auth'
import { User, Lock, Aim } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref(null)
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

function particleStyle(i) {
  const size = 2 + Math.random() * 4
  const x = Math.random() * 100
  const y = Math.random() * 100
  const dur = 8 + Math.random() * 12
  const delay = Math.random() * 10
  return {
    width: size + 'px',
    height: size + 'px',
    left: x + '%',
    top: y + '%',
    animationDuration: dur + 's',
    animationDelay: delay + 's'
  }
}

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const res = await login(form)
    userStore.setLogin(res.data)
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f4ff 0%, #cde4f7 50%, #d6ebff 100%);
  position: relative;
  overflow: hidden;
}

/* SVG 航线 */
.login-bg-routes {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.15;
}
.login-routes-svg {
  width: 100%;
  height: 100%;
}
.route-line {
  fill: none;
  stroke: #245090;
  stroke-width: 2;
  stroke-dasharray: 1200;
  stroke-dashoffset: 1200;
  animation: drawRoute 4s ease-out forwards;
  filter: drop-shadow(0 0 4px rgba(36, 80, 144, 0.3));
}
.route-line-2 {
  animation-delay: 1.5s;
  stroke: #37e2ff;
}
.route-line-3 {
  animation-delay: 3s;
  stroke: #409eff;
}
@keyframes drawRoute {
  to { stroke-dashoffset: 0; }
}

/* 粒子 */
.login-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.login-particle {
  position: absolute;
  border-radius: 50%;
  background: rgba(36, 80, 144, 0.15);
  animation: particleFloat linear infinite;
}
@keyframes particleFloat {
  0% { transform: translateY(0) scale(1); opacity: 0; }
  10% { opacity: 0.6; }
  90% { opacity: 0.6; }
  100% { transform: translateY(-120px) scale(0.5); opacity: 0; }
}

.login-glow {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(55, 226, 255, 0.06), transparent 70%);
  top: -200px;
  right: -200px;
  pointer-events: none;
  z-index: 0;
}

/* 卡片入场动画 */
.login-fade-enter-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.login-fade-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.96);
}

.login-card {
  width: 400px;
  padding: 48px 40px 36px;
  background: rgba(240, 247, 255, 0.88);
  border: 1px solid rgba(124, 156, 198, 0.35);
  border-radius: 20px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 1;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.login-logo {
  text-align: center;
  margin-bottom: 36px;
}

.login-logo-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a3d72, #409eff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(36, 80, 144, 0.25);
  margin-bottom: 16px;
}

.login-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: #10294d;
  letter-spacing: 2px;
}

.login-subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: #5f7391;
}

.login-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(124, 156, 198, 0.2);
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #97b7dc;
}

:deep(.el-input__wrapper) {
  background: rgba(240, 247, 255, 0.95) !important;
  border: 1px solid rgba(124, 156, 198, 0.42) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  padding: 4px 14px !important;
  transition: border-color 0.2s;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #245090 !important;
  box-shadow: 0 0 0 3px rgba(36, 80, 144, 0.08) !important;
}

:deep(.el-input__inner) {
  color: #17355f !important;
  height: 46px !important;
  font-size: 15px !important;
}

:deep(.el-input__prefix) {
  color: #97b7dc !important;
}

:deep(.el-button--primary) {
  height: 46px;
  font-size: 15px !important;
  border-radius: 10px !important;
}
</style>
```

- [ ] **Step 2: Verify syntax**

Run: `node -c /Users/qyf/IdeaProjects/hangyi/web/src/views/login/Login.vue`
Expected: no error

- [ ] **Step 3: Commit**

```bash
git add web/src/views/login/Login.vue
git commit -m "feat(web): add login page animations with SVG flight routes"
```

---

### Task 5: Integration test

- [ ] **Step 1: Build and verify**

Run: `cd /Users/qyf/IdeaProjects/hangyi && ./mvnw compile -pl hangyi-schedule -am -q`
Expected: BUILD SUCCESS

- [ ] **Step 2: Start frontend dev server**

Run: `cd /Users/qyf/IdeaProjects/hangyi/web && npm run dev`
Expected: Vite dev server starts on localhost

- [ ] **Step 3: Manual smoke test**
  - Open login page → verify animated SVG routes and particle effects
  - Login → verify redirect to dashboard
  - Navigate to 排班管理 → click 甘特图 → verify weekly view
  - Test ← 上周 / 下周 → week navigation
  - Hover on cells → tooltip shows
  - Verify stats panel displays correct numbers
  - Click 导出图片 → PNG downloads
