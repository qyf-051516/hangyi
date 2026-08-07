<template>
  <section class="schedule-page">
    <header class="page-intro">
      <div class="intro-copy">
        <p class="eyebrow">Roster control</p>
        <h1>排班管理</h1>
        <p>集中创建、核对并发布班组排班，所有关键操作都有明确状态反馈。</p>
      </div>
      <div class="intro-actions">
        <el-button @click="router.push('/schedule-gantt')">
          <el-icon><Calendar /></el-icon>
          甘特视图
        </el-button>
        <el-button v-if="canAutoSchedule" type="primary" @click="openAutoSchedule">
          <el-icon><MagicStick /></el-icon>
          智能排班
        </el-button>
      </div>
    </header>

    <section class="filter-panel" aria-labelledby="schedule-filter-title">
      <div class="filter-heading">
        <div>
          <h2 id="schedule-filter-title">筛选排班</h2>
          <p>按班组和发布状态缩小结果范围</p>
        </div>
        <el-button
          v-if="hasActiveFilters"
          text
          :disabled="loading"
          @click="resetFilters"
        >
          清空筛选
        </el-button>
      </div>

      <form class="filter-form" @submit.prevent="search">
        <label class="filter-field">
          <span>班组</span>
          <el-select
            v-model="query.groupId"
            placeholder="全部班组"
            clearable
            :loading="groupsLoading"
            :disabled="loading"
          >
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.groupName"
              :value="group.id"
            />
          </el-select>
        </label>

        <label class="filter-field">
          <span>状态</span>
          <el-select
            v-model="query.status"
            placeholder="全部状态"
            clearable
            :disabled="loading"
          >
            <el-option label="草稿" :value="0" />
            <el-option label="已发布" :value="1" />
            <el-option label="已完成" :value="2" />
          </el-select>
        </label>

        <el-button native-type="submit" type="primary" :loading="loading">
          查询
        </el-button>
      </form>

      <div v-if="groupsError" class="inline-notice inline-notice--warning">
        <span>{{ groupsError }}</span>
        <el-button link type="primary" @click="loadGroups">重新加载班组</el-button>
      </div>
    </section>

    <section class="records-panel" aria-labelledby="schedule-records-title">
      <header class="records-heading">
        <div>
          <h2 id="schedule-records-title">排班记录</h2>
          <p>{{ resultSummary }}</p>
        </div>
        <el-button
          circle
          aria-label="刷新排班记录"
          :loading="loading"
          @click="fetchData"
        >
          <el-icon><RefreshRight /></el-icon>
        </el-button>
      </header>

      <div v-if="loading && list.length === 0" class="schedule-skeleton" aria-label="正在加载排班记录">
        <div v-for="index in 5" :key="index" class="skeleton-row">
          <span class="skeleton-block skeleton-block--wide"></span>
          <span class="skeleton-block"></span>
          <span class="skeleton-block skeleton-block--short"></span>
          <span class="skeleton-block"></span>
        </div>
      </div>

      <div v-else-if="loadError" class="state-panel state-panel--error">
        <span class="state-mark">!</span>
        <div>
          <h3>排班记录加载失败</h3>
          <p>{{ loadError }}</p>
        </div>
        <el-button type="primary" plain @click="fetchData">重新加载</el-button>
      </div>

      <div v-else-if="list.length === 0" class="state-panel">
        <span class="state-mark state-mark--empty">0</span>
        <div>
          <h3>{{ hasActiveFilters ? '没有匹配的排班' : '还没有排班记录' }}</h3>
          <p>{{ hasActiveFilters ? '调整筛选条件后再试一次。' : '创建首个智能排班后，记录会显示在这里。' }}</p>
        </div>
        <el-button v-if="hasActiveFilters" @click="resetFilters">清空筛选</el-button>
        <el-button v-else-if="canAutoSchedule" type="primary" @click="openAutoSchedule">
          创建排班
        </el-button>
      </div>

      <template v-else>
        <div class="schedule-table">
          <el-table :data="list" v-loading="loading" row-key="id">
            <el-table-column label="排班计划" min-width="240">
              <template #default="{ row }">
                <button class="schedule-name" type="button" @click="viewDetails(row)">
                  {{ row.scheduleName || `排班 #${row.id}` }}
                </button>
                <span class="schedule-group">{{ getGroupName(row.groupId) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="排班周期" min-width="230">
              <template #default="{ row }">
                <div class="period-cell">
                  <span>{{ formatDate(row.startDate) }} — {{ formatDate(row.endDate) }}</span>
                  <small>{{ getPeriodDays(row) }} 天</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="getStatusMeta(row.status).type" effect="light">
                  {{ getStatusMeta(row.status).label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" min-width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="250" fixed="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button link @click="viewDetails(row)">详情</el-button>
                  <el-button link type="primary" @click="viewGantt(row)">甘特图</el-button>
                  <el-dropdown
                    v-if="hasMoreActions(row)"
                    trigger="click"
                    @command="handleRowCommand($event, row)"
                  >
                    <el-button link :loading="isRowPending(row)">
                      更多
                      <el-icon><MoreFilled /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-if="canExportSchedule" command="export">
                          导出 Excel
                        </el-dropdown-item>
                        <el-dropdown-item
                          v-if="canManageSchedule && row.status === 0"
                          command="publish"
                          divided
                        >
                          发布排班
                        </el-dropdown-item>
                        <el-dropdown-item
                          v-if="canManageSchedule && row.status === 0"
                          command="delete"
                        >
                          删除草稿
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="schedule-cards">
          <article v-for="row in list" :key="row.id" class="schedule-card">
            <div class="schedule-card__topline">
              <el-tag :type="getStatusMeta(row.status).type" effect="light">
                {{ getStatusMeta(row.status).label }}
              </el-tag>
              <span>{{ getGroupName(row.groupId) }}</span>
            </div>
            <h3>{{ row.scheduleName || `排班 #${row.id}` }}</h3>
            <dl>
              <div>
                <dt>周期</dt>
                <dd>{{ formatDate(row.startDate) }} — {{ formatDate(row.endDate) }}</dd>
              </div>
              <div>
                <dt>天数</dt>
                <dd>{{ getPeriodDays(row) }} 天</dd>
              </div>
              <div>
                <dt>创建</dt>
                <dd>{{ formatDateTime(row.createdAt) }}</dd>
              </div>
            </dl>
            <div class="schedule-card__actions">
              <el-button @click="viewDetails(row)">详情</el-button>
              <el-button type="primary" plain @click="viewGantt(row)">甘特图</el-button>
              <el-button
                v-if="canExportSchedule"
                :loading="pendingAction === `export:${row.id}`"
                @click="handleExport(row)"
              >
                导出
              </el-button>
              <el-button
                v-if="canManageSchedule && row.status === 0"
                type="primary"
                :loading="pendingAction === `publish:${row.id}`"
                @click="handlePublish(row)"
              >
                发布
              </el-button>
              <el-button
                v-if="canManageSchedule && row.status === 0"
                type="danger"
                plain
                :loading="pendingAction === `delete:${row.id}`"
                @click="handleDelete(row)"
              >
                删除
              </el-button>
            </div>
          </article>
        </div>

        <footer class="records-footer">
          <span>第 {{ query.page }} 页</span>
          <el-pagination
            v-model:current-page="query.page"
            v-model:page-size="query.size"
            :total="total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="fetchData"
            @size-change="handleSizeChange"
          />
        </footer>
      </template>
    </section>

    <el-dialog
      v-model="showAuto"
      title="创建智能排班"
      width="520px"
      :close-on-click-modal="!autoLoading"
      :close-on-press-escape="!autoLoading"
      :show-close="!autoLoading"
      @closed="resetAutoForm"
    >
      <div class="dialog-intro">
        <span class="dialog-intro__icon"><MagicStick /></span>
        <div>
          <strong>按班组和日期自动生成草稿</strong>
          <p>系统会使用当前启用的班次模板轮转分配人员，生成后仍需确认并发布。</p>
        </div>
      </div>

      <el-form
        ref="autoFormRef"
        :model="autoForm"
        :rules="autoRules"
        label-position="top"
        status-icon
      >
        <el-form-item label="班组" prop="groupId">
          <el-select
            v-model="autoForm.groupId"
            placeholder="请选择班组"
            :loading="groupsLoading"
            style="width: 100%"
          >
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.groupName"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
        <div class="date-grid">
          <el-form-item label="开始日期" prop="startDate">
            <el-date-picker
              v-model="autoForm.startDate"
              type="date"
              placeholder="选择开始日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
              @change="validateEndDate"
            />
          </el-form-item>
          <el-form-item label="结束日期" prop="endDate">
            <el-date-picker
              v-model="autoForm.endDate"
              type="date"
              placeholder="选择结束日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>
      </el-form>

      <div class="period-preview">
        <span>计划周期</span>
        <strong>{{ autoPeriodText }}</strong>
      </div>

      <template #footer>
        <el-button :disabled="autoLoading" @click="showAuto = false">取消</el-button>
        <el-button type="primary" :loading="autoLoading" @click="handleAutoSchedule">
          {{ autoLoading ? '正在生成排班…' : '生成草稿' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showDetail"
      :title="currentSchedule?.scheduleName || '排班详情'"
      width="960px"
    >
      <div class="detail-summary">
        <div>
          <span>班组</span>
          <strong>{{ getGroupName(currentSchedule?.groupId) }}</strong>
        </div>
        <div>
          <span>排班周期</span>
          <strong>{{ detailPeriod }}</strong>
        </div>
        <div>
          <span>排班人数</span>
          <strong>{{ detailEmployeeCount }}</strong>
        </div>
        <div>
          <span>排班条目</span>
          <strong>{{ details.length }}</strong>
        </div>
      </div>

      <div v-if="detailLookupError" class="inline-notice inline-notice--warning detail-notice">
        {{ detailLookupError }}
      </div>

      <div v-loading="detailLoading" class="detail-content">
        <div v-if="detailError && !detailLoading" class="state-panel state-panel--error">
          <span class="state-mark">!</span>
          <div>
            <h3>详情加载失败</h3>
            <p>{{ detailError }}</p>
          </div>
          <el-button type="primary" plain @click="viewDetails(currentSchedule)">重新加载</el-button>
        </div>

        <el-empty
          v-else-if="!detailLoading && details.length === 0"
          description="该排班暂时没有明细"
        />

        <template v-else-if="details.length > 0">
          <div class="detail-table">
            <el-table :data="details" row-key="id" max-height="500">
              <el-table-column label="员工" min-width="130">
                <template #default="{ row }">{{ getEmpName(row.employeeId) }}</template>
              </el-table-column>
              <el-table-column label="日期" width="120" prop="workDate" />
              <el-table-column label="班次" min-width="120">
                <template #default="{ row }">{{ getShiftName(row.shiftId) }}</template>
              </el-table-column>
              <el-table-column label="排班方式" width="110">
                <template #default="{ row }">{{ getScheduleType(row.scheduleType) }}</template>
              </el-table-column>
              <el-table-column label="备注" min-width="200">
                <template #default="{ row }">{{ row.remark || '—' }}</template>
              </el-table-column>
            </el-table>
          </div>

          <div class="detail-cards">
            <article v-for="detail in details" :key="detail.id">
              <div>
                <strong>{{ getEmpName(detail.employeeId) }}</strong>
                <span>{{ detail.workDate }}</span>
              </div>
              <dl>
                <div>
                  <dt>班次</dt>
                  <dd>{{ getShiftName(detail.shiftId) }}</dd>
                </div>
                <div>
                  <dt>方式</dt>
                  <dd>{{ getScheduleType(detail.scheduleType) }}</dd>
                </div>
              </dl>
              <p v-if="detail.remark">{{ detail.remark }}</p>
            </article>
          </div>
        </template>
      </div>

      <template #footer>
        <el-button @click="showDetail = false">关闭</el-button>
        <el-button type="primary" @click="viewGantt(currentSchedule)">查看甘特图</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, MagicStick, MoreFilled, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  autoSchedule,
  deleteSchedule,
  exportScheduleExcel,
  getScheduleDetails,
  getSchedulePage,
  publishSchedule
} from '../../api/schedule'
import { getEmployeeListAll, getGroupList } from '../../api/employee'
import { getShiftList } from '../../api/shift'
import { useUserStore } from '../../store/user'
import { countScheduleDays, getDefaultPlanningPeriod } from '../../utils/scheduleDate'

const router = useRouter()
const userStore = useUserStore()

const list = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const groups = ref([])
const groupsLoading = ref(false)
const groupsError = ref('')
const shifts = ref([])
const employees = ref([])
const pendingAction = ref('')

const showAuto = ref(false)
const autoLoading = ref(false)
const autoFormRef = ref(null)
const autoForm = reactive({ groupId: null, startDate: '', endDate: '' })

const showDetail = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailLookupError = ref('')
const details = ref([])
const currentSchedule = ref(null)

const query = reactive({ page: 1, size: 20, groupId: null, status: null })
let listRequestId = 0
let lookupsPromise = null

const canAutoSchedule = computed(() => userStore.hasAnyRole('ADMIN', 'TEAM_LEADER'))
const canManageSchedule = computed(() => userStore.hasAnyRole('ADMIN'))
const canExportSchedule = computed(() => userStore.hasAnyRole('ADMIN', 'TEAM_LEADER', 'BOSS'))
const hasActiveFilters = computed(() => query.groupId != null || query.status != null)

const resultSummary = computed(() => {
  if (loading.value && list.value.length === 0) return '正在读取最新数据…'
  if (loadError.value) return '暂时无法读取结果'
  if (total.value === 0) return hasActiveFilters.value ? '当前条件下没有结果' : '暂无排班记录'
  const suffix = hasActiveFilters.value ? '，已应用筛选条件' : ''
  return `共 ${total.value} 条记录${suffix}`
})

const autoPeriodText = computed(() => {
  const days = countScheduleDays(autoForm.startDate, autoForm.endDate)
  return days > 0 ? `${days} 天 · ${autoForm.startDate} 至 ${autoForm.endDate}` : '选择完整日期后显示'
})

const detailPeriod = computed(() => {
  if (!currentSchedule.value) return '—'
  return `${formatDate(currentSchedule.value.startDate)} — ${formatDate(currentSchedule.value.endDate)}`
})

const detailEmployeeCount = computed(() => {
  return new Set(details.value.map(item => item.employeeId).filter(id => id != null)).size
})

const autoRules = {
  groupId: [{ required: true, message: '请选择班组', trigger: 'change' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [
    { required: true, message: '请选择结束日期', trigger: 'change' },
    {
      validator: (_rule, value, callback) => {
        if (value && autoForm.startDate && value < autoForm.startDate) {
          callback(new Error('结束日期不能早于开始日期'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ]
}

onMounted(() => {
  void Promise.all([fetchData(), loadGroups()])
})

async function fetchData() {
  const requestId = ++listRequestId
  loading.value = true
  loadError.value = ''

  try {
    const response = await getSchedulePage(
      {
        page: query.page,
        size: query.size,
        groupId: query.groupId ?? undefined,
        status: query.status ?? undefined
      },
      { silent: true }
    )
    if (requestId !== listRequestId) return

    const pageData = response?.data || {}
    list.value = Array.isArray(pageData.records) ? pageData.records : []
    total.value = Number(pageData.total) || 0

    const maxPage = Math.max(1, Math.ceil(total.value / query.size))
    if (query.page > maxPage) {
      query.page = maxPage
      await fetchData()
    }
  } catch (error) {
    if (requestId !== listRequestId) return
    list.value = []
    total.value = 0
    loadError.value = error?.message || '请检查网络连接后重试'
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

async function loadGroups() {
  groupsLoading.value = true
  groupsError.value = ''

  try {
    const response = await getGroupList(undefined, { silent: true })
    groups.value = Array.isArray(response?.data) ? response.data : []
  } catch {
    groups.value = []
    groupsError.value = '班组列表加载失败，筛选和新建排班暂不可用。'
  } finally {
    groupsLoading.value = false
  }
}

function search() {
  query.page = 1
  void fetchData()
}

function resetFilters() {
  query.groupId = null
  query.status = null
  query.page = 1
  void fetchData()
}

function handleSizeChange() {
  query.page = 1
  void fetchData()
}

function openAutoSchedule() {
  const { startDate, endDate } = getDefaultPlanningPeriod()
  Object.assign(autoForm, {
    groupId: query.groupId ?? null,
    startDate,
    endDate
  })
  showAuto.value = true
  void nextTick(() => autoFormRef.value?.clearValidate())
}

function resetAutoForm() {
  Object.assign(autoForm, { groupId: null, startDate: '', endDate: '' })
  autoFormRef.value?.clearValidate()
}

function validateEndDate() {
  if (autoForm.endDate) {
    void autoFormRef.value?.validateField('endDate').catch(() => {})
  }
}

async function handleAutoSchedule() {
  try {
    await autoFormRef.value?.validate()
  } catch {
    return
  }

  autoLoading.value = true
  try {
    const response = await autoSchedule({
      groupId: autoForm.groupId,
      startDate: autoForm.startDate,
      endDate: autoForm.endDate
    })
    const created = response?.data

    query.groupId = created?.groupId ?? autoForm.groupId
    query.status = 0
    query.page = 1
    showAuto.value = false
    ElMessage.success('排班草稿已生成，请核对后发布')
    await fetchData()
  } catch {
    // 请求层已经展示可执行的错误信息。
  } finally {
    autoLoading.value = false
  }
}

async function viewDetails(row) {
  if (!row?.id) return

  currentSchedule.value = row
  details.value = []
  detailError.value = ''
  detailLookupError.value = ''
  detailLoading.value = true
  showDetail.value = true

  const [detailsResult] = await Promise.allSettled([
    getScheduleDetails(row.id, { silent: true }),
    loadDetailLookups()
  ])

  if (detailsResult.status === 'fulfilled') {
    details.value = Array.isArray(detailsResult.value?.data) ? detailsResult.value.data : []
  } else {
    detailError.value = detailsResult.reason?.message || '请检查网络连接后重试'
  }
  detailLoading.value = false
}

async function loadDetailLookups() {
  if (employees.value.length > 0 && shifts.value.length > 0) return
  if (lookupsPromise) return lookupsPromise

  lookupsPromise = Promise.allSettled([
    getShiftList({ silent: true }),
    getEmployeeListAll({ silent: true })
  ]).then(([shiftResult, employeeResult]) => {
    const failed = []

    if (shiftResult.status === 'fulfilled') {
      shifts.value = Array.isArray(shiftResult.value?.data) ? shiftResult.value.data : []
    } else {
      failed.push('班次')
    }

    if (employeeResult.status === 'fulfilled') {
      const employeeData = employeeResult.value?.data
      employees.value = Array.isArray(employeeData?.records)
        ? employeeData.records
        : Array.isArray(employeeData)
          ? employeeData
          : []
    } else {
      failed.push('员工')
    }

    detailLookupError.value = failed.length > 0
      ? `部分${failed.join('、')}信息加载失败，暂以编号显示。`
      : ''
  }).finally(() => {
    lookupsPromise = null
  })

  return lookupsPromise
}

function viewGantt(row) {
  if (!row?.id) return
  showDetail.value = false
  void router.push({ path: '/schedule-gantt', query: { scheduleId: row.id } })
}

function handleRowCommand(command, row) {
  if (command === 'export') void handleExport(row)
  if (command === 'publish') void handlePublish(row)
  if (command === 'delete') void handleDelete(row)
}

async function handleExport(row) {
  if (!row?.id || pendingAction.value) return
  pendingAction.value = `export:${row.id}`

  try {
    await exportScheduleExcel(row.id, row.scheduleName)
    ElMessage.success('排班文件已开始下载')
  } catch (error) {
    ElMessage.error(error?.message || '导出失败，请稍后重试')
  } finally {
    pendingAction.value = ''
  }
}

async function handlePublish(row) {
  if (!row?.id || pendingAction.value) return

  try {
    await ElMessageBox.confirm(
      `发布后“${row.scheduleName || `排班 #${row.id}`}”将作为正式排班供员工查看。`,
      '确认发布排班',
      {
        type: 'warning',
        confirmButtonText: '确认发布',
        cancelButtonText: '暂不发布'
      }
    )
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }

  pendingAction.value = `publish:${row.id}`
  try {
    await publishSchedule(row.id)
    ElMessage.success('排班已发布')
    await fetchData()
  } catch {
    // 请求层已经展示可执行的错误信息。
  } finally {
    pendingAction.value = ''
  }
}

async function handleDelete(row) {
  if (!row?.id || pendingAction.value) return

  try {
    await ElMessageBox.confirm(
      `将永久删除“${row.scheduleName || `排班 #${row.id}`}”及其全部排班明细。`,
      '删除排班草稿',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }

  pendingAction.value = `delete:${row.id}`
  try {
    await deleteSchedule(row.id)
    if (list.value.length === 1 && query.page > 1) query.page -= 1
    ElMessage.success('排班草稿已删除')
    await fetchData()
  } catch {
    // 请求层已经展示可执行的错误信息。
  } finally {
    pendingAction.value = ''
  }
}

function isRowPending(row) {
  return pendingAction.value.endsWith(`:${row.id}`)
}

function hasMoreActions(row) {
  return canExportSchedule.value || (canManageSchedule.value && row.status === 0)
}

function getGroupName(groupId) {
  if (groupId == null) return '未分配班组'
  return groups.value.find(group => group.id === groupId)?.groupName || `班组 #${groupId}`
}

function getEmpName(id) {
  return employees.value.find(employee => employee.id === id)?.name || `员工 #${id}`
}

function getShiftName(id) {
  return shifts.value.find(shift => shift.id === id)?.shiftName || `班次 #${id}`
}

function getScheduleType(type) {
  return {
    AUTO: '自动排班',
    SMART: '智能排班',
    MANUAL: '手动排班',
    SWAP: '调班'
  }[type] || type || '—'
}

function getStatusMeta(status) {
  return {
    0: { label: '草稿', type: 'warning' },
    1: { label: '已发布', type: 'success' },
    2: { label: '已完成', type: 'info' }
  }[status] || { label: '未知', type: 'info' }
}

function getPeriodDays(row) {
  return countScheduleDays(row.startDate, row.endDate) || '—'
}

function formatDate(value) {
  return value || '—'
}

function formatDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 16)
}

</script>

<style scoped>
.schedule-page {
  display: grid;
  gap: 16px;
}

.page-intro {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  overflow: hidden;
  padding: clamp(24px, 3vw, 38px);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(circle at 84% 10%, rgba(168, 184, 216, 0.28), transparent 34%),
    var(--color-brand-50);
}

.page-intro::after {
  position: absolute;
  right: -32px;
  bottom: -50px;
  width: 210px;
  height: 126px;
  border: 1px solid rgba(42, 63, 95, 0.1);
  border-radius: 50%;
  content: '';
  transform: rotate(-12deg);
  pointer-events: none;
}

.intro-copy {
  position: relative;
  z-index: 1;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--color-brand-600);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semi);
  letter-spacing: 0.08em;
}

.intro-copy h1 {
  color: var(--color-brand-900);
  font-size: clamp(28px, 3vw, 38px);
  letter-spacing: -0.04em;
}

.intro-copy > p:last-child {
  max-width: 54ch;
  margin: 12px 0 0;
  color: var(--color-neutral-600);
  line-height: 1.75;
}

.intro-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
}

.filter-panel,
.records-panel {
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: 0 12px 30px rgba(48, 72, 98, 0.04);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.filter-panel {
  padding: 20px;
}

.filter-heading,
.records-heading,
.records-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.filter-heading h2,
.records-heading h2 {
  font-size: var(--font-size-lg);
  letter-spacing: -0.015em;
}

.filter-heading p,
.records-heading p {
  margin: 5px 0 0;
  color: var(--color-neutral-500);
  font-size: var(--font-size-sm);
}

.filter-form {
  display: grid;
  grid-template-columns: minmax(190px, 1fr) minmax(170px, 0.72fr) auto;
  align-items: end;
  gap: 14px;
  max-width: 720px;
  margin-top: 18px;
}

.filter-field {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: var(--color-neutral-600);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.inline-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.inline-notice--warning {
  color: #7a521b;
  background: var(--color-warning-bg);
}

.records-panel {
  overflow: hidden;
}

.records-heading {
  padding: 19px 20px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.schedule-table {
  width: 100%;
}

.schedule-table :deep(.el-table::before) {
  display: none;
}

.schedule-table :deep(.el-table__cell:first-child) {
  padding-left: 12px;
}

.schedule-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  color: var(--color-brand-900);
  background: transparent;
  font: inherit;
  font-weight: var(--font-weight-semi);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.schedule-name:hover {
  color: var(--color-brand-600);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.schedule-group {
  display: block;
  margin-top: 4px;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.period-cell {
  display: grid;
  gap: 3px;
  font-variant-numeric: tabular-nums;
}

.period-cell small {
  color: var(--color-neutral-500);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.schedule-cards {
  display: none;
}

.records-footer {
  min-height: 64px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-neutral-100);
}

.records-footer > span {
  display: none;
  color: var(--color-neutral-500);
  font-size: var(--font-size-sm);
}

.schedule-skeleton {
  padding: 4px 20px;
}

.skeleton-row {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.6fr 0.8fr;
  gap: 30px;
  padding: 20px 12px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.skeleton-block {
  width: 78%;
  height: 12px;
  border-radius: var(--radius-xs);
  background: linear-gradient(
    90deg,
    var(--color-neutral-100) 25%,
    var(--color-neutral-50) 50%,
    var(--color-neutral-100) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.4s ease-in-out infinite;
}

.skeleton-block--wide {
  width: 92%;
}

.skeleton-block--short {
  width: 54%;
}

@keyframes skeleton-loading {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

.state-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 190px;
  padding: 32px clamp(22px, 4vw, 52px);
}

.state-panel h3 {
  font-size: var(--font-size-lg);
}

.state-panel p {
  margin: 7px 0 0;
  color: var(--color-neutral-500);
}

.state-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px 5px 12px 5px;
  color: var(--color-danger);
  background: var(--color-danger-bg);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
}

.state-mark--empty {
  color: var(--color-brand-700);
  background: var(--color-brand-100);
}

.dialog-intro {
  display: flex;
  gap: 14px;
  margin: -4px 0 22px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--color-brand-50);
}

.dialog-intro__icon {
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--color-brand-700);
  background: var(--color-brand-100);
}

.dialog-intro__icon svg {
  width: 18px;
}

.dialog-intro strong {
  display: block;
  color: var(--color-brand-900);
}

.dialog-intro p {
  margin: 5px 0 0;
  color: var(--color-neutral-600);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.date-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.period-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
  padding-top: 15px;
  border-top: 1px solid var(--color-neutral-100);
  color: var(--color-neutral-500);
  font-size: var(--font-size-sm);
}

.period-preview strong {
  color: var(--color-brand-800);
  font-variant-numeric: tabular-nums;
}

.detail-summary {
  display: grid;
  grid-template-columns: 1fr 1.4fr 0.7fr 0.7fr;
  gap: 1px;
  margin-bottom: 18px;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-neutral-200);
}

.detail-summary > div {
  display: grid;
  gap: 5px;
  padding: 13px 15px;
  background: var(--color-neutral-50);
}

.detail-summary span {
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
}

.detail-summary strong {
  overflow: hidden;
  color: var(--color-brand-900);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-notice {
  margin: 0 0 14px;
}

.detail-content {
  min-height: 180px;
}

.detail-cards {
  display: none;
}

@media (max-width: 900px) {
  .page-intro {
    align-items: flex-start;
    flex-direction: column;
  }

  .intro-actions {
    align-self: stretch;
  }

  .intro-actions .el-button {
    flex: 1;
  }

  .detail-summary {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 767px) {
  .schedule-page {
    gap: 12px;
  }

  .page-intro {
    gap: 22px;
    padding: 22px 18px 24px;
    border-radius: var(--radius-lg);
  }

  .intro-copy h1 {
    font-size: 28px;
  }

  .intro-copy > p:last-child {
    font-size: var(--font-size-sm);
  }

  .intro-actions {
    width: 100%;
  }

  .filter-panel {
    padding: 17px 16px;
  }

  .filter-form {
    grid-template-columns: 1fr;
  }

  .filter-form > .el-button {
    width: 100%;
  }

  .records-heading {
    padding: 16px;
  }

  .schedule-table {
    display: none;
  }

  .schedule-cards {
    display: grid;
    gap: 12px;
    padding: 14px;
    background: var(--color-neutral-50);
  }

  .schedule-card {
    padding: 16px;
    border: 1px solid var(--color-neutral-200);
    border-radius: var(--radius-md);
    background: var(--color-neutral-0);
  }

  .schedule-card__topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--color-neutral-500);
    font-size: var(--font-size-xs);
  }

  .schedule-card h3 {
    margin-top: 13px;
    font-size: var(--font-size-lg);
    line-height: 1.4;
  }

  .schedule-card dl,
  .detail-cards dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 16px 0 0;
  }

  .schedule-card dl > div:first-child {
    grid-column: 1 / -1;
  }

  .schedule-card dt,
  .detail-cards dt {
    color: var(--color-neutral-500);
    font-size: var(--font-size-xs);
  }

  .schedule-card dd,
  .detail-cards dd {
    margin: 4px 0 0;
    color: var(--color-neutral-700);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
  }

  .schedule-card__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--color-neutral-100);
  }

  .schedule-card__actions .el-button {
    width: 100%;
    margin: 0;
  }

  .records-footer {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px;
  }

  .records-footer > span {
    display: block;
  }

  .records-footer :deep(.el-pagination__total),
  .records-footer :deep(.el-pagination__sizes) {
    display: none;
  }

  .schedule-skeleton {
    padding: 4px 14px;
  }

  .skeleton-row {
    grid-template-columns: 1fr 0.4fr;
    gap: 14px;
  }

  .skeleton-row .skeleton-block:nth-child(n + 3) {
    display: none;
  }

  .state-panel {
    grid-template-columns: auto 1fr;
    gap: 14px;
    min-height: 220px;
    padding: 28px 18px;
  }

  .state-panel > .el-button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .date-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .period-preview {
    align-items: flex-start;
    flex-direction: column;
  }

  .detail-summary {
    grid-template-columns: 1fr 1fr;
  }

  .detail-table {
    display: none;
  }

  .detail-cards {
    display: grid;
    gap: 10px;
  }

  .detail-cards article {
    padding: 14px;
    border: 1px solid var(--color-neutral-200);
    border-radius: var(--radius-md);
    background: var(--color-neutral-0);
  }

  .detail-cards article > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .detail-cards article > div span {
    color: var(--color-neutral-500);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
  }

  .detail-cards p {
    margin: 12px 0 0;
    padding-top: 11px;
    border-top: 1px solid var(--color-neutral-100);
    color: var(--color-neutral-600);
    font-size: var(--font-size-sm);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-block {
    animation: none;
  }
}
</style>
