<template>
  <view>
    <page-meta>
      <navigation-bar :title="navTitle" />
    </page-meta>
  </view>
</template>

<script>
export default {
  onLaunch() {
    // 检查登录状态
    const token = uni.getStorageSync('token')
    if (!token) {
      uni.reLaunch({ url: '/pages/login/login' })
    }
  },
  computed: {
    navTitle() {
      return '机场排班'
    }
  }
}
</script>

<style>
/* 全局样式 */
page {
  background-color: #f5f5f5;
  font-size: 14px;
  color: #333;
}
</style>
