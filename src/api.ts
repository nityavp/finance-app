import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({ baseURL: BASE });

const token = localStorage.getItem('token');
if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
