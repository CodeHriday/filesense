import React from 'react';
import { useAccessibility } from '../../context/AccessibilityContext';
import PropTypes from 'prop-types';

/**
 * DataTableAccessible - A screen reader friendly data table component
 * 
 * @param {Object} props
 * @param {Array} props.data - The data to render in the table
 * @param {Array} props.columns - Column configuration for the table
 * @param {string} props.caption - Table caption for screen readers
 * @param {string} props.summary - Optional detailed summary for complex tables
 * @param {boolean} props.sortable - Whether the table is sortable
 */
const DataTableAccessible = ({ 
  data, 
  columns, 
  caption, 
  summary, 
  sortable = false,
  onRowClick = null
}) => {
  const { screenReaderOptimized } = useAccessibility();
  
  if (!data || !columns || data.length === 0) {
    return (
      <div className="data-table-empty" role="status">
        <p>No data available</p>
      </div>
    );
  }
  
  return (
    <div className="data-table-accessible-wrapper">
      {/* Screen reader optimized summaries */}
      {screenReaderOptimized && summary && (
        <div className="sr-only">
          <h3>Table Summary</h3>
          <p>{summary}</p>
        </div>
      )}
      
      <table 
        className="data-table-accessible" 
        aria-label={caption}
        summary={summary}
      >
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th 
                key={`header-${column.accessor || column.header || index}`}
                scope="col"
                aria-sort={sortable ? 'none' : undefined}
              >
                {column.header}
                {column.description && (
                  <span className="column-description" aria-hidden="true">
                    <small> ({column.description})</small>
                  </span>
                )}
                {/* For screen readers only - provide additional column information */}
                {column.description && (
                  <span className="sr-only">
                    - {column.description}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr 
              key={`row-${row.id || row.name || rowIndex}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'clickable-row' : ''}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? 'Click to select this row' : undefined}
              onKeyDown={onRowClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onRowClick(row);
                  e.preventDefault();
                }
              } : undefined}
            >
              {columns.map((column, colIndex) => {
                const cellValue = row[column.key];
                // Get the display value if a formatter is provided
                const displayValue = column.formatter ? 
                  column.formatter(cellValue, row) : 
                  cellValue;
                  
                return (
                  <td 
                    key={`cell-${rowIndex}-${column.accessor || colIndex}`}
                    data-label={column.header} // For responsive tables
                  >
                    {/* Render cell content */}
                    {displayValue === null || displayValue === undefined ? 
                      <span aria-label="Empty cell">—</span> : 
                      displayValue}
                    
                    {/* Add additional screen reader context if provided */}
                    {column.screenReaderInfo && (
                      <span className="sr-only">
                        {typeof column.screenReaderInfo === 'function' 
                          ? column.screenReaderInfo(cellValue, row) 
                          : column.screenReaderInfo}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Row count announcement for screen readers */}
      <div className="sr-only">
        This table contains {data.length} {data.length === 1 ? 'row' : 'rows'}.
      </div>
    </div>
  );
};
DataTableAccessible.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object).isRequired,

  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      header: PropTypes.string.isRequired,
      description: PropTypes.string,
      formatter: PropTypes.func,
      screenReaderInfo: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.func
      ])
    })
  ).isRequired,

  caption: PropTypes.string.isRequired,
  summary: PropTypes.string,
  sortable: PropTypes.bool,
  onRowClick: PropTypes.func
};

export default DataTableAccessible;