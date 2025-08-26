// src/axios.js
import axios from 'axios';

export const axiosInstance = axios.create({
  baseURL: 'http://localhost:3000', // oder deine API URL
});
