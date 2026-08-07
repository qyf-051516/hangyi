<template>
  <div class="dashboard">
    <header class="dashboard-intro">
      <div>
        <span class="dashboard-kicker">TODAY / OPERATIONS</span>
        <h1>运行概览</h1>
        <p>聚合今日人员、航班与排班状态，异常信息会在这里优先呈现。</p>
      </div>
      <div class="dashboard-intro-meta">
        <time>{{ todayDate }}</time>
        <span v-if="lastUpdatedLabel">更新于 {{ lastUpdatedLabel }}</span>
        <button
          type="button"
          class="refresh-button"
          :disabled="refreshing"
          @click="loadDashboard(false)"
        >
          <el-icon :class="{ 'is-spinning': refreshing }"><Refresh /></el-icon>
          {{ refreshing ? '刷新中' : '刷新数据' }}
        </button>
      </div>
    </header>

    <div v-if="statsError" class="dashboard-notice" role="alert">
      <el-icon><WarningFilled /></el-icon>
      <span>
        <strong>概览数据暂时不可用</strong>
        {{ statsError }}
      </span>
      <button type="button" @click="loadDashboard(false)">重试</button>
    </div>

    <section class="metric-grid" aria-label="今日关键指标" :aria-busy="initialLoading">
      <article v-for="card in cards" :key="card.key" class="metric-card">
        <div class="metric-card-top">
          <span class="metric-icon">
            <el-icon><component :is="card.icon" /></el-icon>
          </span>
          <span class="metric-index">{{ card.index }}</span>
        </div>
        <div v-if="initialLoading" class="metric-skeleton" aria-hidden="true"></div>
        <strong v-else class="metric-value">{{ formatMetric(card.value) }}</strong>
        <span class="metric-label">{{ card.label }}</span>
        <small>{{ card.description }}</small>
      </article>
    </section>

    <div class="dashboard-grid">
      <section class="dashboard-panel shift-panel" aria-labelledby="shift-title">
        <header class="panel-header">
          <div>
            <span class="panel-index">01</span>
            <div>
              <h2 id="shift-title">今日班次分布</h2>
              <p>按班次统计已安排人员</p>
            </div>
          </div>
          <span v-if="hasShiftData" class="panel-total">{{ shiftTotal }} 人已排班</span>
        </header>

        <div v-if="initialLoading" class="shift-loading" aria-label="正在加载班次分布">
          <span v-for="index in 4" :key="index"></span>
        </div>

        <div v-else-if="statsError && !hasShiftData" class="panel-state">
          <span class="state-icon state-icon--error">
            <el-icon><WarningFilled /></el-icon>
          </span>
          <strong>无法读取班次分布</strong>
          <p>服务恢复后可在此处重新加载。</p>
          <el-button @click="loadDashboard(false)">重新加载</el-button>
        </div>

        <div v-else-if="hasShiftData" class="shift-content">
          <div class="shift-list">
            <div
              v-for="(count, name) in todayShiftCount"
              :key="name"
              class="shift-row"
            >
              <div class="shift-row-label">
                <span>{{ name }}</span>
                <strong>{{ count }} 人</strong>
              </div>
              <div
                class="shift-track"
                role="progressbar"
                :aria-label="`${name} ${count} 人`"
                aria-valuemin="0"
                :aria-valuemax="shiftTotal"
                :aria-valuenow="count"
              >
                <span
                  :style="{ width: `${percentage(count)}%` }"
                  :class="`shift-tone-${getShiftIndex(name)}`"
                ></span>
              </div>
            </div>
          </div>

          <div class="ring-section">
            <div class="ring-chart">
              <svg
                viewBox="0 0 180 180"
                role="img"
                :aria-label="`今日共有 ${shiftTotal} 人已排班`"
              >
                <circle class="ring-track" cx="90" cy="90" r="70" />
                <circle
                  v-for="segment in ringSegments"
                  :key="segment.label"
                  class="ring-segment"
                  cx="90"
                  cy="90"
                  r="70"
                  :stroke="segment.color"
                  :stroke-dasharray="segment.circumference"
                  :stroke-dashoffset="segment.offset"
                  transform="rotate(-90 90 90)"
                />
              </svg>
              <span class="ring-center">
                <strong>{{ shiftTotal }}</strong>
                <small>已排班</small>
              </span>
            </div>

            <div class="ring-legend">
              <div v-for="segment in ringSegments" :key="segment.label">
                <span :style="{ background: segment.color }"></span>
                <small>{{ segment.label }}</small>
                <strong>{{ segment.count }}</strong>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="panel-state">
          <span class="state-icon">
            <el-icon><Calendar /></el-icon>
          </span>
          <strong>今天还没有排班数据</strong>
          <p>创建或发布排班后，班次分布会自动出现在这里。</p>
          <el-button type="primary" @click="$router.push('/schedules')">前往排班管理</el-button>
        </div>
      </section>

      <aside class="dashboard-side">
        <section
          v-if="pendingLeaveCount > 0"
          class="attention-panel"
          aria-label="待处理事项"
        >
          <div>
            <span>待处理</span>
            <strong>{{ pendingLeaveCount }} 条请假申请</strong>
          </div>
          <button type="button" @click="$router.push('/leaves')">
            去审批
            <el-icon><ArrowRight /></el-icon>
          </button>
        </section>

        <section class="dashboard-panel quick-panel" aria-labelledby="quick-title">
          <header class="panel-header panel-header--compact">
            <div>
              <span class="panel-index">02</span>
              <div>
                <h2 id="quick-title">快速操作</h2>
                <p>常用工作入口</p>
              </div>
            </div>
          </header>

          <div class="quick-grid">
            <button
              v-for="action in quickActions"
              :key="action.path"
              type="button"
              class="quick-action"
              @click="$router.push(action.path)"
            >
              <span><el-icon><component :is="action.icon" /></el-icon></span>
              <strong>{{ action.label }}</strong>
              <small>{{ action.description }}</small>
              <el-icon class="quick-arrow"><ArrowRight /></el-icon>
            </button>
          </div>
        </section>

        <section class="dashboard-panel health-panel" aria-labelledby="health-title">
          <header class="panel-header panel-header--compact">
            <div>
              <span class="panel-index">03</span>
              <div>
                <h2 id="health-title">系统状态</h2>
                <p>{{ healthError ? '部分状态不可用' : '关键服务实时检查' }}</p>
              </div>
            </div>
            <button
              type="button"
              class="panel-icon-button"
              aria-label="刷新系统状态"
              :disabled="refreshing"
              @click="loadHealth"
            >
              <el-icon :class="{ 'is-spinning': healthLoading }"><Refresh /></el-icon>
            </button>
          </header>

          <div class="health-list" :aria-busy="healthLoading">
            <div v-for="item in systemHealthList" :key="item.key" class="health-item">
              <span class="health-dot" :class="`health-dot--${item.level}`"></span>
              <span>
                <strong>{{ item.name }}</strong>
                <small>{{ item.detail }}</small>
              </span>
              <em :class="`health-tag--${item.level}`">{{ item.text }}</em>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import {
  Aim,
  ArrowRight,
  Calendar,
  Histogram,
  Refresh,
  User,
  WarningFilled
} from '@element-plus/icons-vue'
import { getDashboardStats, getSystemHealth } from '../../api/dashboard'

