import React, { useState, useEffect } from 'react';
import './NodeDetailDrawer.css';
import { FaTimes, FaFileContract, FaFile, FaCog, FaCalculator, FaTable, FaPlayCircle, FaExclamationTriangle, FaShieldAlt, FaLock, FaArrowRight, FaColumns, FaChevronDown, FaChevronRight, FaTag } from 'react-icons/fa';
import { fetchNodeDetails } from '../services/lineageGraphService';

const NodeDetailDrawer = ({ node, open, onClose }) => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [columnsExpanded, setColumnsExpanded] = useState(false);
  
  useEffect(() => {
    if (open && node) {
      loadDetails();
    } else {
      setDetails(null);
      setError(null);
    }
  }, [open, node]);
  
  const loadDetails = async () => {
    if (!node) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // For grouped nodes, use node.type; for regular nodes, use node.data.type
      const nodeType = node.type === 'grouped' ? 'grouped' : (node.data?.type || node.type);
      const response = await fetchNodeDetails(node.id, nodeType, node.data?.projectId);
      if (response.success) {
        setDetails(response.node.details);
      } else {
        setError(response.error || 'Failed to load node details');
      }
    } catch (err) {
      setError(err.message || 'Failed to load node details');
      console.error('Error loading node details:', err);
    } finally {
      setLoading(false);
    }
  };
  
  if (!open || !node) return null;
  
  const getIcon = () => {
    const iconProps = { size: 20 };
    switch (node.data.type) {
      case 'vendorContract':
        return <FaFileContract {...iconProps} style={{ color: '#6366F1' }} />;
      case 'sourceFile':
        return <FaFile {...iconProps} style={{ color: '#3B82F6' }} />;
      case 'transformation':
        return <FaCog {...iconProps} style={{ color: '#F59E0B' }} />;
      case 'derivedColumn':
        return <FaCalculator {...iconProps} style={{ color: '#8B5CF6' }} />;
      case 'targetTable':
        return <FaTable {...iconProps} style={{ color: '#025043' }} />;
      case 'job':
        return <FaPlayCircle {...iconProps} style={{ color: '#10B981' }} />;
      default:
        return null;
    }
  };
  
  const formatFieldLabel = (key) => {
    return key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };
  
  const formatFieldValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return new Date(value).toLocaleString();
    }
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };
  
  const renderContractDetails = () => {
    const allData = { ...node.data, ...(details || {}) };
    
    // Ordered field definitions with display label and possible key aliases
    const orderedFields = [
      { label: 'Vendor Name', aliases: ['vendor_name', 'vendorName', 'name'] },
      { label: 'Vendor Description', aliases: ['description', 'file_description', 'vendor_description', 'vendorDescription'] },
      { label: 'Vendor Type', aliases: ['vendor_type', 'vendorType'] },
      { label: 'Vendor Onboarding Date', aliases: ['vendor_onboarding_date', 'vendorOnboardingDate', 'onboarding_date', 'onboardingDate'] },
      { label: 'Approval Status', aliases: ['approval_status', 'approvalStatus'] },
      { label: 'Primary Contact Name', aliases: ['primary_contact_name', 'primaryContactName', 'primary_contact'] },
      { label: 'Primary Contact Phone', aliases: ['primary_contact_phone', 'primaryContactPhone'] },
      { label: 'Primary Contact Email', aliases: ['primary_contact_email', 'primaryContactEmail'] },
      { label: 'Secondary Contact Name', aliases: ['secondary_contact_name', 'secondaryContactName', 'secondary_contact'] },
      { label: 'Secondary Contact Phone', aliases: ['secondary_contact_phone', 'secondaryContactPhone'] },
      { label: 'Secondary Contact Email', aliases: ['secondary_contact_email', 'secondaryContactEmail'] },
      { label: 'File Count', aliases: ['file_count', 'fileCount'] }
    ];
    
    // Find first matching value for each field
    const resolvedFields = orderedFields.map(field => {
      for (const alias of field.aliases) {
        const value = allData[alias];
        if (value !== null && value !== undefined && value !== '') {
          return { label: field.label, value };
        }
      }
      return null;
    }).filter(Boolean);
    
    return (
      <section className="drawer-section">
        <h3>Details</h3>
        <div className="drawer-metadata">
          {resolvedFields.map((field, index) => (
            <div className="drawer-metadata-item" key={index}>
              <span className="drawer-metadata-key">{field.label}:</span>
              <span className="drawer-metadata-value">{formatFieldValue(field.value)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  };
  
  const renderTransformationColumnMappings = () => {
    // Parse field_mappings from backend
    let fieldMappings = details?.field_mappings || [];
    if (typeof fieldMappings === 'string') {
      try {
        fieldMappings = JSON.parse(fieldMappings);
      } catch (e) {
        fieldMappings = [];
      }
    }
    
    if (!Array.isArray(fieldMappings)) {
      fieldMappings = [];
    }
    
    // Separate regular mappings from derived columns
    const regularMappings = fieldMappings.filter(m => 
      !m.transformation_type || m.transformation_type === 'direct' || m.transformation_type === 'rename'
    );
    const derivedMappings = fieldMappings.filter(m => 
      m.transformation_type && m.transformation_type !== 'direct' && m.transformation_type !== 'rename'
    );
    
    const hasColumnMappings = regularMappings.length > 0;
    
    return (
      <>
        {/* Source to Target Column Mapping */}
        <section className="drawer-section">
          <h3><FaColumns style={{ marginRight: '8px' }} />Column Mappings</h3>
          {hasColumnMappings ? (
            <div className="column-mapping-table">
              <div className="column-mapping-header">
                <span className="column-mapping-source">Source Column</span>
                <span className="column-mapping-arrow"></span>
                <span className="column-mapping-target">Target Column</span>
                <span className="column-mapping-transform">Transformation</span>
              </div>
              {regularMappings.map((mapping, index) => (
                <div className="column-mapping-row" key={index}>
                  <span className="column-mapping-source">
                    {mapping.source_field || mapping.sourceField || '-'}
                  </span>
                  <span className="column-mapping-arrow">
                    <FaArrowRight size={12} style={{ color: '#6B7280' }} />
                  </span>
                  <span className="column-mapping-target">
                    {mapping.target_field || mapping.targetField || '-'}
                  </span>
                  <span className="column-mapping-transform">
                    {mapping.transformation_type === 'rename' ? 'Rename' : 
                     mapping.transformation_type === 'direct' ? 'Direct' : 
                     mapping.transformation_type || 'Direct'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-mappings-message">No column mappings defined</div>
          )}
        </section>
        
        {/* Derived Columns Section */}
        {derivedMappings.length > 0 && (
          <section className="drawer-section">
            <h3><FaCalculator style={{ marginRight: '8px' }} />Derived Columns</h3>
            <div className="derived-columns-table">
              {derivedMappings.map((mapping, index) => (
                <div className="derived-column-card" key={index}>
                  <div className="derived-column-header">
                    <span className="derived-column-target">{mapping.target_field || mapping.targetField}</span>
                    <span className="derived-column-type">{mapping.transformation_type}</span>
                  </div>
                  <div className="derived-column-expression">
                    <span className="derived-column-label">Expression:</span>
                    <code className="derived-column-code">{mapping.expression || mapping.formula || '-'}</code>
                  </div>
                  {(mapping.source_fields || mapping.sourceFields) && (
                    <div className="derived-column-sources">
                      <span className="derived-column-label">Source Fields:</span>
                      <span className="derived-column-source-list">
                        {Array.isArray(mapping.source_fields || mapping.sourceFields) 
                          ? (mapping.source_fields || mapping.sourceFields).join(', ')
                          : mapping.source_fields || mapping.sourceFields}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Basic Mapping Info */}
        <section className="drawer-section">
          <h3>Mapping Details</h3>
          <div className="drawer-metadata">
            {details?.source_file_pattern && (
              <div className="drawer-metadata-item">
                <span className="drawer-metadata-key">Source Pattern:</span>
                <span className="drawer-metadata-value">{details.source_file_pattern}</span>
              </div>
            )}
            {(details?.target_file_name || details?.target_table_name) && (
              <div className="drawer-metadata-item">
                <span className="drawer-metadata-key">Target:</span>
                <span className="drawer-metadata-value">{details.target_file_name || details.target_table_name}</span>
              </div>
            )}
            {details?.execution_count !== undefined && (
              <div className="drawer-metadata-item">
                <span className="drawer-metadata-key">Execution Count:</span>
                <span className="drawer-metadata-value">{details.execution_count}</span>
              </div>
            )}
            {details?.last_execution && (
              <div className="drawer-metadata-item">
                <span className="drawer-metadata-key">Last Execution:</span>
                <span className="drawer-metadata-value">{new Date(details.last_execution).toLocaleString()}</span>
              </div>
            )}
            {details?.status && (
              <div className="drawer-metadata-item">
                <span className="drawer-metadata-key">Status:</span>
                <span className="drawer-metadata-value">{details.status}</span>
              </div>
            )}
            {!details && (
              <div className="no-mappings-message">Loading mapping details...</div>
            )}
          </div>
        </section>
      </>
    );
  };
  
  const renderContent = () => {
    if (loading) {
      return <div className="drawer-loading">Loading details...</div>;
    }
    
    if (error) {
      return <div className="drawer-error">{error}</div>;
    }
    
    const isContract = node.data?.type === 'vendorContract';
    const isFile = node.data?.type === 'sourceFile';
    const isTransformation = node.data?.type === 'transformation';
    
    return (
      <div className="drawer-content">
        {/* For contracts: single Details section with filtered fields */}
        {/* For transformations: column mapping visualization */}
        {/* For other nodes: standard Metadata section */}
        {isContract ? (
          renderContractDetails()
        ) : isTransformation ? (
          renderTransformationColumnMappings()
        ) : (
          <section className="drawer-section">
            <h3>Details</h3>
            <div className="drawer-metadata">
              {Object.entries(node.data).map(([key, value]) => {
                // Skip internal fields and PII fields (shown in dedicated section)
                if (['label', 'type', 'incidents', 'hasIncidents', 'derivedColumns', 'containsPii', 'dataClassification', 'piiColumns', 'sourcePosition', 'targetPosition'].includes(key)) {
                  return null;
                }
                
                // Format value
                let displayValue = value;
                if (value === null || value === undefined) {
                  return null;
                }
                if (typeof value === 'boolean') {
                  displayValue = value ? 'Yes' : 'No';
                }
                if (value instanceof Date) {
                  displayValue = value.toLocaleString();
                }
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                  displayValue = new Date(value).toLocaleString();
                }
                
                return (
                  <div className="drawer-metadata-item" key={key}>
                    <span className="drawer-metadata-key">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                    </span>
                    <span className="drawer-metadata-value">{String(displayValue)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        
        {/* PII & Data Classification */}
        {(node.data.type === 'sourceFile' || node.data.type === 'targetTable') && (
          <section className="drawer-section">
            <h3>Data Governance</h3>
            <div className="drawer-governance">
              <div className="drawer-governance-item">
                <span className="drawer-governance-label">
                  <FaShieldAlt style={{ color: node.data.containsPii ? '#7C3AED' : '#9CA3AF' }} />
                  Contains PII:
                </span>
                <span className={`drawer-governance-value ${node.data.containsPii ? 'drawer-governance-yes' : 'drawer-governance-no'}`}>
                  {node.data.containsPii ? 'Yes' : 'No'}
                </span>
              </div>
              
              {node.data.dataClassification && (
                <div className="drawer-governance-item">
                  <span className="drawer-governance-label">
                    <FaLock style={{ color: '#6B7280' }} />
                    Classification:
                  </span>
                  <span className={`drawer-governance-classification drawer-governance-classification-${node.data.dataClassification.toLowerCase()}`}>
                    {node.data.dataClassification}
                  </span>
                </div>
              )}
              
              {node.data.piiColumns && node.data.piiColumns.length > 0 && (
                <div className="drawer-governance-item drawer-governance-columns">
                  <span className="drawer-governance-label">
                    <FaShieldAlt style={{ color: '#7C3AED' }} />
                    PII Columns ({node.data.piiColumns.length}):
                  </span>
                  <div className="drawer-pii-columns-list">
                    {node.data.piiColumns.map((col, index) => (
                      <span key={index} className="drawer-pii-column-badge">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
        
        {/* Collapsible Columns Section for source/target files */}
        {(isFile || node.data?.type === 'targetFile') && details?.columns && details.columns.length > 0 && (
          <section className="drawer-section">
            <h3 
              className="drawer-section-collapsible"
              onClick={() => setColumnsExpanded(!columnsExpanded)}
            >
              {columnsExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
              <FaColumns style={{ marginLeft: '6px', marginRight: '8px' }} />
              Columns ({details.columns.length})
            </h3>
            {columnsExpanded && (
              <div className="drawer-columns-list">
                {details.columns.map((col, index) => {
                  const isPii = col.governance_tags?.includes('tag_pii');
                  const hasTags = col.governance_tags && col.governance_tags.length > 0;
                  return (
                    <div className={`drawer-column-item ${isPii ? 'drawer-column-pii' : ''}`} key={index}>
                      <div className="drawer-column-header">
                        <span className="drawer-column-name">{col.column_name}</span>
                        <span className="drawer-column-type">{col.column_type || 'unknown'}</span>
                      </div>
                      <div className="drawer-column-meta">
                        {col.unique_count !== null && col.unique_count !== undefined && (
                          <span className="drawer-column-stat">Unique: {col.unique_count}</span>
                        )}
                        {col.null_count !== null && col.null_count !== undefined && (
                          <span className="drawer-column-stat">Nulls: {col.null_count}</span>
                        )}
                        {col.min_value && (
                          <span className="drawer-column-stat">Min: {col.min_value}</span>
                        )}
                        {col.max_value && (
                          <span className="drawer-column-stat">Max: {col.max_value}</span>
                        )}
                      </div>
                      {hasTags && (
                        <div className="drawer-column-tags">
                          {col.governance_tags.map((tag, tagIndex) => (
                            <span 
                              key={tagIndex} 
                              className={`drawer-column-tag ${tag === 'tag_pii' ? 'drawer-column-tag-pii' : ''}`}
                            >
                              <FaTag size={8} />
                              {tag.replace('tag_', '').toUpperCase()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
        
        {/* Derived Columns - skip for transformation nodes (shown in column mappings) */}
        {node.data.derivedColumns && node.data.derivedColumns.length > 0 && !isTransformation && (
          <section className="drawer-section">
            <h3>Derived Columns ({node.data.derivedColumns.length})</h3>
            <div className="drawer-derived-columns">
              {node.data.derivedColumns.map((col, index) => (
                <div className="drawer-derived-column" key={index}>
                  <div className="drawer-derived-column-name">
                    <FaCalculator size={12} style={{ color: '#8B5CF6' }} />
                    {col.target_field}
                  </div>
                  <div className="drawer-derived-column-expression">
                    {col.expression}
                  </div>
                  <div className="drawer-derived-column-meta">
                    Type: {col.transformation_type} | 
                    Sources: {col.source_fields.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Incidents */}
        {node.data.hasIncidents && node.data.incidents && (
          <section className="drawer-section">
            <h3>Quality Incidents</h3>
            <div className="drawer-incidents-summary">
              <div className="drawer-incident-stat drawer-incident-critical">
                <FaExclamationTriangle />
                <div>
                  <div className="drawer-incident-stat-value">{node.data.incidents.criticalCount}</div>
                  <div className="drawer-incident-stat-label">Critical</div>
                </div>
              </div>
              <div className="drawer-incident-stat drawer-incident-warning">
                <FaExclamationTriangle />
                <div>
                  <div className="drawer-incident-stat-value">{node.data.incidents.warningCount}</div>
                  <div className="drawer-incident-stat-label">Warnings</div>
                </div>
              </div>
              <div className="drawer-incident-stat">
                <div>
                  <div className="drawer-incident-stat-value">{node.data.incidents.totalViolations}</div>
                  <div className="drawer-incident-stat-label">Total</div>
                </div>
              </div>
            </div>
            
            <div className="drawer-incidents-list">
              {node.data.incidents.violations.map((violation, index) => (
                <div className="drawer-incident-item" key={index}>
                  <div className={`drawer-incident-severity drawer-incident-severity-${violation.severity}`}>
                    {violation.severity}
                  </div>
                  <div className="drawer-incident-details">
                    <div className="drawer-incident-rule">{violation.ruleName}</div>
                    <div className="drawer-incident-type">{violation.ruleType}</div>
                    <div className="drawer-incident-count">{violation.count} violations</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Extended Details from Backend - skip for contracts, files, and transformations */}
        {details && !isContract && !isFile && !isTransformation && (
          <section className="drawer-section">
            <h3>Extended Information</h3>
            <div className="drawer-metadata">
              {Object.entries(details).map(([key, value]) => {
                if (value === null || value === undefined || key === 'id') {
                  return null;
                }
                
                let displayValue = value;
                if (typeof value === 'object') {
                  displayValue = JSON.stringify(value, null, 2);
                }
                if (typeof value === 'boolean') {
                  displayValue = value ? 'Yes' : 'No';
                }
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                  displayValue = new Date(value).toLocaleString();
                }
                
                return (
                  <div className="drawer-metadata-item" key={key}>
                    <span className="drawer-metadata-key">
                      {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                    </span>
                    <span className="drawer-metadata-value">{String(displayValue)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  };
  
  return (
    <div className={`node-detail-drawer ${open ? 'open' : ''}`}>
      <div className="drawer-overlay" onClick={onClose}></div>
      <div className="drawer-panel">
        <div className="drawer-header">
          <div className="drawer-title">
            {getIcon()}
            <div>
              <div className="drawer-title-main">{node.data.label}</div>
              <div className="drawer-title-sub">{node.data.type}</div>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        
        {renderContent()}
      </div>
    </div>
  );
};

export default NodeDetailDrawer;
