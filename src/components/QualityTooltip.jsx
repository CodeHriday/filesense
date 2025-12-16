import React from 'react';
import { Tooltip } from './Tooltip';
import PropTypes from 'prop-types';

/**
 * Quality-specific tooltip that displays quality score breakdowns
 * 
 * @param {Object} props Component props
 * @param {React.ReactNode} props.children The element that triggers the tooltip
 * @param {number} props.score The overall quality score
 * @param {Object} props.components The quality component scores (completeness, etc.)
 * @param {string} props.position The position of the tooltip (top, bottom, left, right)
 * @param {boolean} props.animated Whether the tooltip should have an animated entrance
 */
export const QualityTooltip = ({ 
  children, 
  score,
  components = {},
  position = 'top',
  animated = true,
  delay = 200
}) => {
  // Helper function to determine quality class based on score
  const getQualityClass = (score) => {
    if (score >= 80) return 'quality-high';
    if (score >= 60) return 'quality-medium';
    return 'quality-low';
  };

  // Format the score to 1 decimal place
  const formatScore = (score) => {
    return typeof score === 'number' ? score.toFixed(1) : score;
  };

  // Create tooltip content
  const tooltipContent = (
    <div className="quality-tooltip-content">
      <div className="quality-tooltip-title">
        Quality Score: <span className={getQualityClass(score)}>{formatScore(score)}%</span>
      </div>
      {Object.keys(components).length > 0 && (
        <div className="quality-components">
          {Object.entries(components).map(([name, value]) => (
            <div key={name} className="quality-component">
              <span className="quality-component-label">
                {name.charAt(0).toUpperCase() + name.slice(1)}:
              </span>
              <span className={`quality-component-score ${getQualityClass(value)}`}>
                {formatScore(value)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip 
      content={tooltipContent}
      position={position}
      type="default"
      animated={animated}
      delay={delay}
    >
      {children}
    </Tooltip>
  );
};


QualityTooltip.propTypes = {
  /** Element that triggers the tooltip */
  children: PropTypes.node.isRequired,

  /** Overall quality score (0–100) */
  score: PropTypes.number.isRequired,

  /** Breakdown of quality components */
  components: PropTypes.objectOf(PropTypes.number),

  /** Tooltip position */
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),

  /** Enable animated tooltip */
  animated: PropTypes.bool,

  /** Delay before tooltip appears (ms) */
  delay: PropTypes.number
};

QualityTooltip.defaultProps = {
  components: {},
  position: 'top',
  animated: true,
  delay: 200
};

