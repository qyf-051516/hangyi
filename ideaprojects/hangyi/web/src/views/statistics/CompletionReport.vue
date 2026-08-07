<template>
  <div class="completion-page">
    <AppPageHeader
      title="排班完成情况"
      description="按日期和班组追踪任务完成率，并快速识别仍需跟进的人员。"
    >
      <template #actions>
        <el-button :loading="loading" @click="fetchData">刷新数据</el-button>
      </template>
    </AppPageHeader>

    <el-card class="filter-card" shadow="never">
      <div class="filter-copy">
        <strong>分析范围</strong>
        <span>默认展示最近 30 天，可进一步筛选班组。</span>
      </div>
      <div class="filter-row">
        <el-select
          v-model="selectedGroupId"
          placeholder="全部班组"
          clearable
          filterable
          style="width: 180px"
          @change="fetchData"
        >
          <el-option
            v-for="group in groupList"
            :key="group.id"
            :label="group.groupName"
            :value="group.id"
          />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="—"
          start-placeholder="起始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          :clearable="false"
          :disabled-date="disableFutureDate"
          @change="fetchData"
        />
      </div>
    </el-card>

    <AppPageState
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在计算完成情况"
    />
    <AppPageState
      v-else-if="loadError"
      type="error"
      title="完成情况加载失败"
      :description="loadError"
      action-label="重新加载"
      @action="fetchData"
    />
    <template v-else>
      <section class="completion-summary" aria-label="完成情况摘要">
        <article>
          <span>总排班</span>
          <strong>{{ total }}</strong>
          <small>当前筛选范围</small>
        </article>
        <article class="completion-summary__success">
          <span>已完成</span>
          <strong>{{ completed }}</strong>
          <small>{{ completedRate }}% 完成率</small>
        </article>
        <article class="completion-summary__pending">
          <span>待完成</span>
          <strong>{{ pending }}</strong>
          <small>{{ pendingRate }}% 待跟进</small>
        </article>
      </section>

      <el-card shadow="never" class="progress-card">
        <div class="progress-heading">
          <div>
            <strong>整体进度</strong>
            <span>{{ progressDescription }}</span>
          </div>
          <b>{{ completedRate }}%</b>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          aria-label="排班完成率"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Number(completedRate)"
        >
          <i :style="{ width: `${clampedCompletedRate}%` }" />
        </div>
        <div class="progress-legend">
          <span><i class="legend-dot legend-dot--complete" />已完成 {{ completed }}</span>
          <span><i class="legend-dot legend-dot--pending" />待完成 {{ pending }}</span>
        </div>
      </el-card>

      <section class="completion-grid">
        <el-card shadow="never" class="data-card">
          <template #header>
            <div class="section-heading">
              <div>
                <strong>每日明细</strong>
                <span>按工作日期统计任务完成进度</span>
              </div>
              <small>{{ dailyBreakdown.length }} 天</small>
            </div>
          </template>
          <AppPageState
            v-if="dailyBreakdown.length === 0"
            compact
            title="当前范围暂无排班明细"
            description="调整日期范围，或先生成排班计划。"
          />
          <el-table v-else :data="dailyBreakdown" stripe v-loading="loading">
            <el-table-column prop="date" label="日期" min-width="118" />
            <el-table-column prop="total" label="总数" width="76" align="right" />
            <el-table-column prop="completed" label="完成" width="76" align="right" />
            <el-table-column prop="pending" label="待完成" width="84" align="right" />
            <el-table-column label="完成率" width="96" align="right">
              <template #default="{ row }">
                <span :class="rateClass(row.completedRate)">{{ row.completedRate }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card shadow="never" class="data-card">
          <template #header>
            <div class="section-heading">
              <div>
                <strong>待跟进人员</strong>
                <span>仍有未完成任务的人员清单</span>
              </div>
              <small>{{ pendingEmployees.length }} 人</small>
            </div>
          </template>
          <AppPageState
            v-if="pendingEmployees.length === 0"
            compact
            :title="total === 0 ? '暂无待跟进数据' : '当前任务已全部完成'"
            :description="total === 0 ? '排班明细生成后会自动出现在这里。' : '当前筛选范围内没有未完成任务。'"
          />
          <div v-else class="table-scroll">
            <el-table :data="pendingEmployees" stripe v-loading="loading" style="min-width: 620px">
              <el-table-column prop="name" label="姓名" width="90" />
              <el-table-column prop="emp_no" label="工号" width="100" />
              <el-table-column prop="group_name" label="班组" min-width="100" />
              <el-table-column prop="phone" label="手机号" min-width="126">
                <template #default="{ row }">{{ row.phone || '—' }}</template>
              </el-table-column>
              <el-table-column prop="shift_name" label="班次" width="90" />
              <el-table-column prop="work_date" label="日期" width="112" />
            </el-table>
          </div>
        </el-card>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getGroupList } from '../../api/employee'
import { getPendingEmployees, getStatusOverview } from '../../api/statistics'

const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')
const selectedGroupId = ref(null)
const dateRange = ref(defaultDateRange())
const groupList = ref([])

const total = ref(0)
const completed = ref(0)
const pending = ref(0)
const completedRate = ref('0.0')
const pendingRate = ref('0.0')
const dailyBreakdown = ref([])
const pendingEmployees = ref([])

