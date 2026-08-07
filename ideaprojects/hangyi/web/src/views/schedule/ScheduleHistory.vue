<template>
  <div class="history-page">
    <AppPageHeader
      title="排班历史"
      description="按日期追溯活跃班次、已完成记录和排班发布时间线。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadData">刷新记录</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="date-card">
      <div class="date-nav">
        <el-button @click="moveDay(-1)">前一天</el-button>
        <el-date-picker
          v-model="scheduleDate"
          type="date"
          value-format="YYYY-MM-DD"
          :clearable="false"
          @change="loadData"
        />
        <el-button @click="moveDay(1)">后一天</el-button>
        <el-button text type="primary" @click="goToday">回到今天</el-button>
      </div>
      <span>{{ weekdayLabel }}</span>
    </el-card>

    <AppPageState
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在加载排班历史"
    />
    <AppPageState
      v-else-if="loadError"
      type="error"
      title="排班历史加载失败"
      :description="loadError"
      action-label="重新加载"
      @action="loadData"
    />
    <template v-else>
      <section class="history-summary" aria-label="排班历史摘要">
        <div><span>当前活跃</span><strong>{{ active.length }}</strong></div>
        <div><span>完成归档</span><strong>{{ archived.length }}</strong></div>
        <div><span>发布次数</span><strong>{{ publishHistory.length }}</strong></div>
        <p>记录日期 <b>{{ scheduleDate }}</b></p>
      </section>

      <div class="history-layout">
        <el-card shadow="never" class="record-card">
          <el-tabs v-model="activeTab">
            <el-tab-pane name="active">
              <template #label>
                <span>活跃排班</span>
                <span class="tab-count">{{ active.length }}</span>
              </template>
              <ScheduleHistoryState
                :rows="active"
                :loading="loading"
                empty-title="当天没有活跃排班"
                empty-description="当前日期没有待执行的排班记录。"
                mode="active"
              />
            </el-tab-pane>
            <el-tab-pane name="archived">
              <template #label>
                <span>完成归档</span>
                <span class="tab-count">{{ archived.length }}</span>
              </template>
              <ScheduleHistoryState
                :rows="archived"
                :loading="loading"
                empty-title="当天没有完成归档"
                empty-description="完成的排班会归档到这里，便于后续追溯。"
                mode="archived"
              />
            </el-tab-pane>
          </el-tabs>
        </el-card>

        <aside class="publish-panel">
          <div class="publish-panel__heading">
            <span>RELEASE LOG</span>
            <h2>发布记录</h2>
          </div>
          <AppPageState
            v-if="publishHistory.length === 0"
            compact
            title="当天没有发布记录"
            description="发布排班后，时间和排班名称会显示在这里。"
          />
          <ol v-else class="release-list">
            <li v-for="item in publishHistory" :key="item.id">
              <span class="release-list__mark" />
              <div>
                <strong>{{ actionLabel(item.action) }}</strong>
                <p>{{ item.detail || `排班 #${item.id}` }}</p>
                <time>{{ formatDateTime(item.created_at) }}</time>
              </div>
            </li>
          </ol>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { ElTag } from 'element-plus'
import { getScheduleHistory } from '../../api/schedule'
import AppPageState from '../../components/AppPageState.vue'

const scheduleDate = ref(toDateInput(new Date()))
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')
const active = ref([])
const archived = ref([])
const publishHistory = ref([])
const activeTab = ref('active')

const weekdayLabel = computed(() => {
  const date = new Date(`${scheduleDate.value}T00:00:00`)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date)
})

