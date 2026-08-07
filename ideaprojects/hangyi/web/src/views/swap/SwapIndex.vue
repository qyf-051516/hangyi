<template>
  <div class="swap-page">
    <AppPageHeader
      title="调班管理"
      description="提交临时班次或代班申请，并在同一流程中跟踪审批结果。"
    >
      <template #actions>
        <el-button v-if="activeTab === 'records'" type="primary" @click="activeTab = 'apply'">
          新建申请
        </el-button>
      </template>
    </AppPageHeader>

    <el-card shadow="never" class="workspace-card">
      <el-tabs v-model="activeTab" class="swap-tabs" @tab-change="handleTabChange">
        <el-tab-pane label="提交申请" name="apply">
          <div class="apply-intro">
            <div>
              <span class="section-kicker">APPLICATION DESK</span>
              <h2>选择申请方式</h2>
              <p>临时班次用于申请指定时段任务；代班申请用于交换两条已有排班。</p>
            </div>
            <span class="flow-hint">提交申请 → 负责人审批 → 结果通知</span>
          </div>

          <div class="apply-grid">
            <section class="application-panel application-panel--primary">
              <div class="panel-heading">
                <span class="panel-index">01</span>
                <div>
                  <h3>临时班次申请</h3>
                  <p>补充航班与时间信息，申请一段临时工作班次。</p>
                </div>
              </div>

              <el-form
                ref="applicationFormRef"
                :model="applicationForm"
                :rules="applicationRules"
                label-position="top"
                @submit.prevent
              >
                <div class="form-grid">
                  <el-form-item label="工号" prop="employeeNo">
                    <el-input
                      v-model.trim="applicationForm.employeeNo"
                      maxlength="32"
                      placeholder="请输入员工工号"
                    />
                  </el-form-item>
                  <el-form-item label="姓名" prop="name">
                    <el-input
                      v-model.trim="applicationForm.name"
                      maxlength="50"
                      placeholder="请输入员工姓名"
                    />
                  </el-form-item>
                  <el-form-item label="航班号" prop="flightNo">
                    <el-input
                      v-model.trim="applicationForm.flightNo"
                      maxlength="20"
                      placeholder="例如 CA1234"
                      @blur="normalizeFlightNo"
                    />
                  </el-form-item>
                  <el-form-item label="申请日期" prop="workDate">
                    <el-date-picker
                      v-model="applicationForm.workDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      :clearable="false"
                      style="width: 100%"
                    />
                  </el-form-item>
                  <el-form-item label="任务时段" prop="startTime">
                    <div class="time-range">
                      <el-time-picker
                        v-model="applicationForm.startTime"
                        format="HH:mm"
                        value-format="HH:mm"
                        placeholder="开始"
                        @change="validateEndTime"
                      />
                      <span>至</span>
                      <el-time-picker
                        v-model="applicationForm.endTime"
                        format="HH:mm"
                        value-format="HH:mm"
                        placeholder="结束"
                        @change="validateEndTime"
                      />
                    </div>
                  </el-form-item>
                </div>
                <el-form-item label="申请原因" prop="reason">
                  <el-input
                    v-model.trim="applicationForm.reason"
                    type="textarea"
                    :rows="4"
                    maxlength="500"
                    show-word-limit
                    placeholder="说明临时班次的业务原因，便于审批人判断"
                  />
                </el-form-item>
                <div class="form-actions">
                  <el-button @click="resetApplication">清空</el-button>
                  <el-button
                    type="primary"
                    :loading="applicationSubmitting"
                    @click="submitApplication"
                  >
                    提交班次申请
                  </el-button>
                </div>
              </el-form>
            </section>

            <section class="application-panel">
              <div class="panel-heading">
                <span class="panel-index">02</span>
                <div>
                  <h3>已有排班代班</h3>
                  <p>填写原排班和目标排班编号，发起双方班次交换。</p>
                </div>
              </div>

              <el-form
                ref="swapFormRef"
                :model="swapForm"
                :rules="swapRules"
                label-position="top"
                @submit.prevent
              >
                <div class="schedule-id-pair">
                  <el-form-item label="原排班明细 ID" prop="sourceScheduleId">
                    <el-input-number
                      v-model="swapForm.sourceScheduleId"
                      :min="1"
                      :precision="0"
                      controls-position="right"
                      placeholder="原排班编号"
                    />
                  </el-form-item>
                  <span class="exchange-mark" aria-hidden="true">⇄</span>
                  <el-form-item label="目标排班明细 ID" prop="targetScheduleId">
                    <el-input-number
                      v-model="swapForm.targetScheduleId"
                      :min="1"
                      :precision="0"
                      controls-position="right"
                      placeholder="目标排班编号"
                    />
                  </el-form-item>
                </div>
                <el-form-item label="代班原因" prop="reason">
                  <el-input
                    v-model.trim="swapForm.reason"
                    type="textarea"
                    :rows="4"
                    maxlength="500"
                    show-word-limit
                    placeholder="说明交换班次的原因"
                  />
                </el-form-item>
                <div class="form-actions">
                  <el-button @click="resetSwapForm">清空</el-button>
                  <el-button type="primary" :loading="swapSubmitting" @click="submitSwapRequest">
                    提交代班申请
                  </el-button>
                </div>
              </el-form>
            </section>
          </div>
        </el-tab-pane>

        <el-tab-pane name="records">
          <template #label>
            <span>申请记录</span>
            <span v-if="total" class="tab-count">{{ total }}</span>
          </template>

          <div class="records-toolbar">
            <div>
              <h2>审批与进度</h2>
              <p>{{ canApprove ? '查看申请明细，并处理待审批申请。' : '查看你提交的申请及最新审批状态。' }}</p>
            </div>
            <el-select v-model="query.status" style="width: 150px" @change="searchRecords">
              <el-option label="待审批" value="PENDING" />
              <el-option label="已通过" value="APPROVED" />
              <el-option label="已驳回" value="REJECTED" />
            </el-select>
          </div>

          <AppPageState
            v-if="recordsLoading && requests.length === 0"
            type="loading"
            title="正在加载申请记录"
          />
          <AppPageState
            v-else-if="recordsError"
            type="error"
            title="申请记录加载失败"
            :description="recordsError"
            action-label="重新加载"
            @action="fetchRequests"
          />
          <AppPageState
            v-else-if="requests.length === 0"
            title="当前状态下没有申请"
            description="可以切换审批状态，或提交一条新的调班申请。"
            action-label="新建申请"
            @action="activeTab = 'apply'"
          />
          <template v-else>
            <div class="table-scroll desktop-records">
              <el-table :data="requests" stripe v-loading="recordsLoading" style="min-width: 980px">
                <el-table-column label="申请" min-width="170">
                  <template #default="{ row }">
                    <div class="request-title">
                      <strong>{{ requestTypeMeta(row.requestType).label }}</strong>
                      <span>#{{ row.id }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="人员 / 班次" min-width="190">
                  <template #default="{ row }">
                    <template v-if="row.requestType === 'SHIFT_APPLY'">
                      <strong>{{ row.name || '未填写姓名' }}</strong>
                      <span class="cell-subtitle">{{ row.employeeNo || '—' }} · {{ row.flightNo || '—' }}</span>
                    </template>
                    <template v-else>
                      <strong>排班 #{{ row.sourceScheduleId }}</strong>
                      <span class="cell-subtitle">目标 #{{ row.targetScheduleId }}</span>
                    </template>
                  </template>
                </el-table-column>
                <el-table-column label="时段" width="150">
                  <template #default="{ row }">
                    {{ row.startTime && row.endTime ? `${row.startTime} — ${row.endTime}` : '按原排班执行' }}
                  </template>
                </el-table-column>
                <el-table-column prop="reason" label="申请原因" min-width="220" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.reason || '未填写原因' }}</template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                  <template #default="{ row }">
                    <el-tag :type="statusMeta(row.status).type" effect="light">
                      {{ statusMeta(row.status).label }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column v-if="canApprove" label="操作" width="100" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      v-if="row.status === 'PENDING'"
                      text
                      type="primary"
                      size="small"
                      @click="openApprove(row)"
                    >
                      审批
                    </el-button>
                    <span v-else class="muted-text">已处理</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <div class="mobile-records">
              <article v-for="row in requests" :key="row.id" class="record-card">
                <div class="record-card__top">
                  <div>
                    <span>{{ requestTypeMeta(row.requestType).label }}</span>
                    <strong>#{{ row.id }}</strong>
                  </div>
                  <el-tag :type="statusMeta(row.status).type" effect="light">
                    {{ statusMeta(row.status).label }}
                  </el-tag>
                </div>
                <dl>
                  <template v-if="row.requestType === 'SHIFT_APPLY'">
                    <div><dt>申请人</dt><dd>{{ row.name || '—' }} · {{ row.employeeNo || '—' }}</dd></div>
                    <div><dt>航班时段</dt><dd>{{ row.flightNo || '—' }} · {{ row.startTime }}—{{ row.endTime }}</dd></div>
                  </template>
                  <template v-else>
                    <div><dt>交换排班</dt><dd>#{{ row.sourceScheduleId }} ⇄ #{{ row.targetScheduleId }}</dd></div>
                  </template>
                  <div><dt>申请原因</dt><dd>{{ row.reason || '未填写原因' }}</dd></div>
                </dl>
                <el-button
                  v-if="canApprove && row.status === 'PENDING'"
                  type="primary"
                  plain
                  @click="openApprove(row)"
                >
                  审批申请
                </el-button>
              </article>
            </div>

            <el-pagination
              v-model:current-page="query.page"
              v-model:page-size="query.size"
              :total="total"
              layout="total, prev, pager, next"
              @current-change="fetchRequests"
            />
          </template>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog
      v-model="approveVisible"
      title="审批调班申请"
      width="460px"
      destroy-on-close
      @closed="approveFormRef?.clearValidate()"
    >
      <el-form ref="approveFormRef" :model="approveForm" :rules="approveRules" label-position="top">
        <el-form-item label="审批决定" prop="decision">
          <el-radio-group v-model="approveForm.decision">
            <el-radio value="APPROVE">通过申请</el-radio>
            <el-radio value="REJECT">驳回申请</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审批备注" prop="comment">
          <el-input
            v-model.trim="approveForm.comment"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            :placeholder="approveForm.decision === 'REJECT' ? '请说明驳回原因' : '可填写审批说明'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="approveSubmitting" @click="submitApprove">
          确认{{ approveForm.decision === 'APPROVE' ? '通过' : '驳回' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  approveSwapRequest,
  createSwapApplication,
  createSwapRequest,
  listSwapRequests
} from '../../api/swap'
import { useUserStore } from '../../store/user'

const userStore = useUserStore()
const activeTab = ref('apply')
const requests = ref([])
const total = ref(0)
const recordsLoading = ref(false)
const recordsError = ref('')
const applicationSubmitting = ref(false)
const swapSubmitting = ref(false)
const approveSubmitting = ref(false)
const approveVisible = ref(false)
const applicationFormRef = ref(null)
const swapFormRef = ref(null)
const approveFormRef = ref(null)

const query = reactive({ status: 'PENDING', page: 1, size: 20 })
const applicationForm = reactive(createEmptyApplication())
const swapForm = reactive(createEmptySwap())
const approveForm = reactive({ requestId: null, decision: 'APPROVE', comment: '' })
const canApprove = computed(() => userStore.hasAnyRole('ADMIN', 'TEAM_LEADER'))

const applicationRules = {
  employeeNo: [{ required: true, message: '请输入员工工号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入员工姓名', trigger: 'blur' }],
  flightNo: [{ required: true, message: '请输入航班号', trigger: 'blur' }],
  workDate: [{ required: true, message: '请选择申请日期', trigger: 'change' }],
  startTime: [
    {
      validator: (_rule, _value, callback) => {
        if (!applicationForm.startTime || !applicationForm.endTime) {
          callback(new Error('请选择完整的任务时段'))
          return
        }
        if (applicationForm.startTime >= applicationForm.endTime) {
          callback(new Error('结束时间必须晚于开始时间'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ],
  reason: [{ required: true, message: '请填写申请原因', trigger: 'blur' }]
}

const swapRules = {
  sourceScheduleId: [{ required: true, message: '请输入原排班 ID', trigger: 'change' }],
  targetScheduleId: [
    { required: true, message: '请输入目标排班 ID', trigger: 'change' },
    {
      validator: (_rule, value, callback) => {
        if (value && value === swapForm.sourceScheduleId) {
          callback(new Error('目标排班不能与原排班相同'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ],
  reason: [{ required: true, message: '请填写代班原因', trigger: 'blur' }]
}

const approveRules = {
  decision: [{ required: true, message: '请选择审批决定', trigger: 'change' }],
  comment: [
    {
      validator: (_rule, value, callback) => {
        if (approveForm.decision === 'REJECT' && !value?.trim()) {
          callback(new Error('驳回申请时请填写原因'))
          return
        }
        callback()
      },
      trigger: 'blur'
    }
  ]
}

onMounted(fetchRequests)

function handleTabChange(name) {
  if (name === 'records') fetchRequests()
}

async function fetchRequests() {
  recordsLoading.value = true
  recordsError.value = ''
  try {
    const res = await listSwapRequests({ ...query }, { silent: true })
    requests.value = res.data?.records || []
    total.value = Number(res.data?.total || 0)
  } catch (error) {
    requests.value = []
    total.value = 0
    recordsError.value = error?.message || '请检查排班服务后重试'
  } finally {
    recordsLoading.value = false
  }
}

function searchRecords() {
  query.page = 1
  fetchRequests()
}

async function submitApplication() {
  const valid = await applicationFormRef.value?.validate().catch(() => false)
  if (!valid || applicationSubmitting.value) return

  applicationSubmitting.value = true
  try {
    await createSwapApplication({ ...applicationForm })
    ElMessage.success('临时班次申请已提交')
    resetApplication()
    activeTab.value = 'records'
    query.status = 'PENDING'
    await fetchRequests()
  } catch {
    // 请求层已展示错误。
  } finally {
    applicationSubmitting.value = false
  }
}

async function submitSwapRequest() {
  const valid = await swapFormRef.value?.validate().catch(() => false)
  if (!valid || swapSubmitting.value) return

  swapSubmitting.value = true
  try {
    await createSwapRequest({ ...swapForm })
    ElMessage.success('代班申请已提交')
    resetSwapForm()
    activeTab.value = 'records'
    query.status = 'PENDING'
    await fetchRequests()
  } catch {
    // 请求层已展示错误。
  } finally {
    swapSubmitting.value = false
  }
}

function openApprove(row) {
  Object.assign(approveForm, { requestId: row.id, decision: 'APPROVE', comment: '' })
  approveVisible.value = true
}

async function submitApprove() {
  const valid = await approveFormRef.value?.validate().catch(() => false)
  if (!valid || approveSubmitting.value) return

  approveSubmitting.value = true
  try {
    await approveSwapRequest(approveForm.requestId, {
      decision: approveForm.decision,
      comment: approveForm.comment
    })
    ElMessage.success(approveForm.decision === 'APPROVE' ? '申请已通过' : '申请已驳回')
    approveVisible.value = false
    await fetchRequests()
  } catch {
    // 请求层已展示错误。
  } finally {
    approveSubmitting.value = false
  }
}

function resetApplication() {
  Object.assign(applicationForm, createEmptyApplication())
  applicationFormRef.value?.clearValidate()
}

function resetSwapForm() {
  Object.assign(swapForm, createEmptySwap())
  swapFormRef.value?.clearValidate()
}

function validateEndTime() {
  applicationFormRef.value?.validateField('startTime').catch(() => {})
}

function normalizeFlightNo() {
  applicationForm.flightNo = applicationForm.flightNo.replace(/\s+/g, '').toUpperCase()
}

function requestTypeMeta(type) {
  return type === 'SHIFT_APPLY'
    ? { label: '临时班次' }
    : { label: '排班代班' }
}

function statusMeta(status) {
  return {
    PENDING: { label: '待审批', type: 'warning' },
    APPROVED: { label: '已通过', type: 'success' },
    REJECTED: { label: '已驳回', type: 'danger' }
  }[status] || { label: '未知', type: 'info' }
}

function createEmptyApplication() {
  return {
    employeeNo: '',
    name: '',
    flightNo: '',
    workDate: toDateInput(new Date()),
    startTime: '',
    endTime: '',
    reason: ''
  }
}

function createEmptySwap() {
  return { sourceScheduleId: null, targetScheduleId: null, reason: '临时代班' }
}

function toDateInput(date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}
</script>

<style scoped>
.swap-page {
  max-width: 1440px;
  margin: 0 auto;
}

.workspace-card :deep(.el-card__body) {
  padding: 0 !important;
}

.swap-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-neutral-100);
}

.swap-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.swap-tabs :deep(.el-tabs__item) {
  height: 56px;
  font-weight: var(--font-weight-semi);
}

.swap-tabs :deep(.el-tab-pane) {
  padding: 26px 28px 30px;
}

.tab-count {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  margin-left: 7px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--color-brand-700);
  background: var(--color-brand-50);
  font: 600 11px/1 var(--font-family-mono);
}

.apply-intro,
.records-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: 24px;
}

.section-kicker {
  color: var(--color-brand-600);
  font: 600 10px/1.4 var(--font-family-mono);
  letter-spacing: 0.15em;
}

.apply-intro h2,
.records-toolbar h2 {
  margin: 5px 0 6px;
  color: var(--color-brand-900);
  font-size: 20px;
}

.apply-intro p,
.records-toolbar p,
.panel-heading p {
  margin: 0;
  color: var(--color-neutral-500);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.flow-hint {
  flex: 0 0 auto;
  padding: 8px 12px;
  border: 1px solid var(--color-brand-100);
  border-radius: var(--radius-pill);
  color: var(--color-brand-700);
  background: var(--color-brand-50);
  font: 500 11px/1 var(--font-family-mono);
}

.apply-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
  gap: 18px;
}

.application-panel {
  padding: 24px;
  border: 1px solid var(--color-neutral-100);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.application-panel--primary {
  border-color: var(--color-brand-100);
  background:
    linear-gradient(145deg, var(--color-brand-50), transparent 42%),
    var(--color-surface);
}

.panel-heading {
  display: flex;
  min-height: 64px;
  margin-bottom: 24px;
  align-items: flex-start;
  gap: 14px;
}

.panel-heading h3 {
  margin: 1px 0 5px;
  color: var(--color-brand-900);
  font-size: 17px;
}

.panel-index {
  display: grid;
  flex: 0 0 36px;
  height: 36px;
  place-items: center;
  border-radius: 12px 12px 12px 4px;
  color: var(--color-brand-700);
  background: var(--color-brand-100);
  font: 600 11px/1 var(--font-family-mono);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.time-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
}

.time-range :deep(.el-date-editor) {
  width: 100%;
}

.time-range > span {
  color: var(--color-neutral-400);
  font-size: 12px;
}

.schedule-id-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.schedule-id-pair :deep(.el-input-number) {
  width: 100%;
}

.exchange-mark {
  margin-top: 8px;
  color: var(--color-brand-500);
  font-size: 18px;
  text-align: center;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.request-title,
.record-card__top > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.request-title strong,
.record-card__top strong {
  color: var(--color-brand-900);
}

.request-title span,
.record-card__top span,
.cell-subtitle,
.muted-text {
  color: var(--color-neutral-500);
}

.cell-subtitle {
  display: block;
  margin-top: 4px;
  font-size: var(--font-size-xs);
}

.desktop-records + .el-pagination {
  padding-top: 20px;
}

.mobile-records {
  display: none;
}

@media (max-width: 1100px) {
  .apply-grid {
    grid-template-columns: 1fr;
  }

  .panel-heading {
    min-height: auto;
  }
}

@media (max-width: 767px) {
  .swap-tabs :deep(.el-tabs__header) {
    padding-inline: 16px;
  }

  .swap-tabs :deep(.el-tab-pane) {
    padding: 20px 16px 24px;
  }

  .apply-intro,
  .records-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .flow-hint {
    align-self: flex-start;
  }

  .records-toolbar :deep(.el-select) {
    width: 100% !important;
  }

  .application-panel {
    padding: 20px 16px;
  }

  .form-grid,
  .schedule-id-pair {
    grid-template-columns: 1fr;
  }

  .exchange-mark {
    display: none;
  }

  .time-range {
    grid-template-columns: 1fr;
  }

  .time-range > span {
    display: none;
  }

  .form-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .form-actions :deep(.el-button) {
    width: 100%;
    margin: 0;
  }

  .desktop-records {
    display: none;
  }

  .mobile-records {
    display: grid;
    gap: 12px;
  }

  .record-card {
    padding: 16px;
    border: 1px solid var(--color-neutral-100);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .record-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .record-card dl {
    display: grid;
    gap: 10px;
    margin: 16px 0;
  }

  .record-card dl div {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 10px;
  }

  .record-card dt {
    color: var(--color-neutral-400);
    font-size: 12px;
  }

  .record-card dd {
    margin: 0;
    color: var(--color-neutral-700);
    font-size: 13px;
  }

  .record-card :deep(.el-button) {
    width: 100%;
  }
}
</style>
