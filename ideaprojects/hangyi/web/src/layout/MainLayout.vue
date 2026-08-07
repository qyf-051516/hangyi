<template>
  <a class="skip-link" href="#main-content">跳到主内容</a>

  <el-container class="hy-shell">
    <el-aside
      v-show="!isMobile"
      :width="isCollapsed ? '72px' : '236px'"
      class="hy-sidebar"
      :class="{ 'hy-sidebar--collapsed': isCollapsed }"
    >
      <router-link
        to="/dashboard"
        class="hy-logo"
        :class="{ 'hy-logo--collapsed': isCollapsed }"
        aria-label="返回仪表盘"
      >
        <span class="hy-logo-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
        </span>
        <span v-show="!isCollapsed" class="hy-logo-copy">
          <strong>航翼排班</strong>
          <small>OPERATIONS</small>
        </span>
      </router-link>

      <AppNavigation :collapsed="isCollapsed" />

      <div v-if="!isTablet" class="hy-sidebar-footer">
        <button
          type="button"
          class="hy-collapse-button"
          :title="isCollapsed ? '展开导航' : '收起导航'"
          :aria-label="isCollapsed ? '展开导航' : '收起导航'"
          :aria-expanded="!isCollapsed"
          @click="toggleSidebar"
        >
          <el-icon><component :is="isCollapsed ? Expand : Fold" /></el-icon>
          <span v-show="!isCollapsed">收起导航</span>
        </button>
        <span v-show="!isCollapsed" class="hy-version">v1.0.0</span>
      </div>
    </el-aside>

    <el-drawer
      v-if="isMobile"
      v-model="drawerVisible"
      direction="ltr"
      :with-header="false"
      size="min(86vw, 292px)"
      class="hy-mobile-drawer"
    >
      <div class="hy-drawer-inner">
        <router-link to="/dashboard" class="hy-logo hy-drawer-logo" @click="drawerVisible = false">
          <span class="hy-logo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
          </span>
          <span class="hy-logo-copy">
            <strong>航翼排班</strong>
            <small>OPERATIONS</small>
          </span>
        </router-link>
        <AppNavigation drawer @select="drawerVisible = false" />
      </div>
    </el-drawer>

    <el-container class="hy-workspace">
      <div class="hy-airspace-backdrop" aria-hidden="true"></div>

      <el-header class="hy-header">
        <div class="hy-header-left">
          <button
            v-if="isMobile"
            type="button"
            class="hy-icon-button"
            aria-label="打开导航"
            :aria-expanded="drawerVisible"
            @click="drawerVisible = true"
          >
            <el-icon><Menu /></el-icon>
          </button>
          <button
            v-else-if="!isTablet"
            type="button"
            class="hy-icon-button hy-desktop-collapse"
            :aria-label="isCollapsed ? '展开导航' : '收起导航'"
            :aria-expanded="!isCollapsed"
            @click="toggleSidebar"
          >
            <el-icon><component :is="isCollapsed ? Expand : Fold" /></el-icon>
          </button>

          <div class="hy-page-context">
            <span>航翼排班</span>
            <strong>{{ pageTitle }}</strong>
          </div>
        </div>

        <div class="hy-header-right">
          <AppCommandPalette />
          <time v-show="!isCompactHeader" class="hy-header-time">{{ currentTime }}</time>
          <el-dropdown trigger="click" @command="handleCommand">
            <button type="button" class="hy-user-dropdown" aria-label="打开用户菜单">
              <span class="hy-avatar">{{ userInitial }}</span>
              <span v-show="!isCompactHeader" class="hy-user-name">
                {{ userStore.realName || userStore.username || '用户' }}
              </span>
              <el-icon class="hy-arrow"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <span class="hy-account-summary">
                    <strong>{{ userStore.realName || '当前用户' }}</strong>
                    <small>{{ userStore.username }}</small>
                  </span>
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main id="main-content" ref="mainContent" class="hy-main" tabindex="-1">
        <div class="hy-content-frame">
          <router-view v-slot="{ Component }">
            <transition name="page-fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  Expand,
  Fold,
  Menu,
  SwitchButton
} from '@element-plus/icons-vue'
import { logout as logoutRequest } from '../api/auth'
import AppCommandPalette from '../components/AppCommandPalette.vue'
import AppNavigation from '../components/AppNavigation.vue'
import { useUserStore } from '../store/user'

