<template>
  <div class="audit-page">
    <AppPageHeader
      title="审计日志"
      description="追踪关键业务操作和责任人，为问题回溯与合规检查保留完整依据。"
    >
      <template #actions>
        <el-button :loading="exporting" :disabled="loading" @click="exportLogs">
          导出当前结果
        </el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @keyup.enter="search" @submit.prevent>
        <el-form-item label="操作类型">
          <el-input
            v-model.trim="filters.action"
            placeholder="如 PUBLISH_SCHEDULE"
            clearable
            style="width: 210px"
          />
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="—"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            :disabled-date="disableFutureDate"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
      <span class="toolbar-meta">{{ total }} 条记录</span>
    </el-card>

    <el-card shadow="never" class="data-card">
      <AppPageState v-if="loading && logs.length === 0" type="loading" title="正在加载审计日志" />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="审计日志加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchLogs"
      />
      <AppPageState
        v-else-if="logs.length === 0"
        title="当前条件下没有审计记录"
        :description="hasFilters ? '调整操作类型或日期范围后再试。' : '执行发布、审批等关键操作后，日志会显示在这里。'"
        :action-label="hasFilters ? '清除筛选' : ''"
        @action="resetFilters"
      />
      <template v-else>
        <div class="table-scroll">
          <el-table :data="logs" stripe v-loading="loading" style="min-width: 980px">
            <el-table-column prop="createdAt" label="时间" width="174">
              <template #default="{ row }">
                <span class="timestamp">{{ formatTimestamp(row.createdAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作类型" min-width="180">
              <template #default="{ row }">
                <span class="action-code">{{ row.action || 'UNKNOWN' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="detail" label="操作描述" min-width="280" show-overflow-tooltip>
              <template #default="{ row }">{{ row.detail || '—' }}</template>
            </el-table-column>
            <el-table-column prop="targetType" label="目标类型" width="130">
              <template #default="{ row }">{{ row.targetType || '—' }}</template>
            </el-table-column>
            <el-table-column prop="targetId" label="目标 ID" width="100">
              <template #default="{ row }">{{ row.targetId || '—' }}</template>
            </el-table-column>
            <el-table-column prop="operatorId" label="操作人" width="100">
              <template #default="{ row }">{{ row.operatorId || '系统' }}</template>
            </el-table-column>
          </el-table>
        </div>

        <el-pagination
          v-model:current-page="page"
          :total="total"
          :page-size="50"
          layout="total, prev, pager, next"
          @current-change="fetchLogs"
        />
      </template>
    </el-card>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { exportOperationLogs, queryOperationLogs } from '../../api/audit'

const filters = reactive({ action: '', startDate: '', endDate: '' })
const dateRange = ref([])
const logs = ref([])
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const exporting = ref(false)
const hasFilters = computed(() => Boolean(filters.action || dateRange.value?.length))

fetchLogs()

async function fetchLogs() {
  loading.value = true
  loadError.value = ''
  syncDateRange()
  try {
    const res = await queryOperationLogs(
      { page: page.value, size: 50, ...filters },
      { silent: true }
    )
    logs.value = res.data?.records || []
    total.value = Number(res.data?.total || 0)
  } catch (error) {
    logs.value = []
    total.value = 0
    loadError.value = error?.message || '请检查审计服务后重试'
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  fetchLogs()
}

function resetFilters() {
  filters.action = ''
  dateRange.value = []
  filters.startDate = ''
  filters.endDate = ''
  search()
}

function syncDateRange() {
  filters.startDate = dateRange.value?.[0] || ''
  filters.endDate = dateRange.value?.[1] || ''
}

async function exportLogs() {
  if (exporting.value) return
  exporting.value = true
  syncDateRange()
  try {
    const blob = await exportOperationLogs({ ...filters }, { silent: true })
    if (!(blob instanceof Blob)) throw new Error('导出文件格式异常')

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `审计日志_${toDateInput(new Date())}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('审计日志已开始下载')
  } catch (error) {
    ElMessage.error(error?.message || '导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

function formatTimestamp(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 19)
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
.audit-page {
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
  gap: var(--space-4);
  padding-block: 14px !important;
}

.toolbar-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.toolbar-meta {
  flex: 0 0 auto;
  color: var(--color-neutral-500);
  font: 500 12px/1 var(--font-family-mono);
}

.data-card :deep(.el-card__body) {
  padding: 0 !important;
}

.data-card :deep(.el-pagination) {
  padding: 16px 20px 18px;
}

.timestamp,
.action-code {
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}

.timestamp {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.action-code {
  color: var(--color-brand-700);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semi);
}

@media (max-width: 900px) {
  .toolbar-card :deep(.el-card__body) {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-card :deep(.el-form),
  .toolbar-card :deep(.el-form-item),
  .toolbar-card :deep(.el-input),
  .toolbar-card :deep(.el-date-editor) {
    width: 100% !important;
  }
}
</style>
