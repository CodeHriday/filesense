/**
 * API client module
 * 
 * This module provides a configured Axios instance for making API requests.
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { API_BASE_URL } from '../config/config';

// Create a configured Axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from local storage or other auth state management
    const token = localStorage.getItem('token');
    
    // If token exists, add Authorization header
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling common error cases
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    // Handle 401 Unauthorized errors
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login page
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    
    // Handle 403 Forbidden errors
    if (error.response && error.response.status === 403) {
      console.error('Permission denied:', error.response.data);
      // You can redirect to an access denied page or show a message
    }
    
    // Pass the error to the next handler
    return Promise.reject(error);
  }
);

/**
 * Helper class for making API requests with the configured client
 */
export class ApiService {
  /**
   * Make a GET request
   * @param url URL path
   * @param config Optional Axios request config
   * @returns Promise with response data
   */
  static async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await apiClient.get(url, config);
    return response.data;
  }
  
  /**
   * Make a POST request
   * @param url URL path
   * @param data Request body
   * @param config Optional Axios request config
   * @returns Promise with response data
   */
  static async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await apiClient.post(url, data, config);
    return response.data;
  }
  
  /**
   * Make a PUT request
   * @param url URL path
   * @param data Request body
   * @param config Optional Axios request config
   * @returns Promise with response data
   */
  static async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await apiClient.put(url, data, config);
    return response.data;
  }
  
  /**
   * Make a DELETE request
   * @param url URL path
   * @param config Optional Axios request config
   * @returns Promise with response data
   */
  static async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await apiClient.delete(url, config);
    return response.data;
  }
  
  /**
   * Upload a file
   * @param url URL path
   * @param formData FormData with file and other fields
   * @param onProgress Progress callback function
   * @returns Promise with response data
   */
  static async uploadFile<T = any>(
    url: string,
    formData: FormData,
    onProgress?: (progressEvent: any) => void
  ): Promise<T> {
    const response: AxiosResponse<T> = await apiClient.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress,
    });
    return response.data;
  }
}

export default apiClient;