const AUTO_REFRESH_MS = 2 * 60 * 1000
const HEALTHY_STATUSES = new Set([
  'UP', 'OK', 'RUNNING', 'READY', 'HEALTHY', 'CONNECTED', 'AVAILABLE'
])
const ERROR_STATUSES = new Set([
  'DOWN', 'ERROR', 'FAILED', 'UNHEALTHY', 'STOPPED', 'DISCONNECTED', 'UNAVAILABLE'
])
const WARNING_STATUSES = new Set(['DEGRADED', 'WARN', 'WARNING', 'BUSY'])
const ringColors = ['#243d60', '#3d5a85', '#5c7baa', '#7f98ba', '#a8b8d8', '#607d8f']

const initialLoading = ref(true)
const refreshing = ref(false)
const healthLoading = ref(true)
const statsError = ref('')
const healthError = ref('')
const lastUpdatedAt = ref(null)
const todayShiftCount = ref({})
const pendingLeaveCount = ref(0)

let refreshTimer = null

const cards = shallowRef([
  { key: 'employees', index: '01', label: '员工总数', description: '当前在册人员', value: 0, icon: User },
  { key: 'onDuty', index: '02', label: '今日在岗', description: '已安排值班人员', value: 0, icon: Calendar },
  { key: 'flights', index: '03', label: '今日航班', description: '今日航班计划', value: 0, icon: Aim },
  { key: 'schedules', index: '04', label: '排班计划', description: '已生成计划总数', value: 0, icon: Histogram }
])

