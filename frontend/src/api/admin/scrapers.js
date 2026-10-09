import client from '../client'

export const getScrapers = (params = {}) =>
  client.get('/api/v1/admin/scrapers', { params }).then((r) => r.data)

export const retryScraper = (id) =>
  client.post(`/api/v1/admin/scrapers/${id}/retry`).then((r) => r.data)

export const getScraperStats = (period = '7d') =>
  client.get('/api/v1/admin/scrapers/stats', { params: { period } }).then((r) => r.data)

export const getScraperDetail = (id) =>
  client.get(`/api/v1/admin/scrapers/${id}`).then((r) => r.data)

export const cancelScraper = (id) =>
  client.post(`/api/v1/admin/scrapers/${id}/cancel`).then((r) => r.data)

export const launchScraper = (site_id) =>
  client.post('/api/v1/admin/scrapers/launch', { site_id }).then((r) => r.data)

export const getSources = (params = {}) =>
  client.get('/api/v1/admin/sources', { params }).then((r) => r.data)
