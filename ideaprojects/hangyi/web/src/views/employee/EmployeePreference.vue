<template>
  <div class="pref-page">
    <AppPageHeader
      title="排班偏好"
      description="记录人员对班次、时段与休息日的偏好，为自动排班提供可解释的参考。"
    >
      <template #actions>
        <el-button
          v-if="canManage && employeeId"
          type="primary"
          @click="openAdd"
        >
          新增偏好
        </el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="selector-card">
      <div class="selector-copy">
        <strong>选择员工</strong>
        <span>切换人员后自动加载其全部排班偏好。</span>
      </div>
      <el-select
        v-model="employeeId"
        placeholder="搜索姓名或工号"
        filterable
        :loading="employeesLoading"
        style="width: min(100%, 320px)"
        @change="fetchData"
      >
        <el-option
          v-for="employee in employees"
          :key="employee.id"
          :label="`${employee.name} · ${employee.empNo}`"
          :value="employee.id"
        />
      </el-select>
    </el-card>

    <AppPageState
      v-if="employeesLoading && employees.length === 0"
      type="loading"
      title="正在加载员工列表"
    />
    <AppPageState
      v-else-if="employeesError"
      type="error"
      title="员工列表加载失败"
      :description="employeesError"
      action-label="重新加载"
      @action="loadEmployees"
    />
    <AppPageState
      v-else-if="!employeeId"
      title="先选择一名员工"
      description="选择后可查看偏好类型、优先级和生效周期。"
    />
    <el-card v-else shadow="never" class="preference-card">
      <div class="preference-heading">
        <div>
          <span class="selected-employee">{{ selectedEmployee?.name || '当前员工' }}</span>
          <h2>偏好清单</h2>
        </div>
        <span>{{ list.length }} 条记录</span>
      </div>

      <AppPageState
        v-if="loading && list.length === 0"
        type="loading"
        compact
        title="正在加载排班偏好"
      />
      <AppPageState
        v-else-if="loadError"
        type="error"
        compact
        title="排班偏好加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        compact
        title="这名员工还没有偏好"
        description="偏好不是强制排班规则，可按实际需要补充。"
        :action-label="canManage ? '新增第一条偏好' : ''"
        @action="openAdd"
      />
      <div v-else class="preference-list">
        <article v-for="row in list" :key="row.id" class="preference-item">
          <span class="preference-item__mark">{{ typeMeta(row.prefType).short }}</span>
          <div class="preference-item__main">
            <div class="preference-item__title">
              <div>
                <el-tag :type="typeMeta(row.prefType).tag" effect="plain" size="small">
                  {{ typeMeta(row.prefType).label }}
                </el-tag>
                <h3>{{ row.prefKey }}</h3>
              </div>
              <el-tag :type="row.status === 1 ? 'success' : 'info'" effect="light" size="small">
                {{ row.status === 1 ? '启用' : '停用' }}
              </el-tag>
            </div>
            <p>{{ row.prefValue }}</p>
            <dl>
              <div><dt>优先级</dt><dd>{{ row.priority }}</dd></div>
              <div><dt>生效周期</dt><dd>{{ effectiveRange(row) }}</dd></div>
            </dl>
          </div>
          <div v-if="canManage" class="preference-item__actions">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </div>
        </article>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑排班偏好' : '新增排班偏好'"
      width="560px"
      destroy-on-close
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="偏好类型" prop="prefType">
            <el-select v-model="form.prefType" style="width: 100%">
              <el-option label="班次偏好" value="SHIFT" />
              <el-option label="时间段偏好" value="TIME" />
              <el-option label="休息偏好" value="REST" />
              <el-option label="其他偏好" value="OTHER" />
            </el-select>
          </el-form-item>
          <el-form-item label="优先级" prop="priority">
            <el-input-number v-model="form.priority" :min="1" :max="99" style="width: 100%" />
          </el-form-item>
        </div>
        <el-form-item label="偏好项" prop="prefKey">
          <el-input
            v-model.trim="form.prefKey"
            maxlength="100"
            placeholder="例如 期望班次、避免时段"
          />
        </el-form-item>
        <el-form-item label="偏好值" prop="prefValue">
          <el-input
            v-model.trim="form.prefValue"
            maxlength="200"
            placeholder="例如 早班、周五夜班、09:00—17:00"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="生效日期">
            <el-date-picker
              v-model="form.effectiveFrom"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="立即生效"
              style="width: 100%"
              @change="formRef?.validateField('effectiveTo').catch(() => {})"
            />
          </el-form-item>
          <el-form-item label="失效日期" prop="effectiveTo">
            <el-date-picker
              v-model="form.effectiveTo"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="长期有效"
              style="width: 100%"
              :disabled-date="disableEndDate"
            />
          </el-form-item>
        </div>
        <el-form-item label="使用状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="停用"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存偏好</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createEmployeePreference,
  deleteEmployeePreference,
  getEmployeeListAll,
  getEmployeePreferences,
  updateEmployeePreference
} from '../../api/employee'
import { useUserStore } from '../../store/user'

const userStore = useUserStore()
const employeeId = ref(null)
const employees = ref([])
const employeesLoading = ref(false)
const employeesError = ref('')
const list = ref([])
const loading = ref(false)
const loadError = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref(createEmptyForm())

const canManage = computed(() => userStore.hasAnyRole('ADMIN'))
const selectedEmployee = computed(() =>
  employees.value.find(employee => employee.id === employeeId.value)
)

