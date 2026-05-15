import request from './request'

export function getEmployeePage(params) {
  return request.get('/employees/page', { params })
}

export function getEmployee(id) {
  return request.get(`/employees/${id}`)
}

export function createEmployee(data) {
  return request.post('/employees', data)
}

export function updateEmployee(data) {
  return request.put('/employees', data)
}

export function deleteEmployee(id) {
  return request.delete(`/employees/${id}`)
}

export function getGroupList(params) {
  return request.get('/groups/list', { params })
}

export function createGroup(data) {
  return request.post('/groups', data)
}

export function updateGroup(data) {
  return request.put('/groups', data)
}

export function deleteGroup(id) {
  return request.delete(`/groups/${id}`)
}

// 资质管理
export function getQualificationPage(params) {
  return request.get('/qualifications/page', { params })
}

export function getQualificationExpiring() {
  return request.get('/qualifications/expiring')
}

export function createQualification(data) {
  return request.post('/qualifications', data)
}

export function updateQualification(data) {
  return request.put('/qualifications', data)
}

export function deleteQualification(id) {
  return request.delete(`/qualifications/${id}`)
}

// 机型管理
export function getAircraftTypeList() {
  return request.get('/aircraft-types/list')
}

export function getAircraftTypeListAll() {
  return request.get('/aircraft-types/list-all')
}

export function createAircraftType(data) {
  return request.post('/aircraft-types', data)
}

export function updateAircraftType(data) {
  return request.put('/aircraft-types', data)
}

export function deleteAircraftType(id) {
  return request.delete(`/aircraft-types/${id}`)
}

// 排班偏好管理
export function getEmployeePreferences(employeeId) {
  return request.get(`/preferences/employee/${employeeId}`)
}

export function createEmployeePreference(data) {
  return request.post('/preferences', data)
}

export function updateEmployeePreference(data) {
  return request.put('/preferences', data)
}

export function deleteEmployeePreference(id) {
  return request.delete(`/preferences/${id}`)
}
