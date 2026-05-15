<template>
  <div class="ai-page">
    <el-card class="ai-card">
      <template #header>
        <div class="card-header">
          <el-icon class="header-icon" color="#409eff"><ChatLineSquare /></el-icon>
          <span>AI 智能查询</span>
        </div>
      </template>

      <div class="chat-box" ref="chatRef">
        <div v-if="messages.length === 0" class="chat-empty">
          <el-icon size="40" color="#b0c8e0"><ChatDotRound /></el-icon>
          <p>输入你的问题，AI 助手将会为你解答</p>
          <p class="chat-hints">例如：排班有哪些约束规则？如何优化夜班排班？</p>
        </div>
        <div v-for="(msg, i) in messages" :key="i" :class="['chat-msg', msg.role]">
          <div class="msg-avatar">{{ msg.role === 'user' ? '我' : 'AI' }}</div>
          <div class="msg-bubble">{{ msg.content }}</div>
        </div>
        <div v-if="loading" class="chat-msg assistant">
          <div class="msg-avatar">AI</div>
          <div class="msg-bubble thinking">思考中<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
        </div>
      </div>

      <div class="chat-input">
        <el-input
          v-model="input"
          placeholder="输入你的问题..."
          :disabled="loading"
          @keyup.enter="send"
          clearable
        >
          <template #append>
            <el-button @click="send" :disabled="!input.trim() || loading" icon="Promotion" />
          </template>
        </el-input>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { aiQuery } from '../../api/ai'

const input = ref('')
const messages = ref([])
const loading = ref(false)
const chatRef = ref(null)

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  scrollBottom()

  try {
    const res = await aiQuery(text)
    messages.value.push({ role: 'assistant', content: res.data?.answer || '暂无回复' })
  } catch {
    messages.value.push({ role: 'assistant', content: 'AI 服务暂不可用' })
  } finally {
    loading.value = false
    scrollBottom()
  }
}

function scrollBottom() {
  nextTick(() => {
    const el = chatRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
</script>

<style scoped>
.ai-page { max-width: 800px; margin: 0 auto; }
.ai-card { border-radius: 12px; }
.card-header { display: flex; align-items: center; gap: 8px; }
.header-icon { font-size: 20px; }

.chat-box {
  height: 420px;
  overflow-y: auto;
  padding: 16px 8px;
  background: #f8faff;
  border-radius: 10px;
  border: 1px solid #e8edf5;
  margin-bottom: 16px;
}
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8fa8c8;
  gap: 8px;
}
.chat-empty p { margin: 0; font-size: 14px; }
.chat-hints { font-size: 13px; opacity: 0.6; }

.chat-msg { display: flex; gap: 10px; margin-bottom: 16px; }
.chat-msg.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; flex-shrink: 0;
}
.chat-msg.user .msg-avatar { background: linear-gradient(135deg, #245090, #409eff); color: #fff; }
.chat-msg.assistant .msg-avatar { background: linear-gradient(135deg, #36d399, #10b981); color: #fff; }
.msg-bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.chat-msg.user .msg-bubble {
  background: linear-gradient(135deg, #245090, #409eff);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.chat-msg.assistant .msg-bubble {
  background: #fff;
  color: #2c3e50;
  border: 1px solid #e8edf5;
  border-bottom-left-radius: 4px;
}
.thinking { color: #8fa8c8; }
.dots span { animation: dot 1.4s infinite; opacity: 0; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot { 0%, 60%, 100% { opacity: 0; } 30% { opacity: 1; } }

.chat-input :deep(.el-input-group__append) {
  background: transparent;
  border: none;
  padding: 0;
}
.chat-input :deep(.el-button) {
  border-radius: 0 6px 6px 0;
  height: 40px;
}
</style>
