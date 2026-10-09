import client from '../client'
export { launchScraper } from './scrapers'

export const getSources = () =>
  client.get('/api/v1/admin/sources').then((r) => r.data)

export const getSource = (id) =>
  client.get(`/api/v1/admin/sources/${id}`).then((r) => r.data)

export const toggleSource = (id, active) =>
  client.patch(`/api/v1/admin/sources/${id}/toggle`, { active }).then((r) => r.data)
