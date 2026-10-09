import client from '../client'

export const getOverview = () =>
  client.get('/api/v1/dashboard/overview').then(r => r.data)

export const getEvents = (params = {}) =>
  client.get('/api/v1/events', { params }).then(r => r.data)

export const getAlerts = (params = {}) =>
  client.get('/api/v1/alerts', { params }).then(r => r.data)

export const getProducts = (params = {}) =>
  client.get('/api/v1/products', { params }).then(r => r.data)

export const getProduct = (id) =>
  client.get(`/api/v1/products/${id}`).then(r => r.data)

export const getProductComparison = (id) =>
  client.get(`/api/v1/products/${id}/comparison`).then(r => r.data)

export const getProductHistory = (id, period = '30d') =>
  client.get(`/api/v1/products/${id}/history`, { params: { period } }).then(r => r.data)

export const getOffer = (id) =>
  client.get(`/api/v1/offers/${id}`).then(r => r.data)

export const getOfferHistory = (id, period = '30d') =>
  client.get(`/api/v1/offers/${id}/history`, { params: { period } }).then(r => r.data)

export const getEventsSummary = (period = '7d') =>
  client.get('/api/v1/events/summary', { params: { period } }).then(r => r.data)

export const getEventSites = () =>
  client.get('/api/v1/events/sites').then(r => r.data)

export const getDashboardTrends = () =>
  client.get('/api/v1/dashboard/trends').then(r => r.data)

export const getUnreadCount = () =>
  client.get('/api/v1/alerts/unread-count').then(r => r.data)

export const getCategories = (params = {}) =>
  client.get('/api/v1/products/categories', { params }).then(r => r.data)

export const getBrands = (params = {}) =>
  client.get('/api/v1/products/brands', { params }).then(r => r.data)

export const getProductEvents = (id, limit = 10) =>
  client.get(`/api/v1/events?referentiel_id=${id}&limit=${limit}`).then(r => r.data)

export const getPositioning = (params = {}) =>
  client.get('/api/v1/analysis/positioning', { params }).then(r => r.data)

export const getRuptures = () =>
  client.get('/api/v1/dashboard/ruptures').then(r => r.data)

export const getPositioningCategories = () =>
  client.get('/api/v1/analysis/positioning/categories').then(r => r.data)

export const getPositioningCompetitors = () =>
  client.get('/api/v1/analysis/positioning/competitors').then(r => r.data)

export const getAlertRules = () =>
  client.get('/api/v1/alert-rules').then(r => r.data)

export const createAlertRule = (data) =>
  client.post('/api/v1/alert-rules', data).then(r => r.data)

export const updateAlertRule = (id, data) =>
  client.put(`/api/v1/alert-rules/${id}`, data).then(r => r.data)

export const deleteAlertRule = (id) =>
  client.delete(`/api/v1/alert-rules/${id}`)

export const toggleAlertRule = (id, active) =>
  client.patch(`/api/v1/alert-rules/${id}/toggle`, { active }).then(r => r.data)

export const getMarketActivity = (period = '30d') =>
  client.get(`/api/v1/market/activity?period=${period}`).then(r => r.data)

export const getMarketHeatmap = (limit = 10) =>
  client.get(`/api/v1/market/heatmap?limit=${limit}`).then(r => r.data)

export const getMarketTrends = () =>
  client.get('/api/v1/market/trends').then(r => r.data)

export const markAlertRead = (id) =>
  client.patch(`/api/v1/alerts/${id}/read`).then(r => r.data)

export const markAllRead = () =>
  client.patch('/api/v1/alerts/read-all').then(r => r.data)

export const updateProfile = (data) =>
  client.patch('/api/v1/users/me', data).then(r => r.data)

export const updatePassword = (data) =>
  client.patch('/api/v1/users/me/password', data).then(r => r.data)

export const getScopeAvailable = (q = '') =>
  client.get(`/api/v1/scope/available?q=${encodeURIComponent(q)}`).then(r => r.data)

export const addToScope = (categorie_ids) =>
  client.post('/api/v1/scope/add', { categorie_ids }).then(r => r.data)

export const removeFromScope = (categorie_id) =>
  client.delete(`/api/v1/scope/remove/${categorie_id}`)

export const getRiskCategories = () =>
  client.get('/api/v1/analysis/risk-categories').then(r => r.data)

// ── Assistant ──────────────────────────────────────────────────────────────

export const getConversations = () =>
  client.get('/api/v1/assistant/conversations').then(r => r.data)

export const createConversation = (titre = null) =>
  client.post('/api/v1/assistant/conversations', { titre }).then(r => r.data)

export const getMessages = (convId) =>
  client.get(`/api/v1/assistant/conversations/${convId}/messages`).then(r => r.data)

export const uploadDocument = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/api/v1/assistant/documents', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getDocuments = () =>
  client.get('/api/v1/assistant/documents').then(r => r.data)

export const deleteDocument = (id) =>
  client.delete(`/api/v1/assistant/documents/${id}`)

// ── Reports ────────────────────────────────────────────────────────────────────

export const getReports = () =>
  client.get('/api/v1/reports').then(r => r.data)

export const createReport = (data) =>
  client.post('/api/v1/reports', data).then(r => r.data)

export const getReportStatus = (id) =>
  client.get(`/api/v1/reports/${id}/status`).then(r => r.data)

export const downloadReport = async (id, format = 'PDF') => {
  const ext      = format === 'EXCEL' ? 'xlsx' : 'pdf'
  const mimeType = format === 'EXCEL'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf'

  const response = await client.get(`/api/v1/reports/${id}/download`, {
    responseType: 'blob',
  })

  // Try Content-Disposition first (works once CORS exposes the header),
  // fall back to a safe name built from id + known extension.
  const disposition = response.headers['content-disposition'] || ''
  const match       = disposition.match(/filename="?([^";\r\n]+)"?/)
  const filename    = match ? match[1].trim() : `rapport_${id}.${ext}`

  const blob = new Blob([response.data], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const retryReport = (id) =>
  client.post(`/api/v1/reports/${id}/retry`).then(r => r.data)

export const deleteReport = (id) =>
  client.delete(`/api/v1/reports/${id}`)
