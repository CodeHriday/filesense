import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import TableBasedMapper from '../TableBasedMapper';
import './MappingConfigModal.css';

const toTitleCase = (str) => {
  if (!str) return str;
  return str.toLowerCase().split(/[\s_]+/).map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

const formatTypeWithPrecision = (type, precision, scale) => {
  const baseType = toTitleCase(type || 'String');
  if (precision && scale !== null && scale !== undefined) {
    return `${baseType}(${precision},${scale})`;
  } else if (precision) {
    return `${baseType}(${precision})`;
  }
  return baseType;
};

const ExpressionModal = ({ isOpen, onClose, onSave, initialConfig = {}, schema = [], agreementFileQualityRules = [], agreementQualityRuleIds = [] }) => {
  const [name, setName] = useState(initialConfig.name || '');
  const [description, setDescription] = useState(initialConfig.description || '');
  const [fieldMappings, setFieldMappings] = useState(initialConfig.fieldMappings || []);
  const [variables, setVariables] = useState(initialConfig.variables || []);
  const [piiColumns, setPiiColumns] = useState(initialConfig.piiColumns || []);
  const [dqRuleAssignments, setDqRuleAssignments] = useState(initialConfig.dqRuleAssignments || {});
  const [validationError, setValidationError] = useState(null);
  const [activeTab, setActiveTab] = useState('mappings');
  
  useEffect(() => {
    if (isOpen) {
      setName(initialConfig.name || '');
      setDescription(initialConfig.description || '');
      setFieldMappings(initialConfig.fieldMappings || []);
      setVariables(initialConfig.variables || []);
      setPiiColumns(initialConfig.piiColumns || []);
      setDqRuleAssignments(initialConfig.dqRuleAssignments || {});
      setValidationError(null);
      setActiveTab('mappings');
    }
  }, [isOpen, initialConfig]);

  // Auto-populate dqRuleAssignments from the agreement's schema on first open.
  // Guard: fires only when dqRuleAssignments was never explicitly saved (key absent from
  // initialConfig). If the user cleared assignments and saved (value = {}), the key IS
  // present and we skip — respecting the user's choice.
  useEffect(() => {
    if (!isOpen) return;
    if (initialConfig.dqRuleAssignments !== undefined && initialConfig.dqRuleAssignments !== null) return;

    const columnsWithRules = schema.filter(col => col.quality_rules && col.quality_rules.length > 0);
    const hasFileRules = agreementFileQualityRules && agreementFileQualityRules.length > 0;
    const hasFileRuleIds = agreementQualityRuleIds && agreementQualityRuleIds.length > 0;
    if (columnsWithRules.length === 0 && !hasFileRules && !hasFileRuleIds) return;

    const autoPopulate = async () => {
      try {
        // Paginate through the full quality-rules catalogue so we never miss a rule
        // that sits beyond any fixed-size first page (API is ordered by created_at DESC).
        const allRules = [];
        const PAGE_SIZE = 500;
        let offset = 0;
        while (true) {
          const page = await axios.get(`/api/quality-rules?limit=${PAGE_SIZE}&offset=${offset}`);
          const rows = page.data?.rules || [];
          allRules.push(...rows);
          if (!page.data?.pagination?.hasMore) break;
          offset += PAGE_SIZE;
        }

        // Resolve an array of quality rule references to dqRuleAssignment objects.
        // Each ref may be:
        //   - an object:  { rule_name, rule_type }   (new schema format)
        //   - a string:   "date_format"               (legacy / template format)
        // Strings are tried as rule_name first, then rule_type.
        const resolveRules = (qualityRuleRefs) => {
          const matched = [];
          for (const qr of qualityRuleRefs) {
            const isString = typeof qr === 'string';
            const refName = isString ? qr : qr.rule_name;
            const refType = isString ? qr : qr.rule_type;
            let rule = refName ? allRules.find(r => r.rule_name === refName) : null;
            if (!rule && refType) {
              rule = allRules.find(r => r.rule_type === refType);
            }
            if (rule) {
              matched.push({ ruleId: rule.id, errorAction: 'log_continue', applyTo: 'etl_job' });
            }
          }
          return matched;
        };

        const assignments = {};

        // Column-level rules
        for (const col of columnsWithRules) {
          const matched = resolveRules(col.quality_rules);
          if (matched.length > 0) {
            assignments[col.name] = matched;
          }
        }

        // File-level rules stored under the __file__ pseudo-key.
        // Primary: resolve by name/type from agreementFileQualityRules.
        // Fallback: use pre-resolved agreementQualityRuleIds directly when
        //   agreementFileQualityRules is absent or yields no matches.
        if (hasFileRules) {
          const fileMatched = resolveRules(agreementFileQualityRules);
          if (fileMatched.length > 0) {
            assignments['__file__'] = fileMatched;
          } else if (hasFileRuleIds) {
            // Name resolution found nothing; fall back to the DB IDs saved on the schema
            assignments['__file__'] = agreementQualityRuleIds.map(id => ({
              ruleId: id, errorAction: 'log_continue', applyTo: 'etl_job'
            }));
          }
        } else if (hasFileRuleIds) {
          // No rule-object array, but we have pre-resolved IDs — use them directly
          assignments['__file__'] = agreementQualityRuleIds.map(id => ({
            ruleId: id, errorAction: 'log_continue', applyTo: 'etl_job'
          }));
        }

        if (Object.keys(assignments).length > 0) {
          console.log('[ExpressionModal] Auto-populated DQ assignments from agreement:', assignments);
          setDqRuleAssignments(assignments);
        }
      } catch (err) {
        console.error('[ExpressionModal] Auto-populate DQ rules failed:', err);
      }
    };

    autoPopulate();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: runs on open only

  const outputSchema = useMemo(() => {
    return fieldMappings
      .filter(mapping => mapping.include !== false)
      .map(mapping => {
        const targetField = mapping.target_field || mapping.targetField || '';
        const dataType = mapping.data_type || mapping.dataType || mapping.type || mapping.column_type || 'STRING';
        const precision = mapping.precision ?? null;
        const scale = mapping.scale ?? null;
        const nullable = mapping.nullable ?? true;
        const isPII = piiColumns.includes(targetField);
        const dqRules = dqRuleAssignments[targetField] || [];
        return {
          name: targetField,
          type: dataType,
          precision: precision,
          scale: scale,
          nullable: nullable,
          pii: isPII,
          dqRules: dqRules,
          dqStatus: null,
          include: true
        };
      });
  }, [fieldMappings, piiColumns, dqRuleAssignments]);
  
  const handleSave = () => {
    if (!name.trim()) {
      setValidationError('Please enter a name for this expression configuration');
      return;
    }
    
    const config = {
      name,
      description,
      fieldMappings,
      variables,
      piiColumns,
      dqRuleAssignments,
      mappingCount: fieldMappings.filter(m => m.include !== false).length,
      variableCount: variables.length,
      dqRuleCount: Object.keys(dqRuleAssignments).length,
      outputSchema: fieldMappings
        .filter(m => m.include !== false)
        .map(m => ({
          name: m.target_field || m.targetField || '',
          type: m.data_type || m.type || m.column_type || 'STRING',
          precision: m.precision ?? null,
          scale: m.scale ?? null,
          nullable: m.nullable ?? true,
          pii: piiColumns.includes(m.target_field || m.targetField || ''),
          dqRules: dqRuleAssignments[m.target_field || m.targetField || ''] || [],
          include: true
        }))
    };
    onSave(config);
    onClose();
  };
  
  const handleMappingsChange = (mappings, vars, pii, dqAssignments) => {
    setFieldMappings(mappings);
    setVariables(vars || []);
    setPiiColumns(pii || []);
    setDqRuleAssignments(dqAssignments || {});
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay">
      <div className="vm-modal vm-modal-fullscreen">
        <div className="vm-modal-header">
          <h2>Expression Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>

        <div className="vm-tabs">
          <button
            className={`vm-tab ${activeTab === 'mappings' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('mappings')}
          >
            Mappings
          </button>
          <button
            className={`vm-tab ${activeTab === 'schema' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('schema')}
          >
            Output Schema
          </button>
        </div>
        
        <div className="vm-modal-body vm-modal-body-scroll">
          {activeTab === 'mappings' && (
            <>
              {validationError && (
                <div style={{ 
                  padding: '8px 12px', 
                  marginBottom: '12px', 
                  backgroundColor: '#fef2f2', 
                  border: '1px solid #fecaca', 
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ color: '#dc2626', fontSize: '10px', fontFamily: 'Inter, sans-serif' }}>
                    {validationError}
                  </span>
                  <button 
                    onClick={() => setValidationError(null)} 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#dc2626', 
                      cursor: 'pointer',
                      fontSize: '14px',
                      lineHeight: 1,
                      padding: '0 4px'
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                <div className="vm-form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="expression-name">Name *</label>
                  <input
                    id="expression-name"
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setValidationError(null); }}
                    placeholder="Enter a name for this expression configuration"
                    className="vm-input"
                    style={validationError && !name.trim() ? { borderColor: '#dc2626' } : {}}
                  />
                </div>
                
                <div className="vm-form-group" style={{ flex: 2, marginBottom: 0 }}>
                  <label htmlFor="expression-description">Description</label>
                  <input
                    id="expression-description"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    className="vm-input"
                  />
                </div>
              </div>
              
              <TableBasedMapper
                schema={schema}
                fieldMappings={fieldMappings}
                variables={variables}
                piiColumns={piiColumns}
                dqRuleAssignments={dqRuleAssignments}
                onMappingsChange={handleMappingsChange}
              />
            </>
          )}

          {activeTab === 'schema' && (
            <div className="vm-schema-container">
              <div className="vm-schema-meta">
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Total Output Columns:</span>
                  <span className="vm-schema-value">{outputSchema.length}</span>
                </div>
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">PII Columns:</span>
                  <span className="vm-schema-value">{piiColumns.length}</span>
                </div>
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Columns with DQ Rules:</span>
                  <span className="vm-schema-value">{Object.keys(dqRuleAssignments).length}</span>
                </div>
              </div>

              <div className="vm-schema-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="vm-schema-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Column Name</th>
                      <th>Data Type</th>
                      <th>Nullable</th>
                      <th>PII</th>
                      <th>DQ Rules</th>
                      <th>DQ Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputSchema.length > 0 ? (
                      outputSchema.map((col, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                          <td className="vm-schema-col-name">{col.name}</td>
                          <td className="vm-schema-col-type">{formatTypeWithPrecision(col.type, col.precision, col.scale)}</td>
                          <td className="vm-schema-col-nullable">
                            <span className={`vm-nullable-badge ${col.nullable ? 'vm-nullable-yes' : 'vm-nullable-no'}`}>
                              {col.nullable ? 'YES' : 'NO'}
                            </span>
                          </td>
                          <td className="vm-schema-col-pii">
                            <span className={`vm-pii-badge ${col.pii ? 'vm-pii-yes' : 'vm-pii-no'}`}>
                              {col.pii ? 'YES' : 'NO'}
                            </span>
                          </td>
                          <td>
                            {col.dqRules.length > 0 ? (
                              <span style={{ fontSize: '9px', color: '#6b7280' }}>
                                {col.dqRules.map(r => r.name || r.rule_type || `Rule ${r.ruleId}`).join(', ')}
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            {col.dqStatus === 'passed' && (
                              <span style={{ color: '#16a34a', fontSize: '9px', fontWeight: 500 }}>Passed</span>
                            )}
                            {col.dqStatus === 'failed' && (
                              <span style={{ color: '#dc2626', fontSize: '9px', fontWeight: 500 }}>Failed</span>
                            )}
                            {!col.dqStatus && '—'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                          No mappings defined yet. Go to Mappings tab to add columns.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="vm-schema-note">
                <strong>Note:</strong> This tab shows a read-only summary of the output schema based on your mappings. 
                To modify data types, PII settings, or DQ rules, use the Mappings tab.
              </div>
            </div>
          )}
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="vm-btn vm-btn-primary">
            Save Configuration ({fieldMappings.length} mappings)
          </button>
        </div>
      </div>
    </div>
  );
};
ExpressionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  agreementFileQualityRules: PropTypes.array,
  agreementQualityRuleIds: PropTypes.array,

  initialConfig: PropTypes.shape({
    name: PropTypes.string,
    description: PropTypes.string,
    fieldMappings: PropTypes.array,
    variables: PropTypes.array,
    piiColumns: PropTypes.array,
    dqRuleAssignments: PropTypes.object
  }),

  schema: PropTypes.array
};

export default ExpressionModal;
