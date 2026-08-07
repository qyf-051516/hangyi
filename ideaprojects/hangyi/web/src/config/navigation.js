import {
  Aim,
  Calendar,
  Clock,
  Collection,
  DataAnalysis,
  DataBoard,
  Document,
  Edit,
  Finished,
  Histogram,
  Key,
  Odometer,
  Service,
  SetUp,
  Setting,
  Star,
  Switch,
  TakeawayBox,
  Tickets,
  Timer,
  User,
  UserFilled
} from '@element-plus/icons-vue'

export const navigationGroups = [
  {
    key: 'overview',
    label: '概览',
    icon: Odometer,
    items: [
      { path: '/dashboard', label: '仪表盘', description: '今日运行与系统状态', icon: DataBoard },
      { path: '/statistics', label: '排班统计', description: '班组负荷与人员利用率', icon: DataAnalysis },
      { path: '/completion', label: '完成情况', description: '排班任务完成进度', icon: Finished }
    ]
  },
  {
    key: 'personnel',
    label: '人员',
    icon: UserFilled,
    items: [
      { path: '/employee', label: '人员管理', description: '员工档案与班组归属', icon: User },
      { path: '/groups', label: '班组管理', description: '维护组织与班组信息', icon: Collection },
      { path: '/qualifications', label: '资质管理', description: '人员资质与有效期', icon: Key },
      { path: '/leaves', label: '请假管理', description: '请假申请与审批', icon: Edit }
    ]
  },
  {
    key: 'schedule',
    label: '排班',
    icon: Tickets,
    items: [
      { path: '/schedules', label: '排班管理', description: '创建、发布与维护排班', icon: Calendar },
      { path: '/schedule-gantt', label: '甘特图', description: '按周查看排班时间轴', icon: Histogram },
      { path: '/service-schedule', label: '勤务排班', description: '查看航班勤务任务', icon: Service },
      { path: '/swap', label: '调班管理', description: '调班申请与审批', icon: Switch },
      { path: '/schedule-history', label: '排班历史', description: '查询已发布与归档记录', icon: Clock }
    ]
  },
  {
    key: 'resources',
    label: '资源',
    icon: SetUp,
    items: [
      { path: '/aircraft-types', label: '机型管理', description: '维护机型基础数据', icon: TakeawayBox },
      { path: '/flights', label: '航班计划', description: '查询与同步航班计划', icon: Aim },
      { path: '/shifts', label: '班次模板', description: '维护班次时间与规则', icon: Timer }
    ]
  },
  {
    key: 'system',
    label: '系统',
    icon: Setting,
    items: [
      { path: '/audit', label: '审计日志', description: '追踪关键操作记录', icon: Document },
      { path: '/preferences', label: '排班偏好', description: '维护人员排班偏好', icon: Star }
    ]
  }
]

export const navigationItems = navigationGroups.flatMap(group =>
  group.items.map(item => ({ ...item, group: group.label }))
)
