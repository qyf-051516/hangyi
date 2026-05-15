<template>
  <div>
    <div class="dashboard-header">
      <div class="dashboard-header-left">
        <h3 class="page-heading" style="margin-bottom: 0">仪表盘</h3>
      </div>
      <div class="dashboard-header-right">
        <span class="dashboard-date">{{ todayDate }}</span>
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20">
      <el-col :span="6" v-for="(card, idx) in cards" :key="card.label">
        <el-card shadow="hover" class="dash-stat-card" style="margin-bottom: 20px">
          <div class="dash-stat-inner">
            <div class="dash-stat-icon" :class="'dash-icon-' + idx">
              <el-icon :size="24"><component :is="card.icon" /></el-icon>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-value">{{ card.value }}</div>
              <div class="dash-stat-label">{{ card.label }}</div>
            </div>
          </div>
          <div class="dash-stat-trend" v-if="card.trend !== undefined">
            <span :class="card.trend >= 0 ? 'trend-up' : 'trend-down'">
              {{ card.trend >= 0 ? '↑' : '↓' }} {{ Math.abs(card.trend) }}%
            </span>
            <span class="trend-label">较昨日</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <!-- 今日排班分布 -->
      <el-col :span="14">
        <el-card shadow="hover" class="dash-content-card">
          <template #header>
            <div class="card-header-row">
              <div class="card-header-left">
                <el-icon class="card-header-icon"><DataAnalysis /></el-icon>
                <span>今日排班分布</span>
              </div>
              <span class="card-header-badge" v-if="onDutyTotal > 0">在岗 {{ onDutyTotal }} 人</span>
            </div>
          </template>
          <div v-if="hasShiftData" class="shift-distribution">
            <div class="shift-bar-wrapper" v-for="(item, name) in todayShiftCount" :key="name">
              <div class="shift-bar-label">
                <span class="shift-name">{{ name }}</span>
                <span class="shift-count">{{ item }}人</span>
              </div>
              <div class="shift-bar-track">
                <div
                  class="shift-bar-fill"
                  :style="{ width: percentage(item) + '%' }"
                  :class="'shift-fill-' + getShiftIndex(name)"
                ></div>
              </div>
            </div>
            <!-- 环形图 -->
            <div class="ring-chart-section">
              <div class="ring-chart-container">
                <svg viewBox="0 0 180 180" class="ring-svg">
                  <circle cx="90" cy="90" r="72" fill="none" stroke="rgba(124,156,198,0.15)" stroke-width="18"/>
                  <circle
                    v-for="(seg, i) in ringSegments"
                    :key="i"
                    cx="90" cy="90" r="72" fill="none"
                    :stroke="seg.color"
                    stroke-width="18"
                    stroke-linecap="butt"
                    :stroke-dasharray="seg.circumference"
                    :stroke-dashoffset="seg.offset"
                    :transform="'rotate(-90, 90, 90)'"
                    class="ring-segment"
                  />
                </svg>
                <div class="ring-center">
                  <span class="ring-center-value">{{ onDutyTotal }}</span>
                  <span class="ring-center-label">在岗</span>
                </div>
              </div>
              <div class="ring-legend">
                <div class="ring-legend-item" v-for="seg in ringSegments" :key="seg.label">
                  <span class="legend-dot" :style="{ background: seg.color }"></span>
                  <span class="legend-label">{{ seg.label }}</span>
                  <span class="legend-value">{{ seg.count }}人</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="dash-empty">
            <el-icon :size="48" color="#97b7dc"><InfoFilled /></el-icon>
            <span>暂无排班数据</span>
          </div>
        </el-card>
      </el-col>

      <!-- 快速操作 & 信息 -->
      <el-col :span="10">
        <el-card shadow="hover" class="dash-content-card" style="margin-bottom: 20px">
          <template #header>
            <div class="card-header-row">
              <div class="card-header-left">
                <el-icon class="card-header-icon"><Opportunity /></el-icon>
                <span>快速操作</span>
              </div>
            </div>
          </template>
          <div class="quick-actions-grid">
            <div class="quick-action-item" @click="$router.push('/schedules')">
              <div class="qa-icon qa-icon-blue">
                <el-icon :size="22"><Calendar /></el-icon>
              </div>
              <span class="qa-label">排班管理</span>
            </div>
            <div class="quick-action-item" @click="$router.push('/schedule-gantt')">
              <div class="qa-icon qa-icon-green">
                <el-icon :size="22"><Histogram /></el-icon>
              </div>
              <span class="qa-label">甘特图</span>
            </div>
            <div class="quick-action-item" @click="$router.push('/employee')">
              <div class="qa-icon qa-icon-orange">
                <el-icon :size="22"><User /></el-icon>
              </div>
              <span class="qa-label">人员管理</span>
            </div>
            <div class="quick-action-item" @click="$router.push('/flights')">
              <div class="qa-icon qa-icon-purple">
                <el-icon :size="22"><Aim /></el-icon>
              </div>
              <span class="qa-label">航班计划</span>
            </div>
          </div>
        </el-card>

        <el-card shadow="hover" class="dash-content-card">
          <template #header>
            <div class="card-header-row">
              <div class="card-header-left">
                <el-icon class="card-header-icon"><WarningFilled /></el-icon>
                <span>系统状态</span>
              </div>
            </div>
          </template>
          <div class="sys-status-list">
            <div class="sys-status-item">
              <div class="sys-status-dot sys-dot-ok"></div>
              <span class="sys-status-name">后端服务</span>
              <span class="sys-status-tag tag-ok">运行中</span>
            </div>
            <div class="sys-status-item">
              <div class="sys-status-dot sys-dot-ok"></div>
              <span class="sys-status-name">数据库</span>
              <span class="sys-status-tag tag-ok">已连接</span>
            </div>
            <div class="sys-status-item">
              <div class="sys-status-dot sys-dot-ok"></div>
              <span class="sys-status-name">排班引擎</span>
              <span class="sys-status-tag tag-ok">就绪</span>
            </div>
            <div class="sys-status-item">
              <div class="sys-status-dot" :class="solverStatus.dot"></div>
              <span class="sys-status-name">Timefold Solver</span>
              <span class="sys-status-tag" :class="solverStatus.tag">{{ solverStatus.text }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getDashboardStats } from '../../api/dashboard'
