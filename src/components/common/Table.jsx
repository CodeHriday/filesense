import React, { useState } from 'react';
import PropTypes from 'prop-types';

import './Table.css';

const Table = ({ 
  data = [], 
  columns = [], 
  pageSize = 10,
  sortable = true,
  className = ''
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'asc'
  });
  
  // Handle sorting
  const handleSort = (key) => {
    if (!sortable) return;
    
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (sortConfig.key === null) return 0;
    
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    
    if (aValue === undefined || bValue === undefined) return 0;
    
    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
  
  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  
  // Handle page changes
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };
  
  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };
  
  // Get sort icons
  const getSortIcon = (key) => {
    if (!sortable) return null;
    
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? '↑' : '↓';
    }
    return '↕';
  };
  
  return (
    <div className={`table-container ${className}`}>
      {data.length === 0 ? (
        <div className="table-empty">No data available</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th 
                    key={column.accessor || column.header} 
                    onClick={() => sortable && column.accessor && handleSort(column.accessor)}
                    className={sortable && column.accessor ? 'sortable' : ''}
                  >
                    {column.header}
                    {column.accessor && sortable && (
                      <span className="sort-icon">{getSortIcon(column.accessor)}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, rowIndex) => (
                <tr key={row.id || rowIndex}>
                  {columns.map((column, colIndex) => (
                    <td key={colIndex}>
                      {column.cell ? column.cell(row) : row[column.accessor]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <div className="table-pagination">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="pagination-button"
                aria-label="Previous page"
              >
                &lt;
              </button>
              
              {getPageNumbers().map((page, index) => (
                <button
                  key={index}
                  onClick={() => typeof page === 'number' && handlePageChange(page)}
                  className={`pagination-button ${currentPage === page ? 'active' : ''}`}
                  disabled={page === '...'}
                >
                  {page}
                </button>
              ))}
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="pagination-button"
                aria-label="Next page"
              >
                &gt;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
Table.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object),
  
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      header: PropTypes.string.isRequired,
      accessor: PropTypes.string,
      cell: PropTypes.func
    })
  ),

  pageSize: PropTypes.number,
  sortable: PropTypes.bool,
  className: PropTypes.string
};
Table.defaultProps = {
  data: [],
  columns: [],
  pageSize: 10,
  sortable: true,
  className: ''
};

export default Table;