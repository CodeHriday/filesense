import React, { useState, useEffect, useRef } from 'react';
import { FiInfo, FiAlertTriangle, FiCheckCircle, FiFilter } from 'react-icons/fi';
import { ContextualTooltip, MetricTooltip } from './ContextualTooltip';
import { LoadingSkeleton, TableSkeleton } from './LoadingSkeleton';
import './DataQualityHeatmap.css';
import PropTypes from 'prop-types';

/**
 * Data Quality Heatmap Component
 * Displays a real-time heatmap visualization of data quality metrics for files
 */
const DataQualityHeatmap = ({
  data = [],
  metrics = ['completeness', 'accuracy', 'consistency', 'timeliness'],
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  loading = false,
  onRefresh,
  onFileClick,
  className = '',
  style = {}
}) => {
  const [sortBy, setSortBy] = useState('filename');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState({});
  const [heatmapData, setHeatmapData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const refreshTimerRef = useRef(null);
  const metricRanges = useRef({});
  
  // Calculate threshold ranges for heatmap colors
  useEffect(() => {
    // Calculate min/max for each metric to normalize colors
    const ranges = {};
    metrics.forEach(metric => {
      ranges[metric] = {
        min: 100,
        max: 0
      };
    });
    
    data.forEach(item => {
      metrics.forEach(metric => {
        if (item[metric] !== undefined && item[metric] !== null) {
          const value = typeof item[metric] === 'object' ? item[metric].score : item[metric];
          ranges[metric].min = Math.min(ranges[metric].min, value);
          ranges[metric].max = Math.max(ranges[metric].max, value);
        }
      });
    });
    
    metricRanges.current = ranges;
  }, [data, metrics]);
  
  // Set up auto-refresh
  useEffect(() => {
    if (autoRefresh && onRefresh) {
      refreshTimerRef.current = setInterval(() => {
        onRefresh();
        setLastUpdated(new Date());
      }, refreshInterval);
    }
    
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, onRefresh]);
  
  // Sort and filter data
  useEffect(() => {
    if (!data) return;
    
    let processedData = [...data];
    
    // Apply filters
    if (Object.keys(filters).length > 0) {
      processedData = processedData.filter(item => {
        return Object.entries(filters).every(([key, value]) => {
          if (!value || value === '') return true;
          
          if (key === 'filename') {
            return item.filename.toLowerCase().includes(value.toLowerCase());
          }
          
          if (key === 'file_type') {
            return item.file_type === value;
          }
          
          if (key === 'quality_score' && value.min !== undefined && value.max !== undefined) {
            const score = parseFloat(item.quality_score);
            return score >= value.min && score <= value.max;
          }
          
          return true;
        });
      });
    }
    
    // Apply sorting
    processedData.sort((a, b) => {
      let aValue = sortBy === 'quality_score' ? parseFloat(a[sortBy]) : a[sortBy];
      let bValue = sortBy === 'quality_score' ? parseFloat(b[sortBy]) : b[sortBy];
      
      // Handle custom metric objects
      if (typeof aValue === 'object' && aValue !== null) {
        aValue = aValue.score || 0;
      }
      
      if (typeof bValue === 'object' && bValue !== null) {
        bValue = bValue.score || 0;
      }
      
      // Handle undefined values
      if (aValue === undefined) aValue = sortDirection === 'asc' ? '' : '\uffff';
      if (bValue === undefined) bValue = sortDirection === 'asc' ? '' : '\uffff';
      
      // String comparison for text fields
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      // Numeric comparison
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });
    
    setHeatmapData(processedData);
  }, [data, sortBy, sortDirection, filters]);
  
  // Handle column header click for sorting
  const handleSortClick = (column) => {
    if (sortBy === column) {
      // Toggle direction if already sorting by this column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort column and default to ascending
      setSortBy(column);
      setSortDirection('asc');
    }
  };
  
  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Get color for a heatmap cell based on score
  const getHeatmapColor = (value, metric) => {
    if (value === undefined || value === null) return 'var(--color-neutral)';
    
    // Extract score from object if needed
    const score = typeof value === 'object' ? value.score : value;
    
    // If no score, return neutral color
    if (score === undefined || score === null) return 'var(--color-neutral)';
    
    // Calculate color based on thresholds
    if (score >= 90) return 'var(--color-excellent)';
    if (score >= 75) return 'var(--color-good)';
    if (score >= 60) return 'var(--color-fair)';
    if (score >= 40) return 'var(--color-poor)';
    return 'var(--color-critical)';
  };
  
  // Get text color for a cell (for contrast)
  const getTextColor = (bgColor) => {
    if (bgColor === 'var(--color-excellent)' || bgColor === 'var(--color-good)') return '#333';
    if (bgColor === 'var(--color-neutral)') return '#333';
    return '#fff';
  };
  
  // Format the cell content based on metric type
  const formatCellContent = (value, metric) => {
    if (value === undefined || value === null) return '—';
    
    if (typeof value === 'object') {
      return `${value.score.toFixed(0)}%`;
    }
    
    // Return formatted number
    if (typeof value === 'number') {
      if (metric === 'quality_score' || metrics.includes(metric)) {
        return `${value.toFixed(0)}%`;
      }
      return value.toString();
    }
    
    return value;
  };
  
  // Get tooltip for a cell
  const getCellTooltip = (item, metric) => {
    if (!item || !metric || !item[metric]) return null;
    
    const value = item[metric];
    
    if (typeof value === 'object') {
      return (
        <div className="heatmap-tooltip">
          <div className="tooltip-title">{formatMetricName(metric)}</div>
          <div className="tooltip-score">{value.score.toFixed(1)}%</div>
          {value.details && (
            <div className="tooltip-details">
              {Object.entries(value.details).map(([key, val]) => (
                <div key={key} className="tooltip-detail-item">
                  <span className="detail-key">{formatMetricName(key)}:</span>
                  <span className="detail-value">{typeof val === 'number' ? val.toFixed(1) : val}</span>
                </div>
              ))}
            </div>
          )}
          {value.issues && value.issues.length > 0 && (
            <div className="tooltip-issues">
              <div className="issues-title">Issues:</div>
              <ul className="issues-list">
                {value.issues.map((issue, i) => (
                  <li key={i} className="issue-item">{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    
    return null;
  };
  
  // Format metric name for display
  const formatMetricName = (name) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };
  
  // Render loading skeleton
  if (loading) {
    return (
      <div className={`data-quality-heatmap loading ${className}`} style={style}>
        <div className="heatmap-header">
          <h2 className="heatmap-title">Data Quality Heatmap</h2>
          <div className="heatmap-actions">
            <LoadingSkeleton type="rectangle" width="100px" height="32px" borderRadius="4px" inline />
            <LoadingSkeleton type="rectangle" width="100px" height="32px" borderRadius="4px" inline />
          </div>
        </div>
        
        <TableSkeleton rows={5} columns={metrics.length + 2} hasHeader={true} />
        
        <div className="heatmap-footer">
          <LoadingSkeleton type="text" width="200px" height="14px" inline />
        </div>
      </div>
    );
  }
  
  return (
    <div className={`data-quality-heatmap ${className}`} style={style}>
      <div className="heatmap-header">
        <h2 className="heatmap-title">
          Data Quality Heatmap
          <ContextualTooltip
            content="Real-time visualization of data quality metrics across all files. Colors indicate quality levels from critical (red) to excellent (green)."
            position="right"
            interactive={true}
          />
        </h2>
        
        <div className="heatmap-actions">
          <button 
            className={`filter-button ${filterVisible ? 'active' : ''}`}
            onClick={() => setFilterVisible(!filterVisible)}
          >
            <FiFilter /> Filter
          </button>
          
          {onRefresh && (
            <button className="refresh-button" onClick={onRefresh}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
                <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
              </svg>
              Refresh
            </button>
          )}
        </div>
      </div>
      
      {filterVisible && (
        <div className="filter-panel">
          <div className="filter-controls">
            <div className="filter-item">
              <label htmlFor="filenameFilter">Filename</label>
              <input 
                id="filenameFilter"
                type="text" 
                placeholder="Filter by name..."
                value={filters.filename || ''}
                onChange={(e) => handleFilterChange('filename', e.target.value)}
              />
            </div>
            
            <div className="filter-item">
              <label htmlFor="fileTypeFilter">File Type</label>
              <select
                id="fileTypeFilter"
                value={filters.file_type || ''}
                onChange={(e) => handleFilterChange('file_type', e.target.value)}
              >
                <option value="">All Types</option>
                {Array.from(new Set(data.map(item => item.file_type))).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            <div className="filter-item">
              <label htmlFor="qualityScoreMinFilter">Quality Score</label>
              <div className="filter-range">
                <input 
                  id="qualityScoreMinFilter"
                  type="number" 
                  min="0" 
                  max="100" 
                  placeholder="Min"
                  value={(filters.quality_score?.min !== undefined) ? filters.quality_score.min : ''}
                  onChange={(e) => handleFilterChange('quality_score', {
                    ...filters.quality_score || {}, 
                    min: e.target.value === '' ? undefined : parseInt(e.target.value)
                  })}
                />
                <span>to</span>
                <input 
                  id="qualityScoreMaxFilter"
                  type="number" 
                  min="0" 
                  max="100" 
                  placeholder="Max"
                  value={(filters.quality_score?.max !== undefined) ? filters.quality_score.max : ''}
                  onChange={(e) => handleFilterChange('quality_score', {
                    ...filters.quality_score || {}, 
                    max: e.target.value === '' ? undefined : parseInt(e.target.value)
                  })}
                />
              </div>
            </div>
            
            <button 
              className="reset-filters-button"
              onClick={() => setFilters({})}
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}
      
      <div className="heatmap-table-container">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th 
                className={sortBy === 'filename' ? `sorted ${sortDirection}` : ''}
                onClick={() => handleSortClick('filename')}
              >
                Filename
                {sortBy === 'filename' && (
                  <span className="sort-indicator">
                    {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
              
              <th 
                className={sortBy === 'file_type' ? `sorted ${sortDirection}` : ''}
                onClick={() => handleSortClick('file_type')}
              >
                Type
                {sortBy === 'file_type' && (
                  <span className="sort-indicator">
                    {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
              
              <th 
                className={sortBy === 'quality_score' ? `sorted ${sortDirection}` : ''}
                onClick={() => handleSortClick('quality_score')}
              >
                <div className="th-content">
                  Overall Quality
                  <MetricTooltip metric="quality_score" />
                  {sortBy === 'quality_score' && (
                    <span className="sort-indicator">
                      {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                    </span>
                  )}
                </div>
              </th>
              
              {metrics.map(metric => (
                <th 
                  key={metric}
                  className={sortBy === metric ? `sorted ${sortDirection}` : ''}
                  onClick={() => handleSortClick(metric)}
                >
                  <div className="th-content">
                    {formatMetricName(metric)}
                    <MetricTooltip metric={metric} />
                    {sortBy === metric && (
                      <span className="sort-indicator">
                        {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody>
            {heatmapData.length > 0 ? (
              heatmapData.map((item) => (
                <tr 
                  key={item.file_id || item.id}
                  onClick={() => onFileClick && onFileClick(item)}
                  className={onFileClick ? 'clickable' : ''}
                >
                  <td className="filename-cell">
                    <div className="filename-container">
                      {item.filename}
                      {item.updated_at && (
                        <ContextualTooltip
                          content={`Last Updated: ${new Date(item.updated_at).toLocaleString()}`}
                          position="right"
                        >
                          <span className="status-indicator" />
                        </ContextualTooltip>
                      )}
                    </div>
                  </td>
                  
                  <td className="filetype-cell">{item.file_type}</td>
                  
                  <td className="quality-score-cell">
                    <div 
                      className="quality-indicator"
                      style={{ 
                        backgroundColor: getHeatmapColor(item.quality_score, 'quality_score'),
                        color: getTextColor(getHeatmapColor(item.quality_score, 'quality_score'))
                      }}
                    >
                      {formatCellContent(item.quality_score, 'quality_score')}
                    </div>
                  </td>
                  
                  {metrics.map(metric => {
                    const cellColor = getHeatmapColor(item[metric], metric);
                    const tooltipContent = getCellTooltip(item, metric);
                    
                    return (
                      <td key={metric} className={`metric-cell ${metric}`}>
                        <div 
                          className="metric-value"
                          style={{ 
                            backgroundColor: cellColor,
                            color: getTextColor(cellColor)
                          }}
                        >
                          {tooltipContent ? (
                            <ContextualTooltip
                              content={tooltipContent}
                              position="top"
                              interactive={true}
                              maxWidth={350}
                            >
                              <div className="metric-value-content">
                                {formatCellContent(item[metric], metric)}
                              </div>
                            </ContextualTooltip>
                          ) : (
                            <div className="metric-value-content">
                              {formatCellContent(item[metric], metric)}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr className="no-data-row">
                <td colSpan={metrics.length + 3} className="no-data-cell">
                  <div className="no-data-message">
                    <FiInfo className="no-data-icon" />
                    <span>No data available{Object.keys(filters).length > 0 ? ' with current filters' : ''}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="heatmap-footer">
        <div className="color-legend">
          <div className="legend-title">Quality Level:</div>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: 'var(--color-critical)' }}></div>
              <span>Critical (&lt;40%)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: 'var(--color-poor)' }}></div>
              <span>Poor (40-59%)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: 'var(--color-fair)' }}></div>
              <span>Fair (60-74%)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: 'var(--color-good)' }}></div>
              <span>Good (75-89%)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: 'var(--color-excellent)' }}></div>
              <span>Excellent (90%+)</span>
            </div>
          </div>
        </div>
        
        <div className="heatmap-status">
          Showing {heatmapData.length} of {data.length} files
          {Object.keys(filters).length > 0 && ' (filtered)'}
          <span className="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
};
DataQualityHeatmap.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object),
  metrics: PropTypes.arrayOf(PropTypes.string),
  autoRefresh: PropTypes.bool,
  refreshInterval: PropTypes.number,
  loading: PropTypes.bool,
  onRefresh: PropTypes.func,
  onFileClick: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object
};
DataQualityHeatmap.defaultProps = {
  data: [],
  metrics: ['completeness', 'accuracy', 'consistency', 'timeliness'],
  autoRefresh: true,
  refreshInterval: 30000,
  loading: false,
  onRefresh: undefined,
  onFileClick: undefined,
  className: '',
  style: {}
};

export default DataQualityHeatmap;