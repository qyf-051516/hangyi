<template>
  <view class="page">
    <view class="section">
      <view class="section-title">本周排班</view>
      <view class="week-selector">
        <text class="week-btn" @click="prevWeek">‹ 上一周</text>
        <text class="week-label">{{ weekLabel }}</text>
        <text class="week-btn" @click="nextWeek">下一周 ›</text>
      </view>
    </view>

    <!-- 班次日历 -->
    <view class="schedule-calendar">
      <view class="cal-header">
        <text class="cal-hd" v-for="d in weekDays" :key="d">{{ d }}</text>
      </view>
      <view class="cal-body">
        <view
          class="cal-cell"
          v-for="(day, idx) in weekDates"
          :key="idx"
          :class="{ today: day.isToday }"
        >
          <text class="cal-date">{{ day.date }}</text>
          <text class="cal-shift" v-if="day.shiftName">{{ day.shiftName }}</text>
          <text class="cal-shift rest" v-else>休</text>
        </view>
      </view>
    </view>

    <!-- 我的排班列表 -->
    <view class="section">
      <view class="section-title">排班明细</view>
      <view v-if="details.length === 0" class="empty">暂无排班记录</view>
      <view class="detail-list" v-else>
        <view class="detail-item" v-for="d in details" :key="d.id">
          <text class="detail-date">{{ d.workDate }}</text>
          <text class="detail-shift">班次 {{ d.shiftId }}</text>
          <text class="detail-type">{{ d.scheduleType === 'AUTO' ? '自动' : '手动' }}</text>
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
      weekDays: ['一', '二', '三', '四', '五', '六', '日'],
      weekDates: [],
      weekLabel: '',
      weekOffset: 0,
      details: []
    }
  },
  onShow() {
    this.computeWeek()
    this.loadData()
  },
  methods: {
    computeWeek() {
      const now = new Date()
      now.setDate(now.getDate() + this.weekOffset * 7)
      const dayOfWeek = now.getDay() || 7 // 1=周一 ... 7=周日
      const monday = new Date(now)
      monday.setDate(now.getDate() - dayOfWeek + 1)

      this.weekDates = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        const today = new Date()
        const isToday = dateStr === today.toISOString().slice(0, 10)
        this.weekDates.push({ date: d.getDate(), fullDate: dateStr, isToday, shiftName: null })
      }

      const start = this.weekDates[0].fullDate
      const end = this.weekDates[6].fullDate
      this.weekLabel = `${start.slice(5)} ~ ${end.slice(5)}`
    },
    async loadData() {
      try {
        const allDetails = []
        for (const day of this.weekDates) {
          const res = await api.getScheduleByDate(day.fullDate)
          if (res && res.length > 0) {
            allDetails.push(...res)
            // 标记当前用户的班次
            day.shiftName = `班次${res[0].shiftId}`
          }
        }
        this.details = allDetails
      } catch (e) {
        console.error(e)
      }
    },
    prevWeek() { this.weekOffset--; this.computeWeek(); this.loadData() },
    nextWeek() { this.weekOffset++; this.computeWeek(); this.loadData() }
  }
}
</script>

<style>
.page { padding: 20rpx; }
.section { margin-bottom: 30rpx; }
.section-title { font-size: 32rpx; font-weight: bold; margin-bottom: 20rpx; }
.week-selector {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 20rpx;
  border-radius: 12rpx;
}
.week-btn { color: #409EFF; font-size: 28rpx; padding: 10rpx; }
.week-label { font-size: 28rpx; font-weight: bold; }
.schedule-calendar {
  background: #fff;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
}
.cal-header, .cal-body { display: flex; }
.cal-hd, .cal-cell {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
}
.cal-hd { font-size: 26rpx; color: #999; }
.cal-cell { border-top: 2rpx solid #f0f0f0; }
.cal-cell.today { background: #ecf5ff; border-radius: 8rpx; }
.cal-date { font-size: 28rpx; display: block; }
.cal-shift {
  font-size: 22rpx;
  color: #409EFF;
  display: block;
  margin-top: 6rpx;
  background: #ecf5ff;
  border-radius: 4rpx;
  padding: 4rpx;
}
.cal-shift.rest { color: #999; background: #f5f5f5; }
.detail-item {
  display: flex;
  justify-content: space-between;
  background: #fff;
  padding: 24rpx 30rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}
.detail-date { font-size: 28rpx; }
.detail-shift { color: #409EFF; }
.detail-type { color: #999; font-size: 24rpx; }
.empty { text-align: center; color: #999; padding: 60rpx; }
</style>
