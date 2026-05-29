<template>
  <div class="compliance-page">
    <h3>飞行前合规检查</h3>
    <el-form inline>
      <el-form-item label="日期">
        <el-date-picker v-model="scheduleDate" value-format="YYYY-MM-DD"/>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="runCheck">运行检查</el-button>
      </el-form-item>
    </el-form>

    <el-card v-if="checkResult" header="检查结果">
      <el-alert :title="checkResult.passed ? '通过' : '发现 ' + checkResult.summary.totalViolations + ' 个违规'"
        :type="checkResult.passed ? 'success' : 'warning'" :closable="false" show-icon/>
      <el-table :data="checkResult.violations" border style="margin-top:12px" v-if="!checkResult.passed">
        <el-table-column prop="type" label="类型" width="200"/>
        <el-table-column prop="severity" label="严重性" width="100">
          <template #default="{row}">
            <el-tag :type="row.severity==='HIGH'?'danger':row.severity==='MEDIUM'?'warning':'info'" size="small">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="staffName" label="人员" width="120"/>
        <el-table-column prop="description" label="描述"/>
        <el-table-column prop="suggestion" label="建议" width="180"/>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { preflightCheck } from '../../api/compliance'

const scheduleDate = ref('')
const checkResult = ref(null)

const runCheck = async () => {
  const res = await preflightCheck({ scheduleDate: scheduleDate.value, edits: [] })
  checkResult.value = res.data
}
</script>