const quickActions = [
  { label: '排班管理', description: '创建与发布计划', path: '/schedules', icon: Calendar },
  { label: '排班甘特图', description: '查看周排班时间轴', path: '/schedule-gantt', icon: Histogram },
  { label: '人员管理', description: '维护人员与班组', path: '/employee', icon: User },
  { label: '航班计划', description: '查询与同步航班', path: '/flights', icon: Aim }
]

const systemHealthList = ref(createInitialHealth())

const todayDate = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date())
)

const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(lastUpdatedAt.value)
})

const shiftTotal = computed(() =>
  Object.values(todayShiftCount.value).reduce((sum, value) => sum + Number(value || 0), 0)
)
const hasShiftData = computed(() => shiftTotal.value > 0)

const ringSegments = computed(() => {
  const entries = Object.entries(todayShiftCount.value)
  if (shiftTotal.value <= 0) return []

  const circumference = 2 * Math.PI * 70
  let accumulated = 0

  return entries.map(([label, count], index) => {
    const segmentLength = circumference * (count / shiftTotal.value)
    const segment = {
      label,
      count,
      color: ringColors[index % ringColors.length],
      circumference: `${segmentLength} ${circumference - segmentLength}`,
      offset: -accumulated
    }
    accumulated += segmentLength
    return segment
  })
})

onMounted(() => {
  loadDashboard(true)
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') loadDashboard(false)
  }, AUTO_REFRESH_MS)
})

onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})

async function loadDashboard(isInitial = false) {
  if (refreshing.value) return
  if (isInitial) initialLoading.value = true
  else refreshing.value = true

  const [statsResult, healthResult] = await Promise.allSettled([
    getDashboardStats({ silent: true }),
    getSystemHealth({ silent: true })
  ])

  if (statsResult.status === 'fulfilled') {
    applyStats(statsResult.value?.data || {})
    statsError.value = ''
  } else {
    statsError.value = statsResult.reason?.message || '请稍后重新加载'
  }

  if (healthResult.status === 'fulfilled') {
    applyHealth(healthResult.value?.data || {})
    healthError.value = ''
  } else {
    markHealthUnavailable()
    healthError.value = healthResult.reason?.message || '无法检查服务状态'
  }

  lastUpdatedAt.value = new Date()
  initialLoading.value = false
  refreshing.value = false
  healthLoading.value = false
}

async function loadHealth() {
  if (healthLoading.value) return
  healthLoading.value = true
  try {
    const response = await getSystemHealth({ silent: true })
    applyHealth(response?.data || {})
    healthError.value = ''
  } catch (error) {
    markHealthUnavailable()
    healthError.value = error?.message || '无法检查服务状态'
  } finally {
    healthLoading.value = false
    lastUpdatedAt.value = new Date()
  }
}

function applyStats(data) {
  const values = {
    employees: toNonNegativeNumber(data.totalEmployees),
    onDuty: toNonNegativeNumber(data.todayOnDuty),
    flights: toNonNegativeNumber(data.todayFlights),
    schedules: toNonNegativeNumber(data.scheduleCount)
  }

  cards.value = cards.value.map(card => ({ ...card, value: values[card.key] }))
  pendingLeaveCount.value = toNonNegativeNumber(data.pendingLeaveCount)
  todayShiftCount.value = normalizeShiftCounts(data.todayShiftCount)
}

function applyHealth(data) {
  systemHealthList.value = createInitialHealth().map(item => {
    const raw = data[item.key]
    if (raw == null) {
      return { ...item, text: '未知', detail: '服务未返回状态', level: 'unknown' }
    }

    const status = String(typeof raw === 'object' ? raw.status || raw.state || '' : raw).toUpperCase()
    const display = typeof raw === 'object' ? raw.display : ''
    const detail = typeof raw === 'object' && raw.detail ? raw.detail : ''

    if (HEALTHY_STATUSES.has(status)) {
      return {
        ...item,
        text: displayText(display, '正常'),
        detail: '连接正常',
        level: 'ok'
      }
    }
    if (WARNING_STATUSES.has(status)) {
      return {
        ...item,
        text: '需关注',
        detail: detail || '服务处于降级状态',
        level: 'warning'
      }
    }
    if (ERROR_STATUSES.has(status)) {
      return {
        ...item,
        text: '异常',
        detail: detail || '服务连接失败',
        level: 'error'
      }
    }
    return { ...item, text: '未知', detail: detail || '状态无法识别', level: 'unknown' }
  })
}

function markHealthUnavailable() {
  systemHealthList.value = createInitialHealth().map(item => ({
    ...item,
    text: '不可用',
    detail: '暂时无法完成检查',
    level: 'unknown'
  }))
}

