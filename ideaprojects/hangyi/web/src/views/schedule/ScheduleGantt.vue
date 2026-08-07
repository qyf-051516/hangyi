<template>
  <div class="gantt-page">
    <AppPageHeader
      title="排班甘特图"
      description="以周为单位查看人员在岗分布、班次覆盖和每日人力变化。"
    >
      <template #actions>
        <el-button
          type="primary"
          plain
          :disabled="rows.length === 0"
          :loading="exporting"
          @click="exportGantt"
        >
          导出甘特图
        </el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="query-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="班组">
          <el-select
            v-model="query.groupId"
            placeholder="全部班组"
            clearable
            style="width: 180px"
            :loading="groupsLoading"
            @change="fetchData"
          >
            <el-option v-for="g in groups" :key="g.id" :label="g.groupName" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="周">
          <el-date-picker
            v-model="query.weekStart"
            type="week"
            format="YYYY 第 ww 周"
            value-format="YYYY-MM-DD"
            placeholder="选择周"
            :clearable="false"
            style="width: 180px"
            @change="fetchData"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="fetchData">查询</el-button>
          <el-button @click="goToToday">今日</el-button>
          <el-button @click="prevWeek">← 上周</el-button>
          <el-button @click="nextWeek">下周 →</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <section v-if="rows.length > 0" class="gantt-summary" aria-label="排班周摘要">
      <div><span>排班人数</span><strong>{{ stats.totalEmployees }}</strong></div>
      <div><span>统计天数</span><strong>{{ stats.totalDays }}</strong></div>
      <div><span>日均班次</span><strong>{{ stats.avgShiftPerDay }}</strong></div>
      <div><span>排班覆盖率</span><strong>{{ stats.constraintRate }}%</strong></div>
      <p>{{ weekRangeLabel }}</p>
    </section>

    <el-card v-if="shiftStats.length > 0" shadow="never" class="legend-card">
      <strong>班次分布</strong>
      <div class="legend-list">
        <span v-for="shift in shiftStats" :key="shift.name">
          <i :style="{ background: shift.color }" />
          {{ shift.name }}
          <b>{{ shift.count }}</b>
        </span>
      </div>
    </el-card>

    <el-card shadow="never" class="chart-card">
      <AppPageState
        v-if="loading && !hasLoaded"
        type="loading"
        title="正在生成周排班视图"
      />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="甘特图加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="rows.length === 0"
        title="本周暂无排班数据"
        description="切换班组或周次后重试，也可以先在排班管理中创建并发布排班。"
        action-label="刷新本周"
        @action="fetchData"
      />
      <div v-else ref="ganttWrapper" class="gantt-wrapper">
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
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getGanttRange, getSchedule } from '../../api/schedule'
import { getGroupList } from '../../api/employee'
import { ElMessage } from 'element-plus'

const route = useRoute()
const ganttWrapper = ref(null)
const groups = ref([])
const rows = ref([])
const dateHeaders = ref([])
const dailyCounts = ref([])
const groupsLoading = ref(false)
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')
const exporting = ref(false)

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

const weekRangeLabel = computed(() => {
  if (!query.weekStart) return ''
  return `${query.weekStart} — ${addDays(query.weekStart, 6)}`
})

function currentMondayStr() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  return toDateInput(monday)
}

onMounted(async () => {
  query.weekStart = currentMondayStr()
  groupsLoading.value = true
  try {
    const groupRes = await getGroupList({}, { silent: true })
    groups.value = Array.isArray(groupRes.data) ? groupRes.data : []
  } catch {
    groups.value = []
  } finally {
    groupsLoading.value = false
  }

  const scheduleId = route.query.scheduleId
  if (scheduleId != null && scheduleId !== '') {
    const id = Number(scheduleId)
    if (!Number.isNaN(id)) {
      try {
        const sRes = await getSchedule(id, { silent: true })
        const sched = sRes.data
        if (sched) {
          if (sched.groupId != null) query.groupId = sched.groupId
          if (sched.startDate) query.weekStart = getMonday(sched.startDate)
        }
      } catch {
        ElMessage.warning('未找到该排班，请手动选择班组和周')
      }
    }
  }
  await fetchData()
})

function getDateRange() {
  const start = new Date(`${query.weekStart}T00:00:00`)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const ds = toDateInput(d)
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
  const d = new Date(`${date}T00:00:00`)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return toDateInput(d)
}

