import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const username = ref(localStorage.getItem('username') || '')
  const realName = ref(localStorage.getItem('realName') || '')

  function setLogin(resp) {
    token.value = resp.token
    username.value = resp.username
    realName.value = resp.realName
    localStorage.setItem('token', resp.token)
    localStorage.setItem('username', resp.username)
    localStorage.setItem('realName', resp.realName)
  }

  function logout() {
    token.value = ''
    username.value = ''
    realName.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('realName')
  }

  return { token, username, realName, setLogin, logout }
})
