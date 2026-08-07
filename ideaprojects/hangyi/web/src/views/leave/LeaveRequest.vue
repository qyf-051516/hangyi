<template>
  <div class="leave-page">
    <AppPageHeader
      title="请假管理"
      description="集中查看请假周期和审批状态，避免人员缺席与排班计划发生冲突。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">提交请假</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="审批状态">
          <el-select
            v-model="query.status"
            placeholder="全部状态"
            clearable
            style="width: 150px"
            @change="search"
          >
            <el-option label="待审批" :value="0" />
            <el-option label="已通过" :value="1" />
            <el-option label="已驳回" :value="2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
      <span class="toolbar-meta">{{ total }} 条请假记录</span>
    </el-card>

    <el-card shadow="never" class="data-card">
      <AppPageState
        v-if="loading && list.length === 0"
        type="loading"
        title="正在加载请假记录"
      />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="请假记录加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        title="还没有请假记录"
        description="提交请假后，审批进度和结果会集中显示在这里。"
        action-label="提交第一条请假"
        @action="openCreate"
      />
      <template v-else>
        <div class="table-scroll">
          <el-table :data="list" stripe v-loading="loading" style="min-width: 980px">
            <el-table-column label="员工" width="120">
              <template #default="{ row }">
                <strong class="employee-name">{{ getEmpName(row.employeeId) }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="请假类型" width="110">
              <template #default="{ row }">{{ typeMap[row.leaveType] || row.leaveType }}</template>
            </el-table-column>
            <el-table-column label="日期范围" min-width="220">
              <template #default="{ row }">
                <span class="date-range">{{ row.startDate }} — {{ row.endDate || row.startDate }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="totalDays" label="天数" width="80" align="right" />
            <el-table-column prop="reason" label="原因" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ row.reason || '未填写' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusMeta(row.status).type" effect="light">
                  {{ statusMeta(row.status).label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="审批意见" min-width="150">
              <template #default="{ row }">{{ row.approveRemark || '—' }}</template>
            </el-table-column>
            <el-table-column v-if="showApprove" label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 0">
                  <el-button text type="success" size="small" @click="handleApprove(row, 1)">
                    通过
                  </el-button>
                  <el-button text type="danger" size="small" @click="handleApprove(row, 2)">
                    驳回
                  </el-button>
                </template>
                <span v-else class="muted-text">已处理</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="fetchData"
        />
      </template>
    </el-card>

    <el-dialog
      v-model="showAdd"
      title="提交请假"
      width="520px"
      destroy-on-close
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="员工" prop="employeeId">
          <el-select
            v-model="form.employeeId"
            placeholder="请选择员工"
            filterable
            style="width: 100%"
            :loading="employeesLoading"
          >
            <el-option
              v-for="employee in employees"
              :key="employee.id"
              :label="`${employee.name} · ${employee.empNo}`"
              :value="employee.id"
            />
          </el-select>
          <span v-if="employeeError" class="field-hint field-hint--error">{{ employeeError }}</span>
        </el-form-item>
        <el-form-item label="请假类型" prop="leaveType">
          <el-select v-model="form.leaveType" style="width: 100%">
            <el-option label="年假" value="ANNUAL" />
            <el-option label="病假" value="SICK" />
            <el-option label="事假" value="PERSONAL" />
            <el-option label="其他" value="OTHER" />
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="开始日期" prop="startDate">
            <el-date-picker
              v-model="form.startDate"
              type="date"
              placeholder="选择开始日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
              :disabled-date="disablePastDate"
              @change="formRef?.validateField('endDate').catch(() => {})"
            />
          </el-form-item>
          <el-form-item label="结束日期" prop="endDate">
            <el-date-picker
              v-model="form.endDate"
              type="date"
              placeholder="选择结束日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
              :disabled-date="disableEndDate"
            />
          </el-form-item>
        </div>
        <el-form-item label="请假原因" prop="reason">
          <el-input
            v-model.trim="form.reason"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="说明请假原因，便于审批人快速判断"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { approveLeave, createLeave, getLeavePage } from '../../api/leave'
import { getEmployeeListAll } from '../../api/employee'
import { useUserStore } from '../../store/user'

const userStore = useUserStore()
const list = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const employees = ref([])
const employeesLoading = ref(false)
const employeeError = ref('')
const showAdd = ref(false)
const saving = ref(false)
const formRef = ref(null)

const typeMap = { ANNUAL: '年假', SICK: '病假', PERSONAL: '事假', OTHER: '其他' }
const query = reactive({ page: 1, size: 20, status: null })
const form = reactive(createEmptyForm())
const showApprove = computed(() => userStore.hasAnyRole('ADMIN', 'TEAM_LEADER'))

const rules = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  leaveType: [{ required: true, message: '请选择请假类型', trigger: 'change' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [
    { required: true, message: '请选择结束日期', trigger: 'change' },
    {
      validator: (_rule, value, callback) => {
        if (value && form.startDate && value < form.startDate) {
          callback(new Error('结束日期不能早于开始日期'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ],
  reason: [{ required: true, message: '请填写请假原因', trigger: 'blur' }]
}

onMounted(() => {
  fetchData()
  loadEmployees()
})

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getLeavePage({ ...query }, { silent: true })
    list.value = res.data?.records || []
    total.value = Number(res.data?.total || 0)
  } catch (error) {
    list.value = []
    total.value = 0
    loadError.value = error?.message || '请检查服务连接后重试'
  } finally {
    loading.value = false
  }
}

async function loadEmployees() {
  employeesLoading.value = true
  employeeError.value = ''
  try {
    const res = await getEmployeeListAll({ silent: true })
    employees.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    employees.value = []
    employeeError.value = error?.message || '员工列表加载失败'
  } finally {
    employeesLoading.value = false
  }
}

function search() {
  query.page = 1
  fetchData()
}

function resetQuery() {
  query.status = null
  search()
}

function openCreate() {
  Object.assign(form, createEmptyForm())
  showAdd.value = true
  if (employees.value.length === 0 && !employeesLoading.value) {
    loadEmployees()
  }
}

function getEmpName(id) {
  return employees.value.find(employee => employee.id === id)?.name || `员工 #${id}`
}

function statusMeta(status) {
  return {
    0: { label: '待审批', type: 'warning' },
    1: { label: '已通过', type: 'success' },
    2: { label: '已驳回', type: 'danger' }
  }[status] || { label: '未知', type: 'info' }
}

async function handleApprove(row, status) {
  const action = status === 1 ? '通过' : '驳回'
  try {
    await ElMessageBox.confirm(
      `确认${action}${getEmpName(row.employeeId)}的这条请假申请？`,
      `${action}请假`,
      {
        type: status === 1 ? 'success' : 'warning',
        confirmButtonText: `确认${action}`,
        cancelButtonText: '取消'
      }
    )
    await approveLeave(row.id, { status })
    ElMessage.success(`请假申请已${action}`)
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
    await createLeave({ ...form })
    ElMessage.success('请假申请已提交')
    showAdd.value = false
    await fetchData()
  } catch {
    // 请求层已展示明确错误。
  } finally {
    saving.value = false
  }
}

function disablePastDate(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() < today.getTime()
}

function disableEndDate(date) {
  if (!form.startDate) return disablePastDate(date)
  return date.getTime() < new Date(`${form.startDate}T00:00:00`).getTime()
}

function createEmptyForm() {
  return {
    employeeId: null,
    leaveType: 'ANNUAL',
    startDate: '',
    endDate: '',
    reason: ''
  }
}
</script>

<style scoped>
.leave-page {
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

.employee-name {
  color: var(--color-brand-900);
  font-weight: var(--font-weight-semi);
}

.date-range,
.muted-text {
  color: var(--color-neutral-500);
}

.date-range {
  font-variant-numeric: tabular-nums;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.field-hint {
  display: block;
  margin-top: 6px;
  font-size: var(--font-size-xs);
}

.field-hint--error {
  color: var(--color-danger);
}

@media (max-width: 767px) {
  .toolbar-card :deep(.el-card__body) {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-card :deep(.el-form) {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .toolbar-card :deep(.el-form-item),
  .toolbar-card :deep(.el-select) {
    width: 100% !important;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