function prevWeek() {
  query.weekStart = addDays(query.weekStart, -7)
  fetchData()
}

function nextWeek() {
  query.weekStart = addDays(query.weekStart, 7)
  fetchData()
}

function goToToday() {
  query.weekStart = currentMondayStr()
  fetchData()
}

async function fetchData() {
  if (!query.weekStart) return
  query.weekStart = getMonday(query.weekStart)
  const endStr = addDays(query.weekStart, 6)
  loading.value = true
  loadError.value = ''
  hideTooltip()
  try {
    const res = await getGanttRange({
      startDate: query.weekStart,
      endDate: endStr,
      groupId: query.groupId || undefined
    }, { silent: true })
    const data = Array.isArray(res.data) ? res.data : []
    if (data.length === 0) {
      resetChart()
      hasLoaded.value = true
      return
    }

    dateHeaders.value = getDateRange()
    const empMap = {}
    for (const detail of data) {
      if (!empMap[detail.employeeId]) {
        empMap[detail.employeeId] = {
          name: detail.employeeName,
          position: detail.employeePosition,
          days: {}
        }
      }
      empMap[detail.employeeId].days[detail.workDate] = detail
    }

    const employeeIds = Object.keys(empMap)
    const builtRows = employeeIds.map(empId => {
      const employee = empMap[empId]
      const cells = dateHeaders.value.map(day => {
        const detail = employee.days[day.date]
        if (detail) {
          return {
            isRest: false,
            color: detail.shiftColor || '#5C7BAA',
            label: detail.shiftName || '班次',
            shiftName: detail.shiftName || '',
            shiftTime: [detail.shiftStartTime, detail.shiftEndTime].filter(Boolean).join(' — '),
            date: day.date,
            employeeName: employee.name,
            position: employee.position || ''
          }
        }
        return {
          isRest: true,
          color: '',
          label: '',
          shiftName: '',
          shiftTime: '',
          date: day.date,
          employeeName: employee.name,
          position: employee.position || ''
        }
      })
      return {
        empId,
        name: employee.name || `员工 #${empId}`,
        position: employee.position || '',
        cells
      }
    })

    rows.value = builtRows
    dailyCounts.value = dateHeaders.value.map(day =>
      builtRows.filter(row =>
        row.cells.some(cell => cell.date === day.date && !cell.isRest)
      ).length
    )

    const shiftCount = {}
    for (const detail of data) {
      const name = detail.shiftName || '其他'
      if (!shiftCount[name]) {
        shiftCount[name] = {
          name,
          count: 0,
          color: detail.shiftColor || '#5C7BAA'
        }
      }
      shiftCount[name].count++
    }
    shiftStats.value = Object.values(shiftCount)

    stats.totalEmployees = employeeIds.length
    stats.totalDays = dateHeaders.value.length
    const totalCells = employeeIds.length * dateHeaders.value.length
    stats.avgShiftPerDay = Math.round(data.length / dateHeaders.value.length)
    stats.constraintRate = totalCells > 0
      ? Math.round((data.length / totalCells) * 100)
      : 0
    hasLoaded.value = true
  } catch (error) {
    resetChart()
    loadError.value = error?.message || '请检查排班服务后重试'
  } finally {
    loading.value = false
  }
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
  if (!el || exporting.value) return
  exporting.value = true
  const origMaxHeight = el.style.maxHeight
  const origOverflow = el.style.overflow
  el.style.maxHeight = 'none'
  el.style.overflow = 'visible'
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 })
    const link = document.createElement('a')
    link.download = `排班甘特图_${query.weekStart}_${addDays(query.weekStart, 6)}.png`
    link.href = canvas.toDataURL()
    link.click()
    ElMessage.success('甘特图已导出')
  } catch {
    ElMessage.error('甘特图导出失败，请稍后重试')
  } finally {
    el.style.maxHeight = origMaxHeight
    el.style.overflow = origOverflow
    exporting.value = false
  }
}

function resetChart() {
  rows.value = []
  dateHeaders.value = []
  dailyCounts.value = []
  shiftStats.value = []
  Object.assign(stats, {
    totalEmployees: 0,
    totalDays: 0,
    avgShiftPerDay: 0,
    constraintRate: 0
  })
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + amount)
  return toDateInput(date)
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<style scoped>
.gantt-page {
  max-width: 1440px;
  margin: 0 auto;
}