const clampedCompletedRate = computed(() =>
  Math.max(0, Math.min(100, Number(completedRate.value) || 0))
)

const progressDescription = computed(() => {
  if (total.value === 0) return '当前范围没有排班任务'
  if (pending.value === 0) return '所有任务均已完成'
  return `还有 ${pending.value} 项任务需要跟进`
})

onMounted(async () => {
  await Promise.allSettled([fetchGroupList(), fetchData()])
})

async function fetchGroupList() {
  try {
    const res = await getGroupList({}, { silent: true })
    groupList.value = Array.isArray(res.data) ? res.data : []
  } catch {
    groupList.value = []
  }
}

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const params = {
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1]
    }
    if (selectedGroupId.value) params.groupId = selectedGroupId.value

    const [overviewRes, pendingRes] = await Promise.all([
      getStatusOverview(params, { silent: true }),
      getPendingEmployees(params, { silent: true })
    ])
    const data = overviewRes.data || {}
    total.value = Number(data.total || 0)
    completed.value = Number(data.completed || 0)
    pending.value = Number(data.pending || 0)
    completedRate.value = String(data.completedRate || '0.0')
    pendingRate.value = String(data.pendingRate || '0.0')
    dailyBreakdown.value = (data.dailyBreakdown || []).map(item => ({
      ...item,
      completedRate: Number(item.total) > 0
        ? Math.round(Number(item.completed || 0) * 100 / Number(item.total))
        : 0,
      pending: Number(item.pending ?? (Number(item.total || 0) - Number(item.completed || 0)))
    }))
    pendingEmployees.value = Array.isArray(pendingRes.data) ? pendingRes.data : []
    hasLoaded.value = true
  } catch (error) {
    loadError.value = error?.message || '请检查统计服务后重试'
  } finally {
    loading.value = false
  }
}

function rateClass(rate) {
  const value = Number(rate || 0)
  if (value >= 80) return 'rate rate--good'
  if (value >= 50) return 'rate rate--warning'
  return 'rate rate--danger'
}

function disableFutureDate(date) {
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  return date.getTime() >= tomorrow.getTime()
}

function defaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return [toDateInput(start), toDateInput(end)]
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<style scoped>
.completion-page {
  max-width: 1440px;
  margin: 0 auto;
}

.filter-card {
  margin-bottom: var(--space-4);
}

.filter-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding-block: 14px !important;
}

.filter-copy,
.filter-row,
.section-heading,
.progress-heading {
  display: flex;
  align-items: center;
}

.filter-copy {
  align-items: flex-start;
  flex-direction: column;
  gap: 3px;
}

.filter-copy strong,
.section-heading strong,
.progress-heading strong {
  color: var(--color-brand-900);
  font-weight: var(--font-weight-semi);
}

.filter-copy span,
.section-heading span,
.progress-heading span {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.filter-row {
  gap: var(--space-3);
}

.completion-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-bottom: var(--space-4);
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-neutral-200);
}

.completion-summary article {
  display: grid;
  min-height: 116px;
  padding: 18px 22px;
  background: var(--color-surface);
}

.completion-summary span,
.completion-summary small {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.completion-summary strong {
  align-self: center;
  color: var(--color-brand-900);
  font: 650 34px/1 var(--font-family);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.045em;
}

.completion-summary__success strong { color: var(--color-success); }
.completion-summary__pending strong { color: var(--color-warning); }

.progress-card {
  margin-bottom: var(--space-4);
}

.progress-heading {
  justify-content: space-between;
  margin-bottom: 15px;
}

.progress-heading div,
.section-heading div {
  display: grid;
  gap: 3px;
}

.progress-heading b {
  color: var(--color-brand-800);
  font: 650 22px/1 var(--font-family-mono);
}

.progress-track {
  height: 10px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-neutral-100);
}

.progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-success);
  transition: width 420ms cubic-bezier(.2, .8, .2, 1);
}

.progress-legend {
  display: flex;
  gap: var(--space-5);
  margin-top: 12px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 2px;
}

.legend-dot--complete { background: var(--color-success); }
.legend-dot--pending { background: var(--color-warning); }

.completion-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: var(--space-4);
}

.data-card {
  min-width: 0;
}

.data-card :deep(.el-card__body) {
  padding: 0 !important;
}

.section-heading {
  justify-content: space-between;
}

.section-heading small {
  color: var(--color-neutral-500);
  font: 500 11px/1 var(--font-family-mono);
}

.rate {
  font-weight: var(--font-weight-semi);
  font-variant-numeric: tabular-nums;
}

.rate--good { color: var(--color-success); }
.rate--warning { color: var(--color-warning); }
.rate--danger { color: var(--color-danger); }

@media (max-width: 1100px) {
  .completion-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .filter-card :deep(.el-card__body) {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-row {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-row :deep(.el-select),
  .filter-row :deep(.el-date-editor) {
    width: 100% !important;
  }

  .completion-summary {
    grid-template-columns: 1fr;
  }

  .completion-summary article {
    min-height: 92px;
  }

  .progress-legend {
    justify-content: space-between;
  }
}
</style>
