<template>
  <view class="page">
    <!-- 今日概览头部 -->
    <view class="header-card">
      <text class="date">{{ today }}</text>
      <text class="day">{{ dayName }}</text>
      <view class="shift-badge" v-if="myShift">
        <text class="badge-text">{{ myShift }}</text>
      </view>
      <view class="shift-badge empty" v-else>
        <text class="badge-text">今日休息</text>
      </view>
    </view>

    <!-- 今日排班列表 -->
    <view class="section">
      <view class="section-title">今日在岗人员</view>
      <view v-if="loading" class="loading">加载中...</view>
      <view v-else-if="employees.length === 0" class="empty">
        <text>暂无排班数据</text>
      </view>
      <view v-else class="employee-list">
        <view class="employee-item" v-for="emp in employees" :key="emp.id">
          <view class="emp-info">
            <text class="emp-name">{{ emp.name }}</text>
            <text class="emp-shift">{{ emp.shiftName }}</text>
          </view>
          <text class="emp-time">{{ emp.shiftTime }}</text>
        </view>
      </view>
    </view>

    <!-- 快捷操作 -->
    <view class="section">
      <view class="section-title">快捷操作</view>
      <view class="actions">
        <view class="action-item" @click="toPage('schedule')">
          <text class="action-icon">📅</text>
          <text>我的排班</text>
        </view>
        <view class="action-item" @click="toPage('swap')">
          <text class="action-icon">🔄</text>
          <text>申请换班</text>
        </view>
        <view class="action-item" @click="toPage('leave')">
          <text class="action-icon">📝</text>
          <text>请假申请</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import api from '../../api/index'

export default {
  data() {
    return {
      today: '',
      dayName: '',
      myShift: null,
      employees: [],
      loading: false
    }
  },
  onShow() {
    this.initDate()
    this.loadData()
  },
  onPullDownRefresh() {
    this.loadData().then(() => uni.stopPullDownRefresh())
  },
  methods: {
    initDate() {
      const d = new Date()
      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      this.today = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
      this.dayName = `星期${weekdays[d.getDay()]}`
    },
    async loadData() {
      this.loading = true
      try {
        const details = await api.getScheduleByDate(new Date().toISOString().slice(0, 10))
        const employees = await api.getEmployeeList()
        const empRecords = employees.records || employees || []

        // 获取我的排班
        const realName = uni.getStorageSync('realName')
        const myDetail = details.find(d => {
          const emp = empRecords.find(e => e.id === d.employeeId)
          return emp && emp.name === realName
        })
        this.myShift = myDetail ? `今日排班: ${'班次' + myDetail.shiftId}` : null

        // 构建排班列表
        this.employees = details.map(d => {
          const emp = empRecords.find(e => e.id === d.employeeId)
          return {
            id: d.employeeId,
            name: emp ? emp.name : `员工${d.employeeId}`,
            shiftName: `班次${d.shiftId}`,
            shiftTime: d.scheduleType === 'AUTO' ? '自动排班' : '手动调整'
          }
        })
      } catch (e) {
        console.error(e)
      } finally {
        this.loading = false
      }
    },
    toPage(name) {
      uni.switchTab({ url: `/pages/${name}/index` })
    }
  }
}
</script>

<style>
.page { padding: 20rpx; }
.header-card {
  background: linear-gradient(135deg, #409EFF, #2d5a8e);
  color: #fff;
  padding: 40rpx;
  border-radius: 16rpx;
  text-align: center;
  margin-bottom: 30rpx;
}
.date { font-size: 40rpx; font-weight: bold; display: block; }
.day { font-size: 28rpx; opacity: 0.8; margin-top: 10rpx; display: block; }
.shift-badge {
  margin-top: 20rpx;
  background: rgba(255,255,255,0.2);
  padding: 12rpx 40rpx;
  border-radius: 40rpx;
  display: inline-block;
}
.shift-badge.empty { background: rgba(255,255,255,0.1); }
.badge-text { font-size: 30rpx; }
.section { margin-bottom: 30rpx; }
.section-title {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
  color: #333;
}
.employee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 24rpx 30rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}
.emp-name { font-size: 30rpx; font-weight: bold; display: block; }
.emp-shift { font-size: 26rpx; color: #409EFF; margin-top: 6rpx; display: block; }
.emp-time { font-size: 26rpx; color: #999; }
.actions {
  display: flex;
  justify-content: space-around;
}
.action-item {
  background: #fff;
  padding: 30rpx;
  border-radius: 12rpx;
  text-align: center;
  flex: 1;
  margin: 0 10rpx;
}
.action-icon { font-size: 48rpx; display: block; margin-bottom: 10rpx; }
.loading, .empty { text-align: center; color: #999; padding: 40rpx; }
</style>