const MOBILE_MAX = 768
const COMPACT_HEADER_MAX = 960
const TABLET_MAX = 1120
const SIDEBAR_STORAGE_KEY = 'hangyi:sidebar-collapsed'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const currentTime = ref('')
const drawerVisible = ref(false)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const userCollapsed = ref(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true')
const mainContent = ref(null)

let timer = null

const isMobile = computed(() => viewportWidth.value < MOBILE_MAX)
const isTablet = computed(() =>
  viewportWidth.value >= MOBILE_MAX && viewportWidth.value < TABLET_MAX
)
const isCompactHeader = computed(() => viewportWidth.value < COMPACT_HEADER_MAX)
const isCollapsed = computed(() => isTablet.value || userCollapsed.value)
const pageTitle = computed(() => route.meta.title || '工作台')

const userInitial = computed(() => {
  const name = userStore.realName || userStore.username || ''
  return name.trim().charAt(0).toUpperCase() || 'U'
})

watch(
  () => route.fullPath,
  async () => {
    drawerVisible.value = false
    await nextTick()
    mainContent.value?.$el?.scrollTo?.({ top: 0 })
  }
)

onMounted(() => {
  window.addEventListener('resize', syncViewport, { passive: true })
  updateTime()
  timer = window.setInterval(updateTime, 30000)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewport)
  if (timer) window.clearInterval(timer)
})

function syncViewport() {
  viewportWidth.value = window.innerWidth
  if (!isMobile.value) drawerVisible.value = false
}

function updateTime() {
  currentTime.value = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date())
}

function toggleSidebar() {
  if (isTablet.value) return
  userCollapsed.value = !userCollapsed.value
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(userCollapsed.value))
}

async function handleCommand(command) {
  if (command !== 'logout') return
  try {
    await logoutRequest(userStore.refreshToken)
  } catch {
    // 服务不可用时仍允许本地退出，避免用户被困在当前会话。
  } finally {
    userStore.logout()
    await router.replace('/login')
  }
}
</script>

<style scoped>
.skip-link {
  position: fixed;
  top: 8px;
  left: 50%;
  z-index: 30;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  background: var(--color-brand-900);
  color: white;
  transform: translate(-50%, -160%);
  transition: transform var(--transition-base);
}

.skip-link:focus {
  transform: translate(-50%, 0);
}

.hy-shell {
  width: 100%;
  height: 100dvh;
  min-height: 520px;
  overflow: hidden;
  background: var(--color-canvas);
}

.hy-sidebar {
  position: relative;
  z-index: 4;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid rgba(127, 149, 173, 0.2);
  background:
    linear-gradient(180deg, rgba(247, 250, 252, 0.98), rgba(255, 255, 255, 0.98) 42%),
    var(--color-neutral-0);
  box-shadow: 12px 0 36px rgba(30, 50, 75, 0.035);
  transition: width 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.hy-logo {
  height: 68px;
  display: flex;
  align-items: center;
  gap: 11px;
  flex-shrink: 0;
  padding: 0 18px;
  border-bottom: 1px solid var(--color-neutral-200);
  color: inherit;
  white-space: nowrap;
}

.hy-logo:hover {
  color: inherit;
}

.hy-logo--collapsed {
  justify-content: center;
  padding: 0;
}

.hy-logo-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--color-brand-800);
  color: #bce8ed;
  box-shadow: 0 7px 16px rgba(15, 27, 45, 0.14);
}

.hy-logo-icon svg {
  width: 19px;
  height: 19px;
  fill: currentColor;
}

.hy-logo-copy {
  display: grid;
  gap: 1px;
}

