/**
 * DataTable Component
 * 
 * A comprehensive data table component with support for sorting, filtering,
 * pagination, and row selection.
 */
import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import { Button, BUTTON_VARIANTS } from '../../atoms/buttons/Button';
import { Input } from '../../atoms/inputs/Input';
import { Typography, TYPOGRAPHY_VARIANTS } from '../../atoms/typography/Typography';

// Helper to sort data
const sortData = (data, sortConfig) => {
  if (!sortConfig || !sortConfig.key) {
    return [...data];
  }
  
  const { key, direction } = sortConfig;
  
  return [...data].sort((a, b) => {
    // Handle nested props using dot notation
    const aValue = key.split('.').reduce((obj, prop) => obj?.[prop], a);
    const bValue = key.split('.').reduce((obj, prop) => obj?.[prop], b);
    
    // Handle different value types
    if (aValue === bValue) return 0;
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    
    // Handle different data types
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    return direction === 'asc' ? aValue - bValue : bValue - aValue;
  });
};

// Helper to filter data
const filterData = (data, filters) => {
  if (!filters || Object.keys(filters).length === 0) {
    return [...data];
  }
  
  return data.filter(item => {
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      
      // Get the property value, supporting dot notation for nested props
      const propValue = key.split('.').reduce((obj, prop) => obj?.[prop], item);
      
      // Skip if property doesn't exist
      if (propValue === undefined) continue;
      
      // Convert both to strings for comparison
      const propStr = String(propValue).toLowerCase();
      const filterStr = String(value).toLowerCase();
      
      // If property doesn't include filter value, exclude item
      if (!propStr.includes(filterStr)) {
        return false;
      }
    }
    
    return true;
  });
};

