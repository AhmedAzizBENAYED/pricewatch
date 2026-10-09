import client from '../client'

export const getAuditLog = (params = {}) =>
  client.get('/api/v1/admin/audit', { params }).then((r) => r.data)

// Alias used by TenantDetail.jsx
export const getAudit = getAuditLog

export const getAuditEntry = (id) =>
  client.get(`/api/v1/admin/audit/${id}`).then((r) => r.data)
