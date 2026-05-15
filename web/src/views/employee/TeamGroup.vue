<template>
  <div>
    <h3 class="page-heading">班组管理</h3>

    <el-card shadow="hover">
      <el-button type="success" style="margin-bottom: 16px" @click="showAdd = true">新增班组</el-button>

      <el-table :data="list" border stripe>
        <el-table-column prop="groupCode" label="班组编码" width="140" />
        <el-table-column prop="groupName" label="班组名称" width="200" />
        <el-table-column label="班组类型" width="120">
          <template #default="{ row }">
            <el-tag>{{ typeMap[row.groupType] || row.groupType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="edit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAdd" :title="isEdit ? '编辑班组' : '新增班组'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="班组编码" prop="groupCode">
          <el-input v-model="form.groupCode" />
        </el-form-item>
        <el-form-item label="班组名称" prop="groupName">
          <el-input v-model="form.groupName" />
        </el-form-item>
        <el-form-item label="班组类型">
          <el-select v-model="form.groupType" style="width: 100%">
            <el-option label="机务" value="MAINTENANCE" />
            <el-option label="地勤" value="GROUND" />
            <el-option label="安检" value="SECURITY" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getGroupList, createGroup, updateGroup, deleteGroup } from '../../api/employee'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const showAdd = ref(false)
const isEdit = ref(false)

const typeMap = { MAINTENANCE: '机务', GROUND: '地勤', SECURITY: '安检' }

const form = reactive({ id: null, groupCode: '', groupName: '', groupType: '', description: '' })

onMounted(() => fetchData())

async function fetchData() {
  const res = await getGroupList()
  list.value = res.data
}

function edit(row) {
  Object.assign(form, row)
  isEdit.value = true
  showAdd.value = true
}

async function handleDelete(id) {
  await ElMessageBox.confirm('确定删除该班组？')
  await deleteGroup(id)
  ElMessage.success('删除成功')
  fetchData()
}

async function handleSave() {
  if (isEdit.value) {
    await updateGroup(form)
  } else {
    await createGroup(form)
  }
  ElMessage.success('保存成功')
  showAdd.value = false
  fetchData()
}
</script>
