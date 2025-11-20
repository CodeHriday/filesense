import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiGitBranch, FiInfo } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import ColumnMapper from './ColumnMapper';
import { API_BASE_URL } from '../config';

const CrosswalkLookupStep = ({
  crosswalkConfig,
  schema,
  onCrosswalkConfigChange
}) => {
  const [crosswalks, setCrosswalks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crosswalkSchema, setCrosswalkSchema] = useState(null);
  const [loadingCrosswalkSchema, setLoadingCrosswalkSchema] = useState(false);

  useEffect(() => {
    fetchCrosswalks();
  }, []);

  useEffect(() => {
    if (crosswalkConfig?.crosswalk_id) {
      fetchCrosswalkSchema(crosswalkConfig.crosswalk_id);
    } else {
      setCrosswalkSchema(null);
    }
  }, [crosswalkConfig?.crosswalk_id]);

  const fetchCrosswalks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.get(`${API_BASE_URL}/api/rdm/crosswalks`, { headers });
      setCrosswalks(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch crosswalks:', err);
      setCrosswalks([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCrosswalkSchema = async (crosswalkId) => {
    try {
      setLoadingCrosswalkSchema(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const response = await axios.get(
        `${API_BASE_URL}/api/rdm/crosswalks/${crosswalkId}/schema`,
        { headers }
      );
      
      const schemaData = response.data.data;
      setCrosswalkSchema(schemaData || null);
    } catch (err) {
      console.error('Failed to fetch crosswalk schema:', err);
      setCrosswalkSchema(null);
    } finally {
      setLoadingCrosswalkSchema(false);
    }
  };

  const handleCrosswalkChange = (field, value) => {
    onCrosswalkConfigChange({
      ...crosswalkConfig,
      [field]: value
    });
  };

  const handleCrosswalkMappingsChange = (mappings) => {
    onCrosswalkConfigChange({
      ...crosswalkConfig,
      column_mappings: mappings
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <LoadingSpinner size="small" />
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading crosswalks...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="alert alert-info" style={{ color: 'white' }}>
        <FiInfo style={{ marginRight: '0.5rem' }} />
        Map source values to target values using predefined crosswalk tables. Select columns from 
        your data to lookup values and enrich your records.
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
          <FiGitBranch /> Crosswalk Configuration
        </h3>
        <p style={{ margin: 0, marginBottom: '1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Configure crosswalk lookups to map source values to target values using reference tables.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Crosswalk Table</label>
            <select
              className="form-control"
              value={crosswalkConfig?.crosswalk_id || ''}
              onChange={(e) => handleCrosswalkChange('crosswalk_id', e.target.value)}
            >
              <option value="">Select a crosswalk table</option>
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
            <label>Crosswalk Source Field</label>
            <select
              className="form-control"
              value={crosswalkConfig?.crosswalk_source_field || ''}
              onChange={(e) => handleCrosswalkChange('crosswalk_source_field', e.target.value)}
              disabled={!crosswalkConfig?.crosswalk_id || loadingCrosswalkSchema}
            >
              <option value="">Select crosswalk source field</option>
              {crosswalkSchema?.sourceSystem?.fields?.map(field => (
                <option key={field.name} value={field.name}>
                  {field.name} ({field.dataType})
                </option>
              ))}
            </select>
            <small className="form-help">
              Field in the crosswalk table to match against
            </small>
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
          <>
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
              </code> will be looked up in the crosswalk table field <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>
                {crosswalkConfig.crosswalk_source_field || 'source_code'}
              </code>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ 
                margin: 0, 
                marginBottom: '1rem', 
                fontSize: '1rem', 
                fontWeight: '600',
                color: '#111827'
              }}>
                Select Columns to Add from Crosswalk Table
              </h4>
              
              {crosswalkSchema?.sourceSystem && crosswalkSchema?.targetSystem && (
                <div style={{ 
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#0c4a6e'
                }}>
                  <strong>Crosswalk Mapping:</strong> {crosswalkSchema.sourceSystem.name} → {crosswalkSchema.targetSystem.name}
                </div>
              )}
              
              {loadingCrosswalkSchema ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <LoadingSpinner size="small" />
                  <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    Loading crosswalk columns...
                  </p>
                </div>
              ) : (
                <ColumnMapper
                  sourceColumns={crosswalkSchema?.targetSystem?.fields || []}
                  existingTargetColumns={schema || []}
                  mappings={crosswalkConfig?.column_mappings || []}
                  onMappingsChange={handleCrosswalkMappingsChange}
                  sourceLabel="Crosswalk Target Columns"
                  targetLabel="Your Target Schema"
                  allowRename={true}
                />
              )}
            </div>
          </>
        )}
      </div>

      {!crosswalkConfig?.crosswalk_id && (
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
          Select a crosswalk table above to configure column mappings and value lookups.
        </div>
      )}
    </div>
  );
};

export default CrosswalkLookupStep;
