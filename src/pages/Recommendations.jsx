import React, { useState, useEffect } from 'react';
import { FiBarChart, FiCheck, FiActivity, FiAward, FiAlertTriangle, FiClock } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import './Recommendations.css';

// This uses mock data - would be fetched from API in real app
const SAMPLE_RECOMMENDATIONS = [
  {
    id: 1,
    type: 'quality',
    title: 'Fix missing values in "customer_address"',
    description: 'Your customer_data.csv has 128 records with missing address fields.',
    benefit: 'Completing these records would improve data completeness score by 12%.',
    effort: 'medium',
    impact: 'high',
    actions: [
      'Use postal code lookup API to fill missing addresses',
      'Contact customers via email to confirm details',
      'Flag records with persistent missing data'
    ],
    status: 'pending',
    created_at: '2025-04-16T10:30:00Z'
  },
  {
    id: 2,
    type: 'format',
    title: 'Standardize date formats',
    description: 'Detected inconsistent date formats across 3 files: order_data.csv, shipping_data.csv, and returns.csv.',
    benefit: 'Standardizing would prevent analysis errors and improve data consistency score by 8%.',
    effort: 'low',
    impact: 'medium',
    actions: [
      'Convert all dates to ISO format (YYYY-MM-DD)',
      'Update data validation rules in collection systems',
      'Create verification script for future imports'
    ],
    status: 'pending',
    created_at: '2025-04-15T09:15:00Z'
  },
  {
    id: 3,
    type: 'structure',
    title: 'Add data dictionary documentation',
    description: 'Files in the "finance" category lack proper data dictionaries and column descriptions.',
    benefit: 'Improve data governance and make analysis more reliable for stakeholders.',
    effort: 'medium',
    impact: 'medium',
    actions: [
      'Create data dictionary template',
      'Document column definitions, units, and valid ranges',
      'Link data dictionaries to source systems'
    ],
    status: 'implemented',
    implemented_date: '2025-04-10T14:45:00Z',
    created_at: '2025-04-05T13:20:00Z'
  },
  {
    id: 4,
    type: 'validation',
    title: 'Add range checks for numeric fields',
    description: 'Identified outliers in "price" and "quantity" fields in inventory_data.csv.',
    benefit: 'Prevent outliers from affecting aggregate calculations and reporting.',
    effort: 'low',
    impact: 'high',
    actions: [
      'Establish valid min/max ranges for each numeric field',
      'Implement validation checks in the data pipeline',
      'Create alerts for values outside acceptable ranges'
    ],
    status: 'pending',
    created_at: '2025-04-12T16:40:00Z'
  },
  {
    id: 5,
    type: 'integration',
    title: 'Connect source data systems',
    description: 'Manual file uploads introduce delays and errors in data availability.',
    benefit: 'Automate data collection and reduce latency by 72 hours on average.',
    effort: 'high',
    impact: 'high',
    actions: [
      'Configure API connections to source systems',
      'Create scheduled data sync jobs',
      'Implement change detection for incremental updates'
    ],
    status: 'scheduled',
    scheduled_date: '2025-04-30T00:00:00Z',
    created_at: '2025-04-08T11:25:00Z'
  }
];

