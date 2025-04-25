import { useState, useCallback, useMemo } from 'react';

/**
 * Custom hook for data sorting
 * @param {Object} options - Sorting options
 * @param {Array} options.data - Array of data to sort
 * @param {string} options.defaultSortField - Default field to sort by
 * @param {string} options.defaultSortDirection - Default sort direction ('asc' or 'desc')
 * @returns {Object} Sorting state and utilities
 */
export const useSorting = ({
  data = [],
  defaultSortField = '',
  defaultSortDirection = 'asc'
}) => {
  const [sortField, setSortField] = useState(defaultSortField);
  const [sortDirection, setSortDirection] = useState(defaultSortDirection);
  
  // Handle sort field change
  const handleSortByField = useCallback((field) => {
    // If clicking the same field, toggle direction
    if (field === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new field, set it and default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);
  
  // Reset sorting to defaults
  const resetSorting = useCallback(() => {
    setSortField(defaultSortField);
    setSortDirection(defaultSortDirection);
  }, [defaultSortField, defaultSortDirection]);
  
  // Function to sort data by a field and direction
  const sortData = useCallback((dataArray, field, direction) => {
    if (!field || !dataArray.length) return dataArray;
    
    return [...dataArray].sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];
      
      // Handle undefined/null values
      if (aValue === undefined || aValue === null) {
        return direction === 'asc' ? -1 : 1;
      }
      if (bValue === undefined || bValue === null) {
        return direction === 'asc' ? 1 : -1;
      }
      
      // Sort based on value type
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        // Case-insensitive string comparison
        return direction === 'asc' 
          ? aValue.localeCompare(bValue, undefined, { sensitivity: 'base' })
          : bValue.localeCompare(aValue, undefined, { sensitivity: 'base' });
      } else if (aValue instanceof Date && bValue instanceof Date) {
        // Date comparison
        return direction === 'asc' 
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      } else {
        // Number or boolean comparison
        return direction === 'asc' 
          ? aValue - bValue
          : bValue - aValue;
      }
    });
  }, []);
  
  // Apply sorting to data
  const sortedData = useMemo(() => {
    return sortData(data, sortField, sortDirection);
  }, [data, sortField, sortDirection, sortData]);
  
  return {
    sortField,
    sortDirection,
    setSortField,
    setSortDirection,
    handleSortByField,
    resetSorting,
    sortedData,
    sortData, // Exposed for custom sorting needs
    isSorting: !!sortField,
    getSortIcon: (field) => {
      if (field !== sortField) return 'sort'; // Neutral sort icon
      return sortDirection === 'asc' ? 'sort-up' : 'sort-down';
    }
  };
};

export default useSorting;