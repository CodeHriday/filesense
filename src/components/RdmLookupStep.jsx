import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiDatabase, FiGitBranch, FiInfo, FiPlus, FiTrash2 } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import { API_BASE_URL } from '../config';

const RdmLookupStep = ({ 
  datasetConfig, 
  crosswalkConfig, 
  schema,
  onDatasetConfigChange,
  onCrosswalkConfigChange 
}) => {
  const [datasets, setDatasets] = useState([]);
  const [crosswalks, setCrosswalks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setError(err.response?.data?.error || 'Failed to fetch RDM resources');
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (field, value) => {
    onDatasetConfigChange({
      ...datasetConfig,
      [field]: value
    });
  };

  const handleCrosswalkChange = (field, value) => {
    onCrosswalkConfigChange({
      ...crosswalkConfig,
      [field]: value
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <LoadingSpinner size="small" />
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading RDM resources...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        <FiInfo /> {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="alert alert-info">
        <FiInfo style={{ marginRight: '0.5rem' }} />
        Configure RDM lookups to enrich your data with reference datasets and crosswalk mappings. 
        Dataset joins execute first, followed by crosswalk lookups.
      </div>

      <div style={{ 
        padding: '1.5rem', 
        backgroundColor: '#f9fafb', 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px' 
      }}>
        <h3 style={{ 
          margin: 0, 
          marginBottom: '1rem', 
          fontSize: '1.125rem', 
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <FiDatabase /> Dataset Join
        </h3>
        <p style={{ margin: 0, marginBottom: '1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Join your data with a reference dataset to enrich records with additional fields.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Reference Dataset</label>
            <select
              className="form-control"
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

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Join Type</label>
            <select
              className="form-control"
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

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Source Column (Your Data)</label>
            <select
              className="form-control"
              value={datasetConfig?.source_column || ''}
              onChange={(e) => handleDatasetChange('source_column', e.target.value)}
              disabled={!datasetConfig?.dataset_id}
            >
              <option value="">Select column to join on</option>
              {schema && schema.map(col => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Dataset Column (Reference Data)</label>
            <input
              type="text"
              className="form-control"
              value={datasetConfig?.dataset_column || ''}
              onChange={(e) => handleDatasetChange('dataset_column', e.target.value)}
              disabled={!datasetConfig?.dataset_id}
              placeholder="e.g., id, code, identifier"
            />
          </div>
        </div>

        {datasetConfig?.dataset_id && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            backgroundColor: '#e0f2fe', 
            border: '1px solid #bae6fd', 
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: '#0c4a6e'
          }}>
            <strong>Join Preview:</strong> Your records will be enriched with data from the selected dataset 
            where <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>
              {datasetConfig.source_column || '[source column]'}
            </code> matches <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>
              {datasetConfig.dataset_column || '[dataset column]'}
            </code>
          </div>
        )}
      </div>

      <div style={{ 
        padding: '1.5rem', 
        backgroundColor: '#f9fafb', 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px' 
      }}>
        <h3 style={{ 
          margin: 0, 
          marginBottom: '1rem', 
          fontSize: '1.125rem', 
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <FiGitBranch /> Crosswalk Lookup
        </h3>
        <p style={{ margin: 0, marginBottom: '1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Map source values to target values using a predefined crosswalk table.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Crosswalk Table</label>
            <select
              className="form-control"
              value={crosswalkConfig?.crosswalk_id || ''}
              onChange={(e) => handleCrosswalkChange('crosswalk_id', e.target.value)}
            >
              <option value="">Select a crosswalk (optional)</option>
              {crosswalks.map(cw => (
                <option key={cw.id} value={cw.id}>
                  {cw.name} {cw.description && `- ${cw.description}`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Source Column (Your Data)</label>
            <select
              className="form-control"
              value={crosswalkConfig?.source_column || ''}
              onChange={(e) => handleCrosswalkChange('source_column', e.target.value)}
              disabled={!crosswalkConfig?.crosswalk_id}
            >
              <option value="">Select column to lookup</option>
              {schema && schema.map(col => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Target Column Name</label>
            <input
              type="text"
              className="form-control"
              value={crosswalkConfig?.target_column || ''}
              onChange={(e) => handleCrosswalkChange('target_column', e.target.value)}
              disabled={!crosswalkConfig?.crosswalk_id}
              placeholder="e.g., mapped_code, target_value"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Behavior on No Match</label>
            <select
              className="form-control"
              value={crosswalkConfig?.no_match_behavior || 'keep_source'}
              onChange={(e) => handleCrosswalkChange('no_match_behavior', e.target.value)}
              disabled={!crosswalkConfig?.crosswalk_id}
            >
              <option value="keep_source">Keep Source Value</option>
              <option value="set_null">Set to NULL</option>
              <option value="set_default">Use Default Value</option>
            </select>
          </div>

          {crosswalkConfig?.no_match_behavior === 'set_default' && (
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label>Default Value</label>
              <input
                type="text"
                className="form-control"
                value={crosswalkConfig?.default_value || ''}
                onChange={(e) => handleCrosswalkChange('default_value', e.target.value)}
                placeholder="Enter default value for unmatched records"
              />
            </div>
          )}
        </div>

        {crosswalkConfig?.crosswalk_id && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            backgroundColor: '#e0f2fe', 
            border: '1px solid #bae6fd', 
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: '#0c4a6e'
          }}>
            <strong>Lookup Preview:</strong> Values in <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>
              {crosswalkConfig.source_column || '[source column]'}
            </code> will be mapped to <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>
              {crosswalkConfig.target_column || '[target column]'}
            </code> using the selected crosswalk table.
          </div>
        )}
      </div>

      {!datasetConfig?.dataset_id && !crosswalkConfig?.crosswalk_id && (
        <div style={{ 
          padding: '1.5rem', 
          backgroundColor: '#fffbeb', 
          border: '1px solid #fde68a', 
          borderRadius: '8px',
          fontSize: '0.875rem',
          color: '#78350f',
          textAlign: 'center'
        }}>
          <FiInfo style={{ marginRight: '0.5rem' }} />
          No RDM lookups configured. You can skip this step or configure dataset joins and crosswalk mappings above.
        </div>
      )}
    </div>
  );
};

export default RdmLookupStep;
