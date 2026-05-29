<template>
  <div class="swap-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="调班申请" name="apply">
        <el-card>
          <template #header>调班申请</template>
          <el-form :model="appForm" label-width="100px">
            <el-form-item label="工号"><el-input v-model="appForm.employeeNo"/></el-form-item>
            <el-form-item label="姓名"><el-input v-model="appForm.name"/></el-form-item>
            <el-form-item label="航班号"><el-input v-model="appForm.flightNo"/></el-form-item>
            <el-form-item label="开始时间"><el-time-picker v-model="appForm.startTime" format="HH:mm" value-format="HH:mm"/></el-form-item>
            <el-form-item label="结束时间"><el-time-picker v-model="appForm.endTime" format="HH:mm" value-format="HH:mm"/></el-form-item>
            <el-form-item label="原因"><el-input v-model="appForm.reason" type="textarea"/></el-form-item>
            <el-form-item><el-button type="primary" @click="submitApplication">提交申请</el-button></el-form-item>
          </el-form>
        </el-card>
        <el-card style="margin-top:16px">
          <template #header>代班申请</template>
          <el-form :model="swapForm" label-width="120px" inline>
            <el-form-item label="原排班ID"><el-input v-model="swapForm.sourceScheduleId"/></el-form-item>
            <el-form-item label="目标排班ID"><el-input v-model="swapForm.targetScheduleId"/></el-form-item>
            <el-form-item label="原因"><el-input v-model="swapForm.reason"/></el-form-item>
            <el-form-item><el-button type="primary" @click="submitSwapRequest">提交代班</el-button></el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>
      <el-tab-pane label="调班记录" name="records">
        <el-select v-model="statusFilter" @change="fetchRequests" style="width:140px;margin-bottom:12px">
          <el-option label="待审批" value="PENDING"/>
          <el-option label="已通过" value="APPROVED"/>
          <el-option label="已驳回" value="REJECTED"/>
        </el-select>
        <el-table :data="requests" border>
          <el-table-column prop="id" label="ID" width="60"/>
          <el-table-column prop="requestType" label="类型" width="100"/>
          <el-table-column prop="employeeNo" label="工号" width="100"/>
          <el-table-column prop="name" label="姓名" width="80"/>
          <el-table-column prop="flightNo" label="航班号" width="100"/>
          <el-table-column prop="reason" label="原因"/>
          <el-table-column label="状态" width="100">
            <template #default="{row}">
              <el-tag :type="row.status==='PENDING'?'warning':row.status==='APPROVED'?'success':'danger'">
                {{ row.status==='PENDING'?'待审批':row.status==='APPROVED'?'已通过':'已驳回' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" v-if="statusFilter==='PENDING'">
            <template #default="{row}">
              <el-button size="small" type="primary" @click="openApprove(row)">审批</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="approveVisible" title="审批调班" width="400px">
      <el-form>
        <el-form-item label="决定">
          <el-radio-group v-model="approveForm.decision">
            <el-radio value="APPROVE">通过</el-radio>
            <el-radio value="REJECT">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="approveForm.comment" type="textarea"/></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveVisible=false">取消</el-button>
        <el-button type="primary" @click="submitApprove">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { createSwapApplication, createSwapRequest, listSwapRequests, approveSwapRequest } from '../../api/swap'
import { ElMessage } from 'element-plus'

const activeTab = ref('apply')
const statusFilter = ref('PENDING')
const requests = ref([])
const approveVisible = ref(false)

const appForm = reactive({ employeeNo:'', name:'', flightNo:'', startTime:'', endTime:'', reason:'' })
const swapForm = reactive({ sourceScheduleId:'', targetScheduleId:'', reason:'临时代班' })
const approveForm = reactive({ requestId:null, decision:'APPROVE', comment:'' })

const submitApplication = async () => {
  await createSwapApplication(appForm)
  ElMessage.success('申请已提交')
}
const submitSwapRequest = async () => {
  await createSwapRequest(swapForm)
  ElMessage.success('代班申请已提交')
}
const fetchRequests = async () => {
  const res = await listSwapRequests({ status: statusFilter.value })
  requests.value = res.data?.records || []
}
const openApprove = (row) => {
  approveForm.requestId = row.id
  approveForm.decision = 'APPROVE'
  approveForm.comment = ''
  approveVisible.value = true
}
const submitApprove = async () => {
  await approveSwapRequest(approveForm.requestId, { decision: approveForm.decision, comment: approveForm.comment })
  ElMessage.success(approveForm.decision === 'APPROVE' ? '已通过' : '已驳回')
  approveVisible.value = false
  fetchRequests()
}
onMounted(fetchRequests)
</script>
