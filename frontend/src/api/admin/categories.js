import client from '../client'

export const getCategories = (params = {}) =>
  client.get('/api/v1/admin/categories', { params }).then((r) => r.data)

export const getCategory = (id) =>
  client.get(`/api/v1/admin/categories/${id}`).then((r) => r.data)
