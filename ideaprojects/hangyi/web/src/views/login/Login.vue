<template>
  <main class="login-page">
    <section class="login-story" aria-labelledby="login-story-title">
      <div class="login-story-grid" aria-hidden="true"></div>
      <svg class="login-route" viewBox="0 0 720 760" aria-hidden="true">
        <path d="M-30 620C170 530 170 190 410 235C585 268 505 500 760 360" />
        <circle cx="409" cy="235" r="7" />
        <circle cx="187" cy="475" r="5" />
      </svg>

      <div class="login-brand">
        <span class="login-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
        </span>
        <span>
          <strong>航翼排班</strong>
          <small>HANGYI OPERATIONS</small>
        </span>
      </div>

      <div class="login-story-copy">
        <span class="login-kicker">运行控制台 / 01</span>
        <h1 id="login-story-title">让每一次交接，都有清晰依据。</h1>
        <p>统一管理人员、航班与班次，在变化发生时快速回到可执行的计划。</p>
      </div>

      <div class="login-capabilities" aria-label="系统能力">
        <span>人员统筹</span>
        <span>智能排班</span>
        <span>运行追踪</span>
      </div>

      <footer class="login-story-footer">
        <span>内部运营系统</span>
        <span>UTC +08:00</span>
      </footer>
    </section>

    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-form-wrap">
        <div class="login-heading">
          <span class="login-heading-index">SECURE ACCESS</span>
          <h2 id="login-title">登录工作台</h2>
          <p>使用你的内部账号继续。</p>
        </div>

        <div v-if="formError" class="login-error" role="alert">
          <el-icon><WarningFilled /></el-icon>
          <span>{{ formError }}</span>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item label="账号" prop="username">
            <el-input
              ref="usernameInput"
              v-model.trim="form.username"
              placeholder="请输入用户名"
              size="large"
              :prefix-icon="User"
              autocomplete="username"
              aria-label="账号"
              @input="formError = ''"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              :prefix-icon="Lock"
              autocomplete="current-password"
              show-password
              aria-label="密码"
              @input="formError = ''"
            />
          </el-form-item>
          <el-form-item class="login-submit-item">
            <el-button
              type="primary"
              native-type="submit"
              size="large"
              :loading="loading"
              :disabled="loading"
              class="login-submit"
            >
              {{ loading ? '正在验证' : '进入工作台' }}
              <el-icon v-if="!loading"><ArrowRight /></el-icon>
            </el-button>
          </el-form-item>
        </el-form>

        <button v-if="isDev" type="button" class="demo-account" @click="fillDemoAccount">
          <span>本地演示账号</span>
          <code>admin / 123456</code>
          <el-icon><ArrowRight /></el-icon>
        </button>

        <p class="login-security-note">
          <el-icon><Lock /></el-icon>
          会话信息仅用于内部系统身份验证
        </p>
      </div>

      <footer class="login-panel-footer">
        <span>航翼排班</span>
        <span>v1.0.0</span>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  Lock,
  User,
  WarningFilled
} from '@element-plus/icons-vue'
import { login } from '../../api/auth'
import { useUserStore } from '../../store/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const formRef = ref(null)
const usernameInput = ref(null)
const loading = ref(false)
const formError = ref('')
const isDev = import.meta.env.DEV

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

onMounted(async () => {
  await nextTick()
  usernameInput.value?.focus()
})

function fillDemoAccount() {
  form.username = 'admin'
  form.password = '123456'
  formError.value = ''
}

async function handleLogin() {
  if (loading.value) return

  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  formError.value = ''

  try {
    const response = await login({
      username: form.username,
      password: form.password
    })
    userStore.setLogin(response?.data || response)
    await router.replace(resolvePostLoginPath())
  } catch (error) {
    formError.value = error?.message || '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function resolvePostLoginPath() {
  const redirect = route.query.redirect
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return '/dashboard'
  }
  const resolved = router.resolve(redirect)
  return resolved.matched.length > 0 && resolved.name !== 'NotFound'
    ? redirect
    : '/dashboard'
}
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(430px, 0.9fr) minmax(520px, 1.1fr);
  overflow: hidden;
  background: #f4f5f3;
}

.login-story {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: clamp(28px, 4.5vw, 68px);
  background: #14243a;
  color: #f6f8f8;
}

.login-story-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(196, 229, 232, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 229, 232, 0.12) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(to bottom, black, transparent 86%);
}

.login-route {
  position: absolute;
  inset: auto -10% -4% auto;
  width: 115%;
  height: 95%;
  opacity: 0.42;
}

.login-route path {
  fill: none;
  stroke: #8ac3ca;
  stroke-width: 1.5;
  stroke-dasharray: 7 9;
}

.login-route circle {
  fill: #d4f2f1;
  stroke: #14243a;
  stroke-width: 4;
}

.login-brand,
.login-story-copy,
.login-capabilities,
.login-story-footer {
  position: relative;
  z-index: 1;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 13px;
}

.login-brand-mark {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(212, 242, 241, 0.26);
  border-radius: 10px;
  background: rgba(212, 242, 241, 0.09);
  color: #bce8e8;
}

.login-brand-mark svg {
  width: 21px;
  height: 21px;
  fill: currentColor;
}

.login-brand > span:last-child {
  display: grid;
  gap: 2px;
}

.login-brand strong {
  font-size: 17px;
  letter-spacing: 0.06em;
}

