import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiDatabase, FiGitBranch, FiInfo, FiPlus, FiTrash2 } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import ColumnMapper from './ColumnMapper';
import { API_BASE_URL } from '../config';
import PropTypes from 'prop-types';

const RdmLookupStep = ({ 
  datasetConfig, 
  crosswalkConfig, 
  schema,
  datasetEnabled = false,
  crosswalkEnabled = false,
  onDatasetConfigChange,
  onCrosswalkConfigChange,
  onDatasetEnabledChange,
  onCrosswalkEnabledChange
}) => {
  const [datasets, setDatasets] = useState([]);
  const [crosswalks, setCrosswalks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [datasetSchema, setDatasetSchema] = useState([]);
  const [loadingDatasetSchema, setLoadingDatasetSchema] = useState(false);
  
  const [joinConditions, setJoinConditions] = useState(
    datasetConfig?.join_conditions || 
    (datasetConfig?.dataset_column ? [{
      dataset_column: datasetConfig.dataset_column,
      source_column: datasetConfig.source_column
    }] : [{dataset_column: '', source_column: ''}])
  );

  useEffect(() => {
    fetchRdmResources();
  }, []);

  const fetchRdmResources = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [datasetsRes, crosswalksRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/rdm/datasets`, { headers }),
        axios.get(`${API_BASE_URL}/api/rdm/crosswalks`, { headers })
      ]);

      setDatasets(datasetsRes.data.data || []);
      setCrosswalks(crosswalksRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch RDM resources:', err);
      
      const errorDetails = {
        message: err.response?.data?.error || err.message || 'Failed to fetch RDM resources',
        status: err.response?.status,
        statusText: err.response?.statusText,
        details: err.response?.data?.details,
        rawError: err
      };
      
      setError(errorDetails);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (datasetConfig?.dataset_id) {
      fetchDatasetSchema(datasetConfig.dataset_id);
    } else {
      setDatasetSchema([]);
    }
  }, [datasetConfig?.dataset_id]);

  const fetchDatasetSchema = async (datasetId) => {
    try {
      setLoadingDatasetSchema(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const response = await axios.get(
        `${API_BASE_URL}/api/rdm/datasets/${datasetId}/schema`,
        { headers }
      );
      
      const schema = response.data.data?.fields || [];
      setDatasetSchema(schema);
    } catch (err) {
      console.error('Failed to fetch dataset schema:', err);
      setDatasetSchema([]);
    } finally {
      setLoadingDatasetSchema(false);
    }
  };

  const handleDatasetChange = (field, value) => {
    onDatasetConfigChange({
      ...datasetConfig,
      [field]: value
    });
  };

  const handleDatasetMappingsChange = (mappings) => {
    onDatasetConfigChange({
      ...datasetConfig,
      column_mappings: mappings
    });
  };

  const handleCrosswalkChange = (field, value) => {
    onCrosswalkConfigChange({
      ...crosswalkConfig,
      [field]: value
    });
  };

  const addJoinCondition = () => {
    const updated = [...joinConditions, {dataset_column: '', source_column: ''}];
    setJoinConditions(updated);
    handleDatasetChange('join_conditions', updated);
  };

  const removeJoinCondition = (index) => {
    const updated = joinConditions.filter((_, i) => i !== index);
    setJoinConditions(updated);
    handleDatasetChange('join_conditions', updated);
  };

  const updateJoinCondition = (index, field, value) => {
    const updated = [...joinConditions];
    updated[index] = {...updated[index], [field]: value};
    setJoinConditions(updated);
    handleDatasetChange('join_conditions', updated);
  };

  if (loading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center' }}>
        <LoadingSpinner size="small" />
        <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>Loading RDM resources...</p>
      </div>
    );
  }

  const getTroubleshootingHint = (status) => {
    switch (status) {
      case 401:
        return {
          title: 'Authentication Failed',
          message: 'The RDM API key is missing or invalid.',
          actions: [
            'Verify that RDM_API_KEY is set in your Replit Secrets',
            'Check that the API key has not expired',
            'Ensure you have the correct permissions on the RDM system'
          ]
        };
      case 403:
        return {
          title: 'Access Denied',
          message: 'Your API key does not have permission to access this resource.',
          actions: [
            'Contact your RDM administrator to verify your access level',
            'Ensure your API key has the required permissions'
          ]
        };
      case 404:
        return {
          title: 'Resource Not Found',
          message: 'The RDM API endpoint was not found.',
          actions: [
            'Check that RDM_BASE_URL is correctly configured',
            'Verify the RDM service is running and accessible'
          ]
        };
      case 500:
      case 502:
      case 503:
        return {
          title: 'RDM Service Error',
          message: 'The RDM service encountered an internal error.',
          actions: [
            'Wait a few moments and try again',
            'Check the RDM service status',
            'Contact your system administrator if the problem persists'
          ]
        };
      default:
        return {
          title: 'Connection Error',
          message: 'Unable to connect to the RDM service.',
          actions: [
            'Check your network connection',
            'Verify that RDM_BASE_URL is correctly configured',
            'Ensure the RDM service is accessible from your network'
          ]
        };
    }
  };

  if (error) {
    const hint = getTroubleshootingHint(error.status);
    
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ 
          padding: '1.5rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
            <FiInfo style={{ color: '#dc2626', fontSize: '10px' }} />
            <h3 style={{ margin: 0, color: '#dc2626', fontSize: '10px', fontFamily: 'Inter', fontWeight: '600', textTransform: 'uppercase' }}>
              {hint.title}
            </h3>
          </div>
          
          <p style={{ margin: 0, marginBottom: '0.5rem', color: '#991b1b', fontSize: '10px', fontFamily: 'Inter' }}>
            {error.message}
          </p>

          {error.status && (
            <div style={{ 
              padding: '1rem',
              backgroundColor: 'white',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#991b1b', fontSize: '10px', fontFamily: 'Inter' }}>Status:</strong>{' '}
                <span style={{ 
                  padding: '0.125rem 0.25rem',
                  backgroundColor: '#fee2e2',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  color: '#991b1b'
                }}>
                  {error.status} {error.statusText}
                </span>
              </div>

              {error.details?.endpoint && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ color: '#991b1b', fontSize: '10px', fontFamily: 'Inter' }}>Endpoint:</strong>{' '}
                  <code style={{ 
                    padding: '0.125rem 0.25rem',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '4px',
                    fontSize: '10px'
                  }}>
                    {error.details.endpoint}
                  </code>
                </div>
              )}

              {error.details?.responseBody && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ color: '#991b1b', fontSize: '10px', fontFamily: 'Inter', display: 'block', marginBottom: '0.25rem' }}>
                    Response Details:
                  </strong>
                  <pre style={{ 
                    padding: '0.5rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'Consolas, Monaco, Courier New, monospace',
                    margin: 0,
                    overflow: 'auto',
                    maxHeight: '200px',
                    color: '#374151'
                  }}>
                    {JSON.stringify(error.details.responseBody, null, 2)}
                  </pre>
                </div>
              )}

              {error.details?.timestamp && (
                <div style={{ fontSize: '10px', fontFamily: 'Inter', color: '#6b7280' }}>
                  <strong>Time:</strong> {new Date(error.details.timestamp).toLocaleString()}
                </div>
              )}
            </div>
          )}

          <div style={{ 
            padding: '0.5rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            marginBottom: '0.5rem'
          }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem', color: '#92400e', fontSize: '10px', fontFamily: 'Inter' }}>
              Troubleshooting Steps:
            </strong>
            <ul style={{ margin: 0, paddingLeft: '1rem', color: '#78350f', fontSize: '10px', fontFamily: 'Inter' }}>
              {hint.actions.map((action, idx) => (
                <li key={idx} style={{ marginBottom: '0.125rem' }}>{action}</li>
              ))}
            </ul>
          </div>

          <button
            onClick={fetchRdmResources}
            style={{
              padding: '0.125rem 0.25rem',
              backgroundColor: 'hsl(210, 100%, 50%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '10px',
              fontFamily: 'Inter'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = 'hsl(210, 100%, 45%)'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'hsl(210, 100%, 50%)'}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        padding: '0.5rem', 
        backgroundColor: '#f9fafb', 
        border: '1px solid #e5e7eb', 
        borderRadius: '6px' 
      }}>
        <h3 style={{ 
          margin: 0, 
          marginBottom: '0.5rem', 
          fontSize: '10px', 
          fontWeight: '600',
          fontFamily: 'Inter',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem'
        }}>
          <FiDatabase size={10} /> Dataset Join
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          <div style={{ marginBottom: 0 }}>
            <label htmlFor="referenceDataset" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', display: 'block', marginBottom: '0.25rem' }}>Reference Dataset</label>
            <select
              id="referenceDataset"
              style={{ 
                width: '100%', 
                padding: '0.25rem', 
                fontSize: '10px', 
                fontFamily: 'Inter',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                height: '24px'
              }}
              value={datasetConfig?.dataset_id || ''}
              onChange={(e) => handleDatasetChange('dataset_id', e.target.value)}
            >
              <option value="">Select a dataset (optional)</option>
              {datasets.map(ds => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} {ds.description && `- ${ds.description}`}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 0 }}>
            <label htmlFor="joinType" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', display: 'block', marginBottom: '0.25rem' }}>Join Type</label>
            <select
              id="joinType"
              style={{ 
                width: '100%', 
                padding: '0.25rem', 
                fontSize: '10px', 
                fontFamily: 'Inter',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                height: '24px'
              }}
              value={datasetConfig?.join_type || 'inner'}
              onChange={(e) => handleDatasetChange('join_type', e.target.value)}
              disabled={!datasetConfig?.dataset_id}
            >
              <option value="inner">Inner Join - Only matching records</option>
              <option value="left">Left Join - All source records</option>
              <option value="right">Right Join - All dataset records</option>
              <option value="full">Full Outer Join - All records</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <h4 style={{ 
            margin: 0, 
            marginBottom: '0.5rem', 
            fontSize: '10px', 
            fontWeight: '600',
            fontFamily: 'Inter',
            color: '#111827'
          }}>
            Join Conditions
          </h4>
          {joinConditions.map((condition, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ marginBottom: 0 }}>
                <label htmlFor={`datasetColumn-${idx}`} style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', display: 'block', marginBottom: '0.25rem' }}>Dataset Column (Reference Data)</label>
                <select
                  id={`datasetColumn-${idx}`}
                  style={{ 
                    width: '100%', 
                    padding: '0.25rem', 
                    fontSize: '10px', 
                    fontFamily: 'Inter',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    height: '24px'
                  }}
                  value={condition.dataset_column}
                  onChange={(e) => updateJoinCondition(idx, 'dataset_column', e.target.value)}
                  disabled={!datasetConfig?.dataset_id || loadingDatasetSchema}
                >
                  <option value="">Select column</option>
                  {datasetSchema.map(col => (
                    <option key={col.name} value={col.name}>{col.name} ({col.dataType})</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: 0 }}>
                <label htmlFor={`sourceColumn-${idx}`} style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', display: 'block', marginBottom: '0.25rem' }}>Source Column (Your Data)</label>
                <select
                  id={`sourceColumn-${idx}`}
                  style={{ 
                    width: '100%', 
                    padding: '0.25rem', 
                    fontSize: '10px', 
                    fontFamily: 'Inter',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    height: '24px'
                  }}
                  value={condition.source_column}
                  onChange={(e) => updateJoinCondition(idx, 'source_column', e.target.value)}
                  disabled={!datasetConfig?.dataset_id}
                >
                  <option value="">Select column</option>
                  {schema && schema.map(col => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem' }}>
                {joinConditions.length > 1 && (
                  <button 
                    onClick={() => removeJoinCondition(idx)} 
                    style={{
                      padding: '0.25rem',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#b91c1c'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#dc2626'}
                  >
                    <FiTrash2 size={12} />
                  </button>
                )}
                {idx === joinConditions.length - 1 && (
                  <button 
                    onClick={addJoinCondition} 
                    style={{
                      padding: '0.25rem',
                      backgroundColor: 'hsl(210, 100%, 50%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'hsl(210, 100%, 45%)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'hsl(210, 100%, 50%)'}
                  >
                    <FiPlus size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {datasetConfig?.dataset_id && (
          <>
            <div style={{ 
              marginTop: '0.5rem', 
              padding: '0.25rem', 
              backgroundColor: '#e0f2fe', 
              border: '1px solid #bae6fd', 
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'Inter',
              color: '#0c4a6e'
            }}>
              <strong>Join Preview:</strong> Your records will be enriched with data from the selected dataset 
              {joinConditions.length === 1 ? (
                <>
                  {' '}where <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '10px' }}>
                    {joinConditions[0].source_column || '[source column]'}
                  </code> matches <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '10px' }}>
                    {joinConditions[0].dataset_column || '[dataset column]'}
                  </code>
                </>
              ) : (
                <>
                  {' '}where:
                  <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1rem' }}>
                    {joinConditions.map((condition, idx) => (
                      <li key={idx}>
                        <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '10px' }}>
                          {condition.source_column || '[source column]'}
                        </code> matches <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '10px' }}>
                          {condition.dataset_column || '[dataset column]'}
                        </code>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <h4 style={{ 
                margin: 0, 
                marginBottom: '0.5rem', 
                fontSize: '10px', 
                fontWeight: '600',
                fontFamily: 'Inter',
                color: '#111827'
              }}>
                Select Columns to Add from Reference Dataset
              </h4>
              {loadingDatasetSchema ? (
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <LoadingSpinner size="small" />
                  <p style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>
                    Loading dataset columns...
                  </p>
                </div>
              ) : (
                <ColumnMapper
                  sourceColumns={datasetSchema}
                  existingTargetColumns={schema || []}
                  mappings={datasetConfig?.column_mappings || []}
                  onMappingsChange={handleDatasetMappingsChange}
                  sourceLabel="Dataset Columns"
                  targetLabel="Your Target Schema"
                  allowRename={true}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};


RdmLookupStep.propTypes = {
  datasetConfig: PropTypes.shape({
    dataset_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    join_type: PropTypes.string,
    join_conditions: PropTypes.arrayOf(
      PropTypes.shape({
        dataset_column: PropTypes.string,
        source_column: PropTypes.string
      })
    ),
    column_mappings: PropTypes.arrayOf(
      PropTypes.shape({
        source_column: PropTypes.string,
        target_column: PropTypes.string
      })
    )
  }),

  crosswalkConfig: PropTypes.shape({
    crosswalk_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    source_column: PropTypes.string,
    target_column: PropTypes.string
  }),

  schema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      dataType: PropTypes.string
    })
  ),

  datasetEnabled: PropTypes.bool,
  crosswalkEnabled: PropTypes.bool,

  onDatasetConfigChange: PropTypes.func.isRequired,
  onCrosswalkConfigChange: PropTypes.func.isRequired,
  onDatasetEnabledChange: PropTypes.func,
  onCrosswalkEnabledChange: PropTypes.func
};

export default RdmLookupStep;
