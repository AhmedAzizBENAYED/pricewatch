import client from './client'

export const login = (email, password) =>
  client.post('/api/v1/auth/login', { email, password }).then((r) => r.data)

export const getMe = () =>
  client.get('/api/v1/auth/me').then((r) => r.data)
