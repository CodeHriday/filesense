import React from 'react';
import './StatCard.css';
import PropTypes from 'prop-types';
StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.node
  ]).isRequired,
  icon: PropTypes.node,
  trend: PropTypes.shape({
    type: PropTypes.oneOf(['up', 'down']).isRequired,
    value: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number
    ]).isRequired
  }),
  color: PropTypes.oneOf(['primary', 'success', 'warning', 'danger'])
};

export const StatCard = ({ title, value, icon, trend, color = 'primary' }) => {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-info">
        <h3 className="stat-title">{title}</h3>
        <div className="stat-value">{value}</div>
        {trend && (
          <div className={`stat-trend ${trend.type}`}>
            <span className="trend-icon">{trend.type === 'up' ? '↑' : '↓'}</span>
            <span className="trend-value">{trend.value}</span>
          </div>
        )}
      </div>
    </div>
  );
};