import client from '../client'

export const getPlatformStats = () =>
  client.get('/api/v1/admin/stats').then((r) => r.data)

// TODO: backend - add period filter to /stats/scraping
export const getSiteScrapingStats = () =>
  client.get('/api/v1/admin/stats/scraping').then((r) => r.data)

// Alias used by Overview.jsx (period param ignored by backend for now)
export const getScrapingStats = getSiteScrapingStats

export const getMatchingStats = () =>
  client.get('/api/v1/admin/stats/matching').then((r) => r.data)

export const getTenantStats = () =>
  client.get('/api/v1/admin/stats/tenants').then((r) => r.data)
