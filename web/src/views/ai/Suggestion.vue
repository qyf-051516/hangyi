<template>
  <div class="ai-page">
    <el-card class="ai-card">
      <template #header>
        <div class="card-header">
          <div class="card-header-left">
            <el-icon class="header-icon" color="#409eff"><MagicStick /></el-icon>
            <span>AI 智能排班建议</span>
          </div>
          <el-tag v-if="model" type="info" size="small" effect="plain">{{ model }}</el-tag>
        </div>
      </template>

      <el-form :model="form" label-width="80px" class="ai-form">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="班组">
              <el-select v-model="form.groupId" placeholder="选择班组" style="width: 100%">
                <el-option v-for="g in groups" :key="g.id" :label="g.groupName" :value="g.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="开始日期">
              <el-date-picker v-model="form.startDate" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="结束日期">
              <el-date-picker v-model="form.endDate" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <el-button type="primary" @click="generate" :loading="loading" icon="MagicStick">
            {{ loading ? 'AI 分析中...' : '生成排班建议' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="result" class="ai-result">
        <div class="result-title">分析结果</div>
        <div class="result-content markdown-body">{{ result }}</div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getSuggestions } from '../../api/ai'
import request from '../../api/request'

const form = ref({ groupId: null, startDate: '', endDate: '' })
const groups = ref([])
const loading = ref(false)
const result = ref('')
const model = ref('')

onMounted(() => {
  request.get('/groups/list').then(res => {
    groups.value = res.data || []
  }).catch(() => {})
})

async function generate() {
  loading.value = true
  result.value = ''
  try {
    const res = await getSuggestions(form.value)
    result.value = res.data?.suggestions || '暂无建议'
    model.value = res.data?.model || ''
  } catch (e) {
    result.value = '请求失败，请稍后重试'
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
  background: #f8faff;
  border-radius: 10px;
  border: 1px solid #e8edf5;
}
.result-title {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8edf5;
}
.result-content {
  font-size: 14px;
  line-height: 1.8;
  color: #3d4f66;
  white-space: pre-wrap;
}
</style>
