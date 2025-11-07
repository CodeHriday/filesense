import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiGitBranch, FiSearch, FiServer, FiTarget } from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import TransformationDetailsPanel from '../components/TransformationDetailsPanel';
import { formatDate } from '../utils/formatters';
import { getLineages } from '../api/lineageService';
import './ProcessedFileCatalog.css';

const ProcessedFileCatalog = () => {
  const navigate = useNavigate();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLineage, setSelectedLineage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchMappings();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMappings();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const fetchMappings = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm && searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const response = await axios.get(`${API_BASE_URL}/api/file-audit/processed-catalog`, {
        params,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setMappings(response.data?.mappings || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching processed catalog:', err);
      setError('Failed to load processed file catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleViewLineage = async (mappingName) => {
    try {
      const lineageData = await getLineages();
      const transformationLineage = lineageData.transformation_lineage || [];
      const mappingLineage = transformationLineage.find(
        lineage => lineage.mapping_name === mappingName
      );

      if (mappingLineage) {
        setSelectedLineage({ ...mappingLineage, type: 'transformation' });
      } else {
        alert(`No lineage found for mapping "${mappingName}"`);
      }
    } catch (err) {
      console.error('Error fetching lineage:', err);
      alert('Failed to load lineage data. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Processed File Catalog</h1>
          <p style={{ color: '#037c6e', fontSize: '0.875rem' }}>ETL transformation mappings with processed file history</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: '300px' }}>
            <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search mappings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.5rem 0.5rem 2.5rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        {error && (
          <div className="error-message" style={{ margin: '1rem' }}>
            {error}
          </div>
        )}

        <div className="mappings-table-container">
          {mappings.length === 0 ? (
            <div className="empty-state">
              <h3>No processed files yet</h3>
              <p>Execute mapping jobs to see processed files here</p>
            </div>
          ) : (
            <table className="mappings-table" style={{ fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ fontSize: '0.8125rem', fontWeight: 'bold' }}>
                  <th>Mapping Name</th>
                  <th>Project</th>
                  <th>Source</th>
                  <th>File Pattern</th>
                  <th>Target</th>
                  <th>Fields</th>
                  <th>Quality Rules</th>
                  <th>Number of Files</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '0.8125rem', fontWeight: 'normal' }}>
                {mappings.map(mapping => {
                  const fieldCount = Array.isArray(mapping.field_mappings) 
                    ? mapping.field_mappings.length 
                    : (typeof mapping.field_mappings === 'string' ? JSON.parse(mapping.field_mappings).length : 0);
                  const rulesCount = mapping.anomaly_rules 
                    ? (typeof mapping.anomaly_rules === 'object' ? Object.keys(mapping.anomaly_rules).length : 0) 
                    : 0;
                  
                  return (
                    <tr key={mapping.mapping_id}>
                      <td className="mapping-name-cell">
                        <strong>{mapping.mapping_name}</strong>
                      </td>
                      <td>{mapping.project_name || 'Default Project'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FiServer size={14} style={{ color: '#64748b' }} />
                          {mapping.source_connection_name || 'Local'}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.85em', background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>
                          {mapping.file_path && mapping.file_path !== '' ? `${mapping.file_path}` : ''}
                          {mapping.file_name_pattern || mapping.source_file_pattern}
                        </code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FiTarget size={14} style={{ color: '#64748b' }} />
                          {mapping.target_connection_name || 'Local'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{fieldCount}</td>
                      <td style={{ textAlign: 'center' }}>{rulesCount}</td>
                      <td style={{ textAlign: 'center' }}>{mapping.file_count || 0}</td>
                      <td>{formatDate(mapping.created_at)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="action-icon-btn view-btn"
                            onClick={() => navigate('/mappings')}
                            title="View mapping"
                          >
                            <FiArrowRight />
                          </button>
                          <button
                            className="action-icon-btn view-btn"
                            onClick={() => handleViewLineage(mapping.mapping_name)}
                            title="View lineage"
                          >
                            <FiGitBranch />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedLineage && (
        <TransformationDetailsPanel
          transformationData={selectedLineage}
          onClose={() => setSelectedLineage(null)}
        />
      )}
    </div>
  );
};

export default ProcessedFileCatalog;