.query-card,
.legend-card {
  margin-bottom: var(--space-4);
}

.query-card :deep(.el-card__body) {
  padding-block: 14px !important;
}

.query-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.gantt-summary {
  display: grid;
  grid-template-columns: repeat(4, 140px) 1fr;
  margin-bottom: var(--space-4);
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.gantt-summary > div {
  display: grid;
  gap: 7px;
  padding: 16px 20px;
  border-right: 1px solid var(--color-neutral-200);
}

.gantt-summary span,
.gantt-summary p {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.gantt-summary strong {
  color: var(--color-brand-900);
  font-size: 25px;
  font-variant-numeric: tabular-nums;
}

.gantt-summary p {
  align-self: center;
  justify-self: end;
  margin: 0;
  padding: 0 20px;
  font-family: var(--font-family-mono);
}

.legend-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding-block: 13px !important;
}

.legend-card strong {
  flex: 0 0 auto;
  color: var(--color-brand-900);
  font-size: var(--font-size-sm);
}

.legend-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
}

.legend-list span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.legend-list i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.legend-list b {
  color: var(--color-brand-800);
  font-family: var(--font-family-mono);
}

.chart-card :deep(.el-card__body) {
  padding: 16px !important;
}

/*
  Gantt layout:
  - .gantt-wrapper is the SINGLE scroll container (both X and Y).
  - .gantt-header is position: sticky at top: 0 so it stays visible while
    the user scrolls vertically through many rows.
  - min-width on rows forces horizontal scroll when the viewport is narrow
    (e.g. < 720px), and header/rows scroll together.
  - max-height is viewport-based (calc(100vh - 360px)) so the chart fills
    the available area instead of being capped at a fixed 600px.
*/
.gantt-wrapper {
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  background: var(--color-neutral-0);
  overflow: auto;
  max-height: calc(100vh - 360px);
  min-width: 100%;
}
.gantt-header {
  display: flex;
  background: var(--color-brand-50);
  border-bottom: 2px solid var(--color-neutral-200);
  position: sticky;
  top: 0;
  z-index: 2;
  min-width: 720px;
}
.gantt-header-left {
  width: 120px;
  min-width: 120px;
  padding: 10px 8px;
  font-weight: 600;
  font-size: 13px;
  color: var(--color-neutral-600);
  border-right: 1px solid var(--color-neutral-200);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-brand-50);
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
  background: rgba(232, 238, 246, 0.64);
}
.gantt-day-week {
  font-size: 12px;
  color: var(--color-brand-500);
  margin-bottom: 2px;
}
.gantt-day-date {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-brand-900);
}
.gantt-body {
  /* no max-height / no overflow — the wrapper scrolls */
}
.gantt-row {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  min-width: 720px;
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
  position: sticky;
  left: 0;
  background: inherit;
  z-index: 1;
}
.gantt-row:nth-child(even) .gantt-row-left {
  background: #fafbfc;
}
.gantt-row:hover .gantt-row-left {
  background: rgba(64, 158, 255, 0.04);
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
  min-width: 720px;
  position: sticky;
  bottom: 0;
  z-index: 1;
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
  position: sticky;
  left: 0;
  background: #f5f7fa;
  z-index: 1;
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
  z-index: 3000;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  box-shadow: var(--shadow-md);
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

@media (max-width: 1050px) {
  .gantt-summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .gantt-summary p {
    grid-column: 1 / -1;
    justify-self: stretch;
    padding-block: 12px;
    border-top: 1px solid var(--color-neutral-200);
    text-align: center;
  }
}

@media (max-width: 767px) {
  .query-card :deep(.el-form) {
    display: grid;
    grid-template-columns: 1fr;
  }

  .query-card :deep(.el-form-item),
  .query-card :deep(.el-select),
  .query-card :deep(.el-date-editor) {
    width: 100% !important;
  }

  .query-card :deep(.el-form-item:last-child .el-form-item__content) {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .query-card :deep(.el-form-item:last-child .el-button) {
    width: 100%;
    margin: 0;
  }

  .gantt-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gantt-summary > div:nth-child(2),
  .gantt-summary > div:nth-child(4) {
    border-right: 0;
  }

  .legend-card :deep(.el-card__body) {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .gantt-wrapper {
    max-height: calc(100dvh - 320px);
  }
}
</style>
