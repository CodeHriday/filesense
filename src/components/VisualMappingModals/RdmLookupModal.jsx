import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiDatabase, FiGitBranch, FiInfo, FiPlus, FiTrash2 } from 'react-icons/fi';
import LoadingSpinner from '../LoadingSpinner';
import ColumnMapper from '../ColumnMapper';
import { API_BASE_URL } from '../../config';
import './MappingConfigModal.css';

const RdmLookupModal = ({ isOpen, onClose, onSave, initialConfig = {}, cumulativeSchema = [] }) => {
  const [activeTab, setActiveTab] = useState('config');
  const [lookupType, setLookupType] = useState(initialConfig.lookupType || 'dataset');
  
  // Dataset state
  const [datasets, setDatasets] = useState([]);
  const [datasetConfig, setDatasetConfig] = useState(initialConfig.lookupType === 'dataset' ? initialConfig : {});
  const [datasetSchema, setDatasetSchema] = useState([]);
  const [loadingDatasetSchema, setLoadingDatasetSchema] = useState(false);
  const [joinConditions, setJoinConditions] = useState(
    initialConfig.joinKeys || [{ dataset_column: '', source_column: '' }]
  );
  
  // Crosswalk state
  const [crosswalks, setCrosswalks] = useState([]);
  const [crosswalkConfig, setCrosswalkConfig] = useState(initialConfig.lookupType === 'crosswalk' ? initialConfig : {});
  const [crosswalkSchema, setCrosswalkSchema] = useState(null);
  const [loadingCrosswalkSchema, setLoadingCrosswalkSchema] = useState(false);
  
  // Common state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (isOpen) {
      fetchRdmResources();
    }
  }, [isOpen]);
  
  useEffect(() => {
    if (datasetConfig?.datasetId) {
      fetchDatasetSchema(datasetConfig.datasetId);
    } else {
      setDatasetSchema([]);
    }
  }, [datasetConfig?.datasetId]);
  
  useEffect(() => {
    if (crosswalkConfig?.crosswalkId) {
      fetchCrosswalkSchema(crosswalkConfig.crosswalkId);
    } else {
      setCrosswalkSchema(null);
    }
  }, [crosswalkConfig?.crosswalkId]);
  
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
      setError(err.response?.data?.error || err.message || 'Failed to fetch RDM resources');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchDatasetSchema = async (datasetId) => {
    try {
      setLoadingDatasetSchema(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_BASE_URL}/api/rdm/datasets/${datasetId}/schema`, { headers });
      setDatasetSchema(response.data.data?.fields || []);
    } catch (err) {
      console.error('Failed to fetch dataset schema:', err);
      setDatasetSchema([]);
    } finally {
      setLoadingDatasetSchema(false);
    }
  };
  
  const fetchCrosswalkSchema = async (crosswalkId) => {
    try {
      setLoadingCrosswalkSchema(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_BASE_URL}/api/rdm/crosswalks/${crosswalkId}/schema`, { headers });
      setCrosswalkSchema(response.data.data || null);
    } catch (err) {
      console.error('Failed to fetch crosswalk schema:', err);
      setCrosswalkSchema(null);
    } finally {
      setLoadingCrosswalkSchema(false);
    }
  };
  
  const handleLookupTypeChange = (newType) => {
    setLookupType(newType);
    // Reset configs when switching types
    if (newType === 'dataset') {
      setCrosswalkConfig({});
    } else {
      setDatasetConfig({});
      setJoinConditions([{ dataset_column: '', source_column: '' }]);
    }
  };
  
  const handleDatasetChange = (field, value) => {
    setDatasetConfig(prev => ({ ...prev, [field]: value }));
  };
  
  const handleCrosswalkChange = (field, value) => {
    setCrosswalkConfig(prev => ({ ...prev, [field]: value }));
  };
  
  const addJoinCondition = () => {
    setJoinConditions(prev => [...prev, { dataset_column: '', source_column: '' }]);
  };
  
  const removeJoinCondition = (index) => {
    setJoinConditions(prev => prev.filter((_, i) => i !== index));
  };
  
  const updateJoinCondition = (index, field, value) => {
    setJoinConditions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };
  
  const handleDatasetMappingsChange = (mappings) => {
    handleDatasetChange('column_mappings', mappings);
  };
  
  const handleCrosswalkMappingsChange = (mappings) => {
    handleCrosswalkChange('column_mappings', mappings);
  };
  
  const getOutputSchema = () => {
    if (lookupType === 'dataset') {
      // For dataset join, output is cumulative schema + selected dataset columns
      const selectedDatasetColumns = datasetConfig.column_mappings || [];
      const datasetCols = selectedDatasetColumns.map(mapping => {
        const sourceCol = datasetSchema.find(col => col.name === mapping.source);
        return {
          name: mapping.target || mapping.source,
          type: sourceCol?.dataType || 'unknown',
          description: sourceCol?.description || '',
          contains_pii: sourceCol?.isPii || false
        };
      });
      return [...cumulativeSchema, ...datasetCols];
    } else {
      // For crosswalk, output is cumulative schema (potentially with transformed column)
      return cumulativeSchema;
    }
  };
  
  const handleSave = () => {
    let config = { lookupType };
    
    if (lookupType === 'dataset') {
      const selectedDataset = datasets.find(d => d.id === datasetConfig.datasetId);
      config = {
        ...config,
        datasetId: datasetConfig.datasetId,
        datasetName: selectedDataset?.name || '',
        joinType: datasetConfig.join_type || 'inner',
        joinKeys: joinConditions,
        columnMappings: datasetConfig.column_mappings || [],
        outputSchema: getOutputSchema()
      };
    } else {
      const selectedCrosswalk = crosswalks.find(c => c.id === crosswalkConfig.crosswalkId);
      config = {
        ...config,
        crosswalkId: crosswalkConfig.crosswalkId,
        crosswalkName: selectedCrosswalk?.name || '',
        sourceColumn: crosswalkConfig.source_column || '',
        crosswalkSourceField: crosswalkConfig.crosswalk_source_field || '',
        noMatchBehavior: crosswalkConfig.no_match_behavior || 'keep_source',
        defaultValue: crosswalkConfig.default_value || '',
        columnMappings: crosswalkConfig.column_mappings || [],
        outputSchema: getOutputSchema()
      };
    }
    
    onSave(config);
    onClose();
  };
  
  const isConfigValid = () => {
    if (lookupType === 'dataset') {
      return datasetConfig.datasetId && joinConditions.length > 0 && 
             joinConditions.every(jc => jc.dataset_column && jc.source_column);
    } else {
      return crosswalkConfig.crosswalkId && crosswalkConfig.source_column;
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>RDM Lookup Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-tabs">
          <button 
            className={`vm-tab ${activeTab === 'config' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
          <button 
            className={`vm-tab ${activeTab === 'schema' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('schema')}
          >
            Schema
          </button>
        </div>
        
        <div className="vm-modal-body vm-modal-body-scroll">
          {activeTab === 'config' && (
            <>
              <div className="vm-info-box">
                <p>
                  Configure RDM lookups to enrich your data using reference datasets (joins) or crosswalk tables (value mappings).
                </p>
              </div>
              
              <div className="vm-form-group">
                <label>Lookup Type</label>
                <select 
                  className="vm-select"
                  value={lookupType}
                  onChange={(e) => handleLookupTypeChange(e.target.value)}
                >
                  <option value="dataset">Dataset Join - Enrich with reference data</option>
                  <option value="crosswalk">Crosswalk Lookup - Map values between systems</option>
                </select>
              </div>
              
              {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <LoadingSpinner size="small" />
                  <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>
                    Loading RDM resources...
                  </p>
                </div>
              ) : error ? (
                <div className="vm-error-message">
                  <strong>Error:</strong> {error}
                  <button 
                    onClick={fetchRdmResources}
                    className="vm-btn vm-btn-secondary"
                    style={{ marginTop: '0.5rem' }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {lookupType === 'dataset' && (
                    <div>
                      <div className="vm-section-title">
                        <FiDatabase style={{ display: 'inline', marginRight: '0.5rem' }} />
                        Dataset Join Configuration
                      </div>
                      
                      <div className="vm-form-row-two-cols">
                        <div className="vm-form-group">
                          <label>Reference Dataset</label>
                          <select
                            className="vm-select"
                            value={datasetConfig.datasetId || ''}
                            onChange={(e) => handleDatasetChange('datasetId', e.target.value)}
                          >
                            <option value="">Select a dataset</option>
                            {datasets.map(ds => (
                              <option key={ds.id} value={ds.id}>
                                {ds.name} {ds.description && `- ${ds.description}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="vm-form-group">
                          <label>Join Type</label>
                          <select
                            className="vm-select"
                            value={datasetConfig.join_type || 'inner'}
                            onChange={(e) => handleDatasetChange('join_type', e.target.value)}
                            disabled={!datasetConfig.datasetId}
                          >
                            <option value="inner">Inner Join - Only matching records</option>
                            <option value="left">Left Join - All source records</option>
                            <option value="right">Right Join - All dataset records</option>
                            <option value="full">Full Outer Join - All records</option>
                          </select>
                        </div>
                      </div>
                      
                      {datasetConfig.datasetId && (
                        <>
                          <div className="vm-section-title">Join Conditions</div>
                          {joinConditions.map((condition, idx) => (
                            <div key={idx} className="vm-form-row-two-cols" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
                              <div className="vm-form-group">
                                <label>Dataset Column (Reference Data)</label>
                                <select
                                  className="vm-select"
                                  value={condition.dataset_column}
                                  onChange={(e) => updateJoinCondition(idx, 'dataset_column', e.target.value)}
                                  disabled={loadingDatasetSchema}
                                >
                                  <option value="">Select column</option>
                                  {datasetSchema.map(col => (
                                    <option key={col.name} value={col.name}>
                                      {col.name} ({col.dataType})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              <div className="vm-form-group">
                                <label>Source Column (Your Data)</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <select
                                    className="vm-select"
                                    style={{ flex: 1 }}
                                    value={condition.source_column}
                                    onChange={(e) => updateJoinCondition(idx, 'source_column', e.target.value)}
                                  >
                                    <option value="">Select column</option>
                                    {cumulativeSchema.map(col => (
                                      <option key={col.name} value={col.name}>{col.name}</option>
                                    ))}
                                  </select>
                                  {joinConditions.length > 1 && (
                                    <button 
                                      onClick={() => removeJoinCondition(idx)}
                                      className="vm-btn vm-btn-secondary"
                                      style={{ padding: '0.5rem', minWidth: 'auto' }}
                                    >
                                      <FiTrash2 />
                                    </button>
                                  )}
                                  {idx === joinConditions.length - 1 && (
                                    <button 
                                      onClick={addJoinCondition}
                                      className="vm-btn vm-btn-primary"
                                      style={{ padding: '0.5rem', minWidth: 'auto' }}
                                    >
                                      <FiPlus />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          <div className="vm-section-title">Select Columns to Add from Reference Dataset</div>
                          {loadingDatasetSchema ? (
                            <div style={{ padding: '1rem', textAlign: 'center' }}>
                              <LoadingSpinner size="small" />
                              <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>
                                Loading dataset columns...
                              </p>
                            </div>
                          ) : (
                            <ColumnMapper
                              sourceColumns={datasetSchema}
                              existingTargetColumns={cumulativeSchema}
                              mappings={datasetConfig.column_mappings || []}
                              onMappingsChange={handleDatasetMappingsChange}
                              sourceLabel="Dataset Columns"
                              targetLabel="Your Target Schema"
                              allowRename={true}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
                  
                  {lookupType === 'crosswalk' && (
                    <div>
                      <div className="vm-section-title">
                        <FiGitBranch style={{ display: 'inline', marginRight: '0.5rem' }} />
                        Crosswalk Configuration
                      </div>
                      
                      <div className="vm-form-row-two-cols">
                        <div className="vm-form-group">
                          <label>Crosswalk Table</label>
                          <select
                            className="vm-select"
                            value={crosswalkConfig.crosswalkId || ''}
                            onChange={(e) => handleCrosswalkChange('crosswalkId', e.target.value)}
                          >
                            <option value="">Select a crosswalk table</option>
                            {crosswalks.map(cw => (
                              <option key={cw.id} value={cw.id}>
                                {cw.name} {cw.description && `- ${cw.description}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="vm-form-group">
                          <label>Source Column (Your Data)</label>
                          <select
                            className="vm-select"
                            value={crosswalkConfig.source_column || ''}
                            onChange={(e) => handleCrosswalkChange('source_column', e.target.value)}
                            disabled={!crosswalkConfig.crosswalkId}
                          >
                            <option value="">Select column to lookup</option>
                            {cumulativeSchema.map(col => (
                              <option key={col.name} value={col.name}>{col.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      {crosswalkConfig.crosswalkId && (
                        <>
                          <div className="vm-form-row-two-cols">
                            <div className="vm-form-group">
                              <label>Crosswalk Source Field</label>
                              <select
                                className="vm-select"
                                value={crosswalkConfig.crosswalk_source_field || ''}
                                onChange={(e) => handleCrosswalkChange('crosswalk_source_field', e.target.value)}
                                disabled={loadingCrosswalkSchema}
                              >
                                <option value="">Select crosswalk source field</option>
                                {crosswalkSchema?.sourceSystem?.fields?.map(field => (
                                  <option key={field.name} value={field.name}>
                                    {field.name} ({field.dataType})
                                  </option>
                                ))}
                              </select>
                              <span className="vm-help-text">Field in the crosswalk table to match against</span>
                            </div>
                            
                            <div className="vm-form-group">
                              <label>Behavior on No Match</label>
                              <select
                                className="vm-select"
                                value={crosswalkConfig.no_match_behavior || 'keep_source'}
                                onChange={(e) => handleCrosswalkChange('no_match_behavior', e.target.value)}
                              >
                                <option value="keep_source">Keep Source Value</option>
                                <option value="set_null">Set to NULL</option>
                                <option value="set_default">Use Default Value</option>
                              </select>
                            </div>
                          </div>
                          
                          {crosswalkConfig.no_match_behavior === 'set_default' && (
                            <div className="vm-form-group">
                              <label>Default Value</label>
                              <input
                                type="text"
                                className="vm-input"
                                value={crosswalkConfig.default_value || ''}
                                onChange={(e) => handleCrosswalkChange('default_value', e.target.value)}
                                placeholder="Enter default value for unmatched records"
                              />
                            </div>
                          )}
                          
                          <div className="vm-section-title">Select Columns to Add from Crosswalk Table</div>
                          {loadingCrosswalkSchema ? (
                            <div style={{ padding: '1rem', textAlign: 'center' }}>
                              <LoadingSpinner size="small" />
                              <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>
                                Loading crosswalk columns...
                              </p>
                            </div>
                          ) : (
                            <ColumnMapper
                              sourceColumns={crosswalkSchema?.targetSystem?.fields || []}
                              existingTargetColumns={cumulativeSchema}
                              mappings={crosswalkConfig.column_mappings || []}
                              onMappingsChange={handleCrosswalkMappingsChange}
                              sourceLabel="Crosswalk Target Columns"
                              targetLabel="Your Target Schema"
                              allowRename={true}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          
          {activeTab === 'schema' && (
            <div className="vm-schema-container">
              <div className="vm-schema-meta">
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Lookup Type:</span>
                  <span className="vm-schema-value">
                    {lookupType === 'dataset' ? 'Dataset Join' : 'Crosswalk Lookup'}
                  </span>
                </div>
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Total Columns:</span>
                  <span className="vm-schema-value">{getOutputSchema().length}</span>
                </div>
              </div>
              
              {getOutputSchema().length > 0 ? (
                <div className="vm-schema-table-container">
                  <table className="vm-schema-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>#</th>
                        <th>Column Name</th>
                        <th style={{ width: '120px' }}>Data Type</th>
                        <th>Description</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>PII</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getOutputSchema().map((col, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td className="vm-schema-col-name">{col.name}</td>
                          <td className="vm-schema-col-type">{col.type}</td>
                          <td className="vm-schema-col-desc">{col.description || '-'}</td>
                          <td className="vm-schema-col-pii">
                            <span className={`vm-pii-indicator ${col.contains_pii ? 'vm-pii-yes' : 'vm-pii-no'}`}>
                              {col.contains_pii ? 'Yes' : 'No'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="vm-schema-note">
                  <strong>No schema available yet.</strong>
                  <p style={{ margin: '0.5rem 0 0 0' }}>
                    Configure the {lookupType === 'dataset' ? 'dataset join' : 'crosswalk lookup'} in the Configuration tab to see the output schema.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!isConfigValid()}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default RdmLookupModal;
