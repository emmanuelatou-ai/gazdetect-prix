import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gd_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally (token expired)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('gd_token');
      localStorage.removeItem('gd_user');
      window.location.href = '/login?session_expired=1';
    }
    return Promise.reject(err);
  }
);

export default api;
