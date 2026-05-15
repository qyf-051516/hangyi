<template>
  <div>
    <h3 class="page-heading">人员管理</h3>

    <el-card shadow="hover">
      <el-form :inline="true" @keyup.enter="search">
        <el-form-item label="姓名">
          <el-input v-model="query.name" placeholder="搜索姓名" clearable />
        </el-form-item>
        <el-form-item label="班组">
          <el-select v-model="query.groupId" placeholder="选择班组" clearable style="width: 160px">
            <el-option v-for="g in groups" :key="g.id" :label="g.groupName" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
          <el-button type="success" @click="showAdd = true">新增员工</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" style="margin-top: 16px">
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="empNo" label="工号" width="120" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="position" label="岗位" width="120" />
        <el-table-column prop="jobTitle" label="职称" width="100" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? '在职' : '离职' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="hireDate" label="入职日期" width="120" />
        <el-table-column label="操作" min-width="180">
          <template #default="{ row }">
            <el-button size="small" @click="edit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.size"
        :total="total"
        layout="total, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end"
        @current-change="fetchData"
      />
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="showAdd" :title="isEdit ? '编辑员工' : '新增员工'" width="600px">
      <el-form ref="formRef" :model="form" label-width="100px">
        <el-form-item label="工号" prop="empNo">
          <el-input v-model="form.empNo" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="所属班组">
          <el-select v-model="form.groupId" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.groupName" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位">
          <el-input v-model="form.position" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">在职</el-radio>
            <el-radio :value="3">离职</el-radio>
          </el-radio-group>
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
import { getEmployeePage, createEmployee, updateEmployee, deleteEmployee, getGroupList } from '../../api/employee'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const groups = ref([])
const showAdd = ref(false)
const isEdit = ref(false)

const query = reactive({ page: 1, size: 20, name: '', groupId: null })
const form = reactive({ id: null, empNo: '', name: '', phone: '', groupId: null, position: '', status: 1 })

onMounted(() => {
  fetchData()
  getGroupList().then(res => { groups.value = res.data })
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getEmployeePage(query)
    list.value = res.data.records
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function search() { query.page = 1; fetchData() }
function reset() { query.name = ''; query.groupId = null; search() }

function edit(row) {
  Object.assign(form, row)
  isEdit.value = true
  showAdd.value = true
}

async function handleDelete(id) {
  await ElMessageBox.confirm('确定删除该员工？')
  await deleteEmployee(id)
  ElMessage.success('删除成功')
  fetchData()
}

async function handleSave() {
  if (isEdit.value) {
    await updateEmployee(form)
  } else {
    await createEmployee(form)
  }
  ElMessage.success('保存成功')
  showAdd.value = false
  fetchData()
}
</script>
