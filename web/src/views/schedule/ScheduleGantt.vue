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
