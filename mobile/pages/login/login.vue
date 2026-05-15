<template>
  <view class="login-page">
    <view class="login-card">
      <view class="logo-area">
        <text class="logo-icon">✈</text>
        <text class="logo-text">机场排班系统</text>
      </view>

      <view class="form">
        <view class="input-group">
          <text class="label">用户名</text>
          <input class="input" v-model="username" placeholder="请输入用户名" />
        </view>
        <view class="input-group">
          <text class="label">密码</text>
          <input class="input" v-model="password" type="password" placeholder="请输入密码" />
        </view>
        <button class="btn-login" :disabled="loading" @click="handleLogin">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script>
import api from '../../api/index'

export default {
  data() {
    return {
      username: '',
      password: '',
      loading: false
    }
  },
  methods: {
    async handleLogin() {
      if (!this.username || !this.password) {
        uni.showToast({ title: '请输入用户名和密码', icon: 'none' })
        return
      }
      this.loading = true
      try {
        const res = await api.login(this.username, this.password)
        uni.setStorageSync('token', res.token)
        uni.setStorageSync('username', res.username)
        uni.setStorageSync('realName', res.realName)
        uni.showToast({ title: '登录成功', icon: 'success' })
        uni.reLaunch({ url: '/pages/index/index' })
      } catch (e) {
        // 错误已在 api 层处理
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a365d 0%, #2d5a8e 100%);
}
.login-card {
  width: 85%;
  padding: 40rpx 30rpx;
  background: #fff;
  border-radius: 16rpx;
}
.logo-area {
  text-align: center;
  margin-bottom: 50rpx;
}
.logo-icon {
  font-size: 60rpx;
}
.logo-text {
  display: block;
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  margin-top: 16rpx;
}
.input-group {
  margin-bottom: 30rpx;
}
.label {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 10rpx;
  display: block;
}
.input {
  height: 88rpx;
  border: 2rpx solid #dcdfe6;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  width: 100%;
  box-sizing: border-box;
}
.btn-login {
  width: 100%;
  height: 88rpx;
  background: #409EFF;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  line-height: 88rpx;
  text-align: center;
  margin-top: 40rpx;
  border: none;
}
.btn-login[disabled] {
  opacity: 0.6;
}
</style>