function createInitialHealth() {
  return [
    { key: 'backend', name: '系统服务', text: '检查中', detail: '正在连接', level: 'pending' },
    { key: 'database', name: '数据库', text: '检查中', detail: '正在连接', level: 'pending' },
    { key: 'scheduler', name: '排班服务', text: '检查中', detail: '正在连接', level: 'pending' }
  ]
}

function displayText(display, fallback) {
  const values = {
    RUNNING: '运行中',
    READY: '已就绪',
    CONNECTED: '已连接'
  }
  return values[String(display || '').toUpperCase()] || fallback
}

function normalizeShiftCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([name, count]) => [name || '未命名班次', toNonNegativeNumber(count)])
      .filter(([, count]) => count > 0)
  )
}

function toNonNegativeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function formatMetric(value) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function getShiftIndex(name) {
  return Object.keys(todayShiftCount.value).indexOf(name) % ringColors.length
}

function percentage(count) {
  return shiftTotal.value > 0 ? Math.max(3, Math.round(count / shiftTotal.value * 100)) : 0
}
</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 22px;
}

.dashboard-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  padding: 2px 2px 4px;
}

.dashboard-kicker {
  color: var(--color-brand-500);
  font: 600 10px/1 var(--font-family-mono);
  letter-spacing: 0.16em;
}

.dashboard-intro h1 {
  margin: 10px 0 7px;
  color: var(--color-brand-900);
  font-size: clamp(28px, 3vw, 40px);
  font-weight: var(--font-weight-semi);
  letter-spacing: -0.045em;
}

.dashboard-intro p {
  max-width: 58ch;
  margin: 0;
  color: var(--color-neutral-500);
  line-height: 1.65;
}

.dashboard-intro-meta {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  justify-items: end;
  gap: 5px 14px;
  flex-shrink: 0;
}

.dashboard-intro-meta time {
  color: var(--color-neutral-700);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.dashboard-intro-meta > span {
  color: var(--color-neutral-400);
  font: 500 10px/1 var(--font-family-mono);
}

.refresh-button {
  grid-column: 2;
  grid-row: 1 / span 2;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  background: var(--color-neutral-0);
  color: var(--color-neutral-600);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition:
    color var(--transition-base),
    border-color var(--transition-base),
    background var(--transition-base);
}

.refresh-button:hover:not(:disabled) {
  border-color: var(--color-brand-300);
  background: var(--color-brand-50);
  color: var(--color-brand-700);
}

.refresh-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.is-spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.dashboard-notice {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  border-left: 3px solid var(--color-warning);
  border-radius: 2px var(--radius-md) var(--radius-md) 2px;
  background: var(--color-warning-bg);
  color: var(--color-neutral-700);
  font-size: var(--font-size-sm);
}

.dashboard-notice > .el-icon {
  flex-shrink: 0;
  color: var(--color-warning);
}

.dashboard-notice span {
  flex: 1;
}

.dashboard-notice strong {
  margin-right: 5px;
}

.dashboard-notice button {
  border: 0;
  background: transparent;
  color: var(--color-brand-700);
  font: inherit;
  font-weight: var(--font-weight-semi);
  cursor: pointer;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  min-width: 0;
  display: grid;
  padding: 18px 18px 17px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow:
    0 1px 2px rgba(21, 40, 62, 0.04),
    0 12px 28px rgba(48, 72, 98, 0.045);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transition:
    border-color var(--transition-base),
    transform var(--transition-base),
    box-shadow var(--transition-base);
}

.metric-card:hover {
  border-color: var(--color-brand-300);
  box-shadow: var(--shadow-sm);
  transform: translateY(-2px);
}

.metric-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.metric-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  font-size: 18px;
}

.metric-index,
.panel-index {
  color: var(--color-neutral-400);
  font: 600 10px/1 var(--font-family-mono);
  letter-spacing: 0.08em;
}

.metric-value {
  color: var(--color-brand-900);
  font: 650 clamp(30px, 3vw, 42px) / 1 var(--font-family);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.045em;
}

.metric-label {
  margin-top: 9px;
  color: var(--color-neutral-800, #2b3138);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semi);
}

.metric-card small {
  margin-top: 2px;
  color: var(--color-neutral-400);
  font-size: var(--font-size-xs);
}

.metric-skeleton {
  width: 42%;
  height: 40px;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    100deg,
    var(--color-neutral-100) 30%,
    var(--color-neutral-0) 50%,
    var(--color-neutral-100) 70%
  );
  background-size: 220% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  to { background-position-x: -220%; }
}

