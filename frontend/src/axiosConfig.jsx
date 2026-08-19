import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supportToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('supportToken')) {
      localStorage.removeItem('supportToken');
      localStorage.removeItem('supportUser');
      window.dispatchEvent(new Event('support-auth-expired'));
    }
    return Promise.reject(error);
  }
);

export const apiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const details = error.response?.data?.error?.details;
  if (Array.isArray(details) && details.length) return details.join('. ');
  return error.response?.data?.error?.message || fallback;
};
export default api;
