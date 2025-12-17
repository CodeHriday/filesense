import React, { useState, useEffect } from 'react';
import '../styles/global-page-styles.css';

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
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">API Tokens</h1>
          <p className="gps-page-subtitle">Manage API tokens for programmatic file uploads</p>
        </div>
        <div className="gps-header-actions">
          <button
            className={`gps-btn ${showCreateForm ? 'gps-btn--secondary' : 'gps-btn--primary'}`}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : 'Create New Token'}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="gps-card" style={{ marginBottom: '24px' }}>
          <h3 className="gps-section-header">Create New API Token</h3>
          <form onSubmit={handleCreateToken}>
            <div className="gps-form-group">
              <label htmlFor="token-name" className="gps-form-label">Token Name *</label>
              <input
                id="token-name"
                type="text"
                className="gps-form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production Upload Service"
                required
              />
            </div>

            <div className="gps-form-group">
              <label htmlFor="token-project" className="gps-form-label">Project (Optional)</label>
              <select
                id="token-project"
                className="gps-form-select"
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
              <small className="gps-form-hint">Leave empty for wildcard access, or select a specific project to restrict token scope</small>
            </div>

            <div className="gps-form-group">
              {/* Use a <div> or <span> with id instead of <label> */}
              <div id="scopes-label" className="gps-form-label" role="heading" aria-level="3">
                Scopes *
              </div>

              <div 
                className="gps-scope-checkboxes" 
                role="group" 
                aria-labelledby="scopes-label"  
              >
                {availableScopes.map((scope) => (
                  <div key={scope.value} className="gps-checkbox-card">
                    <label className="gps-checkbox-card-label" htmlFor={`scope-${scope.value}`}>
                      <input
                        id={`scope-${scope.value}`}
                        type="checkbox"
                        checked={formData.scopes.includes(scope.value)}
                        onChange={() => handleScopeToggle(scope.value)}
                        aria-label={`${scope.label}${scope.description ? `, ${scope.description}` : ''}`}  // Fallback accessible name
                      />
                      <div className="gps-checkbox-card-content">
                        <span className="gps-checkbox-card-title">{scope.label}</span>
                        <span className="gps-checkbox-card-desc">{scope.description}</span>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="gps-form-row">
                <div className="gps-form-group">
                <label htmlFor="rate-limit" className="gps-form-label">Rate Limit (requests)</label>
                <input
                  id="rate-limit"
                  type="number"
                  className="gps-form-input"
                  value={formData.rateLimit}
                  onChange={(e) => setFormData({ ...formData, rateLimit: e.target.value })}
                  min="1"
                  max="10000"
                />
              </div>
              <div className="gps-form-group">
                <label htmlFor="rate-window" className="gps-form-label">Rate Window (hours)</label>
                <input
                  id="rate-window"
                  type="number"
                  className="gps-form-input"
                  value={formData.rateWindowHours}
                  onChange={(e) => setFormData({ ...formData, rateWindowHours: e.target.value })}
                  min="1"
                  max="24"
                />
              </div>
            </div>

            <div className="gps-form-group">
              <label htmlFor="expires-at" className="gps-form-label">Expiration Date (Optional)</label>
              <input
                id="expires-at"
                type="datetime-local"
                className="gps-form-input"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              />
              <small className="gps-form-hint">Leave empty for tokens that never expire</small>
            </div>

            <button type="submit" className="gps-btn gps-btn--primary">
              Generate Token
            </button>
          </form>
        </div>
      )}

      {showTokenModal && generatedToken && (
        <div className="gps-modal-overlay" onClick={() => setShowTokenModal(false)}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Token Created Successfully</h2>
              <button className="gps-modal-close" onClick={() => setShowTokenModal(false)}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-alert gps-alert--warning">
                Save this token now - it will not be shown again!
              </div>
              <div className="gps-token-display">
                <code className="gps-token-value">{generatedToken.token}</code>
                <button
                  className="gps-btn gps-btn--secondary gps-btn--sm"
                  onClick={() => copyToClipboard(generatedToken.token)}
                >
                  Copy
                </button>
              </div>
              <div className="gps-token-details">
                <p><strong>Token Prefix:</strong> {generatedToken.tokenPrefix}</p>
                <p><strong>Token ID:</strong> {generatedToken.tokenId}</p>
              </div>
            </div>
            <div className="gps-modal-footer">
              <button
                className="gps-btn gps-btn--primary"
                onClick={() => setShowTokenModal(false)}
              >
                I've Saved the Token
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="gps-table-container">
        <div className="gps-table-header-section">
          <h3 className="gps-section-header">Active Tokens</h3>
        </div>
        {loading ? (
          <div className="gps-loading">Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="gps-empty-state">
            <p>No API tokens created yet. Click "Create New Token" to get started.</p>
          </div>
        ) : (
          <table className="gps-table">
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
                  <td><span className="gps-cell-primary">{token.name}</span></td>
                  <td><code className="gps-code">{token.token_prefix}</code></td>
                  <td className="gps-cell-secondary">{formatScopes(token.scopes)}</td>
                  <td className="gps-cell-secondary">{token.project_id || 'All Projects'}</td>
                  <td className="gps-cell-secondary">{token.rate_limit}/{token.rate_window_hours}h</td>
                  <td className="gps-cell-secondary">{formatDate(token.last_used_at)}</td>
                  <td className="gps-cell-secondary">{formatDate(token.created_at)}</td>
                  <td>
                    <span className={`gps-badge ${token.is_active ? 'gps-badge--success' : 'gps-badge--danger'}`}>
                      {token.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td>
                    {token.is_active && (
                      <button
                        className="gps-btn gps-btn--danger gps-btn--sm"
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
        )}
      </div>
    </div>
  );
};

export default APITokens;
