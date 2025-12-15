import React, { useState, useEffect } from 'react';
import { FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { getConnections } from '../../api/connectionService';
import LoadingSpinner from '../LoadingSpinner';
import './Transform.css';
import PropTypes from 'prop-types';

/**
 * Connection Selector component for choosing source and target connections
 */
const ConnectionSelector = ({ sourceConnection, targetConnection, onSourceChange, onTargetChange }) => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const data = await getConnections();
      setConnections(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching connections:', err);
      setError('Failed to load connections. Please check your connection settings.');
    } finally {
      setLoading(false);
    }
  };



  const getConnectionTypeLabel = (type) => {
    const labels = {
      'aws': 'AWS S3',
      's3': 'AWS S3',
      'snowflake': 'Snowflake',
      'databricks': 'Databricks',
      'gcp': 'Google Cloud',
      'azure': 'Azure Blob',
      'sharepoint': 'SharePoint',
      'outlook': 'Outlook'
    };
    return labels[type?.toLowerCase()] || type;
  };



  if (loading) {
    return (
      <div className="connection-selector loading">
        <LoadingSpinner />
        <p>Loading connections...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="connection-selector error">
        <FiAlertCircle />
        <p>{error}</p>
        <button className="btn btn-primary" onClick={fetchConnections}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="connection-selector">
      <div className="selector-header">
        <h2>Select Connections</h2>
        <p>Choose a source connection to read data from and a target connection to write data to.</p>
      </div>

      <div className="connection-sections">
        {/* Source Connection */}
        <div className="connection-section">
          <div className="section-header">
            <h3>Source Connection</h3>
          </div>
          <p className="section-description">
            Select where your data will come from. Source connections are read-only.
          </p>
          <div className="connection-dropdown-container">
            <select 
              className="connection-dropdown"
              value={sourceConnection?.id || ''}
              onChange={(e) => {
                const selectedConnection = connections.find(conn => conn.id === parseInt(e.target.value));
                onSourceChange(selectedConnection);
              }}
            >
              <option value="">Select a source connection...</option>
              {connections.map(connection => (
                <option key={`source-${connection.id}`} value={connection.id}>
                  {connection.name || connection.connection_name} ({getConnectionTypeLabel(connection.type)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Target Connection */}
        <div className="connection-section">
          <div className="section-header">
            <h3>Target Connection</h3>
          </div>
          <p className="section-description">
            Select where your transformed data will be written. Target connections are fully editable.
          </p>
          <div className="connection-dropdown-container">
            <select 
              className="connection-dropdown"
              value={targetConnection?.id || ''}
              onChange={(e) => {
                const selectedConnection = connections.find(conn => conn.id === parseInt(e.target.value));
                onTargetChange(selectedConnection);
              }}
            >
              <option value="">Select a target connection...</option>
              {connections.map(connection => (
                <option key={`target-${connection.id}`} value={connection.id}>
                  {connection.name || connection.connection_name} ({getConnectionTypeLabel(connection.type)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Selection Summary */}
      {(sourceConnection || targetConnection) && (
        <div className="selection-summary">
          <h3>Selected Connections</h3>
          <div className="summary-grid">
            {sourceConnection && (
              <div className="summary-item">
                <strong>Source:</strong> {sourceConnection.name || sourceConnection.connection_name}
                <span className="summary-type">({getConnectionTypeLabel(sourceConnection.type)})</span>
              </div>
            )}
            {targetConnection && (
              <div className="summary-item">
                <strong>Target:</strong> {targetConnection.name || targetConnection.connection_name}
                <span className="summary-type">({getConnectionTypeLabel(targetConnection.type)})</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
ConnectionSelector.propTypes = {
  sourceConnection: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
    connection_name: PropTypes.string,
    type: PropTypes.string
  }),

  targetConnection: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
    connection_name: PropTypes.string,
    type: PropTypes.string
  }),

  onSourceChange: PropTypes.func.isRequired,
  onTargetChange: PropTypes.func.isRequired
};

export default ConnectionSelector;