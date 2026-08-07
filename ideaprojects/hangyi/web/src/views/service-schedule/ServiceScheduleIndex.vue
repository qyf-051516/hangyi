<template>
  <div class="service-page">
    <AppPageHeader
      title="勤务排班"
      description="按航班和任务类型查看当日勤务安排，快速确认每项任务的人员覆盖情况。"
    >
      <template #actions>
        <el-button :loading="loading" @click="fetchTable">刷新数据</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar-copy">
        <strong>工作日期</strong>
        <span>勤务任务按照开始时间顺序排列。</span>
      </div>
      <el-date-picker
        v-model="scheduleDate"
        value-format="YYYY-MM-DD"
        :clearable="false"
        @change="fetchTable"
      />
    </el-card>

    <AppPageState
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在加载勤务排班"
    />
    <AppPageState
      v-else-if="loadError"
      type="error"
      title="勤务排班加载失败"
      :description="loadError"
      action-label="重新加载"
      @action="fetchTable"
    />
    <AppPageState
      v-else-if="tasks.length === 0"
      title="当天没有勤务任务"
      description="为排班明细关联航班和任务类型后，勤务安排会自动汇总到这里。"
      action-label="刷新数据"
      @action="fetchTable"
    />
    <template v-else>
      <section class="service-summary" aria-label="勤务排班摘要">
        <div>
          <span>任务总数</span>
          <strong>{{ total }}</strong>
        </div>
        <div>
          <span>涉及航班</span>
          <strong>{{ flightCount }}</strong>
        </div>
        <div>
          <span>安排人员</span>
          <strong>{{ staffCount }}</strong>
        </div>
        <p>统计日期 <b>{{ scheduleDate }}</b></p>
      </section>

      <section class="task-list" aria-label="勤务任务列表">
        <article v-for="(task, index) in tasks" :key="taskKey(task, index)" class="task-card">
          <div class="task-card__index">{{ String(index + 1).padStart(2, '0') }}</div>
          <div class="task-card__main">
            <header>
              <div>
                <span class="task-label">{{ taskTypeLabel(task.taskType) }}</span>
                <h2>{{ task.flightNo || '未关联航班' }}</h2>
              </div>
              <el-tag :type="task.staff?.length ? 'success' : 'warning'" effect="light">
                {{ task.staff?.length ? `${task.staff.length} 人已安排` : '待安排人员' }}
              </el-tag>
            </header>
            <dl>
              <div>
                <dt>航司 / 机型</dt>
                <dd>{{ [task.airline, task.aircraftType].filter(Boolean).join(' · ') || '—' }}</dd>
              </div>
              <div>
                <dt>任务时间</dt>
                <dd>{{ formatDateTime(task.taskStart) }} — {{ formatTime(task.taskEnd) }}</dd>
              </div>
            </dl>
            <div class="staff-list">
              <template v-if="task.staff?.length">
                <span v-for="staff in task.staff" :key="staff.staffId" class="staff-chip">
                  <b>{{ staff.name || `员工 #${staff.staffId}` }}</b>
                  <small>{{ staff.employeeNo || '无工号' }}</small>
                </span>
              </template>
              <span v-else class="staff-empty">尚未安排执行人员</span>
            </div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { getServiceScheduleTable } from '../../api/serviceSchedule'

const scheduleDate = ref(toDateInput(new Date()))
const tasks = ref([])
const total = ref(0)
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')

const flightCount = computed(() =>
  new Set(tasks.value.map(task => task.flightNo).filter(Boolean)).size
)

const staffCount = computed(() =>
  new Set(
    tasks.value
      .flatMap(task => task.staff || [])
      .map(staff => staff.staffId)
      .filter(id => id != null)
  ).size
)

fetchTable()

async function fetchTable() {
  if (!scheduleDate.value) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await getServiceScheduleTable(
      { scheduleDate: scheduleDate.value },
      { silent: true }
    )
    tasks.value = Array.isArray(res.data?.tasks) ? res.data.tasks : []
    total.value = Number(res.data?.total || tasks.value.length)
    hasLoaded.value = true
  } catch (error) {
    tasks.value = []
    total.value = 0
    loadError.value = error?.message || '请检查排班服务后重试'
  } finally {
    loading.value = false
  }
}