.dashboard-grid {
  min-height: 520px;
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(340px, 0.75fr);
  align-items: stretch;
  gap: 16px;
}

.dashboard-panel {
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow:
    0 1px 2px rgba(21, 40, 62, 0.04),
    0 14px 32px rgba(48, 72, 98, 0.045);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.panel-header {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--color-neutral-200);
}

.panel-header > div {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.panel-header h2 {
  color: var(--color-brand-900);
  font-size: 16px;
  font-weight: var(--font-weight-semi);
}

.panel-header p {
  margin: 3px 0 0;
  color: var(--color-neutral-400);
  font-size: var(--font-size-xs);
}

.panel-index {
  padding-top: 4px;
  color: var(--color-brand-500);
}

.panel-total {
  padding: 5px 8px;
  border-radius: var(--radius-xs);
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semi);
}

.shift-panel {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.shift-content {
  min-height: 380px;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(270px, 0.85fr);
  align-items: center;
  gap: clamp(24px, 4vw, 62px);
  flex: 1;
  padding: clamp(24px, 4vw, 46px);
}

.shift-list {
  display: grid;
  gap: 22px;
}

.shift-row-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  color: var(--color-neutral-600);
  font-size: var(--font-size-sm);
}

.shift-row-label strong {
  color: var(--color-brand-900);
  font: 600 12px/1 var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}

.shift-track {
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-neutral-100);
}

