<template>
  <section class="not-found" aria-labelledby="not-found-title">
    <div class="not-found-code" aria-hidden="true">404</div>
    <div class="not-found-copy">
      <span class="not-found-eyebrow">NAVIGATION ERROR</span>
      <h1 id="not-found-title">这条航线没有对应页面</h1>
      <p>地址可能已变更，或你访问的功能尚未开放。可以返回仪表盘继续工作。</p>
      <div class="not-found-actions">
        <el-button type="primary" @click="$router.replace('/dashboard')">返回仪表盘</el-button>
        <el-button @click="$router.back()">返回上一页</el-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.not-found {
  min-height: calc(100dvh - 68px - 60px);
  display: grid;
  grid-template-columns: minmax(220px, 0.7fr) minmax(320px, 1fr);
  align-items: center;
  gap: clamp(36px, 8vw, 120px);
  padding: clamp(28px, 7vw, 96px);
  overflow: hidden;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xl);
  background: var(--color-neutral-0);
}

.not-found-code {
  position: relative;
  color: var(--color-brand-100);
  font: 700 clamp(112px, 18vw, 260px) / 0.8 var(--font-family-mono);
  letter-spacing: -0.12em;
  user-select: none;
}

.not-found-code::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 8%;
  width: 120%;
  height: 2px;
  background: var(--color-brand-500);
  transform: rotate(-12deg);
  transform-origin: left;
}

.not-found-copy {
  max-width: 520px;
}

.not-found-eyebrow {
  color: var(--color-brand-600);
  font: 600 11px/1 var(--font-family-mono);
  letter-spacing: 0.14em;
}

.not-found h1 {
  max-width: 11em;
  margin-top: 16px;
  color: var(--color-brand-900);
  font-size: clamp(32px, 4vw, 56px);
  letter-spacing: -0.045em;
  text-wrap: balance;
}

.not-found p {
  max-width: 48ch;
  margin: 20px 0 28px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-lg);
  line-height: 1.75;
}

.not-found-actions {
  display: flex;
  gap: 10px;
}

@media (max-width: 760px) {
  .not-found {
    min-height: calc(100dvh - 92px);
    grid-template-columns: 1fr;
    align-content: center;
    gap: 28px;
    padding: 28px 22px 42px;
  }

  .not-found-code {
    font-size: clamp(96px, 36vw, 150px);
  }
}
</style>
