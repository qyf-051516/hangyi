<template>
  <div class="qual-page">
    <AppPageHeader
      title="资质管理"
      description="集中维护人员执照、证书和机型授权，提前识别临期与过期风险。"
    >
      <template #actions>
        <el-button v-if="canManage" type="primary" @click="openAdd">新增资质</el-button>
      </template>
    </AppPageHeader>

    <section class="risk-grid" aria-label="资质状态摘要">
      <article>
        <span>全部资质</span>
        <strong>{{ stats.total }}</strong>
        <small>当前系统记录</small>
      </article>
      <article>
        <span>有效资质</span>
        <strong>{{ stats.valid }}</strong>
        <small>不含临期与过期</small>
      </article>
      <button type="button" @click="showExpiring = true">
        <span>30 天内到期</span>
        <strong>{{ stats.expiring }}</strong>
        <small>点击查看清单</small>
      </button>
      <button type="button" class="risk-grid__danger" @click="showExpired = true">
        <span>已过期</span>
        <strong>{{ stats.expired }}</strong>
        <small>点击查看清单</small>
      </button>
    </section>

    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="员工">
          <el-select
            v-model="query.employeeId"
            placeholder="全部员工"
            clearable
            filterable
            style="width: 220px"
            :loading="optionsLoading"
            @change="search"
          >
            <el-option
              v-for="employee in employees"
              :key="employee.id"
              :label="`${employee.name} · ${employee.empNo}`"
              :value="employee.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
      <span>{{ total }} 条资质记录</span>
    </el-card>

    <el-card shadow="never" class="data-card">
      <AppPageState
        v-if="loading && list.length === 0"
        type="loading"
        title="正在加载资质记录"
      />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="资质记录加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        title="没有符合条件的资质"
        description="调整员工筛选条件，或新增一条人员资质。"
        :action-label="canManage ? '新增资质' : ''"
        @action="openAdd"
      />
      <template v-else>
        <div class="table-scroll desktop-table">
          <el-table :data="list" stripe v-loading="loading" style="min-width: 1120px">
            <el-table-column label="员工" min-width="150">
              <template #default="{ row }">
                <strong class="employee-name">{{ employeeName(row) }}</strong>
                <span class="cell-subtitle">{{ row.empNo || employeeNo(row.employeeId) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="qualName" label="资质名称" min-width="190" />
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag :type="typeMeta(row.qualType).tag" effect="plain" size="small">
                  {{ typeMeta(row.qualType).label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="qualCode" label="资质编码" width="150" />
            <el-table-column label="关联机型" min-width="130">
              <template #default="{ row }">{{ row.aircraftTypeName || aircraftName(row.aircraftTypeId) }}</template>
            </el-table-column>
            <el-table-column prop="issueDate" label="发证日期" width="115">
              <template #default="{ row }">{{ row.issueDate || '—' }}</template>
            </el-table-column>
            <el-table-column label="有效期" width="150">
              <template #default="{ row }">
                <span v-if="!row.expireDate" class="permanent">长期有效</span>
                <el-tag v-else :type="expiryMeta(row).tag" effect="light" size="small">
                  {{ expiryMeta(row).label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="canManage" label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="mobile-list">
          <article v-for="row in list" :key="row.id" class="qual-card">
            <div class="qual-card__top">
              <div>
                <span>{{ employeeName(row) }}</span>
                <strong>{{ row.qualName }}</strong>
              </div>
              <el-tag :type="expiryMeta(row).tag" effect="light" size="small">
                {{ expiryMeta(row).label }}
              </el-tag>
            </div>
            <dl>
              <div><dt>类型 / 编码</dt><dd>{{ typeMeta(row.qualType).label }} · {{ row.qualCode }}</dd></div>
              <div><dt>关联机型</dt><dd>{{ row.aircraftTypeName || aircraftName(row.aircraftTypeId) }}</dd></div>
              <div><dt>有效周期</dt><dd>{{ row.issueDate || '未记录' }} — {{ row.expireDate || '长期' }}</dd></div>
            </dl>
            <div v-if="canManage" class="qual-card__actions">
              <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click="handleDelete(row)">删除</el-button>
            </div>
          </article>
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
      v-model="dialogVisible"
      :title="isEdit ? '编辑人员资质' : '新增人员资质'"
      width="600px"
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
            :loading="optionsLoading"
          >
            <el-option
              v-for="employee in employees"
              :key="employee.id"
              :label="`${employee.name} · ${employee.empNo}`"
              :value="employee.id"
            />
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="资质类型" prop="qualType">
            <el-select
              v-model="form.qualType"
              style="width: 100%"
              @change="handleTypeChange"
            >
              <el-option label="机型授权" value="AIRCRAFT_TYPE" />
              <el-option label="执照" value="LICENSE" />
              <el-option label="证书" value="CERT" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联机型" prop="aircraftTypeId">
            <el-select
              v-model="form.aircraftTypeId"
              :placeholder="form.qualType === 'AIRCRAFT_TYPE' ? '请选择机型' : '可选'"
              clearable
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="type in aircraftTypes"
                :key="type.id"
                :label="`${type.typeCode} · ${type.typeName}`"
                :value="type.id"
              />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="资质名称" prop="qualName">
          <el-input
            v-model.trim="form.qualName"
            maxlength="100"
            placeholder="例如 B737 机型放行授权"
          />
        </el-form-item>
        <el-form-item label="资质编码" prop="qualCode">
          <el-input
            v-model.trim="form.qualCode"
            maxlength="50"
            placeholder="例如 B737-LIC-001"
            @blur="normalizeCode"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="发证日期" prop="issueDate">
            <el-date-picker
              v-model="form.issueDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择发证日期"
              style="width: 100%"
              @change="formRef?.validateField('expireDate').catch(() => {})"
            />
          </el-form-item>
          <el-form-item label="有效期至" prop="expireDate">
            <el-date-picker
              v-model="form.expireDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="不填则长期有效"
              clearable
              style="width: 100%"
              :disabled-date="disableExpireDate"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存资质</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showExpiring" title="30 天内到期的资质" width="720px">
      <AppPageState
        v-if="expiringList.length === 0"
        compact
        title="当前没有临期资质"
        description="未来 30 天内暂无需要续期的人员资质。"
      />
      <div v-else class="table-scroll">
        <el-table :data="expiringList" stripe style="min-width: 580px">
          <el-table-column label="员工" min-width="130">
            <template #default="{ row }">{{ employeeName(row) }}</template>
          </el-table-column>
          <el-table-column prop="qualName" label="资质名称" min-width="210" />
          <el-table-column prop="expireDate" label="有效期至" width="120" />
          <el-table-column label="剩余" width="100">
            <template #default="{ row }">{{ daysLeft(row) }} 天</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <el-dialog v-model="showExpired" title="已过期资质" width="720px">
      <AppPageState
        v-if="expiredList.length === 0"
        compact
        title="没有已过期资质"
        description="当前人员资质均在有效期内。"
      />
      <div v-else class="table-scroll">
        <el-table :data="expiredList" stripe style="min-width: 580px">
          <el-table-column label="员工" min-width="130">
            <template #default="{ row }">{{ employeeName(row) }}</template>
          </el-table-column>
          <el-table-column prop="qualName" label="资质名称" min-width="210" />
          <el-table-column prop="expireDate" label="过期日期" width="120" />
          <el-table-column label="已过期" width="110">
            <template #default="{ row }">{{ Math.abs(daysLeft(row)) }} 天</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createQualification,
  deleteQualification,
  getAircraftTypeList,
  getEmployeeListAll,
  getQualificationExpiring,
  getQualificationPage,
  updateQualification
} from '../../api/employee'
import { useUserStore } from '../../store/user'

const userStore = useUserStore()
const query = reactive({ page: 1, size: 20, employeeId: null })
const list = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const employees = ref([])
const aircraftTypes = ref([])
const optionsLoading = ref(false)
const stats = reactive({ total: 0, valid: 0, expiring: 0, expired: 0 })
const expiringList = ref([])
const expiredList = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref(createEmptyForm())
const showExpiring = ref(false)
const showExpired = ref(false)
const canManage = computed(() => userStore.hasAnyRole('ADMIN'))

const rules = {
  employeeId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  qualType: [{ required: true, message: '请选择资质类型', trigger: 'change' }],
  aircraftTypeId: [
    {
      validator: (_rule, value, callback) => {
        if (form.value.qualType === 'AIRCRAFT_TYPE' && !value) {
          callback(new Error('机型授权必须关联机型'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ],
  qualName: [{ required: true, message: '请输入资质名称', trigger: 'blur' }],
  qualCode: [{ required: true, message: '请输入资质编码', trigger: 'blur' }],
  expireDate: [
    {
      validator: (_rule, value, callback) => {
        if (value && form.value.issueDate && value < form.value.issueDate) {
          callback(new Error('有效期不能早于发证日期'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ]
}

onMounted(() => {
  loadOptions()
  fetchData()
  fetchStats()
})

async function loadOptions() {
  optionsLoading.value = true
  try {
    const [employeeRes, aircraftRes] = await Promise.all([
      getEmployeeListAll({ silent: true }),
      getAircraftTypeList({ silent: true })
    ])
    employees.value = Array.isArray(employeeRes.data) ? employeeRes.data : []
    aircraftTypes.value = Array.isArray(aircraftRes.data) ? aircraftRes.data : []
  } catch {
    employees.value = []
    aircraftTypes.value = []
  } finally {
    optionsLoading.value = false
  }
}

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getQualificationPage({ ...query }, { silent: true })
    list.value = res.data?.records || []
    total.value = Number(res.data?.total || 0)
  } catch (error) {
    list.value = []
    total.value = 0
    loadError.value = error?.message || '请检查人员服务后重试'
  } finally {
    loading.value = false
  }
}

async function fetchStats() {
  try {
    const res = await getQualificationExpiring({ silent: true })
    const data = res.data || {}
    stats.total = Number(data.totalCount || 0)
    stats.valid = Number(data.validCount || 0)
    stats.expiring = Number(data.expiringCount || 0)
    stats.expired = Number(data.expiredCount || 0)
    expiringList.value = Array.isArray(data.expiringSoon) ? data.expiringSoon : []
    expiredList.value = Array.isArray(data.expired) ? data.expired : []
  } catch {
    Object.assign(stats, { total: 0, valid: 0, expiring: 0, expired: 0 })
    expiringList.value = []
    expiredList.value = []
  }
}

function search() {
  query.page = 1
  fetchData()
}

function resetQuery() {
  query.employeeId = null
  search()
}

function openAdd() {
  isEdit.value = false
  form.value = createEmptyForm()
  form.value.employeeId = query.employeeId
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

async function handleSave() {
  normalizeCode()
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || saving.value) return

  saving.value = true
  try {
    const action = isEdit.value ? updateQualification : createQualification
    await action({ ...form.value })
    ElMessage.success(isEdit.value ? '人员资质已更新' : '人员资质已新增')
    dialogVisible.value = false
    await Promise.all([fetchData(), fetchStats()])
  } catch {
    // 请求层已展示错误。
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除 ${employeeName(row)} 的“${row.qualName}”？`,
      '删除人员资质',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    await deleteQualification(row.id)
    ElMessage.success('人员资质已删除')
    await Promise.all([fetchData(), fetchStats()])
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
  }
}

function handleTypeChange() {
  if (form.value.qualType !== 'AIRCRAFT_TYPE') {
    form.value.aircraftTypeId = null
  }
  formRef.value?.validateField('aircraftTypeId').catch(() => {})
}

function typeMeta(type) {
  return {
    AIRCRAFT_TYPE: { label: '机型授权', tag: 'primary' },
    LICENSE: { label: '执照', tag: 'success' },
    CERT: { label: '证书', tag: 'info' }
  }[type] || { label: type || '其他', tag: 'info' }
}

function daysLeft(row) {
  if (!row.expireDate) return null
  const end = new Date(`${row.expireDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

function expiryMeta(row) {
  const days = daysLeft(row)
  if (days == null) return { label: '长期有效', tag: 'success' }
  if (days < 0) return { label: `已过期 ${Math.abs(days)} 天`, tag: 'danger' }
  if (days <= 30) return { label: `剩余 ${days} 天`, tag: 'warning' }
  return { label: `${row.expireDate} 到期`, tag: 'success' }
}

function employeeName(row) {
  return row.employeeName ||
    employees.value.find(employee => employee.id === row.employeeId)?.name ||
    `员工 #${row.employeeId}`
}

function employeeNo(employeeId) {
  return employees.value.find(employee => employee.id === employeeId)?.empNo || '—'
}

function aircraftName(id) {
  if (!id) return '不限定机型'
  return aircraftTypes.value.find(type => type.id === id)?.typeName || `机型 #${id}`
}

function normalizeCode() {
  form.value.qualCode = form.value.qualCode.replace(/\s+/g, '').toUpperCase()
}

function disableExpireDate(date) {
  if (!form.value.issueDate) return false
  return date.getTime() < new Date(`${form.value.issueDate}T00:00:00`).getTime()
}

function createEmptyForm() {
  return {
    employeeId: null,
    qualType: 'AIRCRAFT_TYPE',
    aircraftTypeId: null,
    qualName: '',
    qualCode: '',
    issueDate: '',
    expireDate: '',
    status: 1
  }
}
</script>

<style scoped>
.qual-page {
  max-width: 1440px;
  margin: 0 auto;
}

.risk-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: var(--space-4);
}

.risk-grid article,
.risk-grid button {
  display: grid;
  gap: 6px;
  min-height: 112px;
  padding: 17px 18px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  color: inherit;
  background: var(--color-surface);
  text-align: left;
}

.risk-grid button {
  cursor: pointer;
  transition: border-color var(--transition-base), transform var(--transition-fast);
}

.risk-grid button:hover {
  border-color: var(--color-brand-300);
  transform: translateY(-1px);
}

.risk-grid button:active {
  transform: translateY(1px);
}

.risk-grid span,
.risk-grid small {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.risk-grid strong {
  color: var(--color-brand-900);
  font-size: 27px;
  font-variant-numeric: tabular-nums;
}

.risk-grid button:nth-child(3) strong {
  color: var(--color-warning);
}

.risk-grid__danger strong {
  color: var(--color-danger) !important;
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

.toolbar-card > :deep(.el-card__body) > span {
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
  display: block;
  color: var(--color-brand-900);
}

.cell-subtitle {
  display: block;
  margin-top: 4px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.permanent {
  color: var(--color-success);
}

.mobile-list {
  display: none;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--space-4);
}

@media (max-width: 900px) {
  .risk-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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

  .desktop-table {
    display: none;
  }

  .mobile-list {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .qual-card {
    padding: 16px;
    border: 1px solid var(--color-neutral-100);
    border-radius: var(--radius-md);
    background: var(--color-neutral-0);
  }

  .qual-card__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .qual-card__top > div {
    display: grid;
    gap: 5px;
  }

  .qual-card__top span {
    color: var(--color-neutral-500);
    font-size: var(--font-size-xs);
  }

  .qual-card__top strong {
    color: var(--color-brand-900);
  }

  .qual-card dl {
    display: grid;
    gap: 8px;
    margin: 15px 0;
  }

  .qual-card dl div {
    display: grid;
    grid-template-columns: 84px 1fr;
    gap: 8px;
  }

  .qual-card dt {
    color: var(--color-neutral-400);
    font-size: var(--font-size-xs);
  }

  .qual-card dd {
    margin: 0;
    color: var(--color-neutral-600);
    font-size: var(--font-size-sm);
  }

  .qual-card__actions {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--color-neutral-100);
    padding-top: 7px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
