import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001/api',
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Adds the persisted JWT to each API request without duplicating header logic.
 *
 * @param {Object} config - Axios request configuration.
 * @returns {Object} Configuration containing a Bearer header when authenticated.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supportToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Converts unauthorized API responses into a global authentication-expired event.
 * This side effect clears stale credentials through AuthProvider.
 *
 * @param {Object} response - Successful Axios response.
 * @returns {Object} Unchanged successful response.
 */
api.interceptors.response.use(
  (response) => response,
  /**
   * Rejects failed responses after clearing credentials for expired authentication.
   *
   * @param {Object} error - Axios response error.
   * @returns {Promise<never>} Rejected promise for page-level error handling.
   */
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('supportToken')) {
      localStorage.removeItem('supportToken');
      localStorage.removeItem('supportUser');
      window.dispatchEvent(new Event('support-auth-expired'));
    }
    return Promise.reject(error);
  }
);

/**
 * Extracts field-level or general API errors for consistent user feedback.
 *
 * @param {Object} error - Axios error containing the backend error response.
 * @param {string} [fallback='Something went wrong. Please try again.'] - Message used when the API provides none.
 * @returns {string} Readable validation or API error text.
 */
export const apiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const details = error.response?.data?.error?.details;
  if (Array.isArray(details) && details.length) return details.join('. ');
  return error.response?.data?.error?.message || fallback;
};
export default api;
