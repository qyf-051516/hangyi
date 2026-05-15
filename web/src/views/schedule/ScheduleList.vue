<template>
  <div>
    <h3 class="page-heading">排班管理</h3>

    <el-card shadow="hover">
      <el-form :inline="true">
        <el-form-item label="班组">
          <el-select v-model="query.groupId" placeholder="选择班组" clearable style="width: 160px">
            <el-option v-for="g in groups" :key="g.id" :label="g.groupName" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
            <el-option label="草稿" :value="0" />
            <el-option label="已发布" :value="1" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">查询</el-button>
          <el-button type="success" @click="showAuto = true">智能排班</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" style="margin-top: 16px">
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="scheduleName" label="排班名称" min-width="200" />
        <el-table-column label="排班周期" width="240">
          <template #default="{ row }">
            {{ row.startDate }} ~ {{ row.endDate }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'warning'">
              {{ row.status === 1 ? '已发布' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="250">
          <template #default="{ row }">
            <el-button size="small" @click="viewDetails(row)">详情</el-button>
            <el-button size="small" type="primary" @click="viewGantt(row)">甘特图</el-button>
            <el-button size="small" type="success" @click="exportScheduleExcel(row.id)">导出</el-button>
            <el-button
              size="small" type="warning"
              v-if="row.status === 0"
              @click="handlePublish(row.id)"
            >发布</el-button>
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

    <!-- 智能排班对话框 -->
    <el-dialog v-model="showAuto" title="智能排班" width="500px">
      <el-form :model="autoForm" label-width="100px">
        <el-form-item label="班组">
          <el-select v-model="autoForm.groupId" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.groupName" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="autoForm.startDate" type="date" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="autoForm.endDate" type="date" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAuto = false">取消</el-button>
        <el-button type="primary" :loading="autoLoading" @click="handleAutoSchedule">
          开始排班
        </el-button>
      </template>
    </el-dialog>

    <!-- 排班详情对话框 -->
    <el-dialog v-model="showDetail" title="排班详情" width="900px">
      <el-table :data="details" border stripe max-height="500">
        <el-table-column label="员工" width="120">
          <template #default="{ row }">{{ getEmpName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="日期" width="120" prop="workDate" />
        <el-table-column label="班次" width="100">
          <template #default="{ row }">{{ getShiftName(row.shiftId) }}</template>
        </el-table-column>
        <el-table-column label="排班方式" width="100" prop="scheduleType" />
        <el-table-column label="备注" prop="remark" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSchedulePage, autoSchedule, getScheduleDetails, publishSchedule, deleteSchedule, exportScheduleExcel } from '../../api/schedule'
import { getGroupList } from '../../api/employee'
import { getShiftList } from '../../api/shift'
import { getEmployeePage } from '../../api/employee'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const list = ref([])
const total = ref(0)
const loading = ref(false)
const groups = ref([])
const shifts = ref([])
const employees = ref([])
const showAuto = ref(false)
const autoLoading = ref(false)
const showDetail = ref(false)
const details = ref([])

const query = reactive({ page: 1, size: 20, groupId: null, status: null })
const autoForm = reactive({ groupId: null, startDate: '', endDate: '' })

onMounted(async () => {
  fetchData()
  const [gRes, sRes, eRes] = await Promise.all([
    getGroupList(),
    getShiftList(),
    getEmployeePage({ page: 1, size: 999 })
  ])
  groups.value = gRes.data
  shifts.value = sRes.data
  employees.value = eRes.data.records || eRes.data
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getSchedulePage(query)
    list.value = res.data.records
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function getEmpName(id) {
  return employees.value.find(e => e.id === id)?.name || id
}

function getShiftName(id) {
  return shifts.value.find(s => s.id === id)?.shiftName || id
}

async function viewDetails(row) {
  const res = await getScheduleDetails(row.id)
  details.value = res.data
  showDetail.value = true
}

function viewGantt(row) {
  router.push({ path: '/schedule-gantt', query: { scheduleId: row.id } })
}

async function handlePublish(id) {
  await publishSchedule(id)
  ElMessage.success('已发布')
  fetchData()
}

async function handleDelete(id) {
  await ElMessageBox.confirm('确定删除该排班？')
  await deleteSchedule(id)
  ElMessage.success('删除成功')
  fetchData()
}

async function handleAutoSchedule() {
  autoLoading.value = true
  try {
    await autoSchedule(autoForm)
    ElMessage.success('排班成功')
    showAuto.value = false
    fetchData()
  } finally {
    autoLoading.value = false
  }
}
</script>