const ScheduleHistoryState = defineComponent({
  props: {
    rows: { type: Array, required: true },
    loading: Boolean,
    emptyTitle: String,
    emptyDescription: String,
    mode: String
  },
  setup(props) {
    return () => {
      if (props.rows.length === 0) {
        return h(AppPageState, {
          compact: true,
          title: props.emptyTitle,
          description: props.emptyDescription
        })
      }

      return h('div', { class: 'history-records' }, props.rows.map(row =>
        h('article', { class: 'history-row', key: row.id }, [
          h('div', { class: 'history-person' }, [
            h('span', null, String(row.staff_name || `员工 #${row.employee_id}`)[0]),
            h('div', null, [
              h('strong', null, row.staff_name || `员工 #${row.employee_id}`),
              h('small', null, row.staff_employee_no || '未记录工号')
            ])
          ]),
          h('dl', null, [
            h('div', null, [h('dt', null, '航班'), h('dd', null, row.flight_no || '未关联')]),
            h('div', null, [h('dt', null, '班次'), h('dd', null, shiftText(row))]),
            h('div', null, [
              h('dt', null, props.mode === 'archived' ? '归档时间' : '创建时间'),
              h('dd', null, formatDateTime(
                props.mode === 'archived' ? row.archived_at : row.created_at
              ))
            ])
          ]),
          h(ElTag, {
            type: props.mode === 'archived' ? 'info' : statusMeta(row.status).type,
            effect: 'light',
            size: 'small'
          }, () => props.mode === 'archived' ? '已完成' : statusMeta(row.status).label)
        ])
      ))
    }
  }
})

onMounted(loadData)

async function loadData() {
  if (!scheduleDate.value) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await getScheduleHistory(scheduleDate.value, { silent: true })
    const data = res.data || {}
    active.value = Array.isArray(data.active) ? data.active : []
    archived.value = Array.isArray(data.archived) ? data.archived : []
    publishHistory.value = Array.isArray(data.publishHistory) ? data.publishHistory : []
    hasLoaded.value = true
  } catch (error) {
    active.value = []
    archived.value = []
    publishHistory.value = []
    loadError.value = error?.message || '请检查排班服务后重试'
  } finally {
    loading.value = false
  }
}

function moveDay(offset) {
  const date = new Date(`${scheduleDate.value}T00:00:00`)
  date.setDate(date.getDate() + offset)
  scheduleDate.value = toDateInput(date)
  loadData()
}

function goToday() {
  scheduleDate.value = toDateInput(new Date())
  loadData()
}

const shiftMap = {
  MORNING: '早班',
  AFTERNOON: '午班',
  NIGHT: '夜班',
  EVENING: '晚班',
  STANDBY: '待命',
  REST: '休息'
}

function shiftText(row) {
  const code = row.shift_code || row.shift_group || ''
  return row.shift_name || shiftMap[code] || code || '未指定'
}

function statusMeta(status) {
  return {
    ASSIGNED: { label: '已排班', type: 'primary' },
    SWAPPED: { label: '已互换', type: 'warning' },
    AUTO: { label: '自动排班', type: 'success' },
    SMART: { label: '智能排班', type: 'success' },
    MANUAL: { label: '手动排班', type: 'primary' },
    ADMIN_ROLES: { label: '角色排班', type: 'primary' },
    SERVICE: { label: '勤务排班', type: 'info' }
  }[status] || { label: status || '进行中', type: 'info' }
}

function actionLabel(action) {
  return action === 'PUBLISH_SERVICE_SCHEDULE' ? '发布勤务排班' : '发布排班'
}

function formatDateTime(value) {
  if (!value) return '未记录时间'
  return String(value).replace('T', ' ').slice(0, 16)
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<style scoped>
.history-page {
  max-width: 1440px;
  margin: 0 auto;
}

.date-card {
  margin-bottom: var(--space-4);
}

.date-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding-block: 14px !important;
}

.date-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-card :deep(.el-card__body) > span {
  color: var(--color-brand-600);
  font-weight: var(--font-weight-medium);
}

.history-summary {
  display: grid;
  grid-template-columns: repeat(3, 150px) 1fr;
  margin-bottom: var(--space-4);
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.history-summary > div {
  display: grid;
  gap: 7px;
  padding: 16px 20px;
  border-right: 1px solid var(--color-neutral-200);
}

.history-summary span,
.history-summary p {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.history-summary strong {
  color: var(--color-brand-900);
  font-size: 25px;
  font-variant-numeric: tabular-nums;
}

.history-summary p {
  align-self: center;
  justify-self: end;
  margin: 0;
  padding: 0 20px;
}

.history-summary b {
  color: var(--color-brand-700);
  font-family: var(--font-family-mono);
}

.history-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.34fr);
  align-items: start;
  gap: var(--space-4);
}