.hy-logo-copy strong {
  color: var(--color-brand-900);
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.04em;
}

.hy-logo-copy small {
  color: var(--color-neutral-400);
  font: 600 9px/1.2 var(--font-family-mono);
  letter-spacing: 0.16em;
}

.hy-sidebar :deep(.hy-menu),
.hy-drawer-inner :deep(.hy-menu) {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px 12px 18px;
  border-right: 0;
  background: transparent;
}

.hy-sidebar :deep(.el-menu-item),
.hy-sidebar :deep(.el-sub-menu__title),
.hy-drawer-inner :deep(.el-menu-item),
.hy-drawer-inner :deep(.el-sub-menu__title) {
  height: 42px;
  margin: 2px 0;
  padding-left: 12px !important;
  border-radius: var(--radius-sm);
  color: var(--color-neutral-600);
  font-size: var(--font-size-md);
  line-height: 42px;
  transition:
    color var(--transition-base),
    background var(--transition-base),
    transform var(--transition-base);
}

.hy-sidebar :deep(.el-menu-item:hover),
.hy-sidebar :deep(.el-sub-menu__title:hover),
.hy-drawer-inner :deep(.el-menu-item:hover),
.hy-drawer-inner :deep(.el-sub-menu__title:hover) {
  background: var(--color-neutral-50);
  color: var(--color-neutral-900);
}

.hy-sidebar :deep(.el-menu-item:active),
.hy-drawer-inner :deep(.el-menu-item:active) {
  transform: scale(0.985);
}

.hy-sidebar :deep(.el-menu-item.is-active),
.hy-drawer-inner :deep(.el-menu-item.is-active) {
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  font-weight: var(--font-weight-semi);
  box-shadow: inset 2px 0 0 var(--color-brand-700);
}

.hy-sidebar :deep(.el-menu-item .el-icon),
.hy-sidebar :deep(.el-sub-menu__title .el-icon),
.hy-drawer-inner :deep(.el-menu-item .el-icon),
.hy-drawer-inner :deep(.el-sub-menu__title .el-icon) {
  margin-right: 10px;
  color: inherit;
  font-size: 17px;
}

.hy-sidebar :deep(.el-sub-menu .el-menu),
.hy-drawer-inner :deep(.el-sub-menu .el-menu) {
  background: transparent;
}

.hy-sidebar :deep(.el-sub-menu .el-menu-item),
.hy-drawer-inner :deep(.el-sub-menu .el-menu-item) {
  height: 38px;
  min-width: 0;
  padding-left: 38px !important;
  font-size: var(--font-size-sm);
  line-height: 38px;
}

.hy-sidebar--collapsed :deep(.hy-menu) {
  padding-inline: 8px;
}

.hy-sidebar--collapsed :deep(.el-sub-menu__title),
.hy-sidebar--collapsed :deep(.el-menu-item) {
  justify-content: center;
  margin-inline: 0;
  padding: 0 !important;
}

.hy-sidebar--collapsed :deep(.el-sub-menu__title .el-icon),
.hy-sidebar--collapsed :deep(.el-menu-item .el-icon) {
  margin: 0;
}

.hy-sidebar-footer {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--color-neutral-200);
}

.hy-collapse-button,
.hy-icon-button,
.hy-user-dropdown {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.hy-collapse-button {
  min-width: 36px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.hy-collapse-button:hover {
  background: var(--color-neutral-100);
  color: var(--color-brand-700);
}

.hy-version {
  color: var(--color-neutral-400);
  font: 500 10px/1 var(--font-family-mono);
  letter-spacing: 0.04em;
}

.hy-drawer-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
}

.hy-drawer-logo {
  min-height: 68px;
}

.hy-workspace {
  min-width: 0;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: var(--color-canvas);
}

.hy-airspace-backdrop {
  position: absolute;
  z-index: 0;
  inset: 68px 0 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 2%, rgba(198, 220, 229, 0.5), transparent 30%),
    radial-gradient(circle at 94% 12%, rgba(177, 196, 214, 0.34), transparent 31%),
    linear-gradient(150deg, #f6f8fa 0%, #eef3f6 54%, #f4f7f9 100%);
  pointer-events: none;
}

.hy-airspace-backdrop::before {
  position: absolute;
  inset: 0;
  background-image: url('/airspace-background.svg');
  background-position: center top;
  background-repeat: no-repeat;
  background-size: max(100%, 1380px) auto;
  content: '';
  opacity: 0.9;
}

.hy-airspace-backdrop::after {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.32), transparent 20%),
    radial-gradient(circle at center, transparent 36%, rgba(241, 245, 248, 0.34) 100%);
  content: '';
}

