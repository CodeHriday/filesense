import React from 'react';
import { FiAward, FiStar, FiCheckCircle, FiTrendingUp, FiShield, FiClock } from 'react-icons/fi';
import './AchievementBadge.css';
import PropTypes from 'prop-types';

const BADGE_ICONS = {
  quality: FiAward,
  completeness: FiCheckCircle,
  consistency: FiShield,
  freshness: FiClock,
  improvement: FiTrendingUp,
  excellence: FiStar
};

const BADGE_LEVELS = {
  bronze: {
    color: '#CD7F32',
    label: 'Bronze'
  },
  silver: {
    color: '#C0C0C0',
    label: 'Silver'
  },
  gold: {
    color: '#FFD700',
    label: 'Gold'
  },
  platinum: {
    color: '#E5E4E2',
    label: 'Platinum'
  }
};

const AchievementBadge = ({ type, level, score, label, description, isLocked = false, onClick }) => {
  const IconComponent = BADGE_ICONS[type] || FiAward;
  const levelDetails = BADGE_LEVELS[level] || BADGE_LEVELS.bronze;
  
  return (
    <div 
      className={`achievement-badge ${isLocked ? 'locked' : 'unlocked'}`}
      onClick={onClick}
    >
      <div className="badge-icon-container" style={{ backgroundColor: isLocked ? '#ccc' : levelDetails.color }}>
        <IconComponent className="badge-icon" />
        {!isLocked && score && <span className="badge-score">{score}</span>}
      </div>
      <div className="badge-content">
        <div className="badge-header">
          <h3 className="badge-title">{label}</h3>
          {!isLocked && <span className="badge-level">{levelDetails.label}</span>}
        </div>
        <p className="badge-description">
          {isLocked ? 'Keep improving to unlock this badge' : description}
        </p>
      </div>
    </div>
  );
};
AchievementBadge.propTypes = {
  type: PropTypes.oneOf([
    'quality',
    'completeness',
    'consistency',
    'freshness',
    'improvement',
    'excellence'
  ]).isRequired,

  level: PropTypes.oneOf([
    'bronze',
    'silver',
    'gold',
    'platinum'
  ]).isRequired,

  score: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]),

  label: PropTypes.string.isRequired,

  description: PropTypes.string.isRequired,

  isLocked: PropTypes.bool,

  onClick: PropTypes.func
};
export default AchievementBadge;