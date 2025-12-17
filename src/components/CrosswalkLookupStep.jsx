import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiGitBranch, FiInfo } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import ColumnMapper from './ColumnMapper';
import { API_BASE_URL } from '../config';
import PropTypes from 'prop-types';

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
      <div style={{ padding: '1rem', textAlign: 'center' }}>
        <LoadingSpinner size="small" />
        <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>Loading crosswalks...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
          fontFamily: 'Inter',
          fontWeight: '600',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem'
        }}>
          <FiGitBranch size={10} /> Crosswalk Configuration
        </h3>
        <p style={{ margin: 0, marginBottom: '0.5rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>
          Configure crosswalk lookups to map source values to target values using reference tables.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="crosswalkTable" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', marginBottom: '0.25rem' }}>Crosswalk Table</label>
            <select
              id="crosswalkTable"
              className="form-control"
              style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.25rem', height: '24px' }}
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
            <label htmlFor="sourceColumn" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', marginBottom: '0.25rem' }}>Source Column (Your Data)</label>
            <select
              id="sourceColumn"
              className="form-control"
              style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.25rem', height: '24px' }}
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
            <label htmlFor="crosswalkSourceField" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', marginBottom: '0.25rem' }}>Crosswalk Source Field</label>
            <select
              id="crosswalkSourceField"
              className="form-control"
              style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.25rem', height: '24px' }}
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
            <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
              Field in the crosswalk table to match against
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="noMatchBehavior" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', marginBottom: '0.25rem' }}>Behavior on No Match</label>
            <select
              id="noMatchBehavior"
              className="form-control"
              style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.25rem', height: '24px' }}
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
              <label htmlFor="defaultValue" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: '500', marginBottom: '0.25rem' }}>Default Value</label>
              <input
                id="defaultValue"
                type="text"
                className="form-control"
                style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.25rem' }}
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
              marginTop: '0.5rem', 
              padding: '0.25rem', 
              backgroundColor: '#e0f2fe', 
              border: '1px solid #bae6fd', 
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'Inter',
              color: '#0c4a6e'
            }}>
              <strong>Lookup Preview:</strong> Values in <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '10px' }}>
                {crosswalkConfig.source_column || '[source column]'}
              </code> will be looked up in the crosswalk table field <code style={{ backgroundColor: '#bae6fd', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '10px' }}>
                {crosswalkConfig.crosswalk_source_field || 'source_code'}
              </code>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <h4 style={{ 
                margin: 0, 
                marginBottom: '0.5rem', 
                fontSize: '10px', 
                fontFamily: 'Inter',
                fontWeight: '600',
                textTransform: 'uppercase',
                color: '#111827'
              }}>
                Select Columns to Add from Crosswalk Table
              </h4>
              
              {crosswalkSchema?.sourceSystem && crosswalkSchema?.targetSystem && (
                <div style={{ 
                  marginBottom: '0.5rem',
                  padding: '0.25rem',
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'Inter',
                  color: '#0c4a6e'
                }}>
                  <strong>Crosswalk Mapping:</strong> {crosswalkSchema.sourceSystem.name} → {crosswalkSchema.targetSystem.name}
                </div>
              )}
              
              {loadingCrosswalkSchema ? (
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <LoadingSpinner size="small" />
                  <p style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>
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
    </div>
  );
};
CrosswalkLookupStep.propTypes = {
  crosswalkConfig: PropTypes.shape({
    crosswalk_id: PropTypes.string,
    source_column: PropTypes.string,
    crosswalk_source_field: PropTypes.string,
    no_match_behavior: PropTypes.string,
    default_value: PropTypes.string,
    column_mappings: PropTypes.array
  }),
  schema: PropTypes.array,
  onCrosswalkConfigChange: PropTypes.func.isRequired
};

CrosswalkLookupStep.defaultProps = {
  crosswalkConfig: {},
  schema: []
};
export default CrosswalkLookupStep;
