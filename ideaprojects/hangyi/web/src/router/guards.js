export function resolveAuthNavigation(to, token, resolveRoute) {
  if (to.meta?.requiresAuth && !token) {
    return {
      name: 'Login',
      query: { redirect: to.fullPath }
    }
  }

  if (to.name === 'Login' && token) {
    return safeRedirect(to.query?.redirect, resolveRoute) || { name: 'Dashboard' }
  }

  return true
}

export function safeRedirect(value, resolveRoute) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    typeof resolveRoute !== 'function'
  ) {
    return null
  }

  const resolved = resolveRoute(value)
  return resolved.matched.length > 0 && resolved.name !== 'NotFound' ? value : null
}
