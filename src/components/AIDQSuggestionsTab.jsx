import React, { useState, useEffect } from 'react';
import { FiZap, FiAlertTriangle, FiCheckCircle, FiPlus, FiRefreshCw, FiToggleLeft, FiToggleRight, FiInfo, FiCheck, FiX } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import './AIDQSuggestionsTab.css';

const PROFILE_API_BASE = 'http://0.0.0.0:8000';

const AIDQSuggestionsTab = ({ fileId, filename, columns, projectId }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [featureEnabled, setFeatureEnabled] = useState(null);
  const [featureLoading, setFeatureLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());
  const [creatingRules, setCreatingRules] = useState({});
  const [createdRules, setCreatedRules] = useState(new Set());
  const [toggleUpdating, setToggleUpdating] = useState(false);

  useEffect(() => {
    checkFeatureStatus();
  }, []);

  const checkFeatureStatus = async () => {
    try {
      setFeatureLoading(true);
      const response = await fetch(`${PROFILE_API_BASE}/api/settings/ai_dq_suggestions_enabled`);
      if (response.ok) {
        const data = await response.json();
        setFeatureEnabled(data.value === 'true');
      } else {
        setFeatureEnabled(false);
      }
    } catch (err) {
      console.error('Error checking feature status:', err);
      setFeatureEnabled(false);
    } finally {
      setFeatureLoading(false);
    }
  };

  const toggleFeature = async () => {
    try {
      setToggleUpdating(true);
      const newValue = !featureEnabled;
      const response = await fetch(`${PROFILE_API_BASE}/api/settings/ai_dq_suggestions_enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue.toString() })
      });
      
      if (response.ok) {
        setFeatureEnabled(newValue);
        if (newValue) {
          setSuggestions([]);
          setGeneratedAt(null);
        }
      }
    } catch (err) {
      console.error('Error toggling feature:', err);
    } finally {
      setToggleUpdating(false);
    }
  };

  const generateSuggestions = async () => {
    if (!columns || columns.length === 0) {
      setError('No column data available for analysis');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const columnData = columns.map(col => ({
        name: col.name,
        type: col.type,
        completeness: col.completeness || (100 - (col.nullPercentage || 0)),
        uniqueCount: col.uniqueCount || col.distinct_count,
        patterns: col.patterns || [],
        semanticType: col.semanticType,
        hasNulls: col.nullPercentage > 0 || col.null_count > 0
      }));

      const response = await fetch(`${PROFILE_API_BASE}/api/dq-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          filename,
          columns: columnData
        })
      });

      const data = await response.json();

      if (!data.enabled) {
        setFeatureEnabled(false);
        setError(data.message || 'Feature is disabled');
        return;
      }

      if (data.error) {
        setError(data.error);
        return;
      }

      setSuggestions(data.suggestions || []);
      setGeneratedAt(data.generatedAt);
      setSelectedSuggestions(new Set());
    } catch (err) {
      console.error('Error generating suggestions:', err);
      setError('Failed to generate suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const createQualityRule = async (suggestion) => {
    try {
      setCreatingRules(prev => ({ ...prev, [suggestion.id]: true }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/quality-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rule_name: suggestion.rule_name,
          rule_type: suggestion.rule_type,
          description: suggestion.description,
          column_name: suggestion.column_name,
          rule_config: suggestion.rule_config,
          severity: suggestion.severity,
          project_id: projectId || null
        })
      });

      if (response.ok) {
        setCreatedRules(prev => new Set([...prev, suggestion.id]));
        setSelectedSuggestions(prev => {
          const next = new Set(prev);
          next.delete(suggestion.id);
          return next;
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create rule');
      }
    } catch (err) {
      console.error('Error creating rule:', err);
      alert(`Failed to create rule: ${err.message}`);
    } finally {
      setCreatingRules(prev => ({ ...prev, [suggestion.id]: false }));
    }
  };

  const createSelectedRules = async () => {
    const selectedIds = Array.from(selectedSuggestions);
    for (const id of selectedIds) {
      const suggestion = suggestions.find(s => s.id === id);
      if (suggestion && !createdRules.has(id)) {
        await createQualityRule(suggestion);
      }
    }
  };

  const toggleSuggestionSelection = (id) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllSuggestions = () => {
    const availableIds = suggestions
      .filter(s => !createdRules.has(s.id))
      .map(s => s.id);
    setSelectedSuggestions(new Set(availableIds));
  };

  const clearSelection = () => {
    setSelectedSuggestions(new Set());
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'critical': return 'severity-critical';
      case 'error': return 'severity-error';
      case 'warning': return 'severity-warning';
      default: return 'severity-info';
    }
  };

  const getRuleTypeIcon = (ruleType) => {
    switch (ruleType) {
      case 'completeness': return '📊';
      case 'validity': return '✓';
      case 'consistency': return '🔗';
      case 'uniqueness': return '🔑';
      case 'freshness': return '⏱️';
      default: return '📋';
    }
  };

  if (featureLoading) {
    return (
      <div className="ai-dq-suggestions-tab">
        <div className="loading-state">
          <LoadingSpinner />
          <p>Checking feature status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-dq-suggestions-tab">
      <div className="ai-header">
        <div className="ai-header-left">
          <h3>
            <FiZap className="ai-icon" />
            AI Data Quality Suggestions
          </h3>
          <p className="ai-description">
            Analyze your file profile and get AI-powered recommendations for data quality rules
          </p>
        </div>
        <div className="ai-header-right">
          <div className="feature-toggle">
            <span className="toggle-label">AI Analysis</span>
            <button 
              className={`toggle-button ${featureEnabled ? 'enabled' : 'disabled'}`}
              onClick={toggleFeature}
              disabled={toggleUpdating}
            >
              {toggleUpdating ? (
                <span className="toggle-loading">...</span>
              ) : featureEnabled ? (
                <><FiToggleRight size={20} /> Enabled</>
              ) : (
                <><FiToggleLeft size={20} /> Disabled</>
              )}
            </button>
          </div>
        </div>
      </div>

      {!featureEnabled ? (
        <div className="feature-disabled-notice">
          <FiInfo size={24} />
          <div>
            <h4>AI Suggestions Disabled</h4>
            <p>Enable AI analysis above to generate data quality rule suggestions. Note: This uses AI credits when enabled.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="ai-actions">
            <button 
              className="generate-btn"
              onClick={generateSuggestions}
              disabled={loading}
            >
              {loading ? (
                <><LoadingSpinner size="small" /> Analyzing...</>
              ) : (
                <><FiRefreshCw /> {suggestions.length > 0 ? 'Regenerate' : 'Generate'} Suggestions</>
              )}
            </button>
            
            {suggestions.length > 0 && (
              <div className="bulk-actions">
                <button 
                  className="select-all-btn"
                  onClick={selectAllSuggestions}
                  disabled={suggestions.every(s => createdRules.has(s.id))}
                >
                  Select All
                </button>
                {selectedSuggestions.size > 0 && (
                  <>
                    <button 
                      className="clear-selection-btn"
                      onClick={clearSelection}
                    >
                      Clear ({selectedSuggestions.size})
                    </button>
                    <button 
                      className="create-selected-btn"
                      onClick={createSelectedRules}
                    >
                      <FiPlus /> Create {selectedSuggestions.size} Rule{selectedSuggestions.size > 1 ? 's' : ''}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {generatedAt && (
            <p className="generated-at">
              Generated: {new Date(generatedAt).toLocaleString()}
            </p>
          )}

          {error && (
            <div className="error-message">
              <FiAlertTriangle />
              {error}
            </div>
          )}

          {loading && (
            <div className="loading-state">
              <LoadingSpinner />
              <p>Analyzing file profile with AI...</p>
              <p className="loading-note">This may take a few seconds</p>
            </div>
          )}

          {!loading && suggestions.length === 0 && !error && generatedAt && (
            <div className="no-suggestions">
              <FiCheckCircle size={32} />
              <h4>No Issues Detected</h4>
              <p>The AI analysis found no data quality issues requiring rules for this file.</p>
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <div className="suggestions-list">
              {suggestions.map(suggestion => (
                <div 
                  key={suggestion.id} 
                  className={`suggestion-card ${createdRules.has(suggestion.id) ? 'created' : ''} ${selectedSuggestions.has(suggestion.id) ? 'selected' : ''}`}
                >
                  {!createdRules.has(suggestion.id) && (
                    <div className="suggestion-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(suggestion.id)}
                        onChange={() => toggleSuggestionSelection(suggestion.id)}
                        id={`check-${suggestion.id}`}
                      />
                    </div>
                  )}
                  
                  <div className="suggestion-content">
                    <div className="suggestion-header">
                      <div className="suggestion-meta">
                        <span className="rule-type-icon">{getRuleTypeIcon(suggestion.rule_type)}</span>
                        <span className="rule-type-label">{suggestion.rule_type}</span>
                        <span className={`severity-badge ${getSeverityClass(suggestion.severity)}`}>
                          {suggestion.severity}
                        </span>
                      </div>
                      <div className="column-name">
                        Column: <strong>{suggestion.column_name}</strong>
                      </div>
                    </div>
                    
                    <h4 className="suggestion-title">{suggestion.rule_name}</h4>
                    <p className="suggestion-description">{suggestion.description}</p>
                    
                    <div className="suggestion-reason">
                      <FiInfo size={14} />
                      <span>{suggestion.reason}</span>
                    </div>
                    
                    {suggestion.rule_config && (
                      <div className="rule-config-preview">
                        <code>{JSON.stringify(suggestion.rule_config, null, 2)}</code>
                      </div>
                    )}
                  </div>
                  
                  <div className="suggestion-actions">
                    {createdRules.has(suggestion.id) ? (
                      <span className="created-badge">
                        <FiCheck /> Created
                      </span>
                    ) : (
                      <button
                        className="create-rule-btn"
                        onClick={() => createQualityRule(suggestion)}
                        disabled={creatingRules[suggestion.id]}
                      >
                        {creatingRules[suggestion.id] ? (
                          <LoadingSpinner size="small" />
                        ) : (
                          <><FiPlus /> Create Rule</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !generatedAt && suggestions.length === 0 && !error && (
            <div className="empty-state">
              <FiZap size={48} />
              <h4>Ready to Analyze</h4>
              <p>Click "Generate Suggestions" to analyze your file profile and get AI-powered data quality rule recommendations.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AIDQSuggestionsTab;
