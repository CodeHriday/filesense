import React from 'react';
import './LoadingSkeleton.css';
import PropTypes from 'prop-types';

/**
 * Generic skeleton loading component for various UI elements
 */
const LoadingSkeleton = ({ 
  type = 'rectangle', 
  width, 
  height, 
  borderRadius,
  count = 1,
  className = '',
  animated = true,
  inline = false,
  style = {}
}) => {
  const generateSkeletons = () => {
    const skeletons = [];
    
    for (let i = 0; i < count; i++) {
      const skeletonStyle = {
        width: width || 'auto',
        height: height || 'auto',
        borderRadius: borderRadius || undefined,
        ...style
      };
      
      skeletons.push(
        <div 
          key={`skeleton-${i}`}
          className={`skeleton ${type} ${animated ? 'animated' : ''} ${className}`}
          style={skeletonStyle}
        />
      );
    }
    
    return skeletons;
  };
  
  if (inline) {
    return generateSkeletons();
  }
  
  return (
    <div className="skeleton-wrapper">
      {generateSkeletons()}
    </div>
  );
};
LoadingSkeleton.propTypes = {
  type: PropTypes.oneOf([
    'rectangle',
    'text',
    'circle',
    'line',
    'bar',
    'pie'
  ]),
  width: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  height: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  borderRadius: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  count: PropTypes.number,
  className: PropTypes.string,
  animated: PropTypes.bool,
  inline: PropTypes.bool,
  style: PropTypes.object
};

/**
 * Text skeleton for paragraph and text content
 */
export const TextSkeleton = ({ 
  lines = 3, 
  lastLineWidth = 70, 
  className = '',
  style = {}
}) => {
  const generateLines = () => {
    const skeletons = [];
    
    for (let i = 0; i < lines; i++) {
      const isLastLine = i === lines - 1;
      const width = isLastLine ? `${lastLineWidth}%` : '100%';
      
      skeletons.push(
        <LoadingSkeleton
          key={`text-line-${i}`}
          type="text"
          width={width}
          height="12px"
          className={className}
          style={{
            marginBottom: '8px',
            ...style
          }}
          inline
        />
      );
    }
    
    return skeletons;
  };
  
  return (
    <div className="skeleton-text">
      {generateLines()}
    </div>
  );
};
TextSkeleton.propTypes = {
  lines: PropTypes.number,
  lastLineWidth: PropTypes.number,
  className: PropTypes.string,
  style: PropTypes.object
};

/**
 * Card skeleton for dashboard cards and widgets
 */
export const CardSkeleton = ({ 
  hasHeader = true,
  hasFooter = false,
  contentHeight = 200,
  className = '',
  style = {}
}) => {
  return (
    <div className={`skeleton-card ${className}`} style={style}>
      {hasHeader && (
        <div className="skeleton-card-header">
          <LoadingSkeleton
            type="circle"
            width="32px"
            height="32px"
            inline
          />
          <div className="skeleton-card-title">
            <LoadingSkeleton
              type="text"
              width="140px"
              height="14px"
              inline
            />
            <LoadingSkeleton
              type="text"
              width="100px"
              height="10px"
              inline
            />
          </div>
        </div>
      )}
      
      <div className="skeleton-card-content" style={{ height: contentHeight }}>
        <LoadingSkeleton
          type="rectangle"
          width="100%"
          height="100%"
          inline
        />
      </div>
      
      {hasFooter && (
        <div className="skeleton-card-footer">
          <LoadingSkeleton
            type="text"
            width="100px"
            height="12px"
            inline
          />
          <LoadingSkeleton
            type="rectangle"
            width="80px"
            height="30px"
            borderRadius="4px"
            inline
          />
        </div>
      )}
    </div>
  );
};
CardSkeleton.propTypes = {
  hasHeader: PropTypes.bool,
  hasFooter: PropTypes.bool,
  contentHeight: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  className: PropTypes.string,
  style: PropTypes.object
};

/**
 * Chart skeleton for visualization elements
 */
