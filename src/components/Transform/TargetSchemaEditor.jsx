import React, { useState } from 'react';
import { FiSettings, FiDatabase, FiEdit2, FiSave, FiRefreshCw } from 'react-icons/fi';
import './Transform.css';
import PropTypes from 'prop-types';


/**
 * Target Schema Editor component for configuring target connection settings
 */
const TargetSchemaEditor = ({ connection, schema, onSchemaChange }) => {
  const [settings, setSettings] = useState({
    tableName: 'transformed_data',
    writeMode: 'overwrite', // overwrite, append, upsert
    createTable: true,
    primaryKey: '',
    indexColumns: [],
    partitionBy: '',
    batchSize: 1000
  });

  const [advancedSettings, setAdvancedSettings] = useState(false);

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSchemaColumnUpdate = (columnIndex, field, value) => {
    const updatedSchema = schema.map((col, index) => 
      index === columnIndex ? { ...col, [field]: value } : col
    );
    onSchemaChange(updatedSchema);
  };

  // Helper to determine if connection is a database (not cloud storage)
  const isDatabase = () => {
    if (!connection) return false;
    const type = connection.type?.toLowerCase();
    const cloudTypes = ['aws', 's3', 'gcp', 'google', 'azure', 'blob'];
    return !cloudTypes.some(ct => type?.includes(ct));
  };

  const getConnectionTypeSettings = () => {
    if (!connection) return null;

    switch (connection.type?.toLowerCase()) {
      case 'snowflake':
        return (
          <div className="connection-specific-settings">
            <h4>Snowflake Settings</h4>
            <div className="setting-group">
              <label>Warehouse</label>
              <input 
                type="text" 
                value={settings.warehouse || ''}
                onChange={(e) => handleSettingChange('warehouse', e.target.value)}
                placeholder="COMPUTE_WH"
              />
            </div>
            <div className="setting-group">
              <label>Schema</label>
              <input 
                type="text" 
                value={settings.schema || ''}
                onChange={(e) => handleSettingChange('schema', e.target.value)}
                placeholder="PUBLIC"
              />
            </div>
          </div>
        );
      case 'databricks':
        return (
          <div className="connection-specific-settings">
            <h4>Databricks Settings</h4>
            <div className="setting-group">
              <label>Catalog</label>
              <input 
                type="text" 
                value={settings.catalog || ''}
                onChange={(e) => handleSettingChange('catalog', e.target.value)}
                placeholder="main"
              />
            </div>
            <div className="setting-group">
              <label>Schema</label>
              <input 
                type="text" 
                value={settings.schema || ''}
                onChange={(e) => handleSettingChange('schema', e.target.value)}
                placeholder="default"
              />
            </div>
          </div>
        );
      // Cloud storage settings removed - should be configured in Connections only
      default:
        return null;
    }
  };

  return (
    <div className="target-schema-editor">
      <div className="editor-header">
        <h2>Configure Target</h2>
        <p>Set up the target schema and connection-specific settings for <strong>{connection?.name || connection?.connection_name}</strong>.</p>
      </div>

      <div className="editor-content">
        {/* Basic Settings */}
        <div className="settings-section">
          <h3><FiDatabase /> Basic Settings</h3>
          
          <div className="setting-row">
            <div className="setting-group">
              <label htmlFor="tableName">Table/File Name</label>
              <input 
                id="tableName"
                type="text" 
                value={settings.tableName}
                onChange={(e) => handleSettingChange('tableName', e.target.value)}
                placeholder="Enter table or file name"
              />
            </div>
            
            <div className="setting-group">
              <label htmlFor="writeMode">Write Mode</label>
              <select 
                id="writeMode"
                value={settings.writeMode}
                onChange={(e) => handleSettingChange('writeMode', e.target.value)}
              >
                <option value="overwrite">Overwrite</option>
                <option value="append">Append</option>
                <option value="upsert">Upsert</option>
              </select>
            </div>
          </div>

          {/* Only show create table checkbox for database targets */}
          {isDatabase() && (
            <div className="setting-row">
              <div className="setting-group">
                <label>
                  <input 
                    type="checkbox" 
                    checked={settings.createTable}
                    onChange={(e) => handleSettingChange('createTable', e.target.checked)}
                  />
                  Create table if it doesn't exist
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Connection-specific Settings */}
        {getConnectionTypeSettings()}

        {/* Schema Configuration */}
        <div className="schema-section">
          <h3><FiEdit2 /> Target Schema ({schema.length} columns)</h3>
          <div className="schema-table">
            <div className="schema-header">
              <span>Column Name</span>
              <span>Data Type</span>
              <span>Nullable</span>
              <span>Primary Key</span>
              <span>Index</span>
            </div>
            {schema.map((column, index) => (
              <div key={column.id} className="schema-row">
                <input 
                  type="text"
                  value={column.name}
                  onChange={(e) => handleSchemaColumnUpdate(index, 'name', e.target.value)}
                  className="column-name-input"
                />
                <select 
                  value={column.type}
                  onChange={(e) => handleSchemaColumnUpdate(index, 'type', e.target.value)}
                  className="column-type-select"
                >
                  <option value="string">VARCHAR</option>
                  <option value="integer">INTEGER</option>
                  <option value="decimal">DECIMAL</option>
                  <option value="date">DATE</option>
                  <option value="datetime">TIMESTAMP</option>
                  <option value="boolean">BOOLEAN</option>
                </select>
                <input 
                  type="checkbox"
                  checked={column.nullable || false}
                  onChange={(e) => handleSchemaColumnUpdate(index, 'nullable', e.target.checked)}
                />
                <input 
                  type="radio"
                  name="primaryKey"
                  checked={settings.primaryKey === column.name}
                  onChange={() => handleSettingChange('primaryKey', column.name)}
                />
                <input 
                  type="checkbox"
                  checked={settings.indexColumns.includes(column.name)}
                  onChange={(e) => {
                    const newIndexColumns = e.target.checked 
                      ? [...settings.indexColumns, column.name]
                      : settings.indexColumns.filter(col => col !== column.name);
                    handleSettingChange('indexColumns', newIndexColumns);
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="advanced-section">
          <button 
            className="btn btn-secondary"
            onClick={() => setAdvancedSettings(!advancedSettings)}
          >
            <FiSettings /> {advancedSettings ? 'Hide' : 'Show'} Advanced Settings
          </button>
          
          {advancedSettings && (
            <div className="advanced-settings">
              <div className="setting-row">
                <div className="setting-group">
                  <label htmlFor="batchSize">Batch Size</label>
                  <input 
                    id="batchSize"
                    type="number"
                    value={settings.batchSize}
                    onChange={(e) => handleSettingChange('batchSize', parseInt(e.target.value) || 1000)}
                    min="100"
                    max="10000"
                    step="100"
                  />
                  <small>Number of rows to process in each batch</small>
                </div>
                
                <div className="setting-group">
                  <label htmlFor="partitionBy">Partition By</label>
                  <select 
                    id="partitionBy"
                    value={settings.partitionBy}
                    onChange={(e) => handleSettingChange('partitionBy', e.target.value)}
                  >
                    <option value="">No partitioning</option>
                    {schema.filter(col => col.type === 'date' || col.type === 'datetime').map(col => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview SQL - Only for database targets */}
        {isDatabase() && (
          <div className="sql-preview-section">
            <h3>Generated DDL Preview</h3>
            <div className="sql-preview">
              <code>
                {`CREATE TABLE ${settings.tableName} (\n`}
                {schema.map((col, index) => 
                  `  ${col.name} ${col.type.toUpperCase()}${col.nullable ? '' : ' NOT NULL'}${index < schema.length - 1 ? ',' : ''}\n`
                ).join('')}
                {settings.primaryKey && `  PRIMARY KEY (${settings.primaryKey})\n`}
                {`);\n`}
                {settings.indexColumns.length > 0 && 
                  settings.indexColumns.map(indexCol => 
                    `CREATE INDEX idx_${settings.tableName}_${indexCol} ON ${settings.tableName}(${indexCol});\n`
                  ).join('')
                }
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
TargetSchemaEditor.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    connection_name: PropTypes.string,
    type: PropTypes.string
  }),

  schema: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      nullable: PropTypes.bool
    })
  ).isRequired,

  onSchemaChange: PropTypes.func.isRequired
};

export default TargetSchemaEditor;