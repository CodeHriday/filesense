import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PropTypes from 'prop-types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const HealingRecommendations = ({ anomalyId, anomaly }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (anomalyId) {
      fetchRecommendations();
    }
  }, [anomalyId]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axios.get(`${API_BASE_URL}/api/ml/recommendations/${anomalyId}`);
      
      if (response.data.success) {
        setRecommendations(response.data.recommendations || []);
      } else {
        setError('Failed to load recommendations');
      }
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError(err.response?.data?.error || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      validation: '✓',
      transformation: '⚡',
      monitoring: '📊',
      investigation: '🔍',
      configuration: '⚙️',
      documentation: '📝',
      communication: '✉️'
    };
    return icons[category] || '•';
  };

  const getCategoryColor = (category) => {
    const colors = {
      validation: 'bg-blue-100 text-blue-800',
      transformation: 'bg-purple-100 text-purple-800',
      monitoring: 'bg-green-100 text-green-800',
      investigation: 'bg-yellow-100 text-yellow-800',
      configuration: 'bg-gray-100 text-gray-800',
      documentation: 'bg-indigo-100 text-indigo-800',
      communication: 'bg-pink-100 text-pink-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      critical: 'bg-red-100 text-red-800 border-red-300',
      high: 'bg-orange-100 text-orange-800 border-orange-300',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      low: 'bg-green-100 text-green-800 border-green-300'
    };
    return colors[priority] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const handleActionClick = (recommendation) => {
    const { action_type, action_params } = recommendation;

    switch (action_type) {
      case 'create_etl_transformation':
        // Navigate to ETL transformations page with pre-filled data
        navigate('/transformations', {
          state: {
            createNew: true,
            suggestion: {
              type: action_params.transformation_type,
              field: action_params.field,
              params: action_params
            },
            fromAnomaly: anomalyId
          }
        });
        break;

      case 'create_validation_rule':
        // Navigate to quality rules page
        navigate('/quality-rules', {
          state: {
            createNew: true,
            suggestion: action_params,
            fromAnomaly: anomalyId
          }
        });
        break;

      case 'create_dashboard':
      case 'create_alert_rule':
        // Navigate to insights page for monitoring setup
        navigate('/insights', {
          state: {
            suggestion: action_params,
            fromAnomaly: anomalyId
          }
        });
        break;

      case 'update_schema':
      case 'update_thresholds':
      case 'update_constraints':
        // Show configuration modal or navigate to settings
        alert(`Configuration update needed:\n\n${JSON.stringify(action_params, null, 2)}\n\nPlease update settings manually.`);
        break;

      case 'run_profiling':
        // Trigger re-profiling for the file
        if (anomaly?.file_id) {
          alert(`Profiling will be re-run for file: ${anomaly.file_name}`);
          // Could trigger actual profiling API call here
        }
        break;

      case 'manual_investigation':
      case 'manual_documentation':
      case 'manual_communication':
        // Show action details
        alert(`Manual action required:\n\n${recommendation.description}\n\nFocus areas:\n${JSON.stringify(action_params, null, 2)}`);
        break;

      default:
        alert(`Action: ${action_type}\n\nDetails:\n${JSON.stringify(action_params, null, 2)}`);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading recommendations...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-gray-600">No recommendations available for this anomaly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Healing Recommendations
        </h3>
        <span className="text-sm text-gray-500">
          {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec, index) => (
          <div
            key={rec.id || `rec-${rec.type || rec.title?.substring(0, 20) || index}`}
            className={`border-l-4 rounded-lg p-4 bg-white shadow-sm ${getPriorityColor(rec.priority)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(rec.category)}`}>
                    {getCategoryIcon(rec.category)} {rec.category}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                    {rec.priority}
                  </span>
                  <span className="text-xs text-gray-500">
                    Effort: {rec.effort} • Impact: {rec.impact}
                  </span>
                </div>

                <h4 className="font-semibold text-gray-900 mb-1">
                  {rec.title}
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  {rec.description}
                </p>

                {rec.action_params && Object.keys(rec.action_params).length > 0 && (
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer hover:text-gray-700">
                      View action details
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto">
                      {JSON.stringify(rec.action_params, null, 2)}
                    </pre>
                  </details>
                )}
              </div>

              <div className="ml-4">
                {rec.action_type && !rec.action_type.startsWith('manual_') && (
                  <button
                    onClick={() => handleActionClick(rec)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                  >
                    Take Action
                  </button>
                )}
                {rec.action_type && rec.action_type.startsWith('manual_') && (
                  <button
                    onClick={() => handleActionClick(rec)}
                    className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded hover:bg-gray-700 transition-colors"
                  >
                    View Details
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">💡 How to use recommendations</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li><strong>Automated actions:</strong> Click "Take Action" to navigate to the relevant configuration page</li>
          <li><strong>ETL transformations:</strong> Create or modify transformation mappings to fix data issues</li>
          <li><strong>Quality rules:</strong> Set up validation rules to prevent future anomalies</li>
          <li><strong>Manual actions:</strong> Follow the guidance provided for investigation and documentation</li>
        </ul>
      </div>
    </div>
  );
};
HealingRecommendations.propTypes = {
  anomalyId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  anomaly: PropTypes.shape({
    file_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    file_name: PropTypes.string
  })
};

HealingRecommendations.defaultProps = {
  anomalyId: null,
  anomaly: null
};
export default HealingRecommendations;
