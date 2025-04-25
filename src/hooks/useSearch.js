import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for search and filter functionality
 * @param {Object} options - Search options
 * @param {Array} options.data - Array of data to search/filter
 * @param {Array} options.searchFields - Fields to search in each item
 * @param {Object} options.initialFilters - Initial filter values
 * @param {number} options.debounceMs - Debounce delay for search in milliseconds
 * @returns {Object} Search state and utilities
 */
export const useSearch = ({
  data = [],
  searchFields = [],
  initialFilters = {},
  debounceMs = 300
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const debounceTimeout = useRef(null);
  
  // Debounce search query to prevent excessive filtering on every keypress
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    debounceTimeout.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, debounceMs);
    
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [searchQuery, debounceMs]);
  
  // Update search query
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);
  
  // Set search query programmatically
  const setSearch = useCallback((query) => {
    setSearchQuery(query);
  }, []);
  
  // Update a specific filter
  const handleFilterChange = useCallback((filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  }, []);
  
  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);
  
  // Apply search and filters to data
  const filteredData = useMemo(() => {
    if (!data.length) return [];
    
    // First apply filters
    let result = [...data];
    
    // Apply each active filter
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return; // Skip empty filters
      }
      
      if (Array.isArray(value) && value.length === 0) {
        return; // Skip empty array filters
      }
      
      result = result.filter(item => {
        const itemValue = item[key];
        
        // Handle different filter types
        if (Array.isArray(value)) {
          // Handle array of allowed values (OR condition)
          return value.includes(itemValue);
        } else if (typeof value === 'boolean') {
          // Handle boolean filters
          return itemValue === value;
        } else if (value instanceof Date) {
          // Handle date filters (assuming itemValue is also a date or can be converted to one)
          const itemDate = new Date(itemValue);
          return itemDate.toDateString() === value.toDateString();
        } else if (typeof value === 'object' && value !== null) {
          // Handle range filters
          const { min, max } = value;
          let passesFilter = true;
          
          if (min !== undefined && min !== null) {
            passesFilter = passesFilter && itemValue >= min;
          }
          
          if (max !== undefined && max !== null) {
            passesFilter = passesFilter && itemValue <= max;
          }
          
          return passesFilter;
        } else {
          // Handle string/number equality
          return itemValue === value;
        }
      });
    });
    
    // Then apply search if query exists
    if (debouncedQuery.trim()) {
      const query = debouncedQuery.toLowerCase();
      
      result = result.filter(item => {
        // Search through specified fields
        return searchFields.some(field => {
          const fieldValue = item[field];
          
          if (fieldValue === undefined || fieldValue === null) {
            return false;
          }
          
          const stringValue = String(fieldValue).toLowerCase();
          return stringValue.includes(query);
        });
      });
    }
    
    return result;
  }, [data, filters, debouncedQuery, searchFields]);
  
  return {
    searchQuery,
    setSearchQuery: setSearch,
    handleSearchChange,
    filters,
    setFilters,
    handleFilterChange,
    resetFilters,
    filteredData,
    resultsCount: filteredData.length,
    hasFilters: Object.keys(filters).some(key => {
      const value = filters[key];
      return !(value === undefined || value === null || value === '' || 
              (Array.isArray(value) && value.length === 0));
    }),
    hasSearch: debouncedQuery.trim() !== ''
  };
};

export default useSearch;