<template>
  <view class="page">
    <!-- 提交请假 -->
    <view class="section">
      <view class="section-title">提交请假</view>
      <view class="form-card">
        <view class="form-item">
          <text class="form-label">请假类型</text>
          <picker :range="leaveTypes" @change="onTypeChange">
            <view class="picker">{{ leaveTypes[leaveTypeIdx] }}</view>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">开始日期</text>
          <picker mode="date" @change="onStartChange">
            <view class="picker">{{ leaveForm.startDate || '请选择' }}</view>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">结束日期</text>
          <picker mode="date" @change="onEndChange">
            <view class="picker">{{ leaveForm.endDate || '请选择' }}</view>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">请假原因</text>
          <input class="form-input" v-model="leaveForm.reason" placeholder="请输入请假原因" />
        </view>
        <button class="btn-primary" @click="handleSubmit">提交申请</button>
      </view>
    </view>

    <!-- 我的请假记录 -->
    <view class="section">
      <view class="section-title">我的请假记录</view>
      <view v-if="leaves.length === 0" class="empty">暂无记录</view>
      <view class="leave-list" v-else>
        <view class="leave-item" v-for="l in leaves" :key="l.id">
          <text class="leave-date">{{ l.startDate }} ~ {{ l.endDate }}</text>
          <text class="leave-type">{{ typeMap[l.leaveType] }}</text>
          <text class="leave-status" :class="statusClass(l.status)">{{ statusText(l.status) }}</text>
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
      leaveTypes: ['年假', '病假', '事假', '其他'],
      leaveTypeIdx: 0,
      leaveForm: { startDate: '', endDate: '', reason: '' },
      leaves: [],
      typeMap: { ANNUAL: '年假', SICK: '病假', PERSONAL: '事假', OTHER: '其他' }
    }
  },
  onShow() {
    this.loadLeaves()
  },
  methods: {
    onTypeChange(e) { this.leaveTypeIdx = e.detail.value },
    onStartChange(e) { this.leaveForm.startDate = e.detail.value },
    onEndChange(e) { this.leaveForm.endDate = e.detail.value },
    async handleSubmit() {
      if (!this.leaveForm.startDate || !this.leaveForm.endDate) {
        uni.showToast({ title: '请选择日期', icon: 'none' })
        return
      }
      const types = ['ANNUAL', 'SICK', 'PERSONAL', 'OTHER']
      try {
        await api.createLeave({
          employeeId: 0,
          leaveType: types[this.leaveTypeIdx],
          startDate: this.leaveForm.startDate,
          endDate: this.leaveForm.endDate,
          reason: this.leaveForm.reason
        })
        uni.showToast({ title: '提交成功', icon: 'success' })
        this.leaveForm = { startDate: '', endDate: '', reason: '' }
        this.loadLeaves()
      } catch (e) {}
    },
    async loadLeaves() {
      try {
        const res = await api.getMyLeaves(0)
        this.leaves = res.records || []
      } catch (e) {}
    },
    statusClass(s) {
      return s === 1 ? 'approved' : s === 2 ? 'rejected' : 'pending'
    },
    statusText(s) {
      return s === 1 ? '已通过' : s === 2 ? '已驳回' : '待审批'
    }
  }
}
</script>

<style>
.page { padding: 20rpx; }
.section { margin-bottom: 30rpx; }
.section-title { font-size: 32rpx; font-weight: bold; margin-bottom: 20rpx; }
.form-card {
  background: #fff;
  padding: 30rpx;
  border-radius: 12rpx;
}
.form-item { margin-bottom: 30rpx; }
.form-label { font-size: 28rpx; color: #666; display: block; margin-bottom: 10rpx; }
.form-input, .picker {
  height: 80rpx;
  border: 2rpx solid #dcdfe6;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  width: 100%;
  box-sizing: border-box;
  line-height: 80rpx;
}
.btn-primary {
  width: 100%;
  height: 88rpx;
  background: #409EFF;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  line-height: 88rpx;
  text-align: center;
  border: none;
}
.leave-item {
  display: flex;
  justify-content: space-between;
  background: #fff;
  padding: 24rpx 30rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}
.leave-date { font-size: 26rpx; }
.leave-type { font-size: 26rpx; color: #409EFF; }
.leave-status { font-size: 26rpx; }
.leave-status.approved { color: #67C23A; }
.leave-status.rejected { color: #F56C6C; }
.leave-status.pending { color: #E6A23C; }
.empty { text-align: center; color: #999; padding: 60rpx; }
</style>
