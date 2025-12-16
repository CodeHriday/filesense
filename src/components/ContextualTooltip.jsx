import React, { useState, useRef, useEffect } from 'react';
import { FiInfo, FiX, FiArrowRight, FiExternalLink } from 'react-icons/fi';
import './ContextualTooltip.css';
import PropTypes from 'prop-types';

/**
 * Tooltip component for explaining complex metrics and data concepts
 */
const ContextualTooltip = ({ 
  children, 
  content, 
  title,
  examples,
  links,
  position = 'top',
  maxWidth = 300,
  interactive = false,
  className = '',
  theme = 'light'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const tooltipRef = useRef(null);
  const targetRef = useRef(null);
  
  // Handle click outside to close tooltip when in interactive mode
  useEffect(() => {
    if (!interactive) return;
    
    const handleClickOutside = (event) => {
      if (
        isPinned && 
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target) &&
        targetRef.current && 
        !targetRef.current.contains(event.target)
      ) {
        setIsPinned(false);
        setIsVisible(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [interactive, isPinned]);
  
  // Clean up tooltip when unmounting
  useEffect(() => {
    return () => {
      setIsVisible(false);
      setIsPinned(false);
    };
  }, []);
  
  const handleMouseEnter = () => {
    if (!isPinned) {
      setIsVisible(true);
    }
  };
  
  const handleMouseLeave = () => {
    if (!isPinned) {
      setIsVisible(false);
    }
  };
  
  const handleClick = () => {
    if (interactive) {
      setIsPinned(!isPinned);
      setIsVisible(!isPinned);
    }
  };
  
  const closeTooltip = (e) => {
    e.stopPropagation();
    setIsPinned(false);
    setIsVisible(false);
  };
  
  // Determine tooltip content
  const renderTooltipContent = () => {
    // If content is a React component or JSX
    if (React.isValidElement(content)) {
      return content;
    }
    
    return (
      <div className="tooltip-text">
        {title && <div className="tooltip-title">{title}</div>}
        <div className="tooltip-description">{content}</div>
        
        {examples && examples.length > 0 && (
          <div className="tooltip-examples">
            <div className="tooltip-section-title">Examples:</div>
            <ul>
              {examples.map((example, index) => (
                <li key={`example-${example.substring(0, 20)}-${index}`}>
                  <FiArrowRight className="tooltip-icon" />
                  <span>{example}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {links && links.length > 0 && (
          <div className="tooltip-links">
            {links.map((link, index) => (
              <a 
                key={`link-${link.url || link.text || index}`} 
                href={link.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="tooltip-link"
              >
                <FiExternalLink className="tooltip-icon" />
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div 
      className={`tooltip-container ${className}`}
      ref={targetRef}
    >
      <div 
        className={`tooltip-trigger ${interactive ? 'interactive' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        aria-describedby="tooltip"
      >
        {children || <FiInfo className="info-icon" />}
      </div>
      
      {(isVisible || isPinned) && (
        <div 
          className={`tooltip-content ${position} ${theme} ${isPinned ? 'pinned' : ''}`}
          ref={tooltipRef}
          style={{ maxWidth }}
          role="tooltip"
          id="tooltip"
        >
          {renderTooltipContent()}
          
          {interactive && (
            <button 
              className="tooltip-close"
              onClick={closeTooltip}
              aria-label="Close tooltip"
            >
              <FiX />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Metric explanation tooltips for explaining data metrics
 */
export const MetricTooltip = ({ 
  metric, 
  children, 
  position = 'top',
  theme = 'light'
}) => {
  // Library of common data metrics and their explanations
  const metricLibrary = {
    'quality_score': {
      title: 'Quality Score',
      content: 'An overall measure of data quality based on completeness, accuracy, consistency, and timeliness. Higher scores indicate better quality data.',
      examples: [
        '95%: Excellent quality with minor issues',
        '75%: Good quality with some problems to address',
        '<60%: Poor quality requiring significant attention'
      ]
    },
    'completeness': {
      title: 'Completeness',
      content: 'Measures the proportion of required data that is present. It evaluates whether all expected values are populated.',
      examples: [
        '100%: All required fields are populated',
        '90%: Most fields are populated with some gaps',
        '<70%: Significant missing data'
      ]
    },
    'consistency': {
      title: 'Consistency',
      content: 'Evaluates whether data follows expected patterns and relationships. Inconsistent data may contain contradictions or violations of business rules.',
      examples: [
        'Dates formatted differently across records',
        'Currency values using different symbols',
        'Related fields with conflicting information'
      ]
    },
    'accuracy': {
      title: 'Accuracy',
      content: 'Measures how correctly data represents the real-world entity or event it describes. Inaccurate data contains errors or incorrect values.',
      examples: [
        'Typos in names or addresses',
        'Numerical values outside expected ranges',
        'Incorrect categorical assignments'
      ]
    },
    'timeliness': {
      title: 'Timeliness',
      content: 'Evaluates whether data is up-to-date and available when needed. Stale data may not reflect current reality.',
      examples: [
        'Data updated within expected frequency',
        'Last update timestamp within acceptable range',
        'No processing or update delays'
      ]
    },
    'uniqueness': {
      title: 'Uniqueness',
      content: 'Measures whether each entity is represented only once in the dataset. Duplicate records indicate uniqueness issues.',
      examples: [
        'No duplicate customer records',
        'Unique transaction IDs',
        'No repeated measurements for the same event'
      ]
    },
    'validity': {
      title: 'Validity',
      content: 'Evaluates whether data conforms to the required format, type, and range. Invalid data doesn\'t meet the defined specifications.',
      examples: [
        'Email addresses with proper format',
        'Dates within allowed ranges',
        'Categorical values from predefined lists'
      ]
    },
    'freshness': {
      title: 'Freshness',
      content: 'Measures how recent the data is relative to when it was created or updated. Fresh data reflects the latest available information.',
      examples: [
        'Real-time data updated within seconds',
        'Daily data refreshed within 24 hours',
        'Monthly reports with data no older than the reporting period'
      ]
    },
    'anomaly_score': {
      title: 'Anomaly Score',
      content: 'Indicates how much a data point or pattern deviates from the expected normal behavior. Higher scores suggest greater likelihood of being an anomaly.',
      examples: [
        'Unusual spikes in transaction volume',
        'Values far outside the normal distribution',
        'Unexpected patterns in time series data'
      ]
    },
    'correlation': {
      title: 'Correlation',
      content: 'Measures the statistical relationship between two variables. Values range from -1 (perfect negative correlation) to +1 (perfect positive correlation), with 0 indicating no correlation.',
      examples: [
        '+0.9: Strong positive correlation (when A increases, B typically increases)',
        '-0.8: Strong negative correlation (when A increases, B typically decreases)',
        '0.1: Very weak correlation (minimal relationship)'
      ]
    },
    'null_rate': {
      title: 'Null Rate',
      content: 'The percentage of values in a column that are null or missing. High null rates may indicate data collection or integration issues.',
      examples: [
        '0%: No missing values',
        '5%: Few missing values, typically acceptable',
        '>20%: High missing rate, may limit usefulness'
      ]
    },
    'drift_score': {
      title: 'Data Drift Score',
      content: 'Measures how much data distribution has changed over time. Higher scores indicate significant shifts that may affect analysis or model performance.',
      examples: [
        'New customer demographics different from historical patterns',
        'Seasonal changes in transaction behavior',
        'Shifts in sensor readings due to recalibration'
      ]
    }
  };
  
  // Get metric info or use defaults
  const metricInfo = metricLibrary[metric] || {
    title: metric ? metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Metric',
    content: 'Information about this metric is not available.',
    examples: []
  };
  
  return (
    <ContextualTooltip
      title={metricInfo.title}
      content={metricInfo.content}
      examples={metricInfo.examples}
      position={position}
      theme={theme}
      interactive={true}
    >
      {children}
    </ContextualTooltip>
  );
};

// PropTypes for ContextualTooltip
ContextualTooltip.propTypes = {
  children: PropTypes.node,
  content: PropTypes.oneOfType([PropTypes.node, PropTypes.string]),
  title: PropTypes.string,
  examples: PropTypes.arrayOf(PropTypes.string),
  links: PropTypes.arrayOf(PropTypes.shape({ url: PropTypes.string.isRequired, label: PropTypes.string })),
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
  maxWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  interactive: PropTypes.bool,
  className: PropTypes.string,
  theme: PropTypes.oneOf(['light', 'dark'])
};

ContextualTooltip.defaultProps = {
  children: null,
  content: '',
  title: '',
  examples: null,
  links: null,
  position: 'top',
  maxWidth: 300,
  interactive: false,
  className: '',
  theme: 'light'
};

// PropTypes for MetricTooltip
MetricTooltip.propTypes = {
  metric: PropTypes.string.isRequired,
  children: PropTypes.node,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
  theme: PropTypes.oneOf(['light', 'dark'])
};

MetricTooltip.defaultProps = {
  children: null,
  position: 'top',
  theme: 'light'
};

export default ContextualTooltip;