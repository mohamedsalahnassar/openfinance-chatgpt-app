import axios from 'axios';

const API_BASE_URL = 'http://localhost:1411'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export default api;
