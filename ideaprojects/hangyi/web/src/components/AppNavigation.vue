<template>
  <el-menu
    :key="`${drawer ? 'drawer' : 'sidebar'}-${activeGroup || 'none'}-${collapsed}`"
    :default-active="route.path"
    :default-openeds="activeGroup ? [activeGroup] : []"
    :router="true"
    :collapse="collapsed"
    :collapse-transition="false"
    :unique-opened="true"
    class="hy-menu"
    :class="{ 'hy-menu--drawer': drawer }"
    @select="$emit('select')"
  >
    <el-sub-menu
      v-for="group in navigationGroups"
      :key="group.key"
      :index="group.key"
    >
      <template #title>
        <el-icon><component :is="group.icon" /></el-icon>
        <span>{{ group.label }}</span>
      </template>
      <el-menu-item
        v-for="item in group.items"
        :key="item.path"
        :index="item.path"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </el-menu-item>
    </el-sub-menu>
  </el-menu>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { navigationGroups } from '../config/navigation'

defineProps({
  collapsed: {
    type: Boolean,
    default: false
  },
  drawer: {
    type: Boolean,
    default: false
  }
})

defineEmits(['select'])

const route = useRoute()

const activeGroup = computed(() => {
  return navigationGroups.find(group =>
    group.items.some(item => item.path === route.path)
  )?.key
})
</script>
