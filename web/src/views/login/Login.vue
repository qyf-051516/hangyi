<template>
  <div class="login-container">
    <!-- 动态航线背景 -->
    <div class="login-bg-planes"></div>
    <div class="login-bg-routes">
      <svg class="login-routes-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <path class="route-line" d="M0,400 Q300,100 600,300 T1200,200" />
        <path class="route-line route-line-2" d="M0,600 Q400,800 800,500 T1200,600" />
        <path class="route-line route-line-3" d="M200,0 Q400,300 600,100 T1100,400" />
      </svg>
    </div>
    <div class="login-glow"></div>
    <div class="login-particles">
      <div v-for="i in 20" :key="i" class="login-particle" :style="particleStyle(i)"></div>
    </div>

    <!-- 登录卡片 -->
    <transition name="login-fade" appear>
      <div class="login-card">
        <div class="login-logo">
          <div class="login-logo-icon">
            <el-icon size="28" color="#fff"><Aim /></el-icon>
          </div>
          <h2 class="login-title">航翼排班</h2>
          <p class="login-subtitle">智能排班管理系统</p>
        </div>
        <el-form ref="formRef" :model="form" :rules="rules" label-width="0">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" size="large" :prefix-icon="User" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="密码" size="large" :prefix-icon="Lock" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" style="width: 100%; font-weight: 600; letter-spacing: 2px" :loading="loading" @click="handleLogin">
              <span v-if="!loading">登 录</span>
            </el-button>
          </el-form-item>
        </el-form>
        <div class="login-footer">
          <span>v1.0.0</span>
          <span>演示账号：admin / 123456</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../store/user'
import { login } from '../../api/auth'
import { User, Lock, Aim } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref(null)
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

function particleStyle(i) {
  const size = 2 + Math.random() * 4
  const x = Math.random() * 100
  const y = Math.random() * 100
  const dur = 8 + Math.random() * 12
  const delay = Math.random() * 10
  return {
    width: size + 'px',
    height: size + 'px',
    left: x + '%',
    top: y + '%',
    animationDuration: dur + 's',
    animationDelay: delay + 's'
  }
}

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const res = await login(form)
    userStore.setLogin(res.data)
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f4ff 0%, #cde4f7 50%, #d6ebff 100%);
  position: relative;
  overflow: hidden;
}

/* SVG 航线 */
.login-bg-routes {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.15;
}
.login-routes-svg {
  width: 100%;
  height: 100%;
}
.route-line {
  fill: none;
  stroke: #245090;
  stroke-width: 2;
  stroke-dasharray: 1200;
  stroke-dashoffset: 1200;
  animation: drawRoute 4s ease-out forwards;
  filter: drop-shadow(0 0 4px rgba(36, 80, 144, 0.3));
}
.route-line-2 {
  animation-delay: 1.5s;
  stroke: #37e2ff;
}
.route-line-3 {
  animation-delay: 3s;
  stroke: #409eff;
}
@keyframes drawRoute {
  to { stroke-dashoffset: 0; }
}

/* 粒子 */
.login-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.login-particle {
  position: absolute;
  border-radius: 50%;
  background: rgba(36, 80, 144, 0.15);
  animation: particleFloat linear infinite;
}
@keyframes particleFloat {
  0% { transform: translateY(0) scale(1); opacity: 0; }
  10% { opacity: 0.6; }
  90% { opacity: 0.6; }
  100% { transform: translateY(-120px) scale(0.5); opacity: 0; }
}

.login-glow {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(55, 226, 255, 0.06), transparent 70%);
  top: -200px;
  right: -200px;
  pointer-events: none;
  z-index: 0;
}

/* 卡片入场动画 */
.login-fade-enter-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.login-fade-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.96);
}

.login-card {
  width: 400px;
  padding: 48px 40px 36px;
  background: rgba(240, 247, 255, 0.88);
  border: 1px solid rgba(124, 156, 198, 0.35);
  border-radius: 20px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 1;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.login-logo {
  text-align: center;
  margin-bottom: 36px;
}

.login-logo-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a3d72, #409eff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(36, 80, 144, 0.25);
  margin-bottom: 16px;
}

.login-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: #10294d;
  letter-spacing: 2px;
}

.login-subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: #5f7391;
}

.login-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(124, 156, 198, 0.2);
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #97b7dc;
}

:deep(.el-input__wrapper) {
  background: rgba(240, 247, 255, 0.95) !important;
  border: 1px solid rgba(124, 156, 198, 0.42) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  padding: 4px 14px !important;
  transition: border-color 0.2s;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #245090 !important;
  box-shadow: 0 0 0 3px rgba(36, 80, 144, 0.08) !important;
}

:deep(.el-input__inner) {
  color: #17355f !important;
  height: 46px !important;
  font-size: 15px !important;
}

:deep(.el-input__prefix) {
  color: #97b7dc !important;
}

:deep(.el-button--primary) {
  height: 46px;
  font-size: 15px !important;
  border-radius: 10px !important;
}
</style>