.login-brand small {
  color: rgba(222, 239, 240, 0.55);
  font: 600 9px/1.2 var(--font-family-mono);
  letter-spacing: 0.14em;
}

.login-story-copy {
  max-width: 590px;
  margin: auto 0;
  padding: 92px 0 56px;
}

.login-kicker,
.login-heading-index {
  color: #93c9cd;
  font: 600 11px/1 var(--font-family-mono);
  letter-spacing: 0.13em;
}

.login-story h1 {
  max-width: 8.5em;
  margin: 22px 0 24px;
  color: #f5f8f8;
  font-size: clamp(44px, 5.3vw, 76px);
  font-weight: 600;
  line-height: 1.06;
  letter-spacing: -0.055em;
  text-wrap: balance;
}

.login-story-copy p {
  max-width: 34em;
  margin: 0;
  color: rgba(230, 241, 242, 0.67);
  font-size: clamp(15px, 1.25vw, 18px);
  line-height: 1.8;
}

.login-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 42px;
}

.login-capabilities span {
  padding: 7px 10px;
  border: 1px solid rgba(212, 242, 241, 0.16);
  border-radius: var(--radius-xs);
  color: rgba(230, 241, 242, 0.7);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.login-story-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 18px;
  border-top: 1px solid rgba(212, 242, 241, 0.14);
  color: rgba(230, 241, 242, 0.42);
  font: 500 10px/1 var(--font-family-mono);
  letter-spacing: 0.08em;
}

.login-panel {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(32px, 7vw, 112px);
}

.login-form-wrap {
  width: min(100%, 430px);
  margin: auto;
}

.login-heading {
  margin-bottom: 36px;
}

.login-heading-index {
  color: var(--color-brand-500);
}

.login-heading h2 {
  margin: 14px 0 8px;
  color: var(--color-brand-900);
  font-size: clamp(30px, 3vw, 42px);
  font-weight: var(--font-weight-semi);
  letter-spacing: -0.045em;
}

.login-heading p {
  margin: 0;
  color: var(--color-neutral-500);
  font-size: 15px;
}

.login-error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 18px;
  padding: 11px 13px;
  border-left: 3px solid var(--color-danger);
  border-radius: 2px var(--radius-sm) var(--radius-sm) 2px;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}

.login-error .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 22px;
}

.login-form :deep(.el-form-item__label) {
  height: auto;
  padding-bottom: 7px;
  color: var(--color-neutral-700);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semi);
  line-height: 1.4;
}

.login-form :deep(.el-input__wrapper) {
  min-height: 48px;
  padding-inline: 14px;
  border-radius: var(--radius-md) !important;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 0 0 1px var(--color-neutral-300) inset !important;
}

.login-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--color-brand-300) inset !important;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--color-brand-700) inset,
    0 0 0 3px rgba(42, 63, 95, 0.08) !important;
}

.login-submit-item {
  margin-top: 8px;
}

.login-submit {
  width: 100%;
  height: 48px;
  display: flex;
  justify-content: space-between;
  padding-inline: 18px;
  border-radius: var(--radius-md);
  font-size: 15px;
}

.demo-account {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  padding: 12px 13px;
  border: 1px dashed var(--color-neutral-300);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-neutral-500);
  font: inherit;
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
  transition:
    color var(--transition-base),
    border-color var(--transition-base),
    background var(--transition-base);
}

.demo-account:hover {
  border-color: var(--color-brand-300);
  background: rgba(255, 255, 255, 0.54);
  color: var(--color-brand-700);
}

.demo-account code {
  color: var(--color-neutral-600);
  font: 500 11px/1 var(--font-family-mono);
}

.login-security-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 22px 0 0;
  color: var(--color-neutral-400);
  font-size: 11px;
}

.login-panel-footer {
  position: absolute;
  right: clamp(28px, 5vw, 70px);
  bottom: 25px;
  left: clamp(28px, 5vw, 70px);
  display: flex;
  justify-content: space-between;
  color: var(--color-neutral-400);
  font: 500 10px/1 var(--font-family-mono);
  letter-spacing: 0.06em;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
    overflow: visible;
  }

  .login-story {
    min-height: 230px;
    padding: 28px 34px;
  }

  .login-story-copy {
    margin: auto 0 0;
    padding: 36px 0 0;
  }

  .login-story h1 {
    max-width: 13em;
    margin: 12px 0 0;
    font-size: 34px;
  }

  .login-story-copy p,
  .login-capabilities,
  .login-story-footer {
    display: none;
  }

  .login-panel {
    min-height: calc(100dvh - 230px);
    padding: 54px 28px 80px;
  }
}

@media (max-width: 520px) {
  .login-story {
    min-height: 150px;
    padding: 24px 22px;
  }

  .login-story-copy {
    padding-top: 26px;
  }

  .login-story-copy .login-kicker,
  .login-story h1 {
    display: none;
  }

  .login-panel {
    min-height: calc(100dvh - 150px);
    justify-content: flex-start;
    padding: 42px 20px 72px;
  }

  .login-heading {
    margin-bottom: 28px;
  }

  .demo-account {
    grid-template-columns: 1fr auto;
  }

  .demo-account code {
    display: none;
  }

  .login-panel-footer {
    right: 20px;
    left: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-page *,
  .login-page *::before,
  .login-page *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>