const rules = {
  prefType: [{ required: true, message: '请选择偏好类型', trigger: 'change' }],
  prefKey: [{ required: true, message: '请输入偏好项', trigger: 'blur' }],
  prefValue: [{ required: true, message: '请输入偏好值', trigger: 'blur' }],
  priority: [{ required: true, message: '请设置优先级', trigger: 'change' }],
  effectiveTo: [
    {
      validator: (_rule, value, callback) => {
        if (value && form.value.effectiveFrom && value < form.value.effectiveFrom) {
          callback(new Error('失效日期不能早于生效日期'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ]
}

onMounted(loadEmployees)

async function loadEmployees() {
  employeesLoading.value = true
  employeesError.value = ''
  try {
    const res = await getEmployeeListAll({ silent: true })
    employees.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    employees.value = []
    employeesError.value = error?.message || '当前账号无法读取员工列表'
  } finally {
    employeesLoading.value = false
  }
}

async function fetchData() {
  if (!employeeId.value) {
    list.value = []
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const res = await getEmployeePreferences(employeeId.value, { silent: true })
    list.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    list.value = []
    loadError.value = error?.message || '请检查人员服务后重试'
  } finally {
    loading.value = false
  }
}

function openAdd() {
  isEdit.value = false
  form.value = createEmptyForm()
  form.value.employeeId = employeeId.value
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  form.value = { ...row, status: row.status ?? 1 }
  dialogVisible.value = true
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || saving.value) return

  saving.value = true
  try {
    const action = isEdit.value ? updateEmployeePreference : createEmployeePreference
    await action({ ...form.value, employeeId: employeeId.value })
    ElMessage.success(isEdit.value ? '排班偏好已更新' : '排班偏好已新增')
    dialogVisible.value = false
    await fetchData()
  } catch {
    // 请求层已展示错误。
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除“${row.prefKey}”这条排班偏好？`,
      '删除排班偏好',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    await deleteEmployeePreference(row.id)
    ElMessage.success('排班偏好已删除')
    await fetchData()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
  }
}

function typeMeta(type) {
  return {
    SHIFT: { label: '班次偏好', short: '班', tag: 'primary' },
    TIME: { label: '时段偏好', short: '时', tag: 'success' },
    REST: { label: '休息偏好', short: '休', tag: 'warning' },
    OTHER: { label: '其他偏好', short: '其', tag: 'info' }
  }[type] || { label: type || '其他偏好', short: '其', tag: 'info' }
}

function effectiveRange(row) {
  if (!row.effectiveFrom && !row.effectiveTo) return '长期有效'
  return `${row.effectiveFrom || '立即'} — ${row.effectiveTo || '长期'}`
}

function disableEndDate(date) {
  if (!form.value.effectiveFrom) return false
  return date.getTime() < new Date(`${form.value.effectiveFrom}T00:00:00`).getTime()
}

function createEmptyForm() {
  return {
    employeeId: null,
    prefType: 'SHIFT',
    prefKey: '',
    prefValue: '',
    priority: 5,
    effectiveFrom: '',
    effectiveTo: '',
    status: 1
  }
}
</script>

<style scoped>
.pref-page {
  max-width: 1200px;
  margin: 0 auto;
}

.selector-card {
  margin-bottom: var(--space-4);
}

.selector-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding-block: 14px !important;
}

.selector-copy {
  display: grid;
  gap: 3px;
}

.selector-copy strong,
.preference-heading h2 {
  color: var(--color-brand-900);
}

.selector-copy span,
.preference-heading > span {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.preference-card :deep(.el-card__body) {
  padding: 0 !important;
}

.preference-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.selected-employee {
  display: block;
  margin-bottom: 4px;
  color: var(--color-brand-500);
  font-size: 11px;
  font-weight: var(--font-weight-semi);
}

.preference-heading h2 {
  font-size: var(--font-size-lg);
}

.preference-list {
  display: grid;
}

.preference-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.preference-item:last-child {
  border-bottom: 0;
}

.preference-item__mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px 14px 14px 5px;
  color: var(--color-brand-700);
  background: var(--color-brand-100);
  font-weight: var(--font-weight-semi);
}

.preference-item__title,
.preference-item__title > div,
.preference-item__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preference-item__title {
  justify-content: space-between;
}

.preference-item h3 {
  color: var(--color-brand-900);
  font-size: var(--font-size-md);
}

.preference-item p {
  margin: 8px 0 11px;
  color: var(--color-neutral-700);
  line-height: 1.6;
}

.preference-item dl {
  display: flex;
  gap: 24px;
  margin: 0;
}

.preference-item dl div {
  display: flex;
  gap: 7px;
}

.preference-item dt {
  color: var(--color-neutral-400);
  font-size: var(--font-size-xs);
}

.preference-item dd {
  margin: 0;
  color: var(--color-neutral-600);
  font: 500 12px/1.5 var(--font-family-mono);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--space-4);
}

@media (max-width: 767px) {
  .selector-card :deep(.el-card__body) {
    align-items: stretch;
    flex-direction: column;
  }

  .selector-card :deep(.el-select) {
    width: 100% !important;
  }

  .preference-item {
    grid-template-columns: 38px minmax(0, 1fr);
    padding: 16px;
  }

  .preference-item__mark {
    width: 38px;
    height: 38px;
  }

  .preference-item__actions {
    grid-column: 2;
    justify-content: flex-end;
    border-top: 1px solid var(--color-neutral-100);
    padding-top: 7px;
  }

  .preference-item__title {
    align-items: flex-start;
  }

  .preference-item__title > div {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }

  .preference-item dl {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
