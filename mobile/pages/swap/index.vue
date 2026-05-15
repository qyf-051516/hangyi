<template>
  <view class="page">
    <!-- 申请换班 -->
    <view class="section">
      <view class="section-title">申请换班</view>
      <view class="form-card">
        <view class="form-item">
          <text class="form-label">目标日期</text>
          <picker mode="date" @change="onDateChange">
            <view class="picker">{{ swapForm.date || '请选择日期' }}</view>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">原班次</text>
          <input class="form-input" v-model="swapForm.fromShift" placeholder="如：早班" />
        </view>
        <view class="form-item">
          <text class="form-label">目标班次</text>
          <input class="form-input" v-model="swapForm.toShift" placeholder="如：晚班" />
        </view>
        <view class="form-item">
          <text class="form-label">换班理由</text>
          <input class="form-input" v-model="swapForm.reason" placeholder="请输入换班理由" />
        </view>
        <button class="btn-primary" @click="handleSubmitSwap">提交申请</button>
      </view>
    </view>

    <!-- 我的换班记录 -->
    <view class="section">
      <view class="section-title">我的换班记录</view>
      <view v-if="swaps.length === 0" class="empty">暂无记录</view>
      <view class="swap-list" v-else>
        <view class="swap-item" v-for="s in swaps" :key="s.id">
          <text class="swap-date">{{ s.fromDate }}</text>
          <text class="swap-status" :class="statusClass(s.status)">{{ statusText(s.status) }}</text>
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
      swapForm: { date: '', fromShift: '', toShift: '', reason: '' },
      swaps: []
    }
  },
  onShow() {
    this.loadSwaps()
  },
  methods: {
    onDateChange(e) {
      this.swapForm.date = e.detail.value
    },
    async handleSubmitSwap() {
      if (!this.swapForm.date) {
        uni.showToast({ title: '请选择日期', icon: 'none' })
        return
      }
      try {
        await api.createSwap({
          employeeId: 0, // 真实场景传当前员工 ID
          fromDate: this.swapForm.date,
          reason: this.swapForm.reason,
          changeType: 'SWAP'
        })
        uni.showToast({ title: '提交成功', icon: 'success' })
        this.swapForm = { date: '', fromShift: '', toShift: '', reason: '' }
        this.loadSwaps()
      } catch (e) {}
    },
    async loadSwaps() {
      try {
        const res = await api.getMySwaps(0)
        this.swaps = res.records || []
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
.swap-item {
  display: flex;
  justify-content: space-between;
  background: #fff;
  padding: 24rpx 30rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}
.swap-date { font-size: 28rpx; }
.swap-status { font-size: 26rpx; }
.swap-status.approved { color: #67C23A; }
.swap-status.rejected { color: #F56C6C; }
.swap-status.pending { color: #E6A23C; }
.empty { text-align: center; color: #999; padding: 60rpx; }
</style>
