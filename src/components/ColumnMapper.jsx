import React, { useState } from 'react';
import { FiPlus, FiTrash2, FiMove, FiEdit2 } from 'react-icons/fi';

const ColumnMapper = ({
  sourceColumns = [],
  existingTargetColumns = [],
  mappings = [],
  onMappingsChange,
  sourceLabel = "Available Columns",
  targetLabel = "Target Columns",
  allowRename = true
}) => {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleAddMapping = (sourceColumn) => {
    const newMapping = {
      sourceColumn: sourceColumn.name,
      targetColumn: sourceColumn.name,
      dataType: sourceColumn.type || 'string'
    };
    onMappingsChange([...mappings, newMapping]);
  };

  const handleRemoveMapping = (index) => {
    const newMappings = mappings.filter((_, i) => i !== index);
    onMappingsChange(newMappings);
  };

  const handleRenameStart = (index, currentName) => {
    setEditingIndex(index);
    setEditValue(currentName);
  };

  const handleRenameSave = (index) => {
    const newMappings = [...mappings];
    newMappings[index].targetColumn = editValue;
    onMappingsChange(newMappings);
    setEditingIndex(null);
  };

  const handleRenameCancel = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const isMapped = (columnName) => {
    return mappings.some(m => m.sourceColumn === columnName);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Source Columns */}
      <div>
        <h4 style={{ 
          margin: 0, 
          marginBottom: '1rem', 
          fontSize: '0.9375rem', 
          fontWeight: '600',
          color: '#374151'
        }}>
          {sourceLabel}
        </h4>
        <div style={{ 
          border: '1px solid #e5e7eb', 
          borderRadius: '6px',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          {sourceColumns.length === 0 ? (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center', 
              color: '#9ca3af',
              fontSize: '0.875rem'
            }}>
              No columns available
            </div>
          ) : (
            sourceColumns.map((col, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderBottom: idx < sourceColumns.length - 1 ? '1px solid #f3f4f6' : 'none',
                  backgroundColor: isMapped(col.name) ? '#f9fafb' : 'white',
                  transition: 'background-color 0.2s'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '500', color: '#111827', fontSize: '0.875rem' }}>
                    {col.name}
                  </div>
                  {col.type && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                      {col.type}
                    </div>
                  )}
                </div>
                {!isMapped(col.name) ? (
                  <button
                    onClick={() => handleAddMapping(col)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: 'hsl(210, 100%, 50%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'hsl(210, 100%, 45%)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'hsl(210, 100%, 50%)'}
                  >
                    <FiPlus size={12} /> Add
                  </button>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '500' }}>
                    Added
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Target Columns */}
      <div>
        <h4 style={{ 
          margin: 0, 
          marginBottom: '1rem', 
          fontSize: '0.9375rem', 
          fontWeight: '600',
          color: '#374151'
        }}>
          {targetLabel}
        </h4>
        <div style={{ 
          border: '1px solid #e5e7eb', 
          borderRadius: '6px',
          minHeight: '200px',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          {/* Existing columns from previous steps (read-only) */}
          {existingTargetColumns.length > 0 && (
            <div style={{ 
              backgroundColor: '#f9fafb',
              borderBottom: '2px solid #e5e7eb'
            }}>
              <div style={{ 
                padding: '0.5rem 1rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                From Previous Steps
              </div>
              {existingTargetColumns.map((col, idx) => (
                <div
                  key={`existing-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: '#fafafa'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', color: '#6b7280', fontSize: '0.875rem' }}>
                      {col.name}
                    </div>
                    {col.type && (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                        {col.type}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Existing
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* New mapped columns (editable) */}
          {mappings.length > 0 && (
            <div>
              {existingTargetColumns.length > 0 && (
                <div style={{ 
                  padding: '0.5rem 1rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: 'white',
                  borderBottom: '1px solid #f3f4f6'
                }}>
                  New Columns
                </div>
              )}
              {mappings.map((mapping, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderBottom: idx < mappings.length - 1 ? '1px solid #f3f4f6' : 'none',
                    backgroundColor: 'white'
                  }}
                >
                  <div style={{ flex: 1, marginRight: '0.5rem' }}>
                    {editingIndex === idx ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleRenameSave(idx)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSave(idx);
                          if (e.key === 'Escape') handleRenameCancel();
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '0.25rem 0.5rem',
                          border: '1px solid hsl(210, 100%, 50%)',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          outline: 'none'
                        }}
                      />
                    ) : (
                      <>
                        <div style={{ 
                          fontWeight: '500', 
                          color: '#111827', 
                          fontSize: '0.875rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          {mapping.targetColumn}
                          {allowRename && (
                            <button
                              onClick={() => handleRenameStart(idx, mapping.targetColumn)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '0.125rem',
                                cursor: 'pointer',
                                color: '#6b7280',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Rename column"
                            >
                              <FiEdit2 size={12} />
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                          from: {mapping.sourceColumn}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveMapping(idx)}
                    style={{
                      padding: '0.25rem',
                      backgroundColor: 'transparent',
                      color: '#ef4444',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#fee2e2'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                    title="Remove column"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {mappings.length === 0 && existingTargetColumns.length === 0 && (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center', 
              color: '#9ca3af',
              fontSize: '0.875rem'
            }}>
              <FiMove style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }} />
              <div>No columns mapped yet</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Click "Add" on source columns to map them
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ColumnMapper;
