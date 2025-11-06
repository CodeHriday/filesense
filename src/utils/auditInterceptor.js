import axios from 'axios';

let interceptorInitialized = false;

export function initializeAuditInterceptor() {
  if (interceptorInitialized) {
    return;
  }

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      const skipAuditPaths = ['/api/audit/frontend-api-error', '/api/auth/login', '/api/auth/logout'];
      
      if (!originalRequest || skipAuditPaths.some(path => originalRequest.url.includes(path))) {
        return Promise.reject(error);
      }

      try {
        const browserInfo = {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform
        };

        const errorData = {
          api_endpoint: originalRequest.url,
          api_method: originalRequest.method?.toUpperCase(),
          api_status_code: error.response?.status || 0,
          api_error_message: error.response?.data?.error || error.response?.data?.message || error.message,
          page_url: window.location.href,
          page_title: document.title,
          browser_info: browserInfo,
          metadata: {
            request_data: originalRequest.data ? JSON.parse(JSON.stringify(originalRequest.data)).substring(0, 500) : null,
            response_data: error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : null
          }
        };

        await axios.post('/api/audit/frontend-api-error', errorData);
      } catch (auditError) {
        console.error('Failed to log API error to audit:', auditError);
      }

      return Promise.reject(error);
    }
  );

  interceptorInitialized = true;
}
