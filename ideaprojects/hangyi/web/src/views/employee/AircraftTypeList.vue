<template>
  <div class="type-page">
    <AppPageHeader
      title="机型管理"
      description="维护航班计划和人员资质共同使用的机型基础数据。"
    >
      <template #actions>
        <el-button v-if="canManage" type="primary" @click="openAdd">新增机型</el-button>
      </template>
    </AppPageHeader>

    <section class="type-summary" aria-label="机型数据摘要">
      <div><span>全部机型</span><strong>{{ list.length }}</strong></div>
      <div><span>当前启用</span><strong>{{ activeCount }}</strong></div>
      <p>停用机型不会出现在新的航班计划选项中，既有记录仍会保留。</p>
    </section>

    <el-card shadow="never" class="data-card">
      <div class="data-heading">
        <div>
          <h2>机型目录</h2>
          <p>编码统一使用大写字母与数字，便于航班数据匹配。</p>
        </div>
        <el-button :loading="loading" @click="fetchData">刷新</el-button>
      </div>

      <AppPageState
        v-if="loading && list.length === 0"
        type="loading"
        title="正在加载机型目录"
      />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="机型目录加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        title="还没有机型数据"
        description="新增首个机型后，可在航班计划和人员资质中直接选择。"
        :action-label="canManage ? '新增首个机型' : ''"
        @action="openAdd"
      />
      <template v-else>
        <div class="table-scroll desktop-table">
          <el-table :data="list" stripe v-loading="loading" style="min-width: 720px">
            <el-table-column label="机型" min-width="190">
              <template #default="{ row }">
                <div class="type-name">
                  <strong>{{ row.typeCode }}</strong>
                  <span>{{ row.typeName }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="manufacturer" label="制造商" min-width="160">
              <template #default="{ row }">{{ row.manufacturer || '未填写' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" effect="light">
                  {{ row.status === 1 ? '启用' : '停用' }}
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
          <article v-for="row in list" :key="row.id" class="type-card">
            <div>
              <span class="type-code">{{ row.typeCode }}</span>
              <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                {{ row.status === 1 ? '启用' : '停用' }}
              </el-tag>
            </div>
            <h3>{{ row.typeName }}</h3>
            <p>{{ row.manufacturer || '未填写制造商' }}</p>
            <div v-if="canManage" class="type-card__actions">
              <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click="handleDelete(row)">删除</el-button>
            </div>
          </article>
        </div>
      </template>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑机型' : '新增机型'"
      width="480px"
      destroy-on-close
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="机型编码" prop="typeCode">
          <el-input
            v-model.trim="form.typeCode"
            maxlength="20"
            placeholder="例如 B737"
            @blur="normalizeCode"
          />
        </el-form-item>
        <el-form-item label="机型名称" prop="typeName">
          <el-input v-model.trim="form.typeName" maxlength="100" placeholder="例如 波音 737-800" />
        </el-form-item>
        <el-form-item label="制造商">
          <el-input v-model.trim="form.manufacturer" maxlength="100" placeholder="例如 Boeing" />
        </el-form-item>
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
        <el-button type="primary" :loading="saving" @click="handleSave">保存机型</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createAircraftType,
  deleteAircraftType,
  getAircraftTypeListAll,
  updateAircraftType
} from '../../api/employee'
import { useUserStore } from '../../store/user'

const userStore = useUserStore()
const list = ref([])
const loading = ref(false)
const loadError = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref(createEmptyForm())
const canManage = computed(() => userStore.hasAnyRole('ADMIN'))
const activeCount = computed(() => list.value.filter(item => item.status === 1).length)

const rules = {
  typeCode: [
    { required: true, message: '请输入机型编码', trigger: 'blur' },
    {
      pattern: /^[A-Z0-9-]+$/,
      message: '编码仅支持大写字母、数字和连字符',
      trigger: 'blur'
    }
  ],
  typeName: [{ required: true, message: '请输入机型名称', trigger: 'blur' }]
}

onMounted(fetchData)

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAircraftTypeListAll({ silent: true })
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
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  form.value = { ...row, status: row.status ?? 1 }
  dialogVisible.value = true
}

async function handleSave() {
  normalizeCode()
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || saving.value) return

  saving.value = true
  try {
    const action = isEdit.value ? updateAircraftType : createAircraftType
    await action({ ...form.value })
    ElMessage.success(isEdit.value ? '机型信息已更新' : '机型已新增')
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
      `删除机型 ${row.typeCode} 后，已有业务数据可能无法继续关联该机型。`,
      '确认删除机型',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    await deleteAircraftType(row.id)
    ElMessage.success('机型已删除')
    await fetchData()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
  }
}

function normalizeCode() {
  form.value.typeCode = form.value.typeCode.replace(/\s+/g, '').toUpperCase()
}

function createEmptyForm() {
  return { typeCode: '', typeName: '', manufacturer: '', status: 1 }
}
</script>

<style scoped>
.type-page {
  max-width: 1200px;
  margin: 0 auto;
}

.type-summary {
  display: grid;
  grid-template-columns: 150px 150px 1fr;
  margin-bottom: var(--space-4);
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.type-summary > div {
  display: grid;
  gap: 7px;
  padding: 16px 20px;
  border-right: 1px solid var(--color-neutral-200);
}

.type-summary span,
.type-summary p {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.type-summary strong {
  color: var(--color-brand-900);
  font-size: 25px;
  font-variant-numeric: tabular-nums;
}

.type-summary p {
  align-self: center;
  margin: 0;
  padding: 0 22px;
  line-height: 1.6;
}

.data-card :deep(.el-card__body) {
  padding: 0 !important;
}

.data-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.data-heading h2 {
  color: var(--color-brand-900);
  font-size: var(--font-size-lg);
}

.data-heading p {
  margin: 5px 0 0;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.type-name {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.type-name strong,
.type-code {
  color: var(--color-brand-800);
  font-family: var(--font-family-mono);
}

.type-name span {
  color: var(--color-neutral-600);
}

.mobile-list {
  display: none;
}

@media (max-width: 767px) {
  .type-summary {
    grid-template-columns: 1fr 1fr;
  }

  .type-summary > div:nth-child(2) {
    border-right: 0;
  }

  .type-summary p {
    grid-column: 1 / -1;
    padding-block: 14px;
    border-top: 1px solid var(--color-neutral-200);
  }

  .desktop-table {
    display: none;
  }

  .mobile-list {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .type-card {
    padding: 16px;
    border: 1px solid var(--color-neutral-100);
    border-radius: var(--radius-md);
    background: var(--color-neutral-0);
  }

  .type-card > div:first-child,
  .type-card__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .type-card h3 {
    margin-top: 12px;
    font-size: var(--font-size-lg);
  }

  .type-card p {
    margin: 5px 0 12px;
    color: var(--color-neutral-500);
    font-size: var(--font-size-sm);
  }

  .type-card__actions {
    justify-content: flex-end;
    border-top: 1px solid var(--color-neutral-100);
    padding-top: 8px;
  }
}
</style>
