<template>
  <div class="group-page">
    <AppPageHeader
      title="班组管理"
      description="维护人员组织边界和业务类型，确保排班范围与管理责任清晰。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">新增班组</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="data-card">
      <template #header>
        <div class="section-heading">
          <div>
            <strong>班组列表</strong>
            <span>共 {{ list.length }} 个班组</span>
          </div>
          <el-button text :loading="loading" @click="fetchData">刷新</el-button>
        </div>
      </template>

      <AppPageState v-if="loading && list.length === 0" type="loading" title="正在加载班组" />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="班组加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        title="还没有班组"
        description="创建班组后，人员、资质和排班可以按组织范围管理。"
        action-label="创建第一个班组"
        @action="openCreate"
      />
      <div v-else class="table-scroll">
        <el-table :data="list" stripe v-loading="loading" style="min-width: 720px">
          <el-table-column prop="groupCode" label="班组编码" width="130">
            <template #default="{ row }">
              <span class="code-text">{{ row.groupCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="groupName" label="班组名称" min-width="160">
            <template #default="{ row }">
              <strong class="group-name">{{ row.groupName }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="业务类型" width="120">
            <template #default="{ row }">
              <el-tag effect="light">{{ typeMap[row.groupType] || row.groupType }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="职责说明" min-width="260">
            <template #default="{ row }">{{ row.description || '暂无说明' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="132" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑班组' : '新增班组'"
      width="500px"
      destroy-on-close
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="班组编码" prop="groupCode">
            <el-input
              v-model.trim="form.groupCode"
              maxlength="50"
              placeholder="如 MX-A"
            />
          </el-form-item>
          <el-form-item label="班组名称" prop="groupName">
            <el-input
              v-model.trim="form.groupName"
              maxlength="50"
              placeholder="如 机务一组"
            />
          </el-form-item>
        </div>
        <el-form-item label="业务类型" prop="groupType">
          <el-select v-model="form.groupType" placeholder="请选择业务类型" style="width: 100%">
            <el-option label="机务" value="MAINTENANCE" />
            <el-option label="地勤" value="GROUND" />
            <el-option label="安检" value="SECURITY" />
          </el-select>
        </el-form-item>
        <el-form-item label="职责说明">
          <el-input
            v-model.trim="form.description"
            type="textarea"
            :rows="4"
            maxlength="200"
            show-word-limit
            placeholder="简要说明该班组的职责范围"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建班组' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createGroup, deleteGroup, getGroupList, updateGroup } from '../../api/employee'

const list = ref([])
const loading = ref(false)
const loadError = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = reactive(createEmptyForm())

const typeMap = { MAINTENANCE: '机务', GROUND: '地勤', SECURITY: '安检' }
const rules = {
  groupCode: [{ required: true, message: '请输入班组编码', trigger: 'blur' }],
  groupName: [{ required: true, message: '请输入班组名称', trigger: 'blur' }],
  groupType: [{ required: true, message: '请选择业务类型', trigger: 'change' }]
}

onMounted(fetchData)

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getGroupList({}, { silent: true })
    list.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    list.value = []
    loadError.value = error?.message || '请检查人员服务后重试'
  } finally {
    loading.value = false
  }
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
      `确认删除“${row.groupName}”？请先确保没有人员仍归属该班组。`,
      '删除班组',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    await deleteGroup(row.id)
    ElMessage.success('班组已删除')
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
      await updateGroup(payload)
      ElMessage.success('班组信息已更新')
    } else {
      await createGroup(payload)
      ElMessage.success('班组已创建')
    }
    dialogVisible.value = false
    await fetchData()
  } catch {
    // 请求层已展示明确错误。
  } finally {
    saving.value = false
  }
}

function createEmptyForm() {
  return {
    id: null,
    groupCode: '',
    groupName: '',
    groupType: '',
    description: '',
    status: 1
  }
}
</script>

<style scoped>
.group-page {
  max-width: 1200px;
  margin: 0 auto;
}

.data-card :deep(.el-card__body) {
  padding: 0 !important;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.section-heading div {
  display: grid;
  gap: 3px;
}

.section-heading strong,
.group-name {
  color: var(--color-brand-900);
  font-weight: var(--font-weight-semi);
}

.section-heading span {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.code-text {
  color: var(--color-brand-600);
  font: 500 12px/1 var(--font-family-mono);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
