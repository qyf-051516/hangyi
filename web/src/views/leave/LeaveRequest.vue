<template>
  <div>
    <h3 class="page-heading">请假管理</h3>

    <el-card shadow="hover">
      <el-form :inline="true">
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
            <el-option label="待审批" :value="0" />
            <el-option label="已通过" :value="1" />
            <el-option label="已驳回" :value="2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">查询</el-button>
          <el-button type="success" @click="showAdd = true">提交请假</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" style="margin-top: 16px">
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column label="员工" width="120">
          <template #default="{ row }">{{ getEmpName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="请假类型" width="100">
          <template #default="{ row }">{{ typeMap[row.leaveType] || row.leaveType }}</template>
        </el-table-column>
        <el-table-column label="日期范围" width="240">
          <template #default="{ row }">
            {{ row.startDate }} ~ {{ row.endDate }}
          </template>
        </el-table-column>
        <el-table-column prop="totalDays" label="天数" width="60" />
        <el-table-column prop="reason" label="原因" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'warning'">
              {{ row.status === 1 ? '通过' : row.status === 2 ? '驳回' : '待审批' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批意见" width="150" prop="approveRemark" />
        <el-table-column label="操作" width="180" v-if="showApprove">
          <template #default="{ row }">
            <template v-if="row.status === 0">
              <el-button size="small" type="success" @click="handleApprove(row, 1)">通过</el-button>
              <el-button size="small" type="danger" @click="handleApprove(row, 2)">驳回</el-button>
            </template>
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

    <el-dialog v-model="showAdd" title="提交请假" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="员工">
          <el-select v-model="form.employeeId" style="width: 100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="请假类型">
          <el-select v-model="form.leaveType" style="width: 100%">
            <el-option label="年假" value="ANNUAL" />
            <el-option label="病假" value="SICK" />
            <el-option label="事假" value="PERSONAL" />
            <el-option label="其他" value="OTHER" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="form.startDate" type="date" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="form.endDate" type="date" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="handleSave">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getLeavePage, createLeave, approveLeave } from '../../api/leave'
import { getEmployeePage } from '../../api/employee'
import { ElMessage } from 'element-plus'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const employees = ref([])
const showAdd = ref(false)
const typeMap = { ANNUAL: '年假', SICK: '病假', PERSONAL: '事假', OTHER: '其他' }

const query = reactive({ page: 1, size: 20, status: null })
const form = reactive({ employeeId: null, leaveType: 'ANNUAL', startDate: '', endDate: '', reason: '' })

const showApprove = ref(true)

onMounted(async () => {
  fetchData()
  const res = await getEmployeePage({ page: 1, size: 999 })
  employees.value = res.data.records || res.data
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getLeavePage(query)
    list.value = res.data.records
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function getEmpName(id) {
  return employees.value.find(e => e.id === id)?.name || id
}

async function handleApprove(row, status) {
  await approveLeave(row.id, { status })
  ElMessage.success(status === 1 ? '已通过' : '已驳回')
  fetchData()
}

async function handleSave() {
  await createLeave(form)
  ElMessage.success('提交成功')
  showAdd.value = false
  fetchData()
}
</script>
