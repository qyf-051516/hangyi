<template>
  <section
    class="app-page-state"
    :class="[`app-page-state--${type}`, { 'app-page-state--compact': compact }]"
    :role="type === 'error' ? 'alert' : 'status'"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <template v-if="type === 'loading'">
      <div class="app-page-state__skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span class="sr-only">{{ title || '正在加载' }}</span>
    </template>
    <template v-else>
      <span class="app-page-state__mark" aria-hidden="true">
        <svg v-if="type === 'error'" viewBox="0 0 32 32">
          <path d="M16 5.5 27 25H5L16 5.5Z" />
          <path d="M16 12v6.5M16 22h.01" />
        </svg>
        <svg v-else viewBox="0 0 32 32">
          <path d="M4.5 20.5c5.8-1.2 8.5-7.5 13.7-6.4 3.7.8 4.2 5.8 9.3 5.2" />
          <path d="M6 25h20M8 9.5h6M11 6.5v6" />
        </svg>
      </span>
      <strong>{{ title }}</strong>
      <p v-if="description">{{ description }}</p>
      <el-button v-if="actionLabel" type="primary" plain @click="$emit('action')">
        {{ actionLabel }}
      </el-button>
    </template>
  </section>
</template>

<script setup>
defineProps({
  type: {
    type: String,
    default: 'empty',
    validator: value => ['loading', 'empty', 'error'].includes(value)
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  actionLabel: {
    type: String,
    default: ''
  },
  compact: {
    type: Boolean,
    default: false
  }
})

defineEmits(['action'])
</script>

<style scoped>
.app-page-state {
  display: grid;
  justify-items: center;
  min-height: 260px;
  padding: 52px 24px 58px;
  text-align: center;
}

.app-page-state--compact {
  min-height: 170px;
  padding: 32px 20px 36px;
}

.app-page-state__mark {
  display: grid;
  width: 54px;
  height: 54px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid var(--color-brand-100);
  border-radius: 18px 18px 18px 6px;
  color: var(--color-brand-600);
  background: var(--color-brand-50);
}

.app-page-state__mark svg {
  width: 28px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.app-page-state--error .app-page-state__mark {
  color: var(--color-danger);
  border-color: rgba(197, 48, 48, 0.16);
  background: var(--color-danger-bg);
}

strong {
  color: var(--color-brand-900);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semi);
}

p {
  max-width: 50ch;
  margin: 8px 0 18px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-sm);
  line-height: 1.65;
  text-wrap: pretty;
}

.app-page-state__skeleton {
  width: min(100%, 680px);
}

.app-page-state__skeleton i {
  display: block;
  height: 14px;
  margin: 0 auto 14px;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    100deg,
    var(--color-neutral-100) 20%,
    var(--color-brand-50) 42%,
    var(--color-neutral-100) 64%
  );
  background-size: 220% 100%;
  animation: app-state-shimmer 1.4s ease-in-out infinite;
}

.app-page-state__skeleton i:nth-child(1) { width: 100%; height: 42px; }
.app-page-state__skeleton i:nth-child(2) { width: 88%; }
.app-page-state__skeleton i:nth-child(3) { width: 64%; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes app-state-shimmer {
  to { background-position-x: -220%; }
}
</style>
