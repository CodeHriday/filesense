import React, { useState, useEffect, useMemo } from 'react';
import { FaTrash, FaSearch } from 'react-icons/fa';
import '../styles/global-page-styles.css';

const APITokens = () => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState(null);
  const [tokenToDelete, setTokenToDelete] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [formData, setFormData] = useState({
    name: '',
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

  const formatScopes = (scopes) => {
    try {
      const scopeArray = typeof scopes === 'string' ? JSON.parse(scopes) : scopes;
      return scopeArray?.join(', ') || '';
    } catch (e) {
      return scopes || '';
    }
  };

  useEffect(() => {
    fetchTokens();
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

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;
    const query = searchQuery.toLowerCase();
    return tokens.filter(token => 
      token.name?.toLowerCase().includes(query) ||
      token.token_prefix?.toLowerCase().includes(query) ||
      (formatScopes(token.scopes) || '').toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  const paginatedTokens = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTokens.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTokens, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredTokens.length, totalPages, currentPage]);

  const handleCreateToken = async (e) => {
    e.preventDefault();

    if (formData.scopes.length === 0) {
      alert('Please select at least one scope');
      return;
    }

    if (creating) return;
    setCreating(true);

    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: formData.name,
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
    } finally {
      setCreating(false);
    }
  };

  const openRevokeModal = (token) => {
    setTokenToRevoke(token);
    setShowRevokeModal(true);
  };

  const closeRevokeModal = () => {
    setTokenToRevoke(null);
    setShowRevokeModal(false);
  };

  const handleRevokeToken = async () => {
    if (!tokenToRevoke || revoking) return;
    
    setRevoking(true);
    try {
      const response = await fetch(`/api/tokens/${tokenToRevoke.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        fetchTokens();
        closeRevokeModal();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to revoke token');
      }
    } catch (error) {
      console.error('Failed to revoke token:', error);
      alert('Failed to revoke token');
    } finally {
      setRevoking(false);
    }
  };

  const openDeleteModal = (token) => {
    setTokenToDelete(token);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setTokenToDelete(null);
    setShowDeleteModal(false);
  };

  const handleDeleteToken = async () => {
    if (!tokenToDelete || deleting) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`/api/tokens/${tokenToDelete.id}/permanent`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setSelectedTokens(prev => prev.filter(id => id !== tokenToDelete.id));
        fetchTokens();
        closeDeleteModal();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete token');
      }
    } catch (error) {
      console.error('Failed to delete token:', error);
      alert('Failed to delete token');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTokens.length === 0 || deleting) return;
    
    setDeleting(true);
    try {
      const response = await fetch('/api/tokens/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ tokenIds: selectedTokens })
      });

      if (response.ok) {
        setSelectedTokens([]);
        setShowBulkDeleteModal(false);
        fetchTokens();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete tokens');
      }
    } catch (error) {
      console.error('Failed to delete tokens:', error);
      alert('Failed to delete tokens');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectToken = (tokenId) => {
    setSelectedTokens(prev => 
      prev.includes(tokenId) 
        ? prev.filter(id => id !== tokenId)
        : [...prev, tokenId]
    );
  };

  const toggleSelectAll = () => {
    const currentPageIds = paginatedTokens.map(t => t.id);
    const allSelected = currentPageIds.every(id => selectedTokens.includes(id));
    
    if (allSelected) {
      setSelectedTokens(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedTokens(prev => [...new Set([...prev, ...currentPageIds])]);
    }
  };

  const isAllCurrentPageSelected = paginatedTokens.length > 0 && 
    paginatedTokens.every(t => selectedTokens.includes(t.id));

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
            onClick={() => {
              if (showCreateForm) {
                setFormData({
                  name: '',
                  scopes: [],
                  rateLimit: 100,
                  rateWindowHours: 1,
                  expiresAt: ''
                });
              }
              setShowCreateForm(!showCreateForm);
            }}
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
                        aria-label={`${scope.label}${scope.description ? `, ${scope.description}` : ''}`}
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

            <button 
              type="submit" 
              className="gps-btn gps-btn--primary"
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Generate Token'}
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

      {showRevokeModal && tokenToRevoke && (
        <div className="gps-modal-overlay" onClick={closeRevokeModal}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Revoke API Token</h2>
              <button className="gps-modal-close" onClick={closeRevokeModal}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-alert gps-alert--danger">
                Are you sure you want to revoke this token? This action cannot be undone.
              </div>
              <div style={{ marginTop: '16px' }}>
                <p><strong>Token Name:</strong> {tokenToRevoke.name}</p>
                <p><strong>API ID:</strong> <code className="gps-code">{tokenToRevoke.token_prefix}</code></p>
              </div>
            </div>
            <div className="gps-modal-footer">
              <button
                className="gps-btn gps-btn--secondary"
                onClick={closeRevokeModal}
                disabled={revoking}
              >
                Cancel
              </button>
              <button
                className="gps-btn gps-btn--danger"
                onClick={handleRevokeToken}
                disabled={revoking}
              >
                {revoking ? 'Revoking...' : 'Revoke Token'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && tokenToDelete && (
        <div className="gps-modal-overlay" onClick={closeDeleteModal}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Delete API Token</h2>
              <button className="gps-modal-close" onClick={closeDeleteModal}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-alert gps-alert--danger">
                Are you sure you want to permanently delete this token? This will remove it from the database and cannot be undone.
              </div>
              <div style={{ marginTop: '16px' }}>
                <p><strong>Token Name:</strong> {tokenToDelete.name}</p>
                <p><strong>API ID:</strong> <code className="gps-code">{tokenToDelete.token_prefix}</code></p>
              </div>
            </div>
            <div className="gps-modal-footer">
              <button
                className="gps-btn gps-btn--secondary"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="gps-btn gps-btn--danger"
                onClick={handleDeleteToken}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div className="gps-modal-overlay" onClick={() => setShowBulkDeleteModal(false)}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Delete Selected Tokens</h2>
              <button className="gps-modal-close" onClick={() => setShowBulkDeleteModal(false)}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-alert gps-alert--danger">
                Are you sure you want to permanently delete {selectedTokens.length} token(s)? This will remove them from the database and cannot be undone.
              </div>
            </div>
            <div className="gps-modal-footer">
              <button
                className="gps-btn gps-btn--secondary"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="gps-btn gps-btn--danger"
                onClick={handleBulkDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : `Delete ${selectedTokens.length} Token(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="gps-table-container">
        <div className="gps-table-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h3 className="gps-section-header" style={{ margin: 0 }}>Active Tokens</h3>
            {selectedTokens.length > 0 && (
              <button
                className="gps-btn gps-btn--danger gps-btn--sm"
                onClick={() => setShowBulkDeleteModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FaTrash size={12} />
                Delete Selected ({selectedTokens.length})
              </button>
            )}
          </div>
          <div className="gps-search-box" style={{ position: 'relative', minWidth: '250px' }}>
            <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input
              type="text"
              className="gps-form-input"
              placeholder="Search tokens..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>
        {loading ? (
          <div className="gps-loading">Loading tokens...</div>
        ) : filteredTokens.length === 0 ? (
          <div className="gps-empty-state">
            <p>{searchQuery ? 'No tokens match your search.' : 'No API tokens created yet. Click "Create New Token" to get started.'}</p>
          </div>
        ) : (
          <>
            <table className="gps-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      onChange={toggleSelectAll}
                      title="Select all on this page"
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Name</th>
                  <th>API_ID</th>
                  <th>Scopes</th>
                  <th>Rate Limit</th>
                  <th>Last Used</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTokens.map(token => (
                  <tr key={token.id} style={{ backgroundColor: selectedTokens.includes(token.id) ? '#f0f9ff' : 'inherit' }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedTokens.includes(token.id)}
                        onChange={() => toggleSelectToken(token.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td><span className="gps-cell-primary">{token.name}</span></td>
                    <td><code className="gps-code">{token.token_prefix}</code></td>
                    <td className="gps-cell-secondary">{formatScopes(token.scopes)}</td>
                    <td className="gps-cell-secondary">{token.rate_limit}/{token.rate_window_hours}h</td>
                    <td className="gps-cell-secondary">{formatDate(token.last_used_at)}</td>
                    <td className="gps-cell-secondary">{formatDate(token.created_at)}</td>
                    <td>
                      <span className={`gps-badge ${token.is_active ? 'gps-badge--success' : 'gps-badge--danger'}`}>
                        {token.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {token.is_active && (
                        <button
                          className="gps-btn gps-btn--danger gps-btn--sm"
                          onClick={() => openRevokeModal(token)}
                          title="Revoke Token"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        className="gps-btn gps-btn--icon gps-btn--sm"
                        onClick={() => openDeleteModal(token)}
                        title="Delete Token"
                        style={{ color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
                      >
                        <FaTrash size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div className="gps-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px', padding: '16px' }}>
                <button
                  className="gps-btn gps-btn--secondary gps-btn--sm"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span style={{ color: '#6b7280', fontSize: '14px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="gps-btn gps-btn--secondary gps-btn--sm"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default APITokens;
