<template>
  <header class="app-page-header">
    <div class="app-page-header__copy">
      <span class="app-page-header__eyebrow">{{ eyebrow }}</span>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="app-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup>
defineProps({
  eyebrow: {
    type: String,
    default: 'OPERATIONS / MANAGEMENT'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.app-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-5);
}

.app-page-header__copy {
  min-width: 0;
}

.app-page-header__eyebrow {
  display: block;
  margin-bottom: 7px;
  color: var(--color-brand-500);
  font: 600 10px/1.2 var(--font-family-mono);
  letter-spacing: 0.14em;
}

h1 {
  color: var(--color-brand-900);
  font-size: clamp(24px, 2.2vw, 30px);
  font-weight: 650;
  letter-spacing: -0.035em;
}

p {
  max-width: 64ch;
  margin: 8px 0 0;
  color: var(--color-neutral-500);
  font-size: var(--font-size-sm);
  line-height: 1.65;
  text-wrap: pretty;
}

.app-page-header__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-bottom: 2px;
}

@media (max-width: 767px) {
  .app-page-header {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-4);
  }

  .app-page-header__actions {
    width: 100%;
    justify-content: flex-start;
  }

  .app-page-header__actions :deep(.el-button) {
    flex: 1;
  }
}
</style>
