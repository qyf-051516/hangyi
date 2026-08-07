<template>
  <button
    type="button"
    class="command-trigger"
    aria-label="快速跳转页面"
    @click="openPalette"
  >
    <el-icon><Search /></el-icon>
    <span>快速跳转</span>
    <kbd>{{ shortcutLabel }}</kbd>
  </button>

  <el-dialog
    v-model="visible"
    width="min(560px, calc(100vw - 32px))"
    class="command-dialog"
    :show-close="false"
    :lock-scroll="true"
    append-to-body
    @closed="resetPalette"
  >
    <template #header>
      <div class="command-search">
        <el-icon><Search /></el-icon>
        <input
          ref="searchInput"
          v-model.trim="keyword"
          type="search"
          autocomplete="off"
          placeholder="搜索页面或功能"
          aria-label="搜索页面或功能"
          @keydown="handleSearchKeydown"
        >
        <kbd>ESC</kbd>
      </div>
    </template>

    <div class="command-results" role="listbox" aria-label="页面列表">
      <button
        v-for="(item, index) in filteredItems"
        :key="item.path"
        type="button"
        class="command-result"
        :class="{ 'is-active': index === activeIndex }"
        :aria-selected="index === activeIndex"
        role="option"
        @mouseenter="activeIndex = index"
        @click="navigate(item.path)"
      >
        <span class="command-result-icon">
          <el-icon><component :is="item.icon" /></el-icon>
        </span>
        <span class="command-result-copy">
          <strong>{{ item.label }}</strong>
          <small>{{ item.description }}</small>
        </span>
        <span class="command-result-meta">{{ item.group }}</span>
        <el-icon class="command-result-arrow"><ArrowRight /></el-icon>
      </button>

      <div v-if="filteredItems.length === 0" class="command-empty">
        没有找到“{{ keyword }}”相关页面
      </div>
    </div>

    <template #footer>
      <div class="command-help">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>↵</kbd> 打开</span>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Search } from '@element-plus/icons-vue'
import { navigationItems } from '../config/navigation'

const router = useRouter()
const visible = ref(false)
const keyword = ref('')
const activeIndex = ref(0)
const searchInput = ref(null)

const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

const filteredItems = computed(() => {
  const query = keyword.value.toLocaleLowerCase('zh-CN')
  if (!query) return navigationItems
  return navigationItems.filter(item =>
    `${item.label} ${item.description} ${item.group} ${item.path}`
      .toLocaleLowerCase('zh-CN')
      .includes(query)
  )
})

watch(filteredItems, () => {
  activeIndex.value = 0
})

watch(visible, async isVisible => {
  if (!isVisible) return
  await nextTick()
  searchInput.value?.focus()
})

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

function openPalette() {
  visible.value = true
}

function resetPalette() {
  keyword.value = ''
  activeIndex.value = 0
}

function handleGlobalKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    visible.value = !visible.value
  }
}

function handleSearchKeydown(event) {
  if (event.key === 'Escape') {
    visible.value = false
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (filteredItems.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % filteredItems.value.length
    }
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (filteredItems.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + filteredItems.value.length) % filteredItems.value.length
    }
    return
  }
  if (event.key === 'Enter' && filteredItems.value[activeIndex.value]) {
    event.preventDefault()
    navigate(filteredItems.value[activeIndex.value].path)
  }
}

function navigate(path) {
  visible.value = false
  router.push(path)
}
</script>

<style scoped>
.command-trigger {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  color: var(--color-neutral-500);
  background: var(--color-neutral-50);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition:
    color var(--transition-base),
    border-color var(--transition-base),
    background var(--transition-base);
}

.command-trigger:hover {
  color: var(--color-brand-700);
  border-color: var(--color-brand-300);
  background: var(--color-neutral-0);
}

kbd {
  min-width: 22px;
  padding: 2px 5px;
  border: 1px solid var(--color-neutral-200);
  border-bottom-color: var(--color-neutral-300);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-0);
  color: var(--color-neutral-500);
  font: 500 11px/1.4 var(--font-family-mono);
  text-align: center;
}

.command-trigger kbd {
  margin-left: 12px;
}

.command-search {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}

.command-search > .el-icon {
  color: var(--color-brand-600);
  font-size: 19px;
}

.command-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  color: var(--color-neutral-900);
  font: 500 17px/1.5 var(--font-family);
}

.command-search input::placeholder {
  color: var(--color-neutral-400);
}

.command-results {
  max-height: min(430px, 62vh);
  overflow-y: auto;
  padding: 6px;
}

.command-result {
  width: 100%;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.command-result.is-active {
  background: var(--color-brand-50);
}

.command-result-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-100);
  color: var(--color-brand-700);
}

.command-result-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.command-result-copy strong {
  color: var(--color-neutral-900);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semi);
}

.command-result-copy small {
  overflow: hidden;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-result-meta {
  color: var(--color-neutral-400);
  font-size: var(--font-size-xs);
}

.command-result-arrow {
  color: var(--color-neutral-400);
}

.command-empty {
  padding: 48px 20px;
  color: var(--color-neutral-500);
  text-align: center;
}

.command-help {
  display: flex;
  align-items: center;
  gap: 18px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.command-help span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 767px) {
  .command-trigger {
    width: 36px;
    justify-content: center;
    padding: 0;
  }

  .command-trigger span,
  .command-trigger kbd,
  .command-result-meta {
    display: none;
  }

  .command-result {
    grid-template-columns: 38px minmax(0, 1fr) auto;
  }
}
</style>

<style>
.command-dialog {
  margin-top: max(10vh, 56px) !important;
}

.command-dialog .el-dialog__header {
  padding: 16px 18px !important;
}

.command-dialog .el-dialog__body {
  padding: 0 !important;
}

.command-dialog .el-dialog__footer {
  padding: 10px 18px !important;
}
</style>
