import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/login/Login.vue')
  },
  {
    path: '/',
    component: () => import('../layout/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/dashboard/Dashboard.vue'),
        meta: { title: '仪表盘', icon: 'DataBoard' }
      },
      {
        path: 'employee',
        name: 'Employee',
        component: () => import('../views/employee/EmployeeList.vue'),
        meta: { title: '人员管理', icon: 'User' }
      },
      {
        path: 'groups',
        name: 'TeamGroup',
        component: () => import('../views/employee/TeamGroup.vue'),
        meta: { title: '班组管理', icon: 'Collection' }
      },
      {
        path: 'qualifications',
        name: 'Qualifications',
        component: () => import('../views/employee/QualificationManagement.vue'),
        meta: { title: '资质管理', icon: 'Key' }
      },
      {
        path: 'aircraft-types',
        name: 'AircraftType',
        component: () => import('../views/employee/AircraftTypeList.vue'),
        meta: { title: '机型管理', icon: 'TakeawayBox' }
      },
      {
        path: 'preferences',
        name: 'EmployeePreference',
        component: () => import('../views/employee/EmployeePreference.vue'),
        meta: { title: '排班偏好', icon: 'ThumbUp' }
      },
      {
        path: 'shifts',
        name: 'ShiftTemplate',
        component: () => import('../views/shift/ShiftTemplate.vue'),
        meta: { title: '班次模板', icon: 'Timer' }
      },
      {
        path: 'schedules',
        name: 'ScheduleList',
        component: () => import('../views/schedule/ScheduleList.vue'),
        meta: { title: '排班管理', icon: 'Calendar' }
      },
      {
        path: 'schedule-gantt',
        name: 'ScheduleGantt',
        component: () => import('../views/schedule/ScheduleGantt.vue'),
        meta: { title: '甘特图', icon: 'Histogram' }
      },
      {
        path: 'flights',
        name: 'FlightPlan',
        component: () => import('../views/flight/FlightPlan.vue'),
        meta: { title: '航班计划', icon: 'Airplane' }
      },
      {
        path: 'leaves',
        name: 'LeaveRequest',
        component: () => import('../views/leave/LeaveRequest.vue'),
        meta: { title: '请假管理', icon: 'Edit' }
      },
      {
        path: 'ai/suggestions',
        name: 'AiSuggestions',
        component: () => import('../views/ai/Suggestion.vue'),
        meta: { title: '排班建议', icon: 'MagicStick', parent: 'ai' }
      },
      {
        path: 'ai/query',
        name: 'AiQuery',
        component: () => import('../views/ai/AiQuery.vue'),
        meta: { title: '智能查询', icon: 'ChatLineSquare', parent: 'ai' }
      },
      {
        path: 'ai/conflicts',
        name: 'AiConflicts',
        component: () => import('../views/ai/ConflictDetection.vue'),
        meta: { title: '冲突检测', icon: 'Warning', parent: 'ai' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.name !== 'Login' && !token) {
    next({ name: 'Login' })
  } else {
    next()
  }
})

export default router
