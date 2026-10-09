import client from '../client'

export const getBrands = (params = {}) =>
  client.get('/api/v1/admin/brands', { params }).then((r) => r.data)

export const createBrand = (data) =>
  client.post('/api/v1/admin/brands', data).then((r) => r.data)

export const updateBrand = (id, data) =>
  client.put(`/api/v1/admin/brands/${id}`, data).then((r) => r.data)
