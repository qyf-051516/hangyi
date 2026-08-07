<template>
  <div class="flight-page">
    <AppPageHeader
      title="航班计划"
      description="维护进出港航班、机型和机位信息，为智能排班提供当日任务来源。"
    >
      <template #actions>
        <el-button v-if="canManage" type="primary" @click="openCreate">新增航班</el-button>
        <el-button v-if="canManage" :loading="syncing" @click="handleSync">同步航班</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @keyup.enter="search" @submit.prevent>
        <el-form-item label="计划日期">
          <el-date-picker
            v-model="query.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="全部日期"
            clearable
            style="width: 160px"
          />
        </el-form-item>
        <el-form-item label="航班号">
          <el-input v-model.trim="query.flightNo" placeholder="输入航班号" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
      <span class="toolbar-meta">{{ total }} 个航班</span>
    </el-card>

    <el-card shadow="never" class="data-card">
      <AppPageState
        v-if="loading && list.length === 0"
        type="loading"
        title="正在加载航班计划"
      />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="航班计划加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        title="当前筛选下没有航班"
        :description="hasFilters ? '调整日期或航班号后再试。' : '新增或同步航班后，任务会出现在这里。'"
        :action-label="hasFilters ? '清除筛选' : (canManage ? '新增第一条航班' : '')"
        @action="hasFilters ? resetQuery() : openCreate()"
      />
      <template v-else>
        <div class="table-scroll">
          <el-table :data="list" stripe v-loading="loading" style="min-width: 1080px">
            <el-table-column label="航班号" min-width="120" fixed="left">
              <template #default="{ row }">
                <strong class="flight-number">{{ row.flightNo }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="航线" min-width="150">
              <template #default="{ row }">
                <span class="route-code">{{ row.routeFrom || '—' }}</span>
                <span class="route-arrow">→</span>
                <span class="route-code">{{ row.routeTo || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="计划时间" min-width="160">
              <template #default="{ row }">
                <span class="date-time">{{ row.planDate }} · {{ formatTime(row.planTime) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="方向" width="82">
              <template #default="{ row }">
                <el-tag :type="row.flightType === 'DEP' ? 'primary' : 'success'" effect="light">
                  {{ row.flightType === 'DEP' ? '出港' : '进港' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="机型" min-width="110">
              <template #default="{ row }">{{ getAircraftType(row) }}</template>
            </el-table-column>
            <el-table-column prop="registration" label="机号" min-width="108">
              <template #default="{ row }">{{ row.registration || '—' }}</template>
            </el-table-column>
            <el-table-column prop="gate" label="机位" width="82">
              <template #default="{ row }">{{ row.gate || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="94">
              <template #default="{ row }">
                <el-tag :type="statusMeta(row.status).type" effect="light">
                  {{ statusMeta(row.status).label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="canManage" label="操作" width="132" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="fetchData"
          @size-change="handleSizeChange"
        />
      </template>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑航班' : '新增航班'"
      width="640px"
      destroy-on-close
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="航班号" prop="flightNo">
            <el-input v-model.trim="form.flightNo" maxlength="20" placeholder="如 CA1234" />
          </el-form-item>
          <el-form-item label="航班方向" prop="flightType">
            <el-select v-model="form.flightType" style="width: 100%">
              <el-option label="出港" value="DEP" />
              <el-option label="进港" value="ARR" />
            </el-select>
          </el-form-item>
          <el-form-item label="计划日期" prop="planDate">
            <el-date-picker
              v-model="form.planDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="计划时刻" prop="planTime">
            <el-time-picker
              v-model="form.planTime"
              format="HH:mm"
              value-format="HH:mm:ss"
              placeholder="选择时刻"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="机型" prop="aircraftTypeId">
            <el-select
              v-model="form.aircraftTypeId"
              placeholder="请选择机型"
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="aircraft in aircraftTypes"
                :key="aircraft.id"
                :label="`${aircraft.typeCode} · ${aircraft.typeName}`"
                :value="aircraft.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="机号">
            <el-input v-model.trim="form.registration" maxlength="30" placeholder="选填" />
          </el-form-item>
          <el-form-item label="始发站" prop="routeFrom">
            <el-input v-model.trim="form.routeFrom" maxlength="10" placeholder="如 PEK" />
          </el-form-item>
          <el-form-item label="目的站" prop="routeTo">
            <el-input v-model.trim="form.routeTo" maxlength="10" placeholder="如 SHA" />
          </el-form-item>
          <el-form-item label="机位">
            <el-input v-model.trim="form.gate" maxlength="20" placeholder="如 206" />
          </el-form-item>
          <el-form-item label="计划状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="计划" value="SCHEDULED" />
              <el-option label="延误" value="DELAYED" />
              <el-option label="取消" value="CANCELLED" />
              <el-option label="已完成" value="COMPLETED" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建航班' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAircraftTypeListAll } from '../../api/employee'
import { createFlight, deleteFlight, getFlightPage, syncFlights, updateFlight } from '../../api/flight'
import { useUserStore } from '../../store/user'

const userStore = useUserStore()
const list = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const syncing = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const aircraftTypes = ref([])
const formRef = ref(null)

const query = reactive({ page: 1, size: 20, date: '', flightNo: '' })
const form = reactive(createEmptyForm())
const canManage = computed(() => userStore.hasAnyRole('ADMIN'))
const hasFilters = computed(() => Boolean(query.date || query.flightNo))

const rules = {
  flightNo: [{ required: true, message: '请输入航班号', trigger: 'blur' }],
  flightType: [{ required: true, message: '请选择航班方向', trigger: 'change' }],
  planDate: [{ required: true, message: '请选择计划日期', trigger: 'change' }],
  planTime: [{ required: true, message: '请选择计划时刻', trigger: 'change' }],
  aircraftTypeId: [{ required: true, message: '请选择机型', trigger: 'change' }],
  routeFrom: [{ required: true, message: '请输入始发站', trigger: 'blur' }],
  routeTo: [{ required: true, message: '请输入目的站', trigger: 'blur' }]
}

onMounted(() => {
  fetchData()
  loadAircraftTypes()
})

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getFlightPage({ ...query }, { silent: true })
    list.value = res.data?.records || []
    total.value = Number(res.data?.total || 0)
  } catch (error) {
    list.value = []
    total.value = 0
    loadError.value = error?.message || '请检查航班服务后重试'
  } finally {
    loading.value = false
  }
}

async function loadAircraftTypes() {
  try {
    const res = await getAircraftTypeListAll({ silent: true })
    aircraftTypes.value = Array.isArray(res.data) ? res.data : []
  } catch {
    aircraftTypes.value = []
  }
}

function search() {
  query.page = 1
  fetchData()
}

function resetQuery() {
  query.date = ''
  query.flightNo = ''
  search()
}

function handleSizeChange() {
  query.page = 1
  fetchData()
}

function openCreate() {
  if (!canManage.value) return
  isEdit.value = false
  Object.assign(form, createEmptyForm())
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  Object.assign(form, createEmptyForm(), row)
  dialogVisible.value = true
}

async function handleSync() {
  if (syncing.value) return
  const date = query.date || toDateInput(new Date())
  syncing.value = true
  try {
    const res = await syncFlights(date)
    ElMessage.success(`已同步 ${Number(res.data?.count || 0)} 个航班`)
    query.date = date
    await fetchData()
  } catch {
    // 请求层已展示明确错误。
  } finally {
    syncing.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除航班 ${row.flightNo}？相关排班任务可能需要重新检查。`,
      '删除航班',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    await deleteFlight(row.id)
    ElMessage.success('航班已删除')
    if (list.value.length === 1 && query.page > 1) query.page -= 1
    await fetchData()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
  }
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || saving.value) return

  saving.value = true
  try {
    const payload = {
      ...form,
      flightNo: form.flightNo.toUpperCase(),
      routeFrom: form.routeFrom.toUpperCase(),
      routeTo: form.routeTo.toUpperCase()
    }
    if (isEdit.value) {
      await updateFlight(payload)
      ElMessage.success('航班信息已更新')
    } else {
      await createFlight(payload)
      ElMessage.success('航班已创建')
    }
    dialogVisible.value = false
    await fetchData()
  } catch {
    // 请求层已展示明确错误。
  } finally {
    saving.value = false
  }
}

function getAircraftType(row) {
  if (row.aircraftTypeName) return row.aircraftTypeName
  return aircraftTypes.value.find(item => item.id === row.aircraftTypeId)?.typeName || '—'
}

function statusMeta(status) {
  return {
    SCHEDULED: { label: '计划', type: 'primary' },
    DELAYED: { label: '延误', type: 'warning' },
    CANCELLED: { label: '取消', type: 'danger' },
    COMPLETED: { label: '完成', type: 'success' }
  }[status] || { label: status || '未知', type: 'info' }
}

function formatTime(value) {
  return String(value || '—').slice(0, 5)
}

function createEmptyForm() {
  return {
    id: null,
    flightNo: '',
    aircraftTypeId: null,
    registration: '',
    planDate: '',
    planTime: '',
    flightType: 'DEP',
    routeFrom: '',
    routeTo: '',
    gate: '',
    status: 'SCHEDULED'
  }
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<style scoped>
.flight-page {
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
  color: var(--color-neutral-500);
  font: 500 12px/1 var(--font-family-mono);
}

.data-card :deep(.el-card__body) {
  padding: 0 !important;
}

.data-card :deep(.el-pagination) {
  padding: 16px 20px 18px;
}

.flight-number {
  color: var(--color-brand-800);
  font: 650 13px/1.2 var(--font-family-mono);
}

.route-code,
.date-time {
  font-variant-numeric: tabular-nums;
}

.route-code {
  color: var(--color-brand-900);
  font: 600 12px/1 var(--font-family-mono);
}

.route-arrow {
  margin: 0 7px;
  color: var(--color-brand-300);
}

.date-time {
  color: var(--color-neutral-600);
  font-size: var(--font-size-sm);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--space-5);
}

@media (max-width: 767px) {
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

  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
