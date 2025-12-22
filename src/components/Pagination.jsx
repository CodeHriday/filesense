import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import PropTypes from 'prop-types';

const Pagination = ({ currentPage, totalPages, onPageChange, itemsPerPage, totalItems, pageSize, onPageSizeChange }) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  if (totalPages <= 1 && !onPageSizeChange) return null;

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing {startItem} to {endItem} of {totalItems} items
      </div>
      <div className="pagination-controls">
        {onPageSizeChange && (
          <div className="pagination-page-size">
            <label>Rows per page:</label>
            <select value={pageSize || itemsPerPage} onChange={onPageSizeChange}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        )}
        
        {totalPages > 1 && (
          <>
            <button
              className="pagination-btn"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <FiChevronLeft /> Previous
            </button>
            
            <div className="pagination-numbers">
              {getPageNumbers().map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                ) : (
                  <button
                    key={page}
                    className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                    onClick={() => onPageChange(page)}
                  >
                    {page}
                  </button>
                )
              ))}
            </div>
            
            <button
              className="pagination-btn"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next <FiChevronRight />
            </button>
          </>
        )}
      </div>
    </div>
  );
};


Pagination.propTypes = {
  /** Current active page number (1-based) */
  currentPage: PropTypes.number.isRequired,

  /** Total number of pages */
  totalPages: PropTypes.number.isRequired,

  /** Callback fired when page changes */
  onPageChange: PropTypes.func.isRequired,

  /** Number of items per page */
  itemsPerPage: PropTypes.number.isRequired,

  /** Total number of items across all pages */
  totalItems: PropTypes.number.isRequired,

  /** Current page size value (optional, for page size selector) */
  pageSize: PropTypes.number,

  /** Callback fired when page size changes (optional, enables page size selector) */
  onPageSizeChange: PropTypes.func
};

export default Pagination;
