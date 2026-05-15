<template>
  <div>
    <h3 class="page-heading">航班计划</h3>

    <el-card shadow="hover">
      <el-form :inline="true">
        <el-form-item label="日期">
          <el-date-picker v-model="query.date" type="date" value-format="YYYY-MM-DD" style="width: 160px" />
        </el-form-item>
        <el-form-item label="航班号">
          <el-input v-model="query.flightNo" placeholder="搜索航班号" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button type="success" @click="showAdd = true">新增航班</el-button>
          <el-button type="warning" :loading="syncing" @click="handleSync">同步航班</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" style="margin-top: 16px">
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="flightNo" label="航班号" width="120" />
        <el-table-column label="机型" width="100">
          <template #default="{ row }">{{ getAircraftType(row.aircraftTypeId) }}</template>
        </el-table-column>
        <el-table-column prop="registration" label="机号" width="100" />
        <el-table-column prop="planDate" label="日期" width="110" />
        <el-table-column prop="planTime" label="时刻" width="80" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.flightType === 'DEP' ? 'primary' : 'success'">
              {{ row.flightType === 'DEP' ? '出港' : '进港' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="routeFrom" label="始发站" width="100" />
        <el-table-column prop="routeTo" label="目的站" width="100" />
        <el-table-column prop="gate" label="机位" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag>{{ statusMap[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
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
      />
    </el-card>

    <el-dialog v-model="showAdd" :title="isEdit ? '编辑航班' : '新增航班'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="航班号">
          <el-input v-model="form.flightNo" />
        </el-form-item>
        <el-form-item label="机型">
          <el-select v-model="form.aircraftTypeId" style="width: 100%">
            <el-option v-for="a in aircraftTypes" :key="a.id" :label="a.typeName" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="机号">
          <el-input v-model="form.registration" />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="form.planDate" type="date" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="时刻">
          <el-time-picker v-model="form.planTime" format="HH:mm" value-format="HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.flightType" style="width: 100%">
            <el-option label="出港" value="DEP" />
            <el-option label="进港" value="ARR" />
          </el-select>
        </el-form-item>
        <el-form-item label="始发站">
          <el-input v-model="form.routeFrom" />
        </el-form-item>
        <el-form-item label="目的站">
          <el-input v-model="form.routeTo" />
        </el-form-item>
        <el-form-item label="机位">
          <el-input v-model="form.gate" />
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
import { getFlightPage, createFlight, updateFlight, deleteFlight, syncFlights } from '../../api/flight'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const syncing = ref(false)
const showAdd = ref(false)
const isEdit = ref(false)
const aircraftTypes = ref([])
const statusMap = { SCHEDULED: '计划', DELAYED: '延误', CANCELLED: '取消', COMPLETED: '已完成' }

const query = reactive({ page: 1, size: 20, date: '', flightNo: '' })
const form = reactive({
  id: null, flightNo: '', aircraftTypeId: null, registration: '',
  planDate: '', planTime: '', flightType: 'DEP',
  routeFrom: '', routeTo: '', gate: '', status: 'SCHEDULED'
})

onMounted(() => fetchData())

async function fetchData() {
  loading.value = true
  try {
    const res = await getFlightPage(query)
    list.value = res.data.records
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function search() { query.page = 1; fetchData() }

async function handleSync() {
  const date = query.date || new Date().toISOString().slice(0, 10)
  syncing.value = true
  try {
    const res = await syncFlights(date)
    ElMessage.success(`同步完成，共 ${res.data.count} 条航班`)
    fetchData()
  } finally {
    syncing.value = false
  }
}
function getAircraftType(id) {
  return aircraftTypes.value.find(a => a.id === id)?.typeName || id
}

function edit(row) {
  Object.assign(form, row)
  isEdit.value = true
  showAdd.value = true
}

async function handleDelete(id) {
  await ElMessageBox.confirm('确定删除该航班？')
  await deleteFlight(id)
  ElMessage.success('删除成功')
  fetchData()
}

async function handleSave() {
  if (isEdit.value) {
    await updateFlight(form)
  } else {
    await createFlight(form)
  }
  ElMessage.success('保存成功')
  showAdd.value = false
  fetchData()
}
</script>
