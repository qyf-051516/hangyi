<template>
  <div class="employee-page">
    <AppPageHeader
      title="人员管理"
      description="维护在岗人员、班组归属与岗位信息，为自动排班提供准确的人力基础。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">新增员工</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @keyup.enter="search" @submit.prevent>
        <el-form-item label="姓名">
          <el-input v-model.trim="query.name" placeholder="输入姓名搜索" clearable />
        </el-form-item>
        <el-form-item label="班组">
          <el-select
            v-model="query.groupId"
            placeholder="全部班组"
            clearable
            filterable
            style="width: 170px"
          >
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.groupName"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
      <span class="toolbar-meta">在册 {{ total }} 人</span>
    </el-card>

    <el-card shadow="never" class="data-card">
      <AppPageState
        v-if="loading && list.length === 0"
        type="loading"
        title="正在加载人员信息"
      />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="人员信息加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        title="当前筛选下没有人员"
        :description="hasFilters ? '调整姓名或班组条件后再试。' : '先添加人员，后续才能维护资质并生成排班。'"
        :action-label="hasFilters ? '清除筛选' : '新增第一位员工'"
        @action="hasFilters ? reset() : openCreate()"
      />
      <template v-else>
        <div class="employee-table table-scroll">
          <el-table :data="list" stripe v-loading="loading" style="min-width: 1040px">
            <el-table-column prop="empNo" label="工号" width="110" />
            <el-table-column label="姓名" width="110">
              <template #default="{ row }">
                <strong class="employee-name">{{ row.name }}</strong>
              </template>
            </el-table-column>
            <el-table-column prop="groupName" label="班组" min-width="110">
              <template #default="{ row }">{{ row.groupName || '未分组' }}</template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" min-width="132">
              <template #default="{ row }">{{ row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column prop="position" label="岗位" min-width="110">
              <template #default="{ row }">{{ row.position || '—' }}</template>
            </el-table-column>
            <el-table-column prop="jobTitle" label="职称" min-width="100">
              <template #default="{ row }">{{ row.jobTitle || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="88">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" effect="light">
                  {{ row.status === 1 ? '在职' : '离职' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="hireDate" label="入职日期" width="118">
              <template #default="{ row }">{{ row.hireDate || '—' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="132" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="employee-cards">
          <article v-for="employee in list" :key="employee.id" class="employee-card">
            <div class="employee-card__head">
              <div>
                <strong>{{ employee.name }}</strong>
                <span>{{ employee.empNo }}</span>
              </div>
              <el-tag :type="employee.status === 1 ? 'success' : 'info'" effect="light">
                {{ employee.status === 1 ? '在职' : '离职' }}
              </el-tag>
            </div>
            <dl>
              <div><dt>班组</dt><dd>{{ employee.groupName || '未分组' }}</dd></div>
              <div><dt>岗位</dt><dd>{{ employee.position || '—' }}</dd></div>
              <div><dt>手机号</dt><dd>{{ employee.phone || '—' }}</dd></div>
              <div><dt>入职日期</dt><dd>{{ employee.hireDate || '—' }}</dd></div>
            </dl>
            <div class="employee-card__actions">
              <el-button @click="openEdit(employee)">编辑</el-button>
              <el-button type="danger" plain @click="handleDelete(employee)">删除</el-button>
            </div>
          </article>
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
      :title="isEdit ? '编辑员工' : '新增员工'"
      width="620px"
      destroy-on-close
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="工号" prop="empNo">
            <el-input v-model.trim="form.empNo" maxlength="50" placeholder="如 HY-001" />
          </el-form-item>
          <el-form-item label="姓名" prop="name">
            <el-input v-model.trim="form.name" maxlength="50" placeholder="请输入姓名" />
          </el-form-item>
          <el-form-item label="所属班组" prop="groupId">
            <el-select
              v-model="form.groupId"
              placeholder="请选择班组"
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="group in groups"
                :key="group.id"
                :label="group.groupName"
                :value="group.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="手机号" prop="phone">
            <el-input v-model.trim="form.phone" maxlength="20" placeholder="请输入手机号" />
          </el-form-item>
          <el-form-item label="岗位">
            <el-input v-model.trim="form.position" maxlength="50" placeholder="如 机务工程师" />
          </el-form-item>
          <el-form-item label="职称">
            <el-input v-model.trim="form.jobTitle" maxlength="50" placeholder="选填" />
          </el-form-item>
          <el-form-item label="入职日期">
            <el-date-picker
              v-model="form.hireDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择入职日期"
              style="width: 100%"
              :disabled-date="disableFutureDate"
            />
          </el-form-item>
          <el-form-item label="人员状态">
            <el-radio-group v-model="form.status">
              <el-radio :value="1">在职</el-radio>
              <el-radio :value="0">离职</el-radio>
            </el-radio-group>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建员工' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createEmployee,
  deleteEmployee,
  getEmployeePage,
  getGroupList,
  updateEmployee
} from '../../api/employee'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const groups = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)

