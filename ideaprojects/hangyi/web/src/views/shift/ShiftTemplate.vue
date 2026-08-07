<template>
  <div class="shift-page">
    <AppPageHeader
      title="班次模板"
      description="统一维护早、中、晚班和备勤时段，自动排班会直接引用这些模板。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">新增班次</el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="data-card">
      <template #header>
        <div class="section-heading">
          <div>
            <strong>可用班次</strong>
            <span>共 {{ list.length }} 个模板，跨午夜班次支持结束时间早于开始时间。</span>
          </div>
          <el-button text :loading="loading" @click="fetchData">刷新</el-button>
        </div>
      </template>

      <AppPageState v-if="loading && list.length === 0" type="loading" title="正在加载班次模板" />
      <AppPageState
        v-else-if="loadError"
        type="error"
        title="班次模板加载失败"
        :description="loadError"
        action-label="重新加载"
        @action="fetchData"
      />
      <AppPageState
        v-else-if="list.length === 0"
        title="还没有班次模板"
        description="先创建基础班次，才能生成完整排班。"
        action-label="创建第一个班次"
        @action="openCreate"
      />
      <template v-else>
        <div class="shift-table table-scroll">
          <el-table :data="list" stripe v-loading="loading" style="min-width: 760px">
            <el-table-column label="班次" min-width="180">
              <template #default="{ row }">
                <div class="shift-identity">
                  <i :style="{ background: normalizeColor(row.color) }" />
                  <div>
                    <strong>{{ row.shiftName }}</strong>
                    <span>{{ row.shiftCode }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="时间范围" min-width="170">
              <template #default="{ row }">
                <span class="time-range">
                  {{ formatTime(row.startTime) }} — {{ formatTime(row.endTime) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="班次类型" width="110">
              <template #default="{ row }">
                <el-tag effect="light">{{ typeMap[row.shiftType] || row.shiftType || '未分类' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="资质要求" width="110">
              <template #default="{ row }">
                {{ Number(row.requireQualification) === 1 ? '需要资质' : '无需资质' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="88">
              <template #default="{ row }">
                <el-tag :type="row.status === 0 ? 'info' : 'success'" effect="light">
                  {{ row.status === 0 ? '停用' : '启用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="132" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="shift-cards">
          <article v-for="shift in list" :key="shift.id">
            <div class="shift-card__head">
              <span class="shift-card__color" :style="{ background: normalizeColor(shift.color) }" />
              <div>
                <strong>{{ shift.shiftName }}</strong>
                <small>{{ shift.shiftCode }} · {{ typeMap[shift.shiftType] || shift.shiftType }}</small>
              </div>
              <el-tag :type="shift.status === 0 ? 'info' : 'success'" effect="light">
                {{ shift.status === 0 ? '停用' : '启用' }}
              </el-tag>
            </div>
            <b>{{ formatTime(shift.startTime) }} — {{ formatTime(shift.endTime) }}</b>
            <span>{{ Number(shift.requireQualification) === 1 ? '需要资质' : '无需资质' }}</span>
            <div class="shift-card__actions">
              <el-button @click="openEdit(shift)">编辑</el-button>
              <el-button type="danger" plain @click="handleDelete(shift)">删除</el-button>
            </div>
          </article>
        </div>
      </template>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑班次' : '新增班次'"
      width="540px"
      destroy-on-close
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="班次编码" prop="shiftCode">
            <el-input v-model.trim="form.shiftCode" maxlength="50" placeholder="如 MORNING" />
          </el-form-item>
          <el-form-item label="班次名称" prop="shiftName">
            <el-input v-model.trim="form.shiftName" maxlength="50" placeholder="如 早班" />
          </el-form-item>
          <el-form-item label="开始时间" prop="startTime">
            <el-time-picker
              v-model="form.startTime"
              format="HH:mm"
              value-format="HH:mm:ss"
              placeholder="选择开始时间"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="结束时间" prop="endTime">
            <el-time-picker
              v-model="form.endTime"
              format="HH:mm"
              value-format="HH:mm:ss"
              placeholder="选择结束时间"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="班次类型" prop="shiftType">
            <el-select v-model="form.shiftType" style="width: 100%">
              <el-option label="早班" value="MORNING" />
              <el-option label="中班" value="AFTERNOON" />
              <el-option label="晚班" value="NIGHT" />
              <el-option label="备勤" value="STANDBY" />
              <el-option label="休息" value="REST" />
            </el-select>
          </el-form-item>
          <el-form-item label="识别颜色">
            <div class="color-field">
              <el-color-picker v-model="form.color" />
              <span>{{ form.color }}</span>
            </div>
          </el-form-item>
        </div>
        <div class="switch-row">
          <div>
            <strong>要求专业资质</strong>
            <span>启用后仅会安排具备匹配资质的员工。</span>
          </div>
          <el-switch
            v-model="form.requireQualification"
            :active-value="1"
            :inactive-value="0"
          />
        </div>
        <div class="switch-row">
          <div>
            <strong>启用班次</strong>
            <span>停用后保留历史数据，但不再用于新排班。</span>
          </div>
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建班次' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createShift, deleteShift, getShiftList, updateShift } from '../../api/shift'

const list = ref([])
const loading = ref(false)
const loadError = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = reactive(createEmptyForm())

const typeMap = {
  MORNING: '早班',
  AFTERNOON: '中班',
  NIGHT: '晚班',
  STANDBY: '备勤',
  REST: '休息',
  DAY: '日班'
}

const rules = {
  shiftCode: [{ required: true, message: '请输入班次编码', trigger: 'blur' }],
  shiftName: [{ required: true, message: '请输入班次名称', trigger: 'blur' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  endTime: [{ required: true, message: '请选择结束时间', trigger: 'change' }],
  shiftType: [{ required: true, message: '请选择班次类型', trigger: 'change' }]
}

onMounted(fetchData)

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getShiftList({ silent: true })
    list.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    list.value = []
    loadError.value = error?.message || '请检查排班服务后重试'
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
      `确认删除“${row.shiftName}”？已引用该模板的历史排班不会自动调整。`,
      '删除班次',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    await deleteShift(row.id)
    ElMessage.success('班次模板已删除')
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
      await updateShift(payload)
      ElMessage.success('班次模板已更新')
    } else {
      await createShift(payload)
      ElMessage.success('班次模板已创建')
    }
    dialogVisible.value = false
    await fetchData()
  } catch {
    // 请求层已展示明确错误。
  } finally {
    saving.value = false
  }
}

function formatTime(value) {
  return String(value || '—').slice(0, 5)
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#5C7BAA'
}

function createEmptyForm() {
  return {
    id: null,
    shiftCode: '',
    shiftName: '',
    startTime: '',
    endTime: '',
    shiftType: 'MORNING',
    color: '#5C7BAA',
    requireQualification: 0,
    status: 1
  }
}
</script>

<style scoped>
.shift-page {
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

.section-heading strong {
  color: var(--color-brand-900);
}

.section-heading span {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.shift-identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.shift-identity > i {
  width: 8px;
  height: 34px;
  border-radius: 3px;
}

.shift-identity div {
  display: grid;
  gap: 3px;
}

.shift-identity strong {
  color: var(--color-brand-900);
  font-weight: var(--font-weight-semi);
}

.shift-identity span,
.time-range {
  color: var(--color-neutral-500);
  font: 500 12px/1.4 var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}

.shift-cards {
  display: none;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--space-5);
}

.color-field {
  display: flex;
  align-items: center;
  min-height: 32px;
  gap: var(--space-3);
  color: var(--color-neutral-500);
  font: 500 12px/1 var(--font-family-mono);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 14px 0;
  border-top: 1px solid var(--color-neutral-100);
}

.switch-row div {
  display: grid;
  gap: 3px;
}

.switch-row strong {
  color: var(--color-brand-900);
  font-size: var(--font-size-sm);
}

.switch-row span {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

@media (max-width: 767px) {
  .shift-table {
    display: none;
  }

  .shift-cards {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
  }

  .shift-cards article {
    display: grid;
    gap: var(--space-3);
    padding: 16px;
    border: 1px solid var(--color-neutral-200);
    border-radius: var(--radius-lg);
    background: var(--color-neutral-0);
  }

  .shift-card__head {
    display: grid;
    grid-template-columns: 8px 1fr auto;
    align-items: center;
    gap: var(--space-3);
  }

  .shift-card__head div {
    display: grid;
    gap: 3px;
  }

  .shift-card__head strong {
    color: var(--color-brand-900);
  }

  .shift-card__head small,
  .shift-cards article > span {
    color: var(--color-neutral-500);
  }

  .shift-card__color {
    width: 8px;
    height: 38px;
    border-radius: 3px;
  }

  .shift-cards article > b {
    color: var(--color-brand-800);
    font: 600 18px/1.2 var(--font-family-mono);
  }

  .shift-card__actions {
    display: flex;
    gap: var(--space-2);
  }

  .shift-card__actions :deep(.el-button) {
    flex: 1;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