const Recommendations = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [filteredRecs, setFilteredRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('impact');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    // Mock API call - in a real app, this would fetch from the API
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        
        // Mock API delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Set the sample recommendations
        setRecommendations(SAMPLE_RECOMMENDATIONS);
      } catch (error) {
        console.error('Error fetching recommendations:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRecommendations();
  }, []);
  
  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...recommendations];
    
    // Type filter
    if (filter !== 'all') {
      filtered = filtered.filter(rec => rec.type === filter);
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(rec => rec.status === statusFilter);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.created_at) - new Date(a.created_at);
      } else if (sortBy === 'impact') {
        // Sort by impact (high, medium, low)
        const impactValue = { high: 3, medium: 2, low: 1 };
        return impactValue[b.impact] - impactValue[a.impact];
      } else if (sortBy === 'effort') {
        // Sort by effort (low, medium, high - inverted so low effort appears first)
        const effortValue = { low: 3, medium: 2, high: 1 };
        return effortValue[a.effort] - effortValue[b.effort];
      }
      return 0;
    });
    
    setFilteredRecs(filtered);
  }, [recommendations, filter, statusFilter, sortBy]);
  
  const toggleExpandRec = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };
  
  const markAsImplemented = (id) => {
    const updatedRecs = recommendations.map(rec => {
      if (rec.id === id) {
        return {
          ...rec,
          status: 'implemented',
          implemented_date: new Date().toISOString()
        };
      }
      return rec;
    });
    
    setRecommendations(updatedRecs);
  };
  
  const scheduleImplementation = (id, date) => {
    const updatedRecs = recommendations.map(rec => {
      if (rec.id === id) {
        return {
          ...rec,
          status: 'scheduled',
          scheduled_date: date
        };
      }
      return rec;
    });
    
    setRecommendations(updatedRecs);
  };
  
  const getRecommendationIcon = (type) => {
    switch (type) {
      case 'quality': return <FiBarChart className="rec-icon quality" />;
      case 'format': return <FiActivity className="rec-icon format" />;
      case 'structure': return <FiAward className="rec-icon structure" />;
      case 'validation': return <FiAlertTriangle className="rec-icon validation" />;
      case 'integration': return <FiClock className="rec-icon integration" />;
      default: return <FiBarChart className="rec-icon" />;
    }
  };
  
  const getStatusBadge = (status, scheduledDate) => {
    switch (status) {
      case 'implemented':
        return <span className="status-badge implemented"><FiCheck /> Implemented</span>;
      case 'scheduled':
        return (
          <span className="status-badge scheduled">
            <FiClock /> Scheduled for {new Date(scheduledDate).toLocaleDateString()}
          </span>
        );
      case 'pending':
        return <span className="status-badge pending">Pending</span>;
      default:
        return null;
    }
  };
  
  return (
    <div className="recommendations-container">
      <div className="page-header">
        <h1><FiBarChart className="page-header-icon" /> Smart Data Improvement Recommendations</h1>
        <p>Get intelligent recommendations to improve your data quality and reliability.</p>
      </div>
      
      <div className="recommendations-controls">
        <div className="filter-group">
          <label>Type:</label>
          <div className="button-filters">
            <button 
              className={filter === 'all' ? 'active' : ''} 
              onClick={() => setFilter('all')}
            >
              All Types
            </button>
            <button 
              className={filter === 'quality' ? 'active' : ''} 
              onClick={() => setFilter('quality')}
            >
              Quality
            </button>
            <button 
              className={filter === 'format' ? 'active' : ''} 
              onClick={() => setFilter('format')}
            >
              Format
            </button>
            <button 
              className={filter === 'structure' ? 'active' : ''} 
              onClick={() => setFilter('structure')}
            >
              Structure
            </button>
            <button 
              className={filter === 'validation' ? 'active' : ''} 
              onClick={() => setFilter('validation')}
            >
              Validation
            </button>
            <button 
              className={filter === 'integration' ? 'active' : ''} 
              onClick={() => setFilter('integration')}
            >
              Integration
            </button>
          </div>
        </div>
        
        <div className="filter-group">
          <label>Status:</label>
          <div className="button-filters">
            <button 
              className={statusFilter === 'all' ? 'active' : ''} 
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button 
              className={statusFilter === 'pending' ? 'active' : ''} 
              onClick={() => setStatusFilter('pending')}
            >
              Pending
            </button>
            <button 
              className={statusFilter === 'scheduled' ? 'active' : ''} 
              onClick={() => setStatusFilter('scheduled')}
            >
              Scheduled
            </button>
            <button 
              className={statusFilter === 'implemented' ? 'active' : ''} 
              onClick={() => setStatusFilter('implemented')}
            >
              Implemented
            </button>
          </div>
        </div>
        
        <div className="filter-group">
          <label>Sort by:</label>
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="impact">Impact (Highest first)</option>
            <option value="effort">Effort (Lowest first)</option>
            <option value="date">Date (Newest first)</option>
          </select>
        </div>
      </div>
      
      <div className="recommendations-list">
        {loading ? (
          <LoadingSpinner fullPage={true} />
        ) : filteredRecs.length === 0 ? (
          <div className="no-recommendations">
            <FiBarChart size={48} />
            <h3>No recommendations found</h3>
            <p>Try a different filter or check back later for new recommendations.</p>
          </div>
        ) : (
          filteredRecs.map(rec => (
            <div 
              key={rec.id} 
              className={`recommendation-card ${rec.status} ${expandedId === rec.id ? 'expanded' : ''}`}
              onClick={() => toggleExpandRec(rec.id)}
            >
              <div className="rec-header">
                {getRecommendationIcon(rec.type)}
                <div className="rec-title-area">
                  <h3 className="rec-title">{rec.title}</h3>
                  <div className="rec-meta">
                    <div className="rec-stats">
                      <span className={`rec-effort effort-${rec.effort}`}>
                        Effort: {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}
                      </span>
                      <span className={`rec-impact impact-${rec.impact}`}>
                        Impact: {rec.impact.charAt(0).toUpperCase() + rec.impact.slice(1)}
                      </span>
                    </div>
                    {getStatusBadge(rec.status, rec.scheduled_date)}
                  </div>
                </div>
              </div>
              
              <p className="rec-description">{rec.description}</p>
              
              {expandedId === rec.id && (
                <div className="rec-details">
                  <div className="rec-benefit">
                    <h4>Expected Benefit</h4>
                    <p>{rec.benefit}</p>
                  </div>
                  
                  <div className="rec-actions">
                    <h4>Recommended Actions</h4>
                    <ul>
                      {rec.actions.map((action, index) => (
                        <li key={index}>{action}</li>
                      ))}
                    </ul>
                  </div>
                  
                  {rec.status === 'pending' && (
                    <div className="rec-controls">
                      <button 
                        className="mark-implemented" 
                        onClick={(e) => {
                          e.stopPropagation(); 
                          markAsImplemented(rec.id);
                        }}
                      >
                        <FiCheck /> Mark as Implemented
                      </button>
                      
                      <div className="schedule-container">
                        <input 
                          type="date" 
                          className="schedule-date"
                          min={new Date().toISOString().split('T')[0]}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.value) {
                              scheduleImplementation(rec.id, new Date(e.target.value).toISOString());
                            }
                          }}
                        />
                        <button
                          className="schedule-button"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Schedule
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Recommendations;