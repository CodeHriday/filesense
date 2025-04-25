import { useState, useEffect, useMemo, useCallback } from 'react';

/**
 * Custom hook for pagination logic
 * @param {Object} options - Pagination options
 * @param {Array} options.data - Array of data to paginate
 * @param {number} options.pageSize - Number of items per page (default: 10)
 * @param {number} options.initialPage - Initial page to show (default: 1)
 * @returns {Object} Pagination state and controls
 */
export const usePagination = ({ 
  data = [], 
  pageSize = 10, 
  initialPage = 1 
}) => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(pageSize);
  
  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(data.length / itemsPerPage));
  }, [data, itemsPerPage]);
  
  // Ensure current page is within bounds when data or page size changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  
  // Get current page items
  const currentItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, itemsPerPage]);
  
  // Next page function
  const nextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);
  
  // Previous page function
  const prevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);
  
  // Go to specific page
  const goToPage = useCallback((page) => {
    const pageNumber = parseInt(page, 10);
    if (isNaN(pageNumber)) return;
    
    setCurrentPage(Math.min(Math.max(pageNumber, 1), totalPages));
  }, [totalPages]);
  
  // Change items per page
  const changeItemsPerPage = useCallback((size) => {
    const newSize = parseInt(size, 10);
    if (isNaN(newSize) || newSize < 1) return;
    
    setItemsPerPage(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  }, []);
  
  // Calculate page ranges for pagination control
  const pageRange = useMemo(() => {
    const delta = 2; // Number of pages to show before and after current page
    const range = [];
    
    const rangeWithDots = [];
    let l;
    
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || 
        i === totalPages || 
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        range.push(i);
      } else if (i === currentPage - delta - 1 || i === currentPage + delta + 1) {
        range.push('...');
      }
    }
    
    for (let i of range) {
      if (l) {
        if (i === '...') {
          rangeWithDots.push('...');
        } else {
          if (l + 1 !== i) {
            rangeWithDots.push('...');
          }
          rangeWithDots.push(i);
        }
      } else {
        rangeWithDots.push(i);
      }
      l = i;
    }
    
    return rangeWithDots;
  }, [currentPage, totalPages]);
  
  return {
    currentPage,
    setCurrentPage,
    itemsPerPage,
    totalPages,
    currentItems,
    nextPage,
    prevPage,
    goToPage,
    changeItemsPerPage,
    pageRange,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1
  };
};

export default usePagination;