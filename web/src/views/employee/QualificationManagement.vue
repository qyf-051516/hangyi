<template>
  <div class="qual-page">
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="6">
        <el-card shadow="never" class="stat-card" body-style="padding:16px">
          <div class="stat-value" style="color:#409eff">{{ totalCount }}</div>
          <div class="stat-label">总资质数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card" body-style="padding:16px">
          <div class="stat-value" style="color:#67c23a">{{ validCount }}</div>
          <div class="stat-label">有效</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card" body-style="padding:16px" @click="showExpiring = true" style="cursor:pointer">
          <div class="stat-value" style="color:#e6a23c">{{ expiringCount }}</div>
          <div class="stat-label">即将过期(30天内)</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card" body-style="padding:16px" @click="showExpired = true" style="cursor:pointer">
          <div class="stat-value" style="color:#f56c6c">{{ expiredCount }}</div>
          <div class="stat-label">已过期</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <el-form :inline="true" :model="query" size="default">
          <el-form-item label="员工">
            <el-select v-model="query.employeeId" placeholder="全部员工" filterable clearable style="width:200px">
              <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="fetchData">查询</el-button>
            <el-button @click="resetQuery">重置</el-button>
          </el-form-item>
        </el-form>
        <el-button type="primary" icon="Plus" @click="openAdd">新增资质</el-button>
      </div>

      <el-table :data="list" v-loading="loading" stripe style="width:100%">
        <el-table-column prop="qualName" label="资质名称" min-width="140" />
        <el-table-column label="资质类型" width="120">
          <template #default="{ row }">
            <el-tag :type="qualTypeTag(row.qualType)" size="small" effect="plain">
              {{ qualTypeLabel(row.qualType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="qualCode" label="资质编码" width="110" />
        <el-table-column label="发证日期" width="110">
          <template #default="{ row }">{{ row.issueDate || '-' }}</template>
        </el-table-column>
        <el-table-column label="有效期至" width="110">
          <template #default="{ row }">{{ row.expireDate || '长期' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="isExpired(row)" type="danger" size="small">已过期</el-tag>
            <el-tag v-else-if="isExpiring(row)" type="warning" size="small">即将过期</el-tag>
            <el-tag v-else type="success" size="small">有效</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.size"
        :total="total"
        layout="total, prev, pager, next"
        style="margin-top:16px; justify-content:flex-end"
        @current-change="fetchData"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑资质' : '新增资质'" width="550px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="员工" prop="employeeId">
          <el-select v-model="form.employeeId" placeholder="选择员工" filterable style="width:100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="资质类型" prop="qualType">
              <el-select v-model="form.qualType" style="width:100%">
                <el-option label="机型授权" value="AIRCRAFT_TYPE" />
                <el-option label="执照" value="LICENSE" />
                <el-option label="证书" value="CERT" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="关联机型" prop="aircraftTypeId">
              <el-select v-model="form.aircraftTypeId" placeholder="不指定" clearable style="width:100%">
                <el-option v-for="t in aircraftTypes" :key="t.id" :label="t.typeName" :value="t.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="资质名称" prop="qualName">
          <el-input v-model="form.qualName" placeholder="如：B737机型维护授权" />
        </el-form-item>
        <el-form-item label="资质编码" prop="qualCode">
          <el-input v-model="form.qualCode" placeholder="如：B737-LIC-001" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="发证日期">
              <el-date-picker v-model="form.issueDate" type="date" style="width:100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="有效期至">
              <el-date-picker v-model="form.expireDate" type="date" style="width:100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showExpiring" title="即将过期资质(30天内)" width="700px">
      <el-table :data="expiringList" stripe style="width:100%">
        <el-table-column prop="qualName" label="资质名称" />
        <el-table-column label="有效期至" width="120">
          <template #default="{ row }">{{ row.expireDate }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="showExpired" title="已过期资质" width="700px">
      <el-table :data="expiredList" stripe style="width:100%">
        <el-table-column prop="qualName" label="资质名称" />
        <el-table-column label="有效期至" width="120">
          <template #default="{ row }">{{ row.expireDate }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getEmployeePage } from '../../api/employee'
import {
  getQualificationPage, getQualificationExpiring,
  createQualification, updateQualification, deleteQualification,
  getAircraftTypeList
} from '../../api/employee'
import { ElMessage, ElMessageBox } from 'element-plus'

const query = ref({ page: 1, size: 20, employeeId: null })
const list = ref([])
const total = ref(0)
const loading = ref(false)
const employees = ref([])
const aircraftTypes = ref([])
const totalCount = ref(0)
const validCount = ref(0)
const expiringCount = ref(0)
const expiredCount = ref(0)

const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref({ employeeId: null, qualType: 'AIRCRAFT_TYPE', aircraftTypeId: null, qualName: '', qualCode: '', issueDate: '', expireDate: '' })

const showExpiring = ref(false)
const showExpired = ref(false)
const expiringList = ref([])
const expiredList = ref([])

const rules = {
  employeeId: [{ required: true, message: '请选择员工' }],
  qualType: [{ required: true, message: '请选择资质类型' }],
  qualName: [{ required: true, message: '请输入资质名称' }],
  qualCode: [{ required: true, message: '请输入资质编码' }],
}

onMounted(async () => {
  try {
    const res = await getEmployeePage({ page: 1, size: 200 })
    employees.value = res.data?.records || []
  } catch {}
  try {
    const res = await getAircraftTypeList()
    aircraftTypes.value = res.data || []
  } catch {}
  fetchData()
  fetchExpiringStats()
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getQualificationPage(query.value)
    list.value = res.data?.records || []
    total.value = res.data?.total || 0
  } catch {} finally { loading.value = false }
}

async function fetchExpiringStats() {
  try {
    const res = await getQualificationExpiring()
    const d = res.data || {}
    expiringList.value = d.expiringSoon || []
    expiredList.value = d.expired || []
    expiringCount.value = d.expiringCount || 0
    expiredCount.value = d.expiredCount || 0
  } catch {}
}

function resetQuery() {
  query.value = { page: 1, size: 20, employeeId: null }
  fetchData()
}

function qualTypeTag(t) {
  return t === 'AIRCRAFT_TYPE' ? 'primary' : t === 'LICENSE' ? 'success' : 'info'
}
function qualTypeLabel(t) {
  return t === 'AIRCRAFT_TYPE' ? '机型授权' : t === 'LICENSE' ? '执照' : '证书'
}
function isExpired(row) {
  return row.expireDate && row.expireDate < new Date().toISOString().slice(0, 10)
}
function isExpiring(row) {
  if (!row.expireDate || isExpired(row)) return false
  const d = new Date(row.expireDate)
  const now = new Date()
  return (d - now) / 86400000 <= 30
}

function openAdd() {
  isEdit.value = false
  form.value = { employeeId: null, qualType: 'AIRCRAFT_TYPE', aircraftTypeId: null, qualName: '', qualCode: '', issueDate: '', expireDate: '' }
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
      await updateQualification(form.value)
      ElMessage.success('更新成功')
    } else {
      await createQualification(form.value)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchData()
    fetchExpiringStats()
  } catch {} finally { saving.value = false }
}

function handleDelete(row) {
  ElMessageBox.confirm('确定删除该资质吗？', '提示', { type: 'warning' }).then(async () => {
    await deleteQualification(row.id)
    ElMessage.success('删除成功')
    fetchData()
    fetchExpiringStats()
  }).catch(() => {})
}
</script>

<style scoped>
.qual-page { max-width: 1100px; margin: 0 auto; }
.stat-card { border-radius: 10px; }
.stat-value { font-size: 28px; font-weight: 700; text-align: center; }
.stat-label { font-size: 13px; color: #8fa8c8; text-align: center; margin-top: 4px; }
.table-card { border-radius: 10px; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
</style>
