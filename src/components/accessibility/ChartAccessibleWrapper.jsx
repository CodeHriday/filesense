import React from 'react';
import { useAccessibility } from '../../context/AccessibilityContext';
import PropTypes from 'prop-types';

/**
 * ChartAccessibleWrapper - Wraps chart components to provide accessibility features
 * 
 * @param {Object} props
 * @param {ReactNode} props.children - The chart component to wrap
 * @param {string} props.title - Chart title 
 * @param {string} props.description - Chart description for screen readers
 * @param {Object} props.data - The data used to generate the chart
 * @param {string} props.chartType - Type of chart (e.g., 'bar', 'line', 'pie')
 * @param {string} props.xAxisLabel - Label for x-axis
 * @param {string} props.yAxisLabel - Label for y-axis
 */
const ChartAccessibleWrapper = ({
  children,
  title,
  description,
  data,
  chartType,
  xAxisLabel,
  yAxisLabel,
  dataTableColumns,
  summaryText,
}) => {
  const { screenReaderOptimized } = useAccessibility();
  
  // Create a textual representation of the chart data for screen readers
  const getDataTableRepresentation = () => {
    if (!data || !dataTableColumns) return null;
    
    // Handle different data formats
    if (Array.isArray(data)) {
      return (
        <table className="sr-only">
          <caption>{title} - Data Table</caption>
          <thead>
            <tr>
              {dataTableColumns.map((column, index) => (
                <th key={index} scope="col">{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index}>
                {dataTableColumns.map((column, colIndex) => (
                  <td key={`${index}-${colIndex}`}>
                    {typeof column.accessor === 'function' 
                      ? column.accessor(item) 
                      : item[column.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    
    // If data is not in the expected format, provide a basic description
    return (
      <div className="sr-only">
        <p>Data visualization with title: {title}</p>
        {description && <p>{description}</p>}
      </div>
    );
  };
  
  // Generate a summary of key findings
  const getChartSummary = () => {
    if (summaryText) {
      return summaryText;
    }
    
    // If no summary provided, create a basic one
    return `This ${chartType} chart displays ${title}. ${description || ''}`;
  };
  
  return (
    <div 
      className="chart-accessible-wrapper"
      role="figure" 
      aria-labelledby="chart-title"
      aria-describedby="chart-description"
    >
      <h3 id="chart-title" className="chart-title">{title}</h3>
      
      {/* Visual chart */}
      <div className="chart-container" aria-hidden={screenReaderOptimized}>
        {children}
      </div>
      
      {/* Screen reader content */}
      {screenReaderOptimized && (
        <div className="chart-accessibility-info">
          <div id="chart-description" className="sr-only">
            <h4>Chart Description</h4>
            <p>{description}</p>
            
            {xAxisLabel && yAxisLabel && (
              <p>
                This chart displays {yAxisLabel} values on the y-axis against {xAxisLabel} values on the x-axis.
              </p>
            )}
            
            <h4>Key Findings</h4>
            <p>{getChartSummary()}</p>
          </div>
          
          {/* Data table representation for screen readers */}
          {getDataTableRepresentation()}
          
          {/* Download link for the data */}
          <button 
            className="accessibility-data-download" 
            onClick={() => {
              // Create CSV data from chart data
              if (!data || !dataTableColumns) return;
              
              const headers = dataTableColumns.map(col => col.header).join(',');
              const rows = data.map(item => {
                return dataTableColumns.map(column => {
                  const value = typeof column.accessor === 'function' 
                    ? column.accessor(item) 
                    : item[column.accessor];
                  return typeof value === 'string' && value.includes(',') 
                    ? `"${value}"` 
                    : value;
                }).join(',');
              }).join('\n');
              
              const csvContent = `${headers}\n${rows}`;
              
              // Create blob and download
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.setAttribute('href', url);
              link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_data.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            Download chart data as CSV
          </button>
        </div>
      )}
    </div>
  );
};

export default ChartAccessibleWrapper;

ChartAccessibleWrapper.propTypes = {
  children: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.string,
  data: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  chartType: PropTypes.string,
  xAxisLabel: PropTypes.string,
  yAxisLabel: PropTypes.string,
  dataTableColumns: PropTypes.arrayOf(
    PropTypes.shape({
      header: PropTypes.string.isRequired,
      accessor: PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
    })
  ),
  summaryText: PropTypes.string,
};

ChartAccessibleWrapper.defaultProps = {
  children: null,
  title: '',
  description: '',
  data: null,
  chartType: 'chart',
  xAxisLabel: '',
  yAxisLabel: '',
  dataTableColumns: null,
  summaryText: '',
};