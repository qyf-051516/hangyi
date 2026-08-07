import { createRouter, createWebHashHistory } from 'vue-router'
import { resolveAuthNavigation } from './guards'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/login/Login.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    component: () => import('../layout/MainLayout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
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
        path: 'schedule-history',
        name: 'ScheduleHistory',
        component: () => import('../views/schedule/ScheduleHistory.vue'),
        meta: { title: '排班历史', icon: 'Clock' }
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
        path: 'swap',
        name: 'SwapIndex',
        component: () => import('../views/swap/SwapIndex.vue'),
        meta: { title: '调班管理', icon: 'Switch' }
      },
      {
        path: 'statistics',
        name: 'StatisticsIndex',
        component: () => import('../views/statistics/StatisticsIndex.vue'),
        meta: { title: '排班统计', icon: 'DataAnalysis' }
      },
      {
        path: 'completion',
        name: 'CompletionReport',
        component: () => import('../views/statistics/CompletionReport.vue'),
        meta: { title: '完成情况', icon: 'Finished' }
      },
      {
        path: 'audit',
        name: 'AuditIndex',
        component: () => import('../views/audit/AuditIndex.vue'),
        meta: { title: '审计日志', icon: 'Document' }
      },
      {
        path: 'service-schedule',
        name: 'ServiceScheduleIndex',
        component: () => import('../views/service-schedule/ServiceScheduleIndex.vue'),
        meta: { title: '勤务排班', icon: 'Service' }
      },
      {
        path: ':pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('../views/NotFound.vue'),
        meta: { title: '页面未找到' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(to =>
  resolveAuthNavigation(to, localStorage.getItem('token'), value => router.resolve(value))
)

router.afterEach(to => {
  const title = to.meta.title ? `${to.meta.title} · 航翼排班` : '航翼排班'
  document.title = title
})

export default router
