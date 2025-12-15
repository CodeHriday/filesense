import React from 'react';
import { FiX, FiFileText, FiArrowRight, FiDatabase, FiCode, FiShield } from 'react-icons/fi';
import './TransformationDetailsPanel.css';
import PropTypes from 'prop-types';


/**
 * TransformationDetailsPanel
 * Displays detailed information about a lineage record (manual or transformation)
 */
function TransformationDetailsPanel({ transformationData, onClose }) {
  if (!transformationData) return null;

  // Check if this is transformation lineage or manual lineage
  const isTransformationLineage = transformationData.type === 'transformation';

  const {
    mapping_name,
    description,
    source_filename,
    source_file_type,
    source_file_size,
    source_row_count,
    source_column_count,
    source_created_at,
    source_owner,
    source_path,
    target_filename,
    target_file_type,
    target_file_size,
    target_row_count,
    target_column_count,
    target_created_at,
    target_owner,
    target_path,
    field_mappings,
    variables,
    source_pattern,
    target_pattern,
    source_file_pattern,
    target_file_name,
    target_file_format,
    agreement_name,
    column_mappings
  } = transformationData;

  // Helper function to remove job prefix from transformed filenames
  const cleanTransformedFilename = (filename) => {
    if (!filename) return filename;
    return filename.replace(/^transformed_JOB-[0-9]+-[a-f0-9]+_/, '');
  };

  // For transformation lineage, use connection-based metadata
  // Path comes from connection config, filename from pattern/mapping
  const sourceInfo = {
    path: source_path || '',
    filename: isTransformationLineage 
      ? (source_pattern || source_file_pattern || source_filename)
      : source_filename
  };
  
  const targetInfo = {
    path: target_path || '',
    filename: isTransformationLineage 
      ? cleanTransformedFilename(target_file_name || target_filename)
      : target_filename
  };
  
  // Use file types from backend (connection config or mapping)
  const displaySourceType = source_file_type || 'N/A';
  const displayTargetType = target_file_type || 'N/A';

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString();
  };

  // Parse field mappings and variables if they're strings
  const parsedFieldMappings = field_mappings 
    ? (typeof field_mappings === 'string' ? JSON.parse(field_mappings) : field_mappings)
    : [];
  
  const parsedVariables = variables
    ? (typeof variables === 'string' ? JSON.parse(variables) : variables)
    : [];
  
  // Parse column mappings for PII information
  const parsedColumnMappings = column_mappings
    ? (typeof column_mappings === 'string' ? JSON.parse(column_mappings) : column_mappings)
    : [];
  
  // Create a map of target column -> PII info for quick lookup
  const piiColumnMap = new Map();
  if (Array.isArray(parsedColumnMappings)) {
    parsedColumnMappings.forEach(cm => {
      if (cm.contains_pii && cm.target_column) {
        piiColumnMap.set(cm.target_column, {
          pii_type: cm.pii_type || 'PII',
          transformation_applied: cm.transformation_applied
        });
      }
    });
  }

  // Extract expression from variable
  const getVariableExpression = (variable) => {
    if (variable.expression) {
      return variable.expression;
    }
    
    // Legacy format: build expression from transformations
    if (variable.transformations && variable.transformations.length > 0) {
      const trans = variable.transformations[0];
      if (trans.type && trans.params) {
        // Simple reconstruction - may not be perfect for complex cases
        return `${trans.type}(...)`;
      }
    }
    
    return variable.sourceFields?.join(', ') || 'N/A';
  };

  // Extract source fields from mapping
  const getMappingSourceFields = (mapping) => {
    if (mapping.expression) {
      // Extract field names from expression (simple parsing)
      const fieldMatches = mapping.expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      return fieldMatches.filter(f => !['concat', 'add', 'multiply', 'subtract', 'divide', 'upper', 'lower', 'trim', 'round', 'floor', 'ceil'].includes(f.toLowerCase()));
    }
    // Handle both snake_case (source_field) and camelCase (sourceFields) for backwards compatibility
    const sourceField = mapping.source_field || mapping.sourceFields;
    return sourceField ? [sourceField] : [];
  };

  return (
    <div className="transformation-details-overlay" onClick={onClose}>
      <div className="transformation-details-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>
            {isTransformationLineage 
              ? (mapping_name || 'Transformation Details')
              : 'File Lineage Details'
            }
          </h2>
          <button className="close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="panel-content">
          {description && (
            <div className="section">
              <h3>Description</h3>
              <p className="description-text">{description}</p>
            </div>
          )}

          {/* Source and Target File Metadata */}
          <div className="section">
            <h3>File Lineage</h3>
            <div className="file-flow">
              <div className="file-metadata-card source">
                <div className="file-header">
                  <FiFileText size={16} />
                  <span className="file-label">Source File</span>
                </div>
                <div className="file-details">
                  <div className="file-stats">
                    <span className="stat"><strong>Path:</strong> {sourceInfo.path || '-'}</span>
                    <span className="stat"><strong>Filename:</strong> {sourceInfo.filename || 'N/A'}</span>
                    <span className="stat"><strong>Type:</strong> {displaySourceType?.toUpperCase() || 'N/A'}</span>
                    {agreement_name && (
                      <span className="stat"><strong>Agreement:</strong> {agreement_name}</span>
                    )}
                    <span className="stat"><strong>Owner:</strong> {source_owner || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="arrow-connector">
                <FiArrowRight size={24} />
              </div>

              <div className="file-metadata-card target">
                <div className="file-header">
                  <FiDatabase size={16} />
                  <span className="file-label">Target File</span>
                </div>
                <div className="file-details">
                  <div className="file-stats">
                    <span className="stat"><strong>Path:</strong> {targetInfo.path || '-'}</span>
                    <span className="stat"><strong>Filename:</strong> {targetInfo.filename || 'N/A'}</span>
                    <span className="stat"><strong>Type:</strong> {displayTargetType?.toUpperCase() || 'N/A'}</span>
                    <span className="stat"><strong>Owner:</strong> {target_owner || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Only show field mappings and variables for transformation lineage */}
          {isTransformationLineage && (
            <>
              {/* Derived Fields (Variables) */}
              {parsedVariables && parsedVariables.length > 0 && (
                <div className="section">
                  <h3><FiCode /> Derived Fields ({parsedVariables.length})</h3>
                  <div className="derived-fields-list">
                    {parsedVariables.map((variable, index) => (
                      <div key={index} className="derived-field-item">
                        <div className="field-sequence">{variable.sequence !== undefined ? variable.sequence + 1 : index + 1}</div>
                        <div className="field-info">
                          <div className="field-name">${variable.name}</div>
                          <div className="field-expression">
                            <code>{getVariableExpression(variable)}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="help-text">
                    Variables are calculated sequentially before field mappings and can reference source fields or previous variables.
                  </p>
                </div>
              )}

              {/* Field Mappings */}
              {parsedFieldMappings && parsedFieldMappings.length > 0 && (
                <div className="section">
                  <h3>Field Mappings ({parsedFieldMappings.length})</h3>
                  <div className="field-mappings-list">
                    {parsedFieldMappings.map((mapping, index) => {
                      const sourceFields = getMappingSourceFields(mapping);
                      const hasExpression = mapping.expression || (mapping.transformations && mapping.transformations.length > 0);
                      const targetFieldName = mapping.target_field || mapping.targetField;
                      const piiInfo = piiColumnMap.get(targetFieldName);
                      
                      return (
                        <div key={index} className="field-mapping-item">
                          <div className="mapping-source">
                            {sourceFields.length > 0 ? (
                              sourceFields.map((field, idx) => (
                                <span key={idx} className="source-field">
                                  {field.startsWith('$') ? (
                                    <span className="variable-ref">{field}</span>
                                  ) : (
                                    field
                                  )}
                                </span>
                              ))
                            ) : (
                              <span className="no-source">-</span>
                            )}
                          </div>
                          <div className="mapping-arrow">
                            <FiArrowRight />
                          </div>
                          <div className="mapping-target">
                            <span className="target-field">
                              {targetFieldName}
                              {piiInfo && (
                                <span 
                                  className="pii-field-badge"
                                  title={`Contains PII: ${piiInfo.pii_type}${piiInfo.transformation_applied ? ` (${piiInfo.transformation_applied})` : ''}`}
                                >
                                  <FiShield className="pii-shield-icon" />
                                  {piiInfo.pii_type}
                                </span>
                              )}
                            </span>
                            {hasExpression && (
                              <div className="transformation-badge">
                                <FiCode size={12} />
                                <span className="expression-preview">
                                  {mapping.expression || 'transformed'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Show message for manual lineage */}
          {!isTransformationLineage && (
            <div className="section">
              <p className="help-text" style={{ marginTop: 0 }}>
                This is a direct file lineage record without transformation details. The source file was used to create the target file without field-level transformations.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
TransformationDetailsPanel.propTypes = {
  onClose: PropTypes.func.isRequired,

  transformationData: PropTypes.shape({
    type: PropTypes.string,

    mapping_name: PropTypes.string,
    description: PropTypes.string,

    // Source file info
    source_filename: PropTypes.string,
    source_file_type: PropTypes.string,
    source_file_size: PropTypes.number,
    source_row_count: PropTypes.number,
    source_column_count: PropTypes.number,
    source_created_at: PropTypes.string,
    source_owner: PropTypes.string,
    source_path: PropTypes.string,

    // Target file info
    target_filename: PropTypes.string,
    target_file_type: PropTypes.string,
    target_file_size: PropTypes.number,
    target_row_count: PropTypes.number,
    target_column_count: PropTypes.number,
    target_created_at: PropTypes.string,
    target_owner: PropTypes.string,
    target_path: PropTypes.string,

    // Transformation metadata
    source_pattern: PropTypes.string,
    target_pattern: PropTypes.string,
    source_file_pattern: PropTypes.string,
    target_file_name: PropTypes.string,
    target_file_format: PropTypes.string,
    agreement_name: PropTypes.string,

    // Mappings & variables (can be array or JSON string)
    field_mappings: PropTypes.oneOfType([
      PropTypes.array,
      PropTypes.string
    ]),
    variables: PropTypes.oneOfType([
      PropTypes.array,
      PropTypes.string
    ]),
    column_mappings: PropTypes.oneOfType([
      PropTypes.array,
      PropTypes.string
    ])
  })
};

export default TransformationDetailsPanel;