.record-card :deep(.el-card__body) {
  padding: 0 !important;
}

.record-card :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.record-card :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.record-card :deep(.el-tabs__item) {
  height: 54px;
  font-weight: var(--font-weight-semi);
}

.tab-count {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  margin-left: 7px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--color-brand-700);
  background: var(--color-brand-50);
  font: 600 11px/1 var(--font-family-mono);
}

:deep(.history-records) {
  display: grid;
}

:deep(.history-row) {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) minmax(360px, 1.8fr) auto;
  align-items: center;
  gap: var(--space-4);
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-neutral-100);
}

:deep(.history-row:last-child) {
  border-bottom: 0;
}

:deep(.history-person) {
  display: flex;
  align-items: center;
  gap: 10px;
}

:deep(.history-person > span) {
  display: grid;
  flex: 0 0 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px 11px 11px 4px;
  color: var(--color-brand-700);
  background: var(--color-brand-100);
  font-weight: var(--font-weight-semi);
}

:deep(.history-person > div) {
  display: grid;
  gap: 3px;
}

:deep(.history-person strong) {
  color: var(--color-brand-900);
}

:deep(.history-person small) {
  color: var(--color-neutral-500);
  font-family: var(--font-family-mono);
}

:deep(.history-row dl) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
}

:deep(.history-row dl div) {
  display: grid;
  gap: 4px;
}

:deep(.history-row dt) {
  color: var(--color-neutral-400);
  font-size: var(--font-size-xs);
}

:deep(.history-row dd) {
  margin: 0;
  color: var(--color-neutral-600);
  font-size: var(--font-size-sm);
}

.publish-panel {
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.publish-panel__heading {
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.publish-panel__heading span {
  color: var(--color-brand-500);
  font: 600 10px/1 var(--font-family-mono);
  letter-spacing: 0.14em;
}

.publish-panel__heading h2 {
  margin-top: 6px;
  color: var(--color-brand-900);
  font-size: var(--font-size-lg);
}

.release-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 6px 0;
  list-style: none;
}

.release-list li {
  display: grid;
  grid-template-columns: 12px 1fr;
  gap: 11px;
  padding: 13px 20px;
}

.release-list__mark {
  position: relative;
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border: 2px solid var(--color-brand-500);
  border-radius: 50%;
  background: var(--color-neutral-0);
}

.release-list__mark::after {
  position: absolute;
  top: 9px;
  left: 2px;
  width: 1px;
  height: 54px;
  background: var(--color-neutral-200);
  content: '';
}

.release-list li:last-child .release-list__mark::after {
  display: none;
}

.release-list strong {
  color: var(--color-brand-900);
  font-size: var(--font-size-sm);
}

.release-list p {
  margin: 4px 0;
  color: var(--color-neutral-600);
  font-size: var(--font-size-xs);
}

.release-list time {
  color: var(--color-neutral-400);
  font: 500 11px/1.4 var(--font-family-mono);
}

@media (max-width: 1050px) {
  .history-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .date-card :deep(.el-card__body) {
    align-items: stretch;
    flex-direction: column;
  }

  .date-nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .date-nav :deep(.el-date-editor),
  .date-nav :deep(.el-button:nth-child(4)) {
    grid-column: 1 / -1;
    width: 100%;
  }

  .history-summary {
    grid-template-columns: repeat(3, 1fr);
  }

  .history-summary > div {
    padding: 14px 12px;
  }

  .history-summary p {
    grid-column: 1 / -1;
    justify-self: stretch;
    padding-block: 12px;
    border-top: 1px solid var(--color-neutral-200);
    text-align: center;
  }

  :deep(.history-row) {
    grid-template-columns: 1fr auto;
    padding: 16px;
  }

  :deep(.history-row dl) {
    grid-column: 1 / -1;
    grid-template-columns: 1fr;
  }
}
</style>
