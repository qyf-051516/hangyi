<template>
  <div>
    <h3 class="page-heading">班次模板</h3>

    <el-card shadow="hover">
      <el-button type="success" style="margin-bottom: 16px" @click="showAdd = true">新增班次</el-button>

      <el-table :data="list" border stripe>
        <el-table-column prop="shiftCode" label="编码" width="100" />
        <el-table-column prop="shiftName" label="班次名称" width="120" />
        <el-table-column label="时间段" width="200">
          <template #default="{ row }">
            {{ row.startTime }} - {{ row.endTime }}
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :color="row.color" style="color: #fff">
              {{ typeMap[row.shiftType] || row.shiftType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="颜色" width="80">
          <template #default="{ row }">
            <div :style="{ width: '24px', height: '24px', background: row.color, borderRadius: '4px' }" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="edit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAdd" :title="isEdit ? '编辑班次' : '新增班次'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="编码" prop="shiftCode">
          <el-input v-model="form.shiftCode" />
        </el-form-item>
        <el-form-item label="班次名称" prop="shiftName">
          <el-input v-model="form.shiftName" />
        </el-form-item>
        <el-form-item label="开始时间">
          <el-time-picker v-model="form.startTime" format="HH:mm" value-format="HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-time-picker v-model="form.endTime" format="HH:mm" value-format="HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="班次类型">
          <el-select v-model="form.shiftType" style="width: 100%">
            <el-option label="白班" value="DAY" />
            <el-option label="夜班" value="NIGHT" />
            <el-option label="备勤" value="STANDBY" />
          </el-select>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" />
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
import { getShiftList, createShift, updateShift, deleteShift } from '../../api/shift'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const showAdd = ref(false)
const isEdit = ref(false)
const typeMap = { DAY: '白班', NIGHT: '夜班', STANDBY: '备勤' }
const form = reactive({ id: null, shiftCode: '', shiftName: '', startTime: '', endTime: '', shiftType: 'DAY', color: '#409EFF' })

onMounted(() => fetchData())

async function fetchData() {
  const res = await getShiftList()
  list.value = res.data
}

function edit(row) {
  Object.assign(form, row)
  isEdit.value = true
  showAdd.value = true
}

async function handleDelete(id) {
  await ElMessageBox.confirm('确定删除该班次？')
  await deleteShift(id)
  ElMessage.success('删除成功')
  fetchData()
}

async function handleSave() {
  if (isEdit.value) {
    await updateShift(form)
  } else {
    await createShift(form)
  }
  ElMessage.success('保存成功')
  showAdd.value = false
  fetchData()
}
</script>