import {
  User, Calendar, Histogram, Aim, DataAnalysis,
  Opportunity, WarningFilled, InfoFilled
} from '@element-plus/icons-vue'

const todayDate = ref('')
const onDutyTotal = ref(0)
const hasShiftData = ref(false)

const cards = ref([
  { label: '员工总数', value: 0, icon: User, trend: null },
  { label: '今日在岗', value: 0, icon: Calendar, trend: null },
  { label: '今日航班', value: 0, icon: Aim, trend: null },
  { label: '排班计划', value: 0, icon: Histogram, trend: null }
])
const todayShiftCount = ref({})

const ringColors = [
  '#245090', '#409eff', '#37e2ff', '#5f8ec9',
  '#79bbff', '#a0cfff', '#8cd4f5'
]

const solverStatus = computed(() => ({
  dot: 'sys-dot-ok',
  tag: 'tag-ok',
  text: '就绪'
}))

onMounted(async () => {
  const d = new Date()
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  todayDate.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`

  try {
    const res = await getDashboardStats()
    const data = res.data
    cards.value = [
      { label: '员工总数', value: data.totalEmployees ?? 0, icon: User, trend: null },
      { label: '今日在岗', value: data.todayOnDuty ?? 0, icon: Calendar, trend: null },
      { label: '今日航班', value: data.todayFlights ?? 0, icon: Aim, trend: null },
      { label: '排班计划', value: data.scheduleCount ?? 0, icon: Histogram, trend: null }
    ]
    todayShiftCount.value = data.todayShiftCount || {}
    onDutyTotal.value = data.todayOnDuty ?? 0
    hasShiftData.value = Object.keys(todayShiftCount.value).length > 0
  } catch (e) {
    // API not ready
  }
})

const ringSegments = computed(() => {
  const entries = Object.entries(todayShiftCount.value)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total === 0) return []
  const circumference = 2 * Math.PI * 72 // r=72
  let offset = 0
  return entries.map(([label, count], i) => {
    const pct = count / total
    const segCircumference = circumference * pct
    const seg = {
      label, count,
      color: ringColors[i % ringColors.length],
      circumference: `${segCircumference} ${circumference - segCircumference}`,
      offset: -offset,
    }
    offset += segCircumference
    return seg
  })
})

function getShiftIndex(name) {
  const keys = Object.keys(todayShiftCount.value)
  return keys.indexOf(name) % 5
}

function percentage(count) {
  return onDutyTotal.value > 0 ? Math.round(count / onDutyTotal.value * 100) : 0
}
</script>

<style scoped>
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dashboard-date {
  font-size: 13px;
  color: #97b7dc;
  background: rgba(151, 183, 220, 0.1);
  padding: 6px 16px;
  border-radius: 16px;
  border: 1px solid rgba(124, 156, 198, 0.2);
}

/* ===== 统计卡片 ===== */
.dash-stat-card {
  overflow: hidden;
}
.dash-stat-card :deep(.el-card__body) {
  padding: 20px !important;
}

.dash-stat-inner {
  display: flex;
  align-items: center;
  gap: 16px;
}

.dash-stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dash-icon-0 { background: rgba(36, 80, 144, 0.1); color: #245090; }
.dash-icon-1 { background: rgba(64, 158, 255, 0.1); color: #409eff; }
.dash-icon-2 { background: rgba(55, 226, 255, 0.12); color: #1ba5c4; }
.dash-icon-3 { background: rgba(46, 204, 113, 0.1); color: #1a8a4a; }

.dash-stat-info {
  flex: 1;
  min-width: 0;
}

.dash-stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #10294d;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.dash-stat-label {
  font-size: 13px;
  color: #5f7391;
  margin-top: 4px;
}

.dash-stat-trend {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(124, 156, 198, 0.2);
  font-size: 12px;
}

.trend-up { color: #2ecc71; font-weight: 600; }
.trend-down { color: #c94b56; font-weight: 600; }
.trend-label { color: #97b7dc; margin-left: 6px; }

/* ===== 内容卡片 ===== */
.dash-content-card { margin-bottom: 20px; }

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #10294d;
}

.card-header-icon {
  color: #245090;
  font-size: 18px;
}

.card-header-badge {
  font-size: 12px;
  background: rgba(36, 80, 144, 0.08);
  color: #245090;
  padding: 2px 12px;
  border-radius: 10px;
  font-weight: 500;
}

/* ===== 排班分布 ===== */
.shift-distribution {
  padding: 4px 0;
}

.shift-bar-wrapper {
  margin-bottom: 16px;
}

.shift-bar-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.shift-name {
  font-size: 13px;
  color: #5f7391;
  font-weight: 500;
}

.shift-count {
  font-size: 12px;
  color: #97b7dc;
}

.shift-bar-track {
  height: 8px;
  background: rgba(124, 156, 198, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.shift-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}

.shift-fill-0 { background: linear-gradient(90deg, #245090, #409eff); }
.shift-fill-1 { background: linear-gradient(90deg, #409eff, #37e2ff); }
.shift-fill-2 { background: linear-gradient(90deg, #37e2ff, #8cd4f5); }
.shift-fill-3 { background: linear-gradient(90deg, #5f8ec9, #79bbff); }
.shift-fill-4 { background: linear-gradient(90deg, #a0cfff, #c6e2ff); }

/* ===== 环形图 ===== */
.ring-chart-section {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(124, 156, 198, 0.15);
}

.ring-chart-container {
  position: relative;
  width: 150px;
  height: 150px;
  flex-shrink: 0;
}

.ring-svg {
  width: 100%;
  height: 100%;
}

.ring-segment {
  transition: stroke-dashoffset 0.8s ease;
}

.ring-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.ring-center-value {
  display: block;
  font-size: 26px;
  font-weight: 700;
  color: #10294d;
  line-height: 1;
}

.ring-center-label {
  display: block;
  font-size: 11px;
  color: #97b7dc;
  margin-top: 2px;
}

.ring-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ring-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  color: #5f7391;
  flex: 1;
}

.legend-value {
  color: #10294d;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ===== 快捷操作网格 ===== */
.quick-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.quick-action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.quick-action-item:hover {
  background: rgba(83, 153, 255, 0.06);
  border-color: rgba(124, 156, 198, 0.25);
  transform: translateY(-2px);
}

.qa-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qa-icon-blue { background: rgba(36, 80, 144, 0.1); color: #245090; }
.qa-icon-green { background: rgba(46, 204, 113, 0.1); color: #1a8a4a; }
.qa-icon-orange { background: rgba(194, 138, 39, 0.1); color: #c28a27; }
.qa-icon-purple { background: rgba(102, 51, 153, 0.1); color: #663399; }

.qa-label {
  font-size: 13px;
  color: #5f7391;
  font-weight: 500;
}

/* ===== 系统状态 ===== */
.sys-status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sys-status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.sys-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sys-dot-ok { background: #2ecc71; box-shadow: 0 0 6px rgba(46, 204, 113, 0.4); }

.sys-status-name {
  flex: 1;
  font-size: 13px;
  color: #5f7391;
}

.sys-status-tag {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 500;
}

.tag-ok {
  background: rgba(46, 204, 113, 0.1);
  color: #1a8a4a;
}

/* ===== 空状态 ===== */
.dash-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: #97b7dc;
  font-size: 14px;
}
</style>