.shift-track > span {
  height: 100%;
  display: block;
  border-radius: inherit;
  transition: width 520ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.shift-tone-0 { background: #243d60; }
.shift-tone-1 { background: #3d5a85; }
.shift-tone-2 { background: #5c7baa; }
.shift-tone-3 { background: #7f98ba; }
.shift-tone-4 { background: #a8b8d8; }
.shift-tone-5 { background: #607d8f; }

.ring-section {
  display: grid;
  justify-items: center;
  gap: 22px;
}

.ring-chart {
  width: min(220px, 100%);
  aspect-ratio: 1;
  position: relative;
}

.ring-chart svg {
  width: 100%;
  height: 100%;
}

.ring-track,
.ring-segment {
  fill: none;
  stroke-width: 14;
}

.ring-track {
  stroke: var(--color-neutral-100);
}

.ring-segment {
  transition:
    stroke-dasharray 520ms ease,
    stroke-dashoffset 520ms ease;
}

.ring-center {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
}

.ring-center strong {
  color: var(--color-brand-900);
  font: 650 36px/1 var(--font-family);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.05em;
}

.ring-center small {
  margin-top: 5px;
  color: var(--color-neutral-400);
  font-size: var(--font-size-xs);
}

.ring-legend {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

.ring-legend > div {
  display: grid;
  grid-template-columns: 7px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
}

.ring-legend > div > span {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

.ring-legend small {
  overflow: hidden;
  color: var(--color-neutral-500);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ring-legend strong {
  color: var(--color-neutral-700);
  font: 600 11px/1 var(--font-family-mono);
}

.panel-state {
  min-height: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 24px;
  text-align: center;
}

.state-icon {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
  border-radius: 14px;
  background: var(--color-brand-50);
  color: var(--color-brand-600);
  font-size: 23px;
}

.state-icon--error {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.panel-state strong {
  color: var(--color-brand-900);
  font-size: var(--font-size-lg);
}

.panel-state p {
  max-width: 38ch;
  margin: 7px 0 20px;
  color: var(--color-neutral-500);
  line-height: 1.65;
}

.shift-loading {
  min-height: 380px;
  display: grid;
  align-content: center;
  gap: 24px;
  padding: 48px;
}

.shift-loading span {
  width: 100%;
  height: 12px;
  border-radius: var(--radius-full);
  background: linear-gradient(
    100deg,
    var(--color-neutral-100) 30%,
    white 50%,
    var(--color-neutral-100) 70%
  );
  background-size: 220% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.shift-loading span:nth-child(2) { width: 84%; }
.shift-loading span:nth-child(3) { width: 72%; }
.shift-loading span:nth-child(4) { width: 91%; }

.dashboard-side {
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 16px;
}

.attention-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 17px;
  border: 1px solid #ead8ae;
  border-radius: var(--radius-lg);
  background: #fdf8eb;
}

.attention-panel > div {
  display: grid;
  gap: 2px;
}

.attention-panel span {
  color: var(--color-warning);
  font-size: 10px;
  font-weight: var(--font-weight-semi);
  letter-spacing: 0.08em;
}

.attention-panel strong {
  color: var(--color-neutral-800, #2b3138);
  font-size: var(--font-size-md);
}

.attention-panel button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--color-warning);
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semi);
  cursor: pointer;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quick-action {
  position: relative;
  min-width: 0;
  min-height: 120px;
  display: grid;
  align-content: start;
  justify-items: start;
  padding: 16px;
  border: 0;
  border-right: 1px solid var(--color-neutral-100);
  border-bottom: 1px solid var(--color-neutral-100);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-base);
}

.quick-action:nth-child(2n) {
  border-right: 0;
}

.quick-action:nth-last-child(-n + 2) {
  border-bottom: 0;
}

.quick-action:hover {
  background: var(--color-brand-50);
}

.quick-action > span {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--color-neutral-100);
  color: var(--color-brand-700);
}

.quick-action strong {
  color: var(--color-neutral-800, #2b3138);
  font-size: var(--font-size-sm);
}

.quick-action small {
  max-width: 14em;
  margin-top: 3px;
  overflow: hidden;
  color: var(--color-neutral-400);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-arrow {
  position: absolute;
  top: 17px;
  right: 15px;
  color: var(--color-neutral-300);
  transition:
    color var(--transition-base),
    transform var(--transition-base);
}

.quick-action:hover .quick-arrow {
  color: var(--color-brand-600);
  transform: translateX(2px);
}

.panel-icon-button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  background: var(--color-neutral-0);
  color: var(--color-neutral-500);
  cursor: pointer;
}

.health-list {
  display: grid;
}

.health-item {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 14px 17px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.health-item:last-child {
  border-bottom: 0;
}

.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-neutral-300);
}

.health-dot--ok {
  background: var(--color-success);
  box-shadow: 0 0 0 4px var(--color-success-bg);
}

.health-dot--warning {
  background: var(--color-warning);
  box-shadow: 0 0 0 4px var(--color-warning-bg);
}

.health-dot--error {
  background: var(--color-danger);
  box-shadow: 0 0 0 4px var(--color-danger-bg);
}

.health-dot--pending {
  animation: pulse 1.3s ease-in-out infinite;
}

@keyframes pulse {
  50% { opacity: 0.35; }
}

.health-item > span:nth-child(2) {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.health-item strong {
  color: var(--color-neutral-700);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.health-item small {
  overflow: hidden;
  color: var(--color-neutral-400);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-item em {
  padding: 3px 6px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-style: normal;
  font-weight: var(--font-weight-semi);
}

.health-tag--ok { background: var(--color-success-bg); color: var(--color-success); }
.health-tag--warning { background: var(--color-warning-bg); color: var(--color-warning); }
.health-tag--error { background: var(--color-danger-bg); color: var(--color-danger); }
.health-tag--unknown,
.health-tag--pending { background: var(--color-neutral-100); color: var(--color-neutral-500); }

@media (max-width: 1199px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto;
  }

  .attention-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 840px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shift-content {
    grid-template-columns: 1fr;
  }

  .ring-section {
    grid-template-columns: minmax(160px, 200px) minmax(180px, 1fr);
    align-items: center;
  }

  .ring-legend {
    grid-template-columns: 1fr;
  }

  .dashboard-side {
    grid-template-columns: 1fr;
  }

  .attention-panel {
    grid-column: auto;
  }
}

@media (max-width: 620px) {
  .dashboard {
    gap: 16px;
  }

  .dashboard-intro {
    align-items: flex-start;
    flex-direction: column;
  }

  .dashboard-intro p {
    font-size: var(--font-size-sm);
  }

  .dashboard-intro-meta {
    width: 100%;
    grid-template-columns: 1fr auto;
    justify-items: start;
  }

  .metric-grid {
    gap: 10px;
  }

  .metric-card {
    padding: 14px;
  }

  .metric-card-top {
    margin-bottom: 14px;
  }

  .metric-value {
    font-size: 30px;
  }

  .metric-card small {
    display: none;
  }

  .panel-header {
    padding-inline: 14px;
  }

  .panel-total {
    display: none;
  }

  .shift-content {
    padding: 26px 18px 34px;
  }

  .ring-section {
    grid-template-columns: 1fr;
  }

  .ring-chart {
    width: 190px;
  }

  .ring-legend {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard *,
  .dashboard *::before,
  .dashboard *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
