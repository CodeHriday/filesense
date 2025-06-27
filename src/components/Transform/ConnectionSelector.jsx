import React, { useState, useEffect } from 'react';
import { FiDatabase, FiCloud, FiServer, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { getConnections } from '../../api/connectionService';
import LoadingSpinner from '../LoadingSpinner';
import './Transform.css';

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

  const getConnectionIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'aws':
      case 's3':
        return FiCloud;
      case 'snowflake':
      case 'databricks':
        return FiDatabase;
      default:
        return FiServer;
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

  const ConnectionCard = ({ connection, isSelected, onSelect, label, disabled }) => {
    const IconComponent = getConnectionIcon(connection.type);
    
    return (
      <div 
        className={`connection-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && onSelect(connection)}
      >
        <div className="connection-icon">
          <IconComponent />
        </div>
        <div className="connection-info">
          <h4>{connection.name || connection.connection_name}</h4>
          <p>{getConnectionTypeLabel(connection.type)}</p>
          <div className="connection-meta">
            <span className="connection-status">
              <FiCheckCircle className="status-icon active" />
              Active
            </span>
          </div>
        </div>
        {isSelected && (
          <div className="selection-indicator">
            <FiCheckCircle />
          </div>
        )}
        <div className="connection-label">{label}</div>
      </div>
    );
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
            <span className="section-badge source">READ-ONLY</span>
          </div>
          <p className="section-description">
            Select where your data will come from. Source connections are read-only.
          </p>
          <div className="connection-grid">
            {connections.map(connection => (
              <ConnectionCard
                key={`source-${connection.id}`}
                connection={connection}
                isSelected={sourceConnection?.id === connection.id}
                onSelect={onSourceChange}
                label="SOURCE"
                disabled={false}
              />
            ))}
          </div>
        </div>

        {/* Target Connection */}
        <div className="connection-section">
          <div className="section-header">
            <h3>Target Connection</h3>
            <span className="section-badge target">EDITABLE</span>
          </div>
          <p className="section-description">
            Select where your transformed data will be written. Target connections are fully editable.
          </p>
          <div className="connection-grid">
            {connections.map(connection => (
              <ConnectionCard
                key={`target-${connection.id}`}
                connection={connection}
                isSelected={targetConnection?.id === connection.id}
                onSelect={onTargetChange}
                label="TARGET"
                disabled={false}
              />
            ))}
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

export default ConnectionSelector;