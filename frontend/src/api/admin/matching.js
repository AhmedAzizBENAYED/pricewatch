import client from '../client'

export const getCandidates = (params = {}) =>
  client.get('/api/v1/admin/matching/candidates', { params }).then((r) => r.data)

export const getCandidate = (id) =>
  client.get(`/api/v1/admin/matching/candidates/${id}`).then((r) => r.data)

export const getMatchingStats = () =>
  client.get('/api/v1/admin/matching/stats').then((r) => r.data)

export const validateCandidate = (id, referentiel_id = null) =>
  client.post(`/api/v1/admin/matching/candidates/${id}/validate`, { referentiel_id }).then((r) => r.data)

export const rejectCandidate = (id, reason = null) =>
  client.post(`/api/v1/admin/matching/candidates/${id}/reject`, { reason }).then((r) => r.data)

export const correctCandidate = (id, referentiel_id) =>
  client.patch(`/api/v1/admin/matching/candidates/${id}/correct`, { referentiel_id }).then((r) => r.data)

export const bulkAction = (ids, action) =>
  client.post('/api/v1/admin/matching/candidates/bulk', { ids, action }).then((r) => r.data)