const query = reactive({ page: 1, size: 10, name: '', groupId: null })
const form = reactive(createEmptyForm())
const hasFilters = computed(() => Boolean(query.name || query.groupId))

const rules = {
  empNo: [{ required: true, message: '请输入员工工号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入员工姓名', trigger: 'blur' }],
  groupId: [{ required: true, message: '请选择所属班组', trigger: 'change' }],
  phone: [
    {
      validator: (_rule, value, callback) => {
        const isMaskedPhone = /^\d{3}\*{4}\d{4}$/.test(value || '')
        if (value && !isMaskedPhone && !/^[+\d][\d\s-]{6,19}$/.test(value)) {
          callback(new Error('请输入有效的手机号'))
          return
        }
        callback()
      },
      trigger: 'blur'
    }
  ]
}

onMounted(() => {
  fetchData()
  loadGroups()
})

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getEmployeePage({ ...query }, { silent: true })
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

async function loadGroups() {
  try {
    const res = await getGroupList({}, { silent: true })
    groups.value = Array.isArray(res.data) ? res.data : []
  } catch {
    groups.value = []
  }
}

function search() {
  query.page = 1
  fetchData()
}

function reset() {
  query.name = ''
  query.groupId = null
  search()
}

function handleSizeChange() {
  query.page = 1
  fetchData()
}

function openCreate() {
  isEdit.value = false
  Object.assign(form, createEmptyForm())
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  Object.assign(form, createEmptyForm(), row)
  dialogVisible.value = true
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `删除后将无法继续为“${row.name}”安排新班次，确认删除？`,
      '删除员工',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    await deleteEmployee(row.id)
    ElMessage.success('员工已删除')
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
    const payload = { ...form }
    if (isEdit.value) {
      await updateEmployee(payload)
      ElMessage.success('员工信息已更新')
    } else {
      await createEmployee(payload)
      ElMessage.success('员工已创建')
    }
    dialogVisible.value = false
    await fetchData()
  } catch {
    // 请求层已展示明确错误。
  } finally {
    saving.value = false
  }
}

function disableFutureDate(date) {
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  return date.getTime() >= tomorrow.getTime()
}

function createEmptyForm() {
  return {
    id: null,
    empNo: '',
    name: '',
    phone: '',
    groupId: null,
    position: '',
    jobTitle: '',
    hireDate: '',
    status: 1
  }
}
</script>

<style scoped>
.employee-page {
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

.employee-cards {
  display: none;
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
  .toolbar-card :deep(.el-select) {
    width: 100% !important;
  }

  .employee-table {
    display: none;
  }

  .employee-cards {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
  }

  .employee-card {
    padding: 16px;
    border: 1px solid var(--color-neutral-200);
    border-radius: var(--radius-lg);
    background: var(--color-neutral-0);
  }

  .employee-card__head,
  .employee-card__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .employee-card__head div {
    display: grid;
    gap: 3px;
  }

  .employee-card__head strong {
    color: var(--color-brand-900);
    font-size: var(--font-size-lg);
  }

  .employee-card__head span {
    color: var(--color-neutral-500);
    font: 500 11px/1 var(--font-family-mono);
  }

  .employee-card dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 18px 0;
  }

  .employee-card dl div {
    min-width: 0;
  }

  .employee-card dt {
    margin-bottom: 3px;
    color: var(--color-neutral-500);
    font-size: var(--font-size-xs);
  }

  .employee-card dd {
    margin: 0;
    overflow: hidden;
    color: var(--color-neutral-700);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .employee-card__actions :deep(.el-button) {
    flex: 1;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
