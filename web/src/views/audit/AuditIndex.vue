<template>
  <div class="audit-page">
    <h3>审计日志</h3>
    <el-form inline>
      <el-form-item label="操作类型"><el-input v-model="filters.action" placeholder="如 APPROVE_SWAP"/></el-form-item>
      <el-form-item label="开始日期"><el-date-picker v-model="filters.startDate" value-format="YYYY-MM-DD"/></el-form-item>
      <el-form-item label="结束日期"><el-date-picker v-model="filters.endDate" value-format="YYYY-MM-DD"/></el-form-item>
      <el-form-item>
        <el-button type="primary" @click="fetchLogs">查询</el-button>
        <el-button @click="exportLogs">导出 CSV</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="logs" border>
      <el-table-column prop="id" label="ID" width="60"/>
      <el-table-column prop="action" label="操作类型" width="160"/>
      <el-table-column prop="detail" label="描述"/>
      <el-table-column prop="targetType" label="目标类型" width="120"/>
      <el-table-column prop="targetId" label="目标ID" width="100"/>
      <el-table-column prop="operatorId" label="操作人" width="80"/>
      <el-table-column prop="createdAt" label="时间" width="160"/>
    </el-table>
    <el-pagination v-model:current-page="page" :total="total" :page-size="50" @current-change="fetchLogs" layout="prev,pager,next" style="margin-top:16px"/>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { queryOperationLogs, exportOperationLogs } from '../../api/audit'

const filters = reactive({ action:'', startDate:'', endDate:'' })
const logs = ref([])
const page = ref(1)
const total = ref(0)

const fetchLogs = async () => {
  const res = await queryOperationLogs({ page: page.value, ...filters })
  const d = res.data
  logs.value = d.records || []
  total.value = d.total || 0
}
const exportLogs = async () => {
  const res = await exportOperationLogs(filters)
  const url = URL.createObjectURL(res)
  const a = document.createElement('a')
  a.href = url; a.download = 'audit_logs.csv'; a.click()
  URL.revokeObjectURL(url)
}
fetchLogs()
</script>
