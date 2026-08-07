<template>
  <div class="statistics-page">
    <AppPageHeader
      title="排班统计"
      description="从班组负荷、人员疲劳、资质覆盖和夜班比例四个维度检查排班质量。"
    >
      <template #actions>
        <el-button :loading="loading" @click="fetchStats">刷新数据</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar-copy">
        <strong>统计日期</strong>
        <span>数据按所选自然日聚合，夜班趋势向前回溯 7 天。</span>
      </div>
      <el-date-picker
        v-model="statsDate"
        value-format="YYYY-MM-DD"
        placeholder="选择统计日期"
        :disabled-date="disableFutureDate"
        :clearable="false"
        @change="fetchStats"
      />
    </el-card>

    <AppPageState
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在汇总排班数据"
    />
    <AppPageState
      v-else-if="loadError"
      type="error"
      title="统计数据加载失败"
      :description="loadError"
      action-label="重新加载"
      @action="fetchStats"
    />
    <AppPageState
      v-else-if="!hasOperationalData"
      title="当前日期还没有可分析的排班"
      description="生成人员排班并关联班次、资质后，这里会自动形成负荷和风险分析。"
      action-label="刷新数据"
      @action="fetchStats"
    />
    <template v-else>
      <section class="metric-strip" aria-label="统计摘要">
        <article>
          <span>班组样本</span>
          <strong>{{ groupStats.length }}</strong>
          <small>个班组</small>
        </article>
        <article>
          <span>当日任务</span>
          <strong>{{ summary.totalTasks }}</strong>
          <small>项任务</small>
        </article>
        <article>
          <span>平均利用率</span>
          <strong>{{ summary.averageUtilization }}%</strong>
          <small>按班组计算</small>
        </article>
        <article>
          <span>七日夜班</span>
          <strong>{{ summary.nightShifts }}</strong>
          <small>次安排</small>
        </article>
      </section>

      <section class="analytics-grid">
        <el-card shadow="never" class="analytics-card">
          <template #header>
            <div class="card-heading">
              <span>01</span>
              <div>
                <strong>班组负荷</strong>
                <small>当日任务与在册人数对比</small>
              </div>
            </div>
          </template>
          <AppPageState
            v-if="groupStats.length === 0"
            compact
            title="暂无班组负荷数据"
            description="需要先维护在职员工和所属班组。"
          />
          <el-table v-else :data="groupStats" stripe>
            <el-table-column prop="group_name" label="班组" min-width="120" />
            <el-table-column prop="staff_count" label="人数" width="72" align="right" />
            <el-table-column prop="task_count" label="任务" width="72" align="right" />
            <el-table-column prop="avgTasksPerStaff" label="人均" width="72" align="right" />
            <el-table-column label="利用率" width="110" align="right">
              <template #default="{ row }">
                <span :class="utilizationClass(row.utilization)">{{ row.utilization }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card shadow="never" class="analytics-card">
          <template #header>
            <div class="card-heading">
              <span>02</span>
              <div>
                <strong>人员疲劳风险</strong>
                <small>按任务量排序的前 10 名</small>
              </div>
            </div>
          </template>
          <AppPageState
            v-if="staffUtil.length === 0"
            compact
            title="暂无人员利用数据"
            description="排班明细生成后会自动计算疲劳风险。"
          />
          <el-table v-else :data="staffUtil.slice(0, 10)" stripe>
            <el-table-column prop="name" label="姓名" min-width="100" />
            <el-table-column prop="task_count" label="任务" width="72" align="right" />
            <el-table-column prop="fatigueScore" label="疲劳度" width="82" align="right" />
            <el-table-column label="风险" width="88">
              <template #default="{ row }">
                <el-tag :type="riskMeta(row.fatigueRisk).type" effect="light">
                  {{ riskMeta(row.fatigueRisk).label }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card shadow="never" class="analytics-card">
          <template #header>
            <div class="card-heading">
              <span>03</span>
              <div>
                <strong>资质覆盖</strong>
                <small>各机型有效资质人员占比</small>
              </div>
            </div>
          </template>
          <AppPageState
            v-if="qualStats.length === 0"
            compact
            title="暂无资质覆盖数据"
            description="录入人员机型资质后即可查看覆盖率。"
          />
          <el-table v-else :data="qualStats" stripe>
            <el-table-column prop="aircraft_type" label="机型" min-width="130" />
            <el-table-column prop="qualified_count" label="资质人数" width="100" align="right" />
            <el-table-column label="覆盖率" width="110" align="right">
              <template #default="{ row }">
                <span :class="coverageClass(row.coverageRate)">{{ row.coverageRate }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card shadow="never" class="analytics-card">
          <template #header>
            <div class="card-heading">
              <span>04</span>
              <div>
                <strong>近 7 天夜班分布</strong>
                <small>观察夜班密度和集中趋势</small>
              </div>
            </div>
          </template>
          <el-table :data="nightDist" stripe>
            <el-table-column prop="date" label="日期" min-width="112" />
            <el-table-column prop="total" label="总数" width="66" align="right" />
            <el-table-column prop="night" label="夜班" width="66" align="right" />
            <el-table-column label="夜班率" width="92" align="right">
              <template #default="{ row }">
                <span :class="nightRateClass(row.nightRate)">{{ row.nightRate }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { getScheduleStatistics } from '../../api/statistics'

const statsDate = ref(toDateInput(new Date()))
const groupStats = ref([])
const staffUtil = ref([])
const qualStats = ref([])
const nightDist = ref([])
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')

const hasOperationalData = computed(() =>
  groupStats.value.length > 0 ||
  staffUtil.value.length > 0 ||
  qualStats.value.length > 0 ||
  nightDist.value.some(item => Number(item.total || 0) > 0)
)

const summary = computed(() => {
  const totalTasks = groupStats.value.reduce((sum, item) => sum + Number(item.task_count || 0), 0)
  const averageUtilization = groupStats.value.length
    ? Math.round(
        groupStats.value.reduce((sum, item) => sum + Number(item.utilization || 0), 0) /
        groupStats.value.length
      )
    : 0
  const nightShifts = nightDist.value.reduce((sum, item) => sum + Number(item.night || 0), 0)
  return { totalTasks, averageUtilization, nightShifts }
})

fetchStats()

async function fetchStats() {
  if (!statsDate.value) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await getScheduleStatistics(
      { scheduleDate: statsDate.value },
      { silent: true }
    )
    const data = res.data || {}
    groupStats.value = data.groupStats || []
    staffUtil.value = data.staffUtilization || []
    qualStats.value = data.qualificationStats || []
    nightDist.value = data.nightDistribution || []
    hasLoaded.value = true
  } catch (error) {
    loadError.value = error?.message || '请检查统计服务后重试'
  } finally {
    loading.value = false
  }
}

function riskMeta(risk) {
  return {
    high: { label: '高', type: 'danger' },
    medium: { label: '中', type: 'warning' },
    low: { label: '低', type: 'success' }
  }[risk] || { label: '未知', type: 'info' }
}

function utilizationClass(value) {
  const numeric = Number(value || 0)
  return numeric >= 85 ? 'metric-danger' : numeric >= 65 ? 'metric-warning' : 'metric-normal'
}

function coverageClass(value) {
  return Number(value || 0) < 50 ? 'metric-danger' : 'metric-normal'
}

function nightRateClass(value) {
  return Number(value || 0) >= 40 ? 'metric-warning' : 'metric-normal'
}

function disableFutureDate(date) {
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  return date.getTime() >= tomorrow.getTime()
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<style scoped>
.statistics-page {
  max-width: 1440px;
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
  font-weight: var(--font-weight-semi);
}

.toolbar-copy span,
.card-heading small {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-bottom: var(--space-4);
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-neutral-200);
  box-shadow: var(--shadow-xs);
}

.metric-strip article {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  min-height: 104px;
  padding: 18px 20px;
  background: var(--color-surface);
}

.metric-strip span {
  grid-column: 1 / -1;
  align-self: start;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.metric-strip strong {
  color: var(--color-brand-900);
  font: 650 28px/1 var(--font-family);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
}

.metric-strip small {
  color: var(--color-neutral-500);
  font-size: 11px;
}

.analytics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.analytics-card {
  min-width: 0;
}

.analytics-card :deep(.el-card__body) {
  padding: 0 !important;
}

.card-heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.card-heading > span {
  color: var(--color-brand-500);
  font: 600 10px/1 var(--font-family-mono);
}

.card-heading div {
  display: grid;
  gap: 3px;
}

.card-heading strong {
  color: var(--color-brand-900);
  font-size: var(--font-size-md);
}

.metric-normal,
.metric-warning,
.metric-danger {
  font-weight: var(--font-weight-semi);
  font-variant-numeric: tabular-nums;
}

.metric-normal { color: var(--color-success); }
.metric-warning { color: var(--color-warning); }
.metric-danger { color: var(--color-danger); }

@media (max-width: 960px) {
  .metric-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .toolbar-card :deep(.el-card__body) {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-card :deep(.el-date-editor) {
    width: 100% !important;
  }

  .metric-strip {
    grid-template-columns: 1fr;
  }

  .metric-strip article {
    min-height: 86px;
  }
}
</style>
