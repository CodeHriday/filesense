import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing state with local storage persistence
 * @param {string} key - Storage key
 * @param {any} initialValue - Initial value
 * @returns {Array} [storedValue, setValue, removeValue]
 */
export const useLocalStorage = (key, initialValue) => {
  // State to store our value
  const [storedValue, setStoredValue] = useState(() => {
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      
      // Parse stored json or return initialValue
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });
  
  // Return a wrapped version of useState's setter function that 
  // persists the new value to localStorage
  const setValue = useCallback((value) => {
    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = 
        value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      
      // Dispatch a custom event so other instances of useLocalStorage can update
      window.dispatchEvent(new CustomEvent('local-storage-update', { 
        detail: { key, value: valueToStore } 
      }));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);
  
  // Function to remove item from localStorage
  const removeValue = useCallback(() => {
    try {
      // Remove from localStorage
      window.localStorage.removeItem(key);
      
      // Reset state to initial value
      setStoredValue(initialValue);
      
      // Dispatch a custom event so other instances of useLocalStorage can update
      window.dispatchEvent(new CustomEvent('local-storage-update', { 
        detail: { key, value: undefined, removed: true } 
      }));
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);
  
  // Listen to changes in localStorage from other components
  useEffect(() => {
    const handleStorageUpdate = (e) => {
      if (e.detail.key === key) {
        if (e.detail.removed) {
          setStoredValue(initialValue);
        } else {
          setStoredValue(e.detail.value);
        }
      }
    };
    
    // Listen for the custom event we dispatch
    window.addEventListener('local-storage-update', handleStorageUpdate);
    
    // Also listen for storage events from other tabs/windows
    const handleStorageChange = (e) => {
      if (e.key === key) {
        if (e.newValue === null) {
          setStoredValue(initialValue);
        } else {
          try {
            setStoredValue(JSON.parse(e.newValue));
          } catch (error) {
            console.error(`Error parsing localStorage value for key "${key}":`, error);
          }
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('local-storage-update', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);
  
  return [storedValue, setValue, removeValue];
};

export default useLocalStorage;