const DataTable = ({
  data = [],
  columns = [],
  keyField = 'id',
  className,
  showHeader = true,
  striped = true,
  bordered = false,
  compact = false,
  highlightOnHover = true,
  sortable = true,
  filterable = false,
  pagination = true,
  pageSize = 10,
  selectable = false,
  onRowClick,
  onSelectionChange,
  emptyMessage = 'No data available',
  loading = false,
  loadingMessage = 'Loading data...',
  initialSort = null,
  headerClassName,
  rowClassName,
  cellClassName,
  containerClassName,
  footerClassName,
  paginationClassName,
  ...props
}) => {
  // State for sorting
  const [sortConfig, setSortConfig] = useState(initialSort);
  
  // State for filtering
  const [filters, setFilters] = useState({});
  
  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  
  // State for row selection
  const [selectedRows, setSelectedRows] = useState([]);
  
  // Reset pagination when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data, filters]);
  
  // Call onSelectionChange when selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedRows);
    }
  }, [selectedRows, onSelectionChange]);
  
  // Apply sorting and filtering
  const processedData = useMemo(() => {
    const filtered = filterData(data, filters);
    return sortData(filtered, sortConfig);
  }, [data, sortConfig, filters]);
  
  // Apply pagination
  const paginatedData = useMemo(() => {
    if (!pagination) return processedData;
    
    const startIndex = (currentPage - 1) * pageSize;
    return processedData.slice(startIndex, startIndex + pageSize);
  }, [processedData, pagination, currentPage, pageSize]);
  
  // Total page count
  const pageCount = useMemo(() => {
    return Math.ceil(processedData.length / pageSize);
  }, [processedData, pageSize]);
  
  // Handle sorting
  const handleSort = (key) => {
    if (!sortable) return;
    
    setSortConfig(prevSort => {
      // If not already sorting by this column, sort ascending
      if (!prevSort || prevSort.key !== key) {
        return { key, direction: 'asc' };
      }
      
      // If already sorting ascending by this column, sort descending
      if (prevSort.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      
      // If already sorting descending by this column, clear sort
      return null;
    });
  };
  
  // Handle filtering
  const handleFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Handle pagination
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };
  
  // Handle row selection
  const handleRowSelect = (rowKey, checked) => {
    if (!selectable) return;
    
    setSelectedRows(prev => {
      if (checked) {
        return [...prev, rowKey];
      } else {
        return prev.filter(key => key !== rowKey);
      }
    });
  };
  
  // Handle select all
  const handleSelectAll = (checked) => {
    if (!selectable) return;
    
    if (checked) {
      const allRowKeys = paginatedData.map(row => row[keyField]);
      setSelectedRows(allRowKeys);
    } else {
      setSelectedRows([]);
    }
  };
  
  // Check if all rows are selected
  const areAllRowsSelected = useMemo(() => {
    if (!paginatedData.length) return false;
    
    const pageRowKeys = paginatedData.map(row => row[keyField]);
    return pageRowKeys.every(key => selectedRows.includes(key));
  }, [paginatedData, selectedRows, keyField]);
  
  // Get sort icon
  const getSortIcon = (key) => {
    if (!sortConfig || sortConfig.key !== key) {
      return '↕';
    }
    
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };
  
  // Table container classes
  const containerClasses = clsx(
    'overflow-x-auto',
    containerClassName
  );
  
  // Table classes
  const tableClasses = clsx(
    'w-full text-left',
    className
  );
  
  // Header classes
  const headerClasses = clsx(
    'bg-gray-100 text-gray-700',
    headerClassName
  );
  
  // Header cell classes
  const getHeaderCellClasses = (column) => clsx(
    'px-4 py-2 font-semibold',
    {
      'cursor-pointer hover:bg-gray-200': sortable && column.sortable !== false,
      'border': bordered
    },
    column.headerClassName
  );
  
  // Row classes
  const getRowClasses = (row, index) => clsx(
    {
      'bg-gray-50': striped && index % 2 === 1,
      'hover:bg-blue-50': highlightOnHover,
      'cursor-pointer': !!onRowClick,
      'border-t': bordered,
      'bg-blue-50': selectedRows.includes(row[keyField])
    },
    rowClassName
  );
  
  // Cell classes
  const getCellClasses = (column) => clsx(
    'px-4',
    {
      'py-2': !compact,
      'py-1': compact,
      'border': bordered
    },
    cellClassName,
    column.className
  );
  
  // Footer classes
  const footerClasses = clsx(
    'py-2 px-4',
    footerClassName
  );
  
  // Pagination classes
  const paginationClasses = clsx(
    'flex items-center justify-between mt-4',
    paginationClassName
  );
  
  // Render table
  return (
    <div {...props}>
      {/* Filter inputs */}
      {filterable && (
        <div className="mb-4 flex flex-wrap gap-4">
          {columns
            .filter(column => column.filterable !== false)
            .map(column => (
              <div key={`filter-${column.key || column.accessor}`} className="flex-1 min-w-[200px]">
                <Input
                  placeholder={`Filter ${column.header || column.accessor}`}
                  value={filters[column.accessor] || ''}
                  onChange={(e) => handleFilter(column.accessor, e.target.value)}
                  size="small"
                />
              </div>
            ))}
        </div>
      )}
      
      {/* Table container */}
      <div className={containerClasses}>
        {loading ? (
          <div className="flex justify-center items-center p-8">
            <Typography>{loadingMessage}</Typography>
          </div>
        ) : processedData.length === 0 ? (
          <div className="flex justify-center items-center p-8">
            <Typography>{emptyMessage}</Typography>
          </div>
        ) : (
          <table className={tableClasses}>
            {/* Table header */}
            {showHeader && (
              <thead className={headerClasses}>
                <tr>
                  {/* Selection checkbox */}
                  {selectable && (
                    <th className={getHeaderCellClasses({ headerClassName: 'w-10' })}>
                      <input
                        type="checkbox"
                        checked={areAllRowsSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </th>
                  )}
                  
                  {/* Column headers */}
                  {columns.map((column) => (
                    <th
                      key={column.key || column.accessor}
                      className={getHeaderCellClasses(column)}
                      onClick={() => column.sortable !== false && handleSort(column.accessor)}
                      style={column.width ? { width: column.width } : undefined}
                    >
                      <div className="flex items-center justify-between">
                        <span>{column.header || column.accessor}</span>
                        
                        {sortable && column.sortable !== false && (
                          <span className="ml-1">{getSortIcon(column.accessor)}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            
            {/* Table body */}
            <tbody>
              {paginatedData.map((row, rowIndex) => (
                <tr
                  key={row[keyField] || rowIndex}
                  className={getRowClasses(row, rowIndex)}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {/* Selection checkbox */}
                  {selectable && (
                    <td className={getCellClasses({ className: 'w-10' })}>
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(row[keyField])}
                        onChange={(e) => handleRowSelect(row[keyField], e.target.checked)}
                        onClick={(e) => e.stopPropagation()} // Prevent row click when clicking checkbox
                      />
                    </td>
                  )}
                  
                  {/* Row cells */}
                  {columns.map((column) => (
                    <td key={`${row[keyField]}-${column.key || column.accessor}`} className={getCellClasses(column)}>
                      {column.render
                        ? column.render(row)
                        : row[column.accessor]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Pagination footer */}
      {pagination && !loading && processedData.length > 0 && (
        <div className={footerClasses}>
          <div className={paginationClasses}>
            <div className="flex items-center gap-2">
              <Typography variant={TYPOGRAPHY_VARIANTS.BODY2}>
                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, processedData.length)} of {processedData.length} entries
              </Typography>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant={BUTTON_VARIANTS.SECONDARY}
                size="small"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              >
                First
              </Button>
              
              <Button
                variant={BUTTON_VARIANTS.SECONDARY}
                size="small"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Prev
              </Button>
              
              <Typography variant={TYPOGRAPHY_VARIANTS.BODY2} className="mx-2">
                Page {currentPage} of {pageCount}
              </Typography>
              
              <Button
                variant={BUTTON_VARIANTS.SECONDARY}
                size="small"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === pageCount}
              >
                Next
              </Button>
              
              <Button
                variant={BUTTON_VARIANTS.SECONDARY}
                size="small"
                onClick={() => handlePageChange(pageCount)}
                disabled={currentPage === pageCount}
              >
                Last
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

DataTable.propTypes = {
  /** Table data array */
  data: PropTypes.array,
  /** Column definitions */
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      /** Column unique identifier */
      key: PropTypes.string,
      /** Property accessor for data objects */
      accessor: PropTypes.string.isRequired,
      /** Column header text */
      header: PropTypes.node,
      /** Custom render function */
      render: PropTypes.func,
      /** Column width */
      width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      /** Enable/disable sorting for this column */
      sortable: PropTypes.bool,
      /** Enable/disable filtering for this column */
      filterable: PropTypes.bool,
      /** Custom CSS class for the column */
      className: PropTypes.string,
      /** Custom CSS class for the header cell */
      headerClassName: PropTypes.string,
    })
  ),
  /** Property name to use as unique key for rows */
  keyField: PropTypes.string,
  /** Additional CSS class for the table */
  className: PropTypes.string,
  /** Show table header */
  showHeader: PropTypes.bool,
  /** Apply zebra striping to rows */
  striped: PropTypes.bool,
  /** Add borders to cells */
  bordered: PropTypes.bool,
  /** Reduce cell padding for compact table */
  compact: PropTypes.bool,
  /** Highlight rows on hover */
  highlightOnHover: PropTypes.bool,
  /** Enable sorting */
  sortable: PropTypes.bool,
  /** Enable filtering */
  filterable: PropTypes.bool,
  /** Enable pagination */
  pagination: PropTypes.bool,
  /** Number of rows per page */
  pageSize: PropTypes.number,
  /** Enable row selection */
  selectable: PropTypes.bool,
  /** Row click handler */
  onRowClick: PropTypes.func,
  /** Selection change handler */
  onSelectionChange: PropTypes.func,
  /** Message to display when there's no data */
  emptyMessage: PropTypes.node,
  /** Loading state */
  loading: PropTypes.bool,
  /** Message to display when loading */
  loadingMessage: PropTypes.node,
  /** Initial sort configuration */
  initialSort: PropTypes.shape({
    key: PropTypes.string.isRequired,
    direction: PropTypes.oneOf(['asc', 'desc']).isRequired,
  }),
  /** Custom CSS class for the header */
  headerClassName: PropTypes.string,
  /** Custom CSS class for rows */
  rowClassName: PropTypes.string,
  /** Custom CSS class for cells */
  cellClassName: PropTypes.string,
  /** Custom CSS class for the container */
  containerClassName: PropTypes.string,
  /** Custom CSS class for the footer */
  footerClassName: PropTypes.string,
  /** Custom CSS class for pagination */
  paginationClassName: PropTypes.string,
};

export default DataTable;