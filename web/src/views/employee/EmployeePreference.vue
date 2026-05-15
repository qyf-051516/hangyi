<template>
  <div class="pref-page">
    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <el-form :inline="true" size="default">
          <el-form-item label="员工">
            <el-select v-model="employeeId" placeholder="选择员工" filterable style="width:220px" @change="fetchData">
              <el-option v-for="e in employees" :key="e.id" :label="`${e.name} (${e.empNo})`" :value="e.id" />
            </el-select>
          </el-form-item>
        </el-form>
        <el-button v-if="employeeId" type="primary" icon="Plus" @click="openAdd">新增偏好</el-button>
      </div>

      <div v-if="!employeeId" style="text-align:center; padding:60px 0; color:#8fa8c8">
        请先选择一名员工查看其排班偏好
      </div>

      <template v-else>
        <el-table :data="list" v-loading="loading" stripe style="width:100%">
          <el-table-column label="偏好类型" width="120">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="row.prefType === 'SHIFT' ? 'primary' : 'success'">
                {{ row.prefType === 'SHIFT' ? '班次偏好' : row.prefType === 'TIME' ? '时间段偏好' : row.prefType }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="prefKey" label="偏好项" width="150" />
          <el-table-column prop="prefValue" label="偏好值" width="150" />
          <el-table-column prop="priority" label="优先级" width="80" />
          <el-table-column label="生效日期" width="110">
            <template #default="{ row }">{{ row.effectiveFrom || '-' }}</template>
          </el-table-column>
          <el-table-column label="失效日期" width="110">
            <template #default="{ row }">{{ row.effectiveTo || '长期' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                {{ row.status === 1 ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && list.length === 0" description="该员工暂无排班偏好" />
      </template>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑偏好' : '新增偏好'" width="550px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="偏好类型" prop="prefType">
          <el-select v-model="form.prefType" style="width:100%">
            <el-option label="班次偏好" value="SHIFT" />
            <el-option label="时间段偏好" value="TIME" />
            <el-option label="休息偏好" value="REST" />
            <el-option label="其他" value="OTHER" />
          </el-select>
        </el-form-item>
        <el-form-item label="偏好项" prop="prefKey">
          <el-input v-model="form.prefKey" placeholder="如：期望班次、期望时间段" />
        </el-form-item>
        <el-form-item label="偏好值" prop="prefValue">
          <el-input v-model="form.prefValue" placeholder="如：早班、09:00-17:00" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="优先级" prop="priority">
              <el-input-number v-model="form.priority" :min="1" :max="99" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="生效日期">
              <el-date-picker v-model="form.effectiveFrom" type="date" style="width:100%" value-format="YYYY-MM-DD" placeholder="立即生效" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="失效日期">
              <el-date-picker v-model="form.effectiveTo" type="date" style="width:100%" value-format="YYYY-MM-DD" placeholder="长期有效" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getEmployeePage, getEmployeePreferences, createEmployeePreference, updateEmployeePreference, deleteEmployeePreference } from '../../api/employee'
import { ElMessage, ElMessageBox } from 'element-plus'

const employeeId = ref(null)
const employees = ref([])
const list = ref([])
const loading = ref(false)

const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref({
  employeeId: null, prefType: 'SHIFT', prefKey: '', prefValue: '',
  priority: 5, effectiveFrom: '', effectiveTo: '', status: 1
})

const rules = {
  prefType: [{ required: true, message: '请选择偏好类型' }],
  prefKey: [{ required: true, message: '请输入偏好项' }],
  prefValue: [{ required: true, message: '请输入偏好值' }],
}

onMounted(async () => {
  try {
    const res = await getEmployeePage({ page: 1, size: 200 })
    employees.value = res.data?.records || []
  } catch {}
})

async function fetchData() {
  if (!employeeId.value) return
  loading.value = true
  try {
    const res = await getEmployeePreferences(employeeId.value)
    list.value = res.data || []
  } catch {} finally { loading.value = false }
}

function openAdd() {
  isEdit.value = false
  form.value = { employeeId: employeeId.value, prefType: 'SHIFT', prefKey: '', prefValue: '', priority: 5, effectiveFrom: '', effectiveTo: '', status: 1 }
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => {})
  if (!valid) return
  saving.value = true
  try {
    if (isEdit.value) {
      await updateEmployeePreference(form.value)
      ElMessage.success('更新成功')
    } else {
      await createEmployeePreference(form.value)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {} finally { saving.value = false }
}

function handleDelete(row) {
  ElMessageBox.confirm('确定删除该偏好吗？', '提示', { type: 'warning' }).then(async () => {
    await deleteEmployeePreference(row.id)
    ElMessage.success('删除成功')
    fetchData()
  }).catch(() => {})
}
</script>

<style scoped>
.pref-page { max-width: 1100px; margin: 0 auto; }
.table-card { border-radius: 10px; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
</style>
