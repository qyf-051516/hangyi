<template>
  <div class="stats-page">
    <h3>排班统计</h3>
    <el-date-picker v-model="statsDate" @change="fetchStats" value-format="YYYY-MM-DD" placeholder="选择日期"/>

    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="12">
        <el-card header="班组负荷对比">
          <el-table :data="groupStats" border size="small">
            <el-table-column prop="group_id" label="班组"/>
            <el-table-column prop="staff_count" label="人数"/>
            <el-table-column prop="task_count" label="任务数"/>
            <el-table-column prop="avgTasksPerStaff" label="人均任务"/>
            <el-table-column prop="utilization" label="利用率%"/>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="人员利用率 TOP 10">
          <el-table :data="staffUtil.slice(0,10)" border size="small">
            <el-table-column prop="name" label="姓名"/>
            <el-table-column prop="task_count" label="任务数"/>
            <el-table-column prop="fatigueScore" label="疲劳度"/>
            <el-table-column label="风险" width="80">
              <template #default="{row}">
                <el-tag :type="row.fatigueRisk==='high'?'danger':row.fatigueRisk==='medium'?'warning':'success'" size="small">
                  {{ row.fatigueRisk }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="12">
        <el-card header="资质覆盖">
          <el-table :data="qualStats" border size="small">
            <el-table-column prop="aircraft_type" label="机型"/>
            <el-table-column prop="qualified_count" label="资质人数"/>
            <el-table-column prop="coverageRate" label="覆盖率%"/>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="近7天夜班分布">
          <el-table :data="nightDist" border size="small">
            <el-table-column prop="date" label="日期"/>
            <el-table-column prop="total" label="总数"/>
            <el-table-column prop="night" label="夜班"/>
            <el-table-column prop="nightRate" label="夜班率%"/>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getScheduleStatistics } from '../../api/statistics'

const statsDate = ref('')
const groupStats = ref([])
const staffUtil = ref([])
const qualStats = ref([])
const nightDist = ref([])

const fetchStats = async () => {
  const res = await getScheduleStatistics({ scheduleDate: statsDate.value || undefined })
  const d = res.data
  groupStats.value = d.groupStats || []
  staffUtil.value = d.staffUtilization || []
  qualStats.value = d.qualificationStats || []
  nightDist.value = d.nightDistribution || []
}
fetchStats()
</script>
