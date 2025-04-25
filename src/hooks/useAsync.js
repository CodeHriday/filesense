import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for handling asynchronous operations
 * with loading, error, and success states
 * 
 * @param {Function} asyncFunction - The async function to execute
 * @param {Object} options - Configuration options
 * @returns {Object} Async operation state and control methods
 */
export const useAsync = (asyncFunction, options = {}) => {
  const {
    immediate = false,
    initialData = null,
    onSuccess,
    onError,
    resetOnSuccess = false
  } = options;
  
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const [hasRun, setHasRun] = useState(false);
  
  // Store the latest callbacks in refs to avoid unnecessary rerenders
  const successCallbackRef = useRef(onSuccess);
  const errorCallbackRef = useRef(onError);
  
  // Update callback refs when they change
  successCallbackRef.current = onSuccess;
  errorCallbackRef.current = onError;
  
  // Track if the component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);
  
  // Remember the latest promise to avoid race conditions
  const lastPromiseRef = useRef(null);
  
  const execute = useCallback((...args) => {
    setLoading(true);
    setError(null);
    
    // Generate a unique promise ID to track this specific execution
    const promiseId = Symbol('promise');
    lastPromiseRef.current = promiseId;
    
    const promise = asyncFunction(...args)
      .then(result => {
        // Only update state if this is still the latest promise
        if (isMountedRef.current && lastPromiseRef.current === promiseId) {
          setData(result);
          setHasRun(true);
          setLoading(false);
          
          if (resetOnSuccess) {
            setTimeout(() => {
              if (isMountedRef.current && lastPromiseRef.current === promiseId) {
                setData(initialData);
              }
            }, 0);
          }
          
          if (successCallbackRef.current) {
            successCallbackRef.current(result);
          }
        }
        return result;
      })
      .catch(err => {
        // Only update state if this is still the latest promise
        if (isMountedRef.current && lastPromiseRef.current === promiseId) {
          setError(err);
          setHasRun(true);
          setLoading(false);
          
          if (errorCallbackRef.current) {
            errorCallbackRef.current(err);
          }
        }
        return Promise.reject(err);
      });
    
    return promise;
  }, [asyncFunction, initialData, resetOnSuccess]);
  
  // Execute immediately if configured
  useState(() => {
    if (immediate) {
      execute();
    }
  });
  
  // Cleanup on unmount
  useState(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Reset the state
  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setLoading(false);
    setHasRun(false);
  }, [initialData]);
  
  return {
    data,
    loading,
    error,
    execute,
    reset,
    hasRun,
    setData, // Allows manual updates to the data
  };
};

export default useAsync;