<template>
  <el-container style="height: 100vh; position: relative">
    <!-- 动态飞机背景 -->
    <div class="hy-bg-planes"></div>

    <!-- 侧边栏 -->
    <el-aside width="220px" class="hy-sidebar">
      <div class="hy-logo">
        <div class="hy-logo-icon">
          <el-icon size="20" color="#37e2ff"><Aim /></el-icon>
        </div>
        <span class="hy-logo-text">航翼排班</span>
      </div>
      <el-menu
        :default-active="route.path"
        :router="true"
        class="hy-menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataBoard /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/employee">
          <el-icon><User /></el-icon>
          <span>人员管理</span>
        </el-menu-item>
        <el-menu-item index="/groups">
          <el-icon><Collection /></el-icon>
          <span>班组管理</span>
        </el-menu-item>
        <el-menu-item index="/qualifications">
          <el-icon><Key /></el-icon>
          <span>资质管理</span>
        </el-menu-item>
        <el-menu-item index="/aircraft-types">
          <el-icon><TakeawayBox /></el-icon>
          <span>机型管理</span>
        </el-menu-item>
        <el-menu-item index="/preferences">
          <el-icon><ThumbUp /></el-icon>
          <span>排班偏好</span>
        </el-menu-item>
        <el-menu-item index="/shifts">
          <el-icon><Timer /></el-icon>
          <span>班次模板</span>
        </el-menu-item>
        <el-menu-item index="/schedules">
          <el-icon><Calendar /></el-icon>
          <span>排班管理</span>
        </el-menu-item>
        <el-menu-item index="/schedule-gantt">
          <el-icon><Histogram /></el-icon>
          <span>甘特图</span>
        </el-menu-item>
        <el-menu-item index="/flights">
          <el-icon><Aim /></el-icon>
          <span>航班计划</span>
        </el-menu-item>
        <el-menu-item index="/leaves">
          <el-icon><Edit /></el-icon>
          <span>请假管理</span>
        </el-menu-item>

        <el-menu-item index="/swap">
          <el-icon><Switch /></el-icon>
          <span>调班管理</span>
        </el-menu-item>
        <el-menu-item index="/statistics">
          <el-icon><DataAnalysis /></el-icon>
          <span>排班统计</span>
        </el-menu-item>
        <el-menu-item index="/compliance">
          <el-icon><CircleCheck /></el-icon>
          <span>合规检查</span>
        </el-menu-item>
        <el-menu-item index="/audit">
          <el-icon><Document /></el-icon>
          <span>审计日志</span>
        </el-menu-item>
        <el-menu-item index="/service-schedule">
          <el-icon><Service /></el-icon>
          <span>勤务排班</span>
        </el-menu-item>
      </el-menu>

      <!-- 底部版本信息 -->
      <div class="hy-sidebar-footer">
        <span>v1.0.0</span>
      </div>
    </el-aside>

    <el-container style="position: relative; z-index: 1">
      <!-- 顶部 -->
      <el-header class="hy-header">
        <div class="hy-header-left">
          <div class="hy-breadcrumb-dot"></div>
          <span class="hy-breadcrumb-text">航翼智能排班管理系统</span>
        </div>
        <div class="hy-header-right">
          <div class="hy-header-time">{{ currentTime }}</div>
          <el-dropdown @command="handleCommand">
            <span class="hy-user-dropdown">
              <div class="hy-avatar">
                <span>{{ userInitial }}</span>
              </div>
              <span class="hy-user-name">{{ userStore.realName || userStore.username }}</span>
              <el-icon class="hy-arrow"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon style="margin-right: 6px"><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容 -->
      <el-main class="hy-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../store/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const currentTime = ref('')
let timer = null

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 30000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function updateTime() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  currentTime.value = `${h}:${m}`
}

const userInitial = computed(() => {
  const name = userStore.realName || userStore.username || ''
  return name.charAt(0).toUpperCase() || 'U'
})

function handleCommand(cmd) {
  if (cmd === 'logout') {
    userStore.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
/* ===== 侧边栏 ===== */
.hy-sidebar {
  background: linear-gradient(180deg, #152a45 0%, #0c1d33 100%);
  border-right: 1px solid rgba(84, 170, 255, 0.12);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 2;
}

.hy-logo {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(84, 170, 255, 0.1);
}

.hy-logo-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(55, 226, 255, 0.15), rgba(55, 226, 255, 0.05));
  border: 1px solid rgba(55, 226, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hy-logo-text {
  color: #d8ebff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 2px;
}

/* ===== 菜单 ===== */
.hy-menu {
  border-right: none !important;
  background: transparent !important;
  flex: 1;
  padding-top: 4px;
}

.hy-menu .el-menu-item {
  color: #8fa8c8 !important;
  height: 44px;
  line-height: 44px;
  margin: 2px 10px;
  border-radius: 8px;
  font-size: 14px;
  padding-left: 14px !important;
  transition: all 0.2s ease;
}

.hy-menu .el-menu-item:hover {
  background: rgba(64, 158, 255, 0.08) !important;
  color: #c8daf0 !important;
}

.hy-menu .el-menu-item.is-active {
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.15), rgba(55, 226, 255, 0.08)) !important;
  color: #409eff !important;
  font-weight: 600;
}

.hy-menu .el-menu-item .el-icon {
  color: inherit;
  margin-right: 8px;
  font-size: 16px;
}

/* ===== 侧边栏底部 ===== */
.hy-sidebar-footer {
  padding: 12px 20px;
  border-top: 1px solid rgba(84, 170, 255, 0.08);
  text-align: center;
  font-size: 11px;
  color: rgba(143, 168, 200, 0.5);
  letter-spacing: 1px;
}

/* ===== 顶部栏 ===== */
.hy-header {
  background: rgba(240, 247, 255, 0.85) !important;
  border-bottom: 1px solid rgba(124, 156, 198, 0.25) !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: 56px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.hy-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hy-breadcrumb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #245090, #409eff);
  box-shadow: 0 0 6px rgba(36, 80, 144, 0.3);
}

.hy-breadcrumb-text {
  color: #5f7391;
  font-size: 14px;
  font-weight: 500;
}

.hy-header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.hy-header-time {
  font-size: 13px;
  color: #97b7dc;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
  padding: 4px 12px;
  background: rgba(151, 183, 220, 0.08);
  border-radius: 6px;
}

.hy-user-dropdown {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 20px;
  transition: background 0.2s;
}

.hy-user-dropdown:hover {
  background: rgba(83, 153, 255, 0.08);
}

.hy-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #245090, #409eff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.hy-user-name {
  color: #5f7391;
  font-size: 14px;
}

.hy-arrow {
  color: #97b7dc;
  font-size: 12px;
}

/* ===== 主内容 ===== */
.hy-main {
  background: linear-gradient(180deg, #e8f4ff 0%, #d6ebff 100%);
  padding: 24px;
  min-height: 0;
  position: relative;
}
</style>
