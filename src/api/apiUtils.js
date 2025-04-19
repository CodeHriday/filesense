/**
 * Common error handling function for API calls
 * @param {Error} error - The error object from axios
 * @returns {Object} Standardized error object
 */
export const handleApiError = (error) => {
  console.error('API Error:', error);
  
  if (error.response) {
    // Server responded with an error (status code not 2xx)
    return {
      success: false,
      status: error.response.status,
      message: error.response.data.error || 'Server error occurred',
      details: error.response.data
    };
  } else if (error.request) {
    // Request was made but no response was received
    return {
      success: false,
      status: 0,
      message: 'No response from server. Please check your connection.',
      details: { request: error.request }
    };
  } else {
    // Error in setting up the request
    return {
      success: false,
      status: 0,
      message: error.message || 'An unknown error occurred',
      details: { error: error.toString() }
    };
  }
};

/**
 * Standardize successful API responses
 * @param {Object} response - The axios response object
 * @returns {Object} Standardized success response
 */
export const handleApiSuccess = async (response) => {
  try {
    const data = await response.json();
    return {
      success: response.ok,
      status: response.status,
      data: data
    };
  } catch (error) {
    return {
      success: response.ok,
      status: response.status,
      data: {}
    };
  }
};