.hy-header {
  position: relative;
  z-index: 2;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 0 clamp(16px, 2.2vw, 30px);
  border-bottom: 1px solid rgba(127, 149, 173, 0.18);
  background: rgba(250, 252, 253, 0.86);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(18px) saturate(112%);
  backdrop-filter: blur(18px) saturate(112%);
}

.hy-header-left,
.hy-header-right {
  display: flex;
  align-items: center;
}

.hy-header-left {
  min-width: 0;
  gap: 12px;
}

.hy-header-right {
  gap: 12px;
}

.hy-icon-button {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  background: var(--color-neutral-0);
  color: var(--color-neutral-600);
  font-size: 18px;
  transition:
    color var(--transition-base),
    border-color var(--transition-base),
    background var(--transition-base);
}

.hy-icon-button:hover {
  border-color: var(--color-brand-300);
  background: var(--color-brand-50);
  color: var(--color-brand-700);
}

.hy-page-context {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.hy-page-context span {
  color: var(--color-neutral-400);
  font-size: 10px;
  font-weight: var(--font-weight-semi);
  letter-spacing: 0.08em;
}

.hy-page-context strong {
  overflow: hidden;
  color: var(--color-brand-900);
  font-size: 16px;
  font-weight: var(--font-weight-semi);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hy-header-time {
  padding-left: 4px;
  color: var(--color-neutral-500);
  font: 500 13px/1 var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}

.hy-user-dropdown {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 3px 4px;
  border-radius: var(--radius-md);
  transition: background var(--transition-base);
}

.hy-user-dropdown:hover {
  background: var(--color-neutral-100);
}

.hy-avatar {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--color-brand-800);
  color: white;
  font-size: 13px;
  font-weight: var(--font-weight-semi);
}

.hy-user-name {
  max-width: 120px;
  overflow: hidden;
  color: var(--color-neutral-700);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hy-arrow {
  color: var(--color-neutral-400);
  font-size: 11px;
}

.hy-main {
  position: relative;
  z-index: 1;
  min-height: 0;
  overflow: auto;
  padding: clamp(18px, 2.2vw, 30px);
  background: transparent;
  outline: none;
}

.hy-content-frame {
  width: 100%;
  max-width: 1580px;
  min-height: 100%;
  margin: 0 auto;
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.page-fade-leave-to {
  opacity: 0;
}

.hy-account-summary {
  min-width: 150px;
  display: grid;
  gap: 2px;
  padding-block: 3px;
}

.hy-account-summary strong {
  color: var(--color-neutral-800);
  font-size: var(--font-size-sm);
}

.hy-account-summary small {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

@media (max-width: 767px) {
  .hy-header {
    height: 60px;
    padding-inline: 14px;
  }

  .hy-page-context span {
    display: none;
  }

  .hy-page-context strong {
    font-size: 15px;
  }

  .hy-header-left,
  .hy-header-right {
    gap: 8px;
  }

  .hy-main {
    padding: 16px 12px 24px;
  }

  .hy-airspace-backdrop {
    inset-block-start: 60px;
  }

  .hy-airspace-backdrop::before {
    background-position: 42% top;
    background-size: auto 780px;
    opacity: 0.68;
  }

  .hy-user-dropdown {
    padding-right: 2px;
  }
}
</style>

<style>
.hy-mobile-drawer .el-drawer__body {
  padding: 0 !important;
}
</style>
