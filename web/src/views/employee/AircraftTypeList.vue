<template>
  <div class="type-page">
    <el-card shadow="never" class="page-card">
      <div class="toolbar">
        <span class="toolbar-title">机型列表</span>
        <el-button type="primary" icon="Plus" @click="openAdd">新增机型</el-button>
      </div>

      <el-table :data="list" v-loading="loading" stripe style="width:100%">
        <el-table-column prop="typeCode" label="机型编码" width="120" />
        <el-table-column prop="typeName" label="机型名称" width="180" />
        <el-table-column prop="manufacturer" label="制造商" width="160" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
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
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑机型' : '新增机型'" width="450px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="机型编码" prop="typeCode">
          <el-input v-model="form.typeCode" placeholder="如：B737" />
        </el-form-item>
        <el-form-item label="机型名称" prop="typeName">
          <el-input v-model="form.typeName" placeholder="如：波音737" />
        </el-form-item>
        <el-form-item label="制造商">
          <el-input v-model="form.manufacturer" placeholder="如：Boeing" />
        </el-form-item>
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
import { getAircraftTypeListAll, createAircraftType, updateAircraftType, deleteAircraftType } from '../../api/employee'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref({ typeCode: '', typeName: '', manufacturer: '' })
const rules = {
  typeCode: [{ required: true, message: '请输入机型编码' }],
  typeName: [{ required: true, message: '请输入机型名称' }],
}

onMounted(() => fetchData())

async function fetchData() {
  loading.value = true
  try {
    const res = await getAircraftTypeListAll()
    list.value = res.data || []
  } catch {} finally { loading.value = false }
}

function openAdd() {
  isEdit.value = false
  form.value = { typeCode: '', typeName: '', manufacturer: '' }
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
      await updateAircraftType(form.value)
      ElMessage.success('更新成功')
    } else {
      await createAircraftType(form.value)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {} finally { saving.value = false }
}

function handleDelete(row) {
  ElMessageBox.confirm('确定删除该机型吗？', '提示', { type: 'warning' }).then(async () => {
    await deleteAircraftType(row.id)
    ElMessage.success('删除成功')
    fetchData()
  }).catch(() => {})
}
</script>

<style scoped>
.type-page { max-width: 800px; margin: 0 auto; }
.page-card { border-radius: 10px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.toolbar-title { font-size: 15px; font-weight: 600; color: #2c3e50; }
</style>
