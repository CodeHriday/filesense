import React, { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import '../styles/admin.css';

const APITokens = () => {
  const [tokens, setTokens] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    projectId: '',
    scopes: [],
    rateLimit: 100,
    rateWindowHours: 1,
    expiresAt: ''
  });

  const availableScopes = [
    { value: 'vendor_agreements:upload', label: 'Vendor Agreement Upload', description: 'Upload files to vendor agreements' },
    { value: 'projects:upload', label: 'Project Upload', description: 'Upload files to internal projects' },
    { value: 'bulk:upload', label: 'Bulk Upload', description: 'Upload multiple files at once' }
  ];

  useEffect(() => {
    fetchTokens();
    fetchProjects();
  }, []);

  const fetchTokens = async () => {
    try {
      const response = await fetch('/api/tokens', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setTokens(data.tokens || []);
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const handleCreateToken = async (e) => {
    e.preventDefault();

    if (formData.scopes.length === 0) {
      alert('Please select at least one scope');
      return;
    }

    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: formData.name,
          projectId: formData.projectId || null,
          scopes: formData.scopes,
          rateLimit: parseInt(formData.rateLimit),
          rateWindowHours: parseInt(formData.rateWindowHours),
          expiresAt: formData.expiresAt || null
        })
      });

      const data = await response.json();

      if (response.ok) {
        setGeneratedToken(data);
        setShowTokenModal(true);
        setShowCreateForm(false);
        setFormData({
          name: '',
          projectId: '',
          scopes: [],
          rateLimit: 100,
          rateWindowHours: 1,
          expiresAt: ''
        });
        fetchTokens();
      } else {
        alert(data.error || 'Failed to create token');
      }
    } catch (error) {
      console.error('Failed to create token:', error);
      alert('Failed to create token');
    }
  };

  const handleRevokeToken = async (tokenId) => {
    if (!confirm('Are you sure you want to revoke this token? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/tokens/${tokenId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        fetchTokens();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to revoke token');
      }
    } catch (error) {
      console.error('Failed to revoke token:', error);
      alert('Failed to revoke token');
    }
  };

  const handleScopeToggle = (scope) => {
    setFormData(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope]
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Token copied to clipboard!');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatScopes = (scopes) => {
    try {
      const scopeArray = typeof scopes === 'string' ? JSON.parse(scopes) : scopes;
      return scopeArray.join(', ');
    } catch (e) {
      return scopes;
    }
  };

  return (
    <PageLayout title="API Token Management">
      <div className="api-tokens-container">
        <div className="page-header">
          <div>
            <h1>API Tokens</h1>
            <p>Manage API tokens for programmatic file uploads</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : 'Create New Token'}
          </button>
        </div>

        {showCreateForm && (
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3>Create New API Token</h3>
            <form onSubmit={handleCreateToken}>
              <div className="form-group">
                <label>Token Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Production Upload Service"
                  required
                />
              </div>

              <div className="form-group">
                <label>Project (Optional)</label>
                <select
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                >
                  <option value="">All Projects (Wildcard)</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <small>Leave empty for wildcard access, or select a specific project to restrict token scope</small>
              </div>

              <div className="form-group">
                <label>Scopes *</label>
                <div className="scope-checkboxes">
                  {availableScopes.map(scope => (
                    <div key={scope.value} className="checkbox-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={formData.scopes.includes(scope.value)}
                          onChange={() => handleScopeToggle(scope.value)}
                        />
                        <div>
                          <strong>{scope.label}</strong>
                          <p>{scope.description}</p>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Rate Limit (requests)</label>
                  <input
                    type="number"
                    value={formData.rateLimit}
                    onChange={(e) => setFormData({ ...formData, rateLimit: e.target.value })}
                    min="1"
                    max="10000"
                  />
                </div>
                <div className="form-group">
                  <label>Rate Window (hours)</label>
                  <input
                    type="number"
                    value={formData.rateWindowHours}
                    onChange={(e) => setFormData({ ...formData, rateWindowHours: e.target.value })}
                    min="1"
                    max="24"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Expiration Date (Optional)</label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <small>Leave empty for tokens that never expire</small>
              </div>

              <button type="submit" className="btn btn-primary">
                Generate Token
              </button>
            </form>
          </div>
        )}

        {showTokenModal && generatedToken && (
          <div className="modal-overlay" onClick={() => setShowTokenModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Token Created Successfully</h3>
              <div className="token-display">
                <p className="warning-text">⚠️ Save this token now - it will not be shown again!</p>
                <div className="token-value">
                  <code>{generatedToken.token}</code>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => copyToClipboard(generatedToken.token)}
                  >
                    Copy
                  </button>
                </div>
                <div className="token-details">
                  <p><strong>Token Prefix:</strong> {generatedToken.tokenPrefix}</p>
                  <p><strong>Token ID:</strong> {generatedToken.tokenId}</p>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowTokenModal(false)}
              >
                I've Saved the Token
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <h3>Active Tokens</h3>
          {loading ? (
            <p>Loading tokens...</p>
          ) : tokens.length === 0 ? (
            <p>No API tokens created yet. Click "Create New Token" to get started.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Prefix</th>
                    <th>Scopes</th>
                    <th>Project</th>
                    <th>Rate Limit</th>
                    <th>Last Used</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map(token => (
                    <tr key={token.id}>
                      <td>{token.name}</td>
                      <td><code>{token.token_prefix}</code></td>
                      <td>{formatScopes(token.scopes)}</td>
                      <td>{token.project_id || 'All Projects'}</td>
                      <td>{token.rate_limit}/{token.rate_window_hours}h</td>
                      <td>{formatDate(token.last_used_at)}</td>
                      <td>{formatDate(token.created_at)}</td>
                      <td>
                        <span className={`status-badge ${token.is_active ? 'active' : 'revoked'}`}>
                          {token.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td>
                        {token.is_active && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRevokeToken(token.id)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .api-tokens-container {
          max-width: 1400px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .page-header h1 {
          margin: 0 0 8px 0;
        }

        .page-header p {
          margin: 0;
          color: #666;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .scope-checkboxes {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .checkbox-item label {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
        }

        .checkbox-item label:hover {
          background: #f5f5f5;
        }

        .checkbox-item input[type="checkbox"] {
          margin-top: 4px;
        }

        .checkbox-item strong {
          display: block;
          margin-bottom: 4px;
        }

        .checkbox-item p {
          margin: 0;
          font-size: 0.9em;
          color: #666;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 32px;
          border-radius: 8px;
          max-width: 600px;
          width: 90%;
        }

        .modal-content h3 {
          margin-top: 0;
        }

        .token-display {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 4px;
          margin: 20px 0;
        }

        .warning-text {
          color: #d97706;
          font-weight: 600;
          margin-bottom: 16px;
        }

        .token-value {
          display: flex;
          gap: 12px;
          align-items: center;
          background: white;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 16px;
        }

        .token-value code {
          flex: 1;
          font-family: monospace;
          font-size: 14px;
          word-break: break-all;
        }

        .token-details p {
          margin: 8px 0;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.85em;
          font-weight: 500;
        }

        .status-badge.active {
          background: #dcfce7;
          color: #15803d;
        }

        .status-badge.revoked {
          background: #fee2e2;
          color: #991b1b;
        }

        .btn-danger {
          background: #dc2626;
          color: white;
        }

        .btn-danger:hover {
          background: #b91c1c;
        }

        small {
          display: block;
          margin-top: 4px;
          color: #666;
          font-size: 0.9em;
        }
      `}</style>
    </PageLayout>
  );
};

export default APITokens;