function taskKey(task, index) {
  return `${task.flightNo || 'flight'}-${task.taskType || 'task'}-${task.taskStart || index}`
}

function taskTypeLabel(value) {
  return {
    RELEASE: '放行',
    MAINTENANCE: '机务',
    SECURITY: '安检',
    GROUND: '地勤',
    BOARDING: '登机保障'
  }[value] || value || '勤务任务'
}

function formatDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 16)
}

function formatTime(value) {
  if (!value) return '—'
  const text = String(value).replace('T', ' ')
  return text.includes(' ') ? text.split(' ')[1].slice(0, 5) : text.slice(0, 5)
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<style scoped>
.service-page {
  max-width: 1200px;
  margin: 0 auto;
}

.toolbar-card {
  margin-bottom: var(--space-4);
}

.toolbar-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding-block: 14px !important;
}

.toolbar-copy {
  display: grid;
  gap: 3px;
}

.toolbar-copy strong {
  color: var(--color-brand-900);
}

.toolbar-copy span {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.service-summary {
  display: grid;
  grid-template-columns: repeat(3, 150px) 1fr;
  align-items: stretch;
  margin-bottom: var(--space-4);
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.service-summary > div {
  display: grid;
  gap: 7px;
  padding: 16px 20px;
  border-right: 1px solid var(--color-neutral-200);
}

.service-summary span,
.service-summary p {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.service-summary strong {
  color: var(--color-brand-900);
  font: 650 25px/1 var(--font-family);
  font-variant-numeric: tabular-nums;
}

.service-summary p {
  align-self: center;
  justify-self: end;
  margin: 0;
  padding: 0 20px;
}

.service-summary p b {
  color: var(--color-brand-700);
  font-family: var(--font-family-mono);
}

.task-list {
  display: grid;
  gap: var(--space-3);
}

.task-card {
  display: grid;
  grid-template-columns: 58px 1fr;
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-xs);
  transition: border-color var(--transition-base), transform var(--transition-base);
}

.task-card:hover {
  border-color: var(--color-brand-300);
  transform: translateY(-1px);
}

.task-card__index {
  display: grid;
  place-items: start center;
  padding-top: 22px;
  color: var(--color-brand-500);
  border-right: 1px solid var(--color-neutral-200);
  background: var(--color-brand-50);
  font: 600 10px/1 var(--font-family-mono);
}

.task-card__main {
  padding: 18px 20px 20px;
}

.task-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.task-card header div {
  display: grid;
  gap: 5px;
}

.task-label {
  color: var(--color-brand-500);
  font: 600 10px/1 var(--font-family-mono);
  letter-spacing: 0.08em;
}

.task-card h2 {
  font-size: 20px;
  letter-spacing: -0.02em;
}

.task-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);
  margin: 18px 0;
}

.task-card dt {
  margin-bottom: 4px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.task-card dd {
  margin: 0;
  color: var(--color-neutral-700);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.staff-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.staff-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  background: var(--color-neutral-0);
}

.staff-chip b {
  color: var(--color-brand-900);
  font-size: var(--font-size-sm);
}

.staff-chip small,
.staff-empty {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

@media (max-width: 767px) {
  .toolbar-card :deep(.el-card__body) {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-card :deep(.el-date-editor) {
    width: 100% !important;
  }

  .service-summary {
    grid-template-columns: repeat(3, 1fr);
  }

  .service-summary > div {
    padding: 14px 12px;
  }

  .service-summary p {
    grid-column: 1 / -1;
    justify-self: stretch;
    padding: 12px;
    border-top: 1px solid var(--color-neutral-200);
    text-align: center;
  }

  .task-card {
    grid-template-columns: 38px 1fr;
  }

  .task-card__main {
    padding: 16px;
  }

  .task-card dl {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
