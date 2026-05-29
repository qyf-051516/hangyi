<template>
  <div class="service-page">
    <h3>勤务排班</h3>
    <el-form inline>
      <el-form-item label="日期">
        <el-date-picker v-model="scheduleDate" @change="fetchTable" value-format="YYYY-MM-DD"/>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="fetchTable">查询</el-button>
      </el-form-item>
    </el-form>

    <el-card v-for="task in tasks" :key="task.flightNo+task.taskType" style="margin-bottom:12px">
      <template #header>
        {{ task.flightNo }} - {{ task.taskType }} ({{ task.airline }} {{ task.aircraftType }})
      </template>
      <el-tag v-for="s in task.staff" :key="s.staffId" style="margin-right:8px">
        {{ s.name }} ({{ s.employeeNo }})
      </el-tag>
    </el-card>
    <p>共 {{ total }} 个任务</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getServiceScheduleTable } from '../../api/serviceSchedule'

const scheduleDate = ref('')
const tasks = ref([])
const total = ref(0)

const fetchTable = async () => {
  const res = await getServiceScheduleTable({ scheduleDate: scheduleDate.value || undefined })
  tasks.value = res.data.tasks || []
  total.value = res.data.total || 0
}
fetchTable()
</script>
