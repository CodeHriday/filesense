import React, { useState, useEffect } from 'react';
import { FiPlus, FiDatabase, FiEdit2, FiTrash2, FiLock } from 'react-icons/fi';
import axios from 'axios';
import Card from '../components/Card';
import { formatDate } from '../utils/formatters';
import './Connections.css';

function Connections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [currentConnection, setCurrentConnection] = useState(null);
  
  // Form state
  const [connectionName, setConnectionName] = useState('');
  const [connectionType, setConnectionType] = useState('postgresql');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [databaseName, setDatabaseName] = useState('');
  const [connectionString, setConnectionString] = useState('');
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [testConnectionStatus, setTestConnectionStatus] = useState(null);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/connections');
        setConnections(response.data || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching connections:', err);
        setError('Failed to load connections. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchConnections();
  }, []);

  const handleAddConnection = () => {
    setCurrentConnection(null);
    setConnectionName('');
    setConnectionType('postgresql');
    setHost('');
    setPort('');
    setUsername('');
    setPassword('');
    setDatabaseName('');
    setConnectionString('');
    setShowConnectionString(false);
    setTestConnectionStatus(null);
    setShowForm(true);
  };

  const handleEditConnection = (connection) => {
    setCurrentConnection(connection);
    setConnectionName(connection.connection_name);
    setConnectionType(connection.connection_type);
    setHost(connection.host || '');
    setPort(connection.port ? connection.port.toString() : '');
    setUsername(connection.username || '');
    setPassword(''); // Don't populate password for security
    setDatabaseName(connection.database_name || '');
    setConnectionString(connection.connection_string || '');
    setShowConnectionString(!!connection.connection_string);
    setTestConnectionStatus(null);
    setShowForm(true);
  };

  const handleDeleteConnection = async (id) => {
    if (window.confirm('Are you sure you want to delete this connection?')) {
      try {
        await axios.delete(`/api/connections/${id}`);
        setConnections(connections.filter(conn => conn.id !== id));
      } catch (err) {
        console.error('Error deleting connection:', err);
        alert('Failed to delete connection. Please try again.');
      }
    }
  };

  const handleToggleConnectionString = () => {
    setShowConnectionString(!showConnectionString);
    if (!showConnectionString) {
      // Generate connection string when switching to connection string mode
      if (connectionType === 'postgresql' && host && port && username && databaseName) {
        setConnectionString(
          `postgresql://${username}:${password ? 'password' : ''}@${host}:${port}/${databaseName}`
        );
      }
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestConnectionStatus('testing');
      
      // In a real app, you would send the connection details to your backend
      // to test the connection. Here we'll just simulate it.
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate a successful connection
      setTestConnectionStatus('success');
    } catch (err) {
      console.error('Error testing connection:', err);
      setTestConnectionStatus('error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const connectionData = {
        connection_name: connectionName,
        connection_type: connectionType,
        host: showConnectionString ? '' : host,
        port: showConnectionString ? null : (port ? parseInt(port) : null),
        username: showConnectionString ? '' : username,
        password: password, // In a real app, would be handled securely
        database_name: showConnectionString ? '' : databaseName,
        connection_string: showConnectionString ? connectionString : ''
      };
      
      let response;
      
      if (currentConnection) {
        // Update existing connection
        response = await axios.put(
          `/api/connections/${currentConnection.id}`,
          connectionData
        );
        
        setConnections(connections.map(conn => 
          conn.id === currentConnection.id ? response.data : conn
        ));
      } else {
        // Create new connection
        response = await axios.post('/api/connections', connectionData);
        setConnections([...connections, response.data]);
      }
      
      setShowForm(false);
    } catch (err) {
      console.error('Error saving connection:', err);
      alert('Failed to save connection. Please try again.');
    }
  };

  return (
    <div className="connections-container">
      <div className="connections-header">
        <h1>Connections</h1>
        <button className="btn btn-primary" onClick={handleAddConnection}>
          <FiPlus className="btn-icon" />
          Add Connection
        </button>
      </div>
      
      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading connections...</p>
        </div>
      ) : error ? (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {showForm && (
            <Card className="connection-form-card">
              <h2>{currentConnection ? 'Edit Connection' : 'Create Connection'}</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="connectionName">Connection Name</label>
                  <input
                    type="text"
                    id="connectionName"
                    className="form-control"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="connectionType">Connection Type</label>
                  <select
                    id="connectionType"
                    className="form-control"
                    value={connectionType}
                    onChange={(e) => setConnectionType(e.target.value)}
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="bigquery">BigQuery</option>
                    <option value="snowflake">Snowflake</option>
                    <option value="redshift">Redshift</option>
                  </select>
                </div>
                
                <div className="connection-toggle">
                  <button 
                    type="button"
                    className={`toggle-btn ${!showConnectionString ? 'active' : ''}`}
                    onClick={() => setShowConnectionString(false)}
                  >
                    Connection Details
                  </button>
                  <button 
                    type="button"
                    className={`toggle-btn ${showConnectionString ? 'active' : ''}`}
                    onClick={() => setShowConnectionString(true)}
                  >
                    Connection String
                  </button>
                </div>
                
                {showConnectionString ? (
                  <div className="form-group">
                    <label htmlFor="connectionString">Connection String</label>
                    <div className="password-field">
                      <input
                        type="text"
                        id="connectionString"
                        className="form-control"
                        value={connectionString}
                        onChange={(e) => setConnectionString(e.target.value)}
                        required
                      />
                    </div>
                    <small className="form-text">
                      Example: postgresql://username:password@localhost:5432/database
                    </small>
                  </div>
                ) : (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="host">Host</label>
                        <input
                          type="text"
                          id="host"
                          className="form-control"
                          value={host}
                          onChange={(e) => setHost(e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor="port">Port</label>
                        <input
                          type="text"
                          id="port"
                          className="form-control"
                          value={port}
                          onChange={(e) => setPort(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                          type="text"
                          id="username"
                          className="form-control"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="password-field">
                          <input
                            type="password"
                            id="password"
                            className="form-control"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={currentConnection ? '••••••••' : ''}
                            required={!currentConnection}
                          />
                          <span className="password-icon">
                            <FiLock />
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="databaseName">Database Name</label>
                      <input
                        type="text"
                        id="databaseName"
                        className="form-control"
                        value={databaseName}
                        onChange={(e) => setDatabaseName(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
                
                <div className="form-actions">
                  <div className="test-connection">
                    <button 
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleTestConnection}
                      disabled={testConnectionStatus === 'testing'}
                    >
                      {testConnectionStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                    
                    {testConnectionStatus === 'success' && (
                      <span className="test-success">Connection successful!</span>
                    )}
                    
                    {testConnectionStatus === 'error' && (
                      <span className="test-error">Connection failed. Please check your settings.</span>
                    )}
                  </div>
                  
                  <div className="form-buttons">
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={() => setShowForm(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      {currentConnection ? 'Update Connection' : 'Create Connection'}
                    </button>
                  </div>
                </div>
              </form>
            </Card>
          )}
          
          {connections.length === 0 && !showForm ? (
            <Card>
              <div className="empty-state">
                <FiDatabase className="empty-icon" />
                <h2>No Connections Configured</h2>
                <p>
                  Configure connections to your data sources to enable data
                  ingestion, synchronization, and more.
                </p>
                <button className="btn btn-primary" onClick={handleAddConnection}>
                  <FiPlus className="btn-icon" />
                  Add Your First Connection
                </button>
              </div>
            </Card>
          ) : (
            <div className="connections-grid">
              {connections.map(connection => (
                <Card key={connection.id} className="connection-card">
                  <div className="connection-header">
                    <div className="connection-title">
                      <div className={`connection-icon ${connection.connection_type}`}>
                        <FiDatabase />
                      </div>
                      <h3>{connection.connection_name}</h3>
                    </div>
                    <div className="connection-actions">
                      <button 
                        className="action-button" 
                        title="Edit Connection"
                        onClick={() => handleEditConnection(connection)}
                      >
                        <FiEdit2 />
                      </button>
                      <button 
                        className="action-button delete-button" 
                        title="Delete Connection"
                        onClick={() => handleDeleteConnection(connection.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                  <div className="connection-content">
                    <div className="connection-detail">
                      <span className="detail-label">Type:</span>
                      <span className="detail-value">
                        {connection.connection_type.charAt(0).toUpperCase() + connection.connection_type.slice(1)}
                      </span>
                    </div>
                    <div className="connection-detail">
                      <span className="detail-label">Host:</span>
                      <span className="detail-value">
                        {connection.host || 'N/A'}
                      </span>
                    </div>
                    <div className="connection-detail">
                      <span className="detail-label">Database:</span>
                      <span className="detail-value">
                        {connection.database_name || 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="connection-footer">
                    Created: {formatDate(connection.created_at)}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Connections;