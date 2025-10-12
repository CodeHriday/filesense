import React, { useState, useEffect } from 'react';
import { FiMessageSquare, FiFileText, FiBell, FiBarChart2, FiBox } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import './DataInsights.css';

// This is a placeholder until we integrate with OpenAI for real insights
const SAMPLE_INSIGHTS = [
  {
    id: 1,
    type: 'anomaly',
    title: 'Unusual spike in missing values',
    description: 'Detected an unusual spike in missing values in the "customer_id" column of sales_data.csv.',
    suggestion: 'Investigate the data collection process for February 15-18 to identify possible system issues.',
    severity: 'high',
    created_at: '2025-04-17T10:30:00Z'
  },
  {
    id: 2,
    type: 'pattern',
    title: 'Seasonal pattern detected',
    description: 'Identified a recurring seasonal pattern in your transaction_data.csv file.',
    suggestion: 'Consider adding season as a feature in your analysis models to improve accuracy.',
    severity: 'medium',
    created_at: '2025-04-16T14:22:00Z'
  },
  {
    id: 3,
    type: 'correlation',
    title: 'Strong correlation found',
    description: 'Discovered strong correlation between "marketing_spend" and "new_customers" in marketing_data.csv.',
    suggestion: 'This correlation suggests marketing activities are effective at customer acquisition.',
    severity: 'low',
    created_at: '2025-04-15T09:15:00Z'
  },
  {
    id: 4,
    type: 'quality',
    title: 'Potential duplicate records',
    description: 'Identified potential duplicate records in customer_data.csv based on email and phone fields.',
    suggestion: 'Run de-duplication process and verify merged records for accuracy.',
    severity: 'medium',
    created_at: '2025-04-14T16:45:00Z'
  }
];

const DataInsights = () => {
  const [insights, setInsights] = useState([]);
  const [filteredInsights, setFilteredInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInProgress, setMessageInProgress] = useState(false);
  const [userQuery, setUserQuery] = useState('');

  useEffect(() => {
    // Mock API call - in a real app, this would fetch from the API
    const fetchInsights = async () => {
      try {
        setLoading(true);
        
        // Mock API delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Set the sample insights
        setInsights(SAMPLE_INSIGHTS);
      } catch (error) {
        console.error('Error fetching insights:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInsights();
  }, []);
  
  // Filter insights based on selected type and search query
  useEffect(() => {
    let filtered = [...insights];
    
    // Apply type filter
    if (filter !== 'all') {
      filtered = filtered.filter(insight => insight.type === filter);
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(insight => 
        insight.title.toLowerCase().includes(query) || 
        insight.description.toLowerCase().includes(query)
      );
    }
    
    setFilteredInsights(filtered);
  }, [insights, filter, searchQuery]);
  
  // Process user query with AI
  const processQuery = async (e) => {
    e.preventDefault();
    
    if (!userQuery.trim()) return;
    
    try {
      setMessageInProgress(true);
      
      // Mock AI processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock a new insight generated from the query
      const newInsight = {
        id: insights.length + 1,
        type: 'custom',
        title: `Analysis of "${userQuery.substring(0, 30)}${userQuery.length > 30 ? '...' : ''}"`,
        description: `This is a customized analysis based on your query: "${userQuery}"`,
        suggestion: 'Based on this analysis, consider reviewing your data collection methods and validation rules.',
        severity: 'medium',
        created_at: new Date().toISOString()
      };
      
      setInsights(prev => [newInsight, ...prev]);
      setUserQuery('');
    } catch (error) {
      console.error('Error processing query:', error);
    } finally {
      setMessageInProgress(false);
    }
  };
  
  const getInsightIcon = (type) => {
    switch (type) {
      case 'anomaly': return <FiBell className="insight-icon anomaly" />;
      case 'pattern': return <FiBarChart2 className="insight-icon pattern" />;
      case 'correlation': return <FiBox className="insight-icon correlation" />;
      case 'quality': return <FiFileText className="insight-icon quality" />;
      case 'custom': return <FiMessageSquare className="insight-icon custom" />;
      default: return <FiMessageSquare className="insight-icon" />;
    }
  };
  
  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'high': return 'severity-high';
      case 'medium': return 'severity-medium';
      case 'low': return 'severity-low';
      default: return '';
    }
  };
  
  return (
    <div className="data-insights-container">
      <div className="page-header">
        <h1><FiMessageSquare className="page-header-icon" /> AI-Powered Data Insights</h1>
        <p>Get personalized insights about your data files and quality trends.</p>
      </div>
      
      <div className="chatbot-container">
        <div className="message-form-container">
          <form onSubmit={processQuery} className="message-form">
            <input
              type="text"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Ask anything about your data... (e.g., 'What patterns exist in my sales data?')"
              disabled={messageInProgress}
              className="message-input"
            />
            <button 
              type="submit" 
              disabled={messageInProgress || !userQuery.trim()}
              className="message-submit"
            >
              {messageInProgress ? 'Processing...' : 'Ask'}
            </button>
          </form>
        </div>
        
        <div className="insights-controls">
          <div className="insights-filters">
            <button 
              className={filter === 'all' ? 'active' : ''} 
              onClick={() => setFilter('all')}
            >
              All Insights
            </button>
            <button 
              className={filter === 'anomaly' ? 'active' : ''} 
              onClick={() => setFilter('anomaly')}
            >
              Anomalies
            </button>
            <button 
              className={filter === 'pattern' ? 'active' : ''} 
              onClick={() => setFilter('pattern')}
            >
              Patterns
            </button>
            <button 
              className={filter === 'correlation' ? 'active' : ''} 
              onClick={() => setFilter('correlation')}
            >
              Correlations
            </button>
            <button 
              className={filter === 'quality' ? 'active' : ''} 
              onClick={() => setFilter('quality')}
            >
              Quality Issues
            </button>
            <button 
              className={filter === 'custom' ? 'active' : ''} 
              onClick={() => setFilter('custom')}
            >
              Custom Analysis
            </button>
          </div>
          
          <div className="insights-search">
            <input
              type="text"
              placeholder="Search insights..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        
        <div className="insights-list">
          {loading ? (
            <LoadingSpinner fullPage={true} />
          ) : filteredInsights.length === 0 ? (
            <div className="no-insights">
              <FiMessageSquare size={48} />
              <h3>No insights found</h3>
              <p>Try a different filter or search term, or ask a question to generate new insights.</p>
            </div>
          ) : (
            filteredInsights.map(insight => (
              <div 
                key={insight.id} 
                className={`insight-card ${getSeverityClass(insight.severity)}`}
              >
                <div className="insight-header">
                  {getInsightIcon(insight.type)}
                  <h3>{insight.title}</h3>
                </div>
                <p className="insight-description">{insight.description}</p>
                <div className="insight-suggestion">
                  <strong>Suggestion:</strong> {insight.suggestion}
                </div>
                <div className="insight-meta">
                  <span className="insight-date">
                    {new Date(insight.created_at).toLocaleDateString()} • {new Date(insight.created_at).toLocaleTimeString()}
                  </span>
                  {insight.severity && (
                    <span className={`insight-severity ${getSeverityClass(insight.severity)}`}>
                      {insight.severity.charAt(0).toUpperCase() + insight.severity.slice(1)} Priority
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DataInsights;