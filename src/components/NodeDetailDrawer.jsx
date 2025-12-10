import React, { useState, useEffect } from 'react';
import './NodeDetailDrawer.css';
import { FaTimes, FaFileContract, FaFile, FaCog, FaCalculator, FaTable, FaPlayCircle, FaExclamationTriangle, FaShieldAlt, FaLock } from 'react-icons/fa';
import { fetchNodeDetails } from '../services/lineageGraphService';

const NodeDetailDrawer = ({ node, open, onClose }) => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
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
  
  const renderContent = () => {
    if (loading) {
      return <div className="drawer-loading">Loading details...</div>;
    }
    
    if (error) {
      return <div className="drawer-error">{error}</div>;
    }
    
    const isContract = node.data?.type === 'vendorContract';
    
    return (
      <div className="drawer-content">
        {/* For contracts: single Details section with filtered fields */}
        {/* For other nodes: standard Metadata section */}
        {isContract ? (
          renderContractDetails()
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
        
        {/* Derived Columns */}
        {node.data.derivedColumns && node.data.derivedColumns.length > 0 && (
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
        
        {/* Extended Details from Backend - skip for contracts (already merged into Details) */}
        {details && !isContract && (
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
