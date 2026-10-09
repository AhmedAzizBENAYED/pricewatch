import client from '../client'

export const getTenants = (params = {}) =>
  client.get('/api/v1/admin/tenants', { params }).then((r) => r.data)

export const createTenant = (data) =>
  client.post('/api/v1/admin/tenants', data).then((r) => r.data)

export const getTenant = (id) =>
  client.get(`/api/v1/admin/tenants/${id}`).then((r) => r.data)

export const updateTenant = (id, data) =>
  client.put(`/api/v1/admin/tenants/${id}`, data).then((r) => r.data)

export const deleteTenant = (id) =>
  client.delete(`/api/v1/admin/tenants/${id}`).then((r) => r.data)

export const getTenantStats = (id) =>
  client.get(`/api/v1/admin/tenants/${id}/stats`).then((r) => r.data)

export const getTenantCategories = (id, params = {}) =>
  client.get(`/api/v1/admin/tenants/${id}/categories`, { params }).then((r) => r.data)

export const getAvailableCategories = (id, params = {}) =>
  client.get(`/api/v1/admin/tenants/${id}/categories/available`, { params }).then((r) => r.data)

export const assignCategories = (id, categorie_ids) =>
  client.post(`/api/v1/admin/tenants/${id}/categories`, { categorie_ids }).then((r) => r.data)

export const removeCategory = (tenantId, catId) =>
  client.delete(`/api/v1/admin/tenants/${tenantId}/categories/${catId}`)

export const getTenantUsers = (tenantId, params = {}) =>
  client.get(`/api/v1/admin/tenants/${tenantId}/users`, { params }).then((r) => r.data)

export const createUser = (tenantId, data) =>
  client.post(`/api/v1/admin/tenants/${tenantId}/users`, data).then((r) => r.data)

export const updateUser = (tenantId, userId, data) =>
  client.put(`/api/v1/admin/tenants/${tenantId}/users/${userId}`, data).then((r) => r.data)

export const deactivateUser = (tenantId, userId) =>
  client.patch(`/api/v1/admin/tenants/${tenantId}/users/${userId}/deactivate`)