export const ChartSkeleton = ({
  type = 'bar',
  className = '',
  height = 200,
  width = '100%',
  style = {}
}) => {
  const renderChartElements = () => {
    if (type === 'bar') {
      return (
        <div className="skeleton-chart-bars">
          {[...Array(6)].map((_, i) => (
            <div className="skeleton-chart-bar" key={`bar-${i}`}>
              <LoadingSkeleton
                type="rectangle"
                width="40px"
                height={`${Math.floor(Math.random() * 50) + 30}%`}
                borderRadius="4px 4px 0 0"
                inline
              />
            </div>
          ))}
        </div>
      );
    }
    
    if (type === 'line') {
      return (
        <div className="skeleton-chart-line">
          <svg width="100%" height="100%" viewBox="0 0 100 50">
            <path 
              d="M0,25 Q20,40 40,20 T80,30" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className="skeleton-chart-path"
            />
          </svg>
        </div>
      );
    }
    
    if (type === 'pie') {
      return (
        <div className="skeleton-chart-pie">
          <LoadingSkeleton
            type="circle"
            width="120px"
            height="120px"
            inline
          />
          <div className="skeleton-chart-legend">
            {[...Array(4)].map((_, i) => (
              <div className="skeleton-legend-item" key={`legend-${i}`}>
                <LoadingSkeleton
                  type="rectangle"
                  width="16px"
                  height="16px"
                  inline
                />
                <LoadingSkeleton
                  type="text"
                  width="60px"
                  height="10px"
                  inline
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    return (
      <LoadingSkeleton
        type="rectangle"
        width="100%"
        height="100%"
        inline
      />
    );
  };
  
  return (
    <div 
      className={`skeleton-chart ${type} ${className}`}
      style={{ height, width, ...style }}
    >
      {renderChartElements()}
    </div>
  );
};
ChartSkeleton.propTypes = {
  type: PropTypes.oneOf(['bar', 'line', 'pie']),
  className: PropTypes.string,
  height: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  width: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  style: PropTypes.object
};

/**
 * Dashboard insight skeleton for the data insights section
 */
export const InsightSkeleton = ({ count = 3 }) => {
  return (
    <div className="skeleton-insights">
      {[...Array(count)].map((_, i) => (
        <div className="skeleton-insight" key={`insight-${i}`}>
          <div className="skeleton-insight-header">
            <LoadingSkeleton
              type="circle"
              width="36px"
              height="36px"
              inline
            />
            <div className="skeleton-insight-title">
              <LoadingSkeleton
                type="text"
                width="180px"
                height="16px"
                inline
              />
              <LoadingSkeleton
                type="text"
                width="120px"
                height="12px"
                inline
              />
            </div>
          </div>
          <div className="skeleton-insight-content">
            <TextSkeleton lines={2} lastLineWidth={50} />
            <div className="skeleton-insight-metrics">
              <LoadingSkeleton
                type="rectangle"
                width="45%"
                height="60px"
                borderRadius="6px"
                inline
              />
              <LoadingSkeleton
                type="rectangle"
                width="45%"
                height="60px"
                borderRadius="6px"
                inline
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
InsightSkeleton.propTypes = {
  count: PropTypes.number
};

/**
 * Table skeleton for data grids and tables
 */
export const TableSkeleton = ({
  rows = 5,
  columns = 4,
  hasHeader = true,
  className = '',
  style = {}
}) => {
  return (
    <div className={`skeleton-table ${className}`} style={style}>
      {hasHeader && (
        <div className="skeleton-table-header">
          {[...Array(columns)].map((_, i) => (
            <div className="skeleton-table-cell" key={`header-${i}`}>
              <LoadingSkeleton
                type="text"
                width="80%"
                height="16px"
                inline
              />
            </div>
          ))}
        </div>
      )}
      
      <div className="skeleton-table-body">
        {[...Array(rows)].map((_, rowIndex) => (
          <div className="skeleton-table-row" key={`row-${rowIndex}`}>
            {[...Array(columns)].map((_, colIndex) => (
              <div className="skeleton-table-cell" key={`cell-${rowIndex}-${colIndex}`}>
                <LoadingSkeleton
                  type="text"
                  width={`${Math.floor(Math.random() * 50) + 30}%`}
                  height="12px"
                  inline
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
TableSkeleton.propTypes = {
  rows: PropTypes.number,
  columns: PropTypes.number,
  hasHeader: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object
};

/**
 * Dashboard skeleton for the main dashboard
 */
export const DashboardSkeleton = () => {
  return (
    <div className="skeleton-dashboard">
      <div className="skeleton-dashboard-header">
        <LoadingSkeleton
          type="text"
          width="200px"
          height="24px"
          inline
        />
        <div className="skeleton-actions">
          <LoadingSkeleton
            type="rectangle"
            width="100px"
            height="36px"
            borderRadius="4px"
            inline
          />
          <LoadingSkeleton
            type="rectangle"
            width="100px"
            height="36px"
            borderRadius="4px"
            inline
          />
        </div>
      </div>
      
      <div className="skeleton-dashboard-grid">
        <CardSkeleton contentHeight={180} />
        <CardSkeleton contentHeight={180} />
        <CardSkeleton hasHeader={true} hasFooter={true} contentHeight={280} />
        <CardSkeleton contentHeight={280} />
      </div>
    </div>
  );
};
DashboardSkeleton.propTypes = {};

export default LoadingSkeleton;