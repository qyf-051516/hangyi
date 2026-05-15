<template>
  <div class="ai-page">
    <el-card class="ai-card">
      <template #header>
        <div class="card-header">
          <div class="card-header-left">
            <el-icon class="header-icon" color="#e6a23c"><Warning /></el-icon>
            <span>AI 排班冲突检测</span>
          </div>
          <el-tag v-if="lastDetected" type="warning" size="small" effect="plain">上次检测: {{ lastDetected }}</el-tag>
        </div>
      </template>

      <el-form :model="form" label-width="100px" class="ai-form">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="排班方案">
              <el-select v-model="form.scheduleId" placeholder="选择排班方案" style="width: 100%" filterable>
                <el-option v-for="s in schedules" :key="s.id" :label="s.scheduleName" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="日期范围">
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <el-button type="warning" @click="detect" :loading="loading" icon="Warning">
            {{ loading ? 'AI 检测中...' : '检测冲突' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="result" class="ai-result">
        <div class="result-title">
          <el-icon color="#e6a23c" style="margin-right: 6px"><WarningFilled /></el-icon>
          检测结果
        </div>
        <div class="result-content markdown-body">{{ result }}</div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { detectConflicts } from '../../api/ai'
import request from '../../api/request'

const form = ref({ scheduleId: null })
const dateRange = ref(null)
const schedules = ref([])
const loading = ref(false)
const result = ref('')
const lastDetected = ref('')

onMounted(() => {
  request.get('/schedules/list').then(res => {
    schedules.value = res.data || []
  }).catch(() => {})
})

async function detect() {
  loading.value = true
  result.value = ''
  try {
    const params = { ...form.value }
    if (dateRange.value) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    const res = await detectConflicts(params)
    result.value = res.data?.conflicts || '未检测到冲突'
    const now = new Date()
    lastDetected.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  } catch {
    result.value = '检测失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.ai-page { max-width: 900px; margin: 0 auto; }
.ai-card { border-radius: 12px; }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.card-header-left { display: flex; align-items: center; gap: 8px; }
.header-icon { font-size: 20px; }
.ai-form { margin-bottom: 8px; }
.ai-result {
  margin-top: 16px;
  padding: 20px;
  background: #fffbf0;
  border-radius: 10px;
  border: 1px solid #f0dbb0;
}
.result-title {
  font-size: 14px;
  font-weight: 600;
  color: #8c6a1f;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0dbb0;
  display: flex;
  align-items: center;
}
.result-content {
  font-size: 14px;
  line-height: 1.8;
  color: #5f4d1a;
  white-space: pre-wrap;
}
</style>
