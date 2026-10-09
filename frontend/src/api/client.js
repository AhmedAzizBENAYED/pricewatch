import axios from 'axios'

const client = axios.create({
  baseURL: '',
  timeout: 30000,
  paramsSerializer: (params) => {
    const parts = []
    for (const [key, val] of Object.entries(params)) {
      if (val === null || val === undefined) continue
      if (Array.isArray(val)) {
        val.forEach(v => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`))
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
      }
    }
    return parts.join('&')
  },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pfe_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pfe_token')
      localStorage.removeItem('pfe_auth')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default client
