import React, { useState, useEffect, useCallback } from 'react';
import { FiAward, FiLock, FiInfo, FiRefreshCw } from 'react-icons/fi';
import { getUserBadges, getBadgeDefinitions, BADGE_DEFINITIONS } from '../api/badgeService';
import AchievementBadge from '../components/AchievementBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import './Badges.css';

const Badges = () => {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedBadge, setSelectedBadge] = useState(null);

  const fetchBadges = useCallback(async () => {
    try {
      setLoading(true);
      // Get user's earned badges
      const userBadges = await getUserBadges();
      
      // Get all possible badge definitions
      const allBadgeDefinitions = getBadgeDefinitions();
      
      // Map earned badges
      const earnedBadges = userBadges.map(badge => ({
        ...badge,
        ...BADGE_DEFINITIONS[badge.badgeId],
        isLocked: false
      }));
      
      // Map locked badges (badges not yet earned)
      const earnedBadgeIds = new Set(userBadges.map(b => b.badgeId));
      const lockedBadges = allBadgeDefinitions
        .filter(def => !earnedBadgeIds.has(def.type + '-' + def.level))
        .map(def => ({
          ...def,
          badgeId: def.type + '-' + def.level,
          isLocked: true,
          score: null
        }));
      
      // Combine earned and locked badges
      setBadges([...earnedBadges, ...lockedBadges]);
    } catch (error) {
      console.error('Error fetching badges:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  // Filter badges by type
  const filteredBadges = badges.filter(badge => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'earned') return !badge.isLocked;
    if (activeFilter === 'locked') return badge.isLocked;
    return badge.type === activeFilter;
  });

  // Group badges by type for display
  const groupedBadges = filteredBadges.reduce((acc, badge) => {
    if (!acc[badge.type]) {
      acc[badge.type] = [];
    }
    acc[badge.type].push(badge);
    return acc;
  }, {});

  // Get badge group title
  const getBadgeGroupTitle = (type) => {
    switch (type) {
      case 'quality': return 'Quality Achievement';
      case 'completeness': return 'Completeness Achievement';
      case 'consistency': return 'Consistency Achievement';
      case 'freshness': return 'Data Freshness';
      case 'improvement': return 'Continuous Improvement';
      case 'excellence': return 'Data Excellence';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <div className="badges-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1><FiAward className="page-header-icon" /> Achievement Badges</h1>
          <button 
            className="gps-btn gps-btn-secondary" 
            onClick={fetchBadges} 
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FiRefreshCw className={loading ? 'spinning' : ''} /> Refresh
          </button>
        </div>
        <p>Track your data quality achievements and unlock special badges.</p>
      </div>
      
      <div className="badge-filters">
        <button 
          className={activeFilter === 'all' ? 'active' : ''} 
          onClick={() => setActiveFilter('all')}
        >
          All Badges
        </button>
        <button 
          className={activeFilter === 'earned' ? 'active' : ''} 
          onClick={() => setActiveFilter('earned')}
        >
          Earned Badges
        </button>
        <button 
          className={activeFilter === 'locked' ? 'active' : ''} 
          onClick={() => setActiveFilter('locked')}
        >
          Locked Badges
        </button>
        <button 
          className={activeFilter === 'quality' ? 'active' : ''} 
          onClick={() => setActiveFilter('quality')}
        >
          Quality
        </button>
        <button 
          className={activeFilter === 'completeness' ? 'active' : ''} 
          onClick={() => setActiveFilter('completeness')}
        >
          Completeness
        </button>
        <button 
          className={activeFilter === 'consistency' ? 'active' : ''} 
          onClick={() => setActiveFilter('consistency')}
        >
          Consistency
        </button>
      </div>
      
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {Object.keys(groupedBadges).length === 0 ? (
            <div className="no-badges">
              <FiLock size={48} />
              <h3>No badges match your filter</h3>
              <p>Try a different filter or keep improving your data quality to earn badges.</p>
            </div>
          ) : (
            Object.entries(groupedBadges).map(([type, badgeList]) => (
              <div key={type} className="badge-group">
                <h2 className="badge-group-title">{getBadgeGroupTitle(type)}</h2>
                <div className="badge-grid">
                  {badgeList.map((badge) => (
                    <AchievementBadge
                      key={badge.badgeId}
                      type={badge.type}
                      level={badge.level}
                      score={badge.score}
                      label={badge.label}
                      description={badge.description}
                      isLocked={badge.isLocked}
                      onClick={() => setSelectedBadge(badge)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
      
      {/* Badge Detail Modal */}
      {selectedBadge && (
        <div className="badge-detail-modal">
          <div className="badge-detail-content">
            <button className="close-modal" onClick={() => setSelectedBadge(null)}>×</button>
            <div className="badge-detail-header">
              <AchievementBadge
                type={selectedBadge.type}
                level={selectedBadge.level}
                score={selectedBadge.score}
                label={selectedBadge.label}
                description={selectedBadge.description}
                isLocked={selectedBadge.isLocked}
              />
            </div>
            
            <div className="badge-detail-info">
              <h3>How to earn this badge</h3>
              <p>
                {selectedBadge.isLocked ? (
                  <span>
                    {selectedBadge.description}. This badge requires a threshold of {selectedBadge.threshold}
                    {selectedBadge.type === 'freshness' ? ' days or less' : '%'}.
                  </span>
                ) : (
                  <span>
                    You earned this badge on {new Date(selectedBadge.earnedDate).toLocaleDateString()} 
                    with a score of {selectedBadge.score}
                    {selectedBadge.type === 'freshness' ? ' days' : '%'}.
                  </span>
                )}
              </p>
              
              {selectedBadge.isLocked && (
                <div className="badge-tips">
                  <h4><FiInfo /> Tips to earn this badge</h4>
                  <ul>
                    {selectedBadge.type === 'quality' && (
                      <>
                        <li>Run comprehensive quality checks on your data files</li>
                        <li>Fix identified quality issues and rerun analysis</li>
                        <li>Ensure your data meets validation rules</li>
                      </>
                    )}
                    {selectedBadge.type === 'completeness' && (
                      <>
                        <li>Fill in missing values in your datasets</li>
                        <li>Ensure required fields have data</li>
                        <li>Use data imputation techniques for gaps</li>
                      </>
                    )}
                    {selectedBadge.type === 'consistency' && (
                      <>
                        <li>Standardize formats across your data</li>
                        <li>Resolve contradicting values</li>
                        <li>Normalize data formats</li>
                      </>
                    )}
                    {selectedBadge.type === 'freshness' && (
                      <>
                        <li>Update your data more frequently</li>
                        <li>Set up automated refresh schedules</li>
                        <li>Monitor data sources for changes</li>
                      </>
                    )}
                    {selectedBadge.type === 'improvement' && (
                      <>
                        <li>Track quality score changes over time</li>
                        <li>Implement suggested improvements</li>
                        <li>Continuously refine your data</li>
                      </>
                    )}
                    {selectedBadge.type === 'excellence' && (
                      <>
                        <li>Achieve gold level in all other badge categories</li>
                        <li>Maintain consistent quality across all dimensions</li>
                        <li>Implement advanced data governance</li>
                      </>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Badges;