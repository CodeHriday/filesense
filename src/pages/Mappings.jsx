import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiPlus, 
  FiEdit2, 
  FiTrash2, 
  FiPlay, 
  FiServer,
  FiTarget,
  FiLayers,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import './Mappings.css';

function Mappings() {
  const { hasWritePermission, hasExecutePermission, currentUser } = useAuth();
  const navigate = useNavigate();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState(null);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const mappingsRes = await axios.get(`${API_BASE_URL}/api/transformations`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setMappings(mappingsRes.data?.mappings || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load mappings data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMapping = () => {
    navigate('/mappings/create');
  };

  const handleEditMapping = (mappingId) => {
    navigate(`/mappings/edit/${mappingId}`);
  };

  const handleDeleteMapping = (mappingId, mappingName) => {
    setMappingToDelete({ id: mappingId, name: mappingName });
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!mappingToDelete) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/transformations/${mappingToDelete.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setDeleteModalOpen(false);
      setMappingToDelete(null);
      // Refresh the mappings list
      await fetchData();
    } catch (err) {
      console.error('Error deleting mapping:', err);
      alert(err.response?.data?.error || 'Failed to delete mapping');
    }
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setMappingToDelete(null);
  };

  const handleExecuteMapping = async (mappingId) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/transformations/${mappingId}/execute`,
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      const jobId = response.data.jobId;
      setExecutionResult({
        success: true,
        jobId: jobId,
        message: 'The mapping job has been submitted for execution. Please navigate to the Jobs page to check on the status of execution.'
      });
      setExecutionModalOpen(true);
    } catch (err) {
      console.error('Error executing mapping:', err);
      setExecutionResult({
        success: false,
        message: err.response?.data?.error || 'Failed to execute mapping'
      });
      setExecutionModalOpen(true);
    }
  };

  const closeExecutionModal = () => {
    setExecutionModalOpen(false);
    setExecutionResult(null);
  };

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentMappings = mappings.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(mappings.length / itemsPerPage);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <h1 style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>ETL Mappings</h1>
          <p style={{ color: 'white', fontSize: '0.875rem' }}>Create and manage data transformation mappings with file pattern matching and quality checks</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={handleCreateMapping}
            disabled={!hasWritePermission('transformation')}
          >
            <FiPlus /> Create Mapping
          </button>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        {error && (
          <div className="error-message" style={{ margin: '1rem' }}>
            <FiAlertCircle /> {error}
          </div>
        )}

        <div className="mappings-table-container">
          {mappings.length === 0 ? (
            <div className="empty-state">
              <FiLayers size={48} />
              <h3>No mappings yet</h3>
              <p>Create your first mapping to start transforming data files</p>
              <button 
                className="btn btn-primary"
                onClick={handleCreateMapping}
              >
                <FiPlus /> Create Mapping
              </button>
            </div>
          ) : (
            <table className="mappings-table" style={{ fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
                  <th>Project</th>
                  <th>Mapping Name</th>
                  <th>Source</th>
                  <th>File Pattern</th>
                  <th>Target</th>
                  <th>Fields</th>
                  <th>Quality Rules</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>
                {currentMappings.map(mapping => {
                      const fieldCount = Array.isArray(mapping.field_mappings) 
                        ? mapping.field_mappings.length 
                        : (typeof mapping.field_mappings === 'string' ? JSON.parse(mapping.field_mappings).length : 0);
                      const rulesCount = mapping.anomaly_rules 
                        ? (typeof mapping.anomaly_rules === 'object' ? Object.keys(mapping.anomaly_rules).length : 0) 
                        : 0;
                      
                      return (
                        <tr key={mapping.id}>
                          <td>{mapping.project_name || 'Default Project'}</td>
                          <td className="mapping-name-cell">
                            <strong>{mapping.mapping_name}</strong>
                          </td>
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
                          <td>{formatDate(mapping.created_at)}</td>
                          <td>
                            <div className="table-actions">
                              {hasExecutePermission('transformation') && (
                                <button
                                  className="icon-btn"
                                  onClick={() => handleExecuteMapping(mapping.mapping_id)}
                                  title="Execute mapping"
                                >
                                  <FiPlay />
                                </button>
                              )}
                              {hasWritePermission('transformation') && (
                                <>
                                  <button
                                    className="icon-btn"
                                    onClick={() => handleEditMapping(mapping.mapping_id)}
                                    title="Edit mapping"
                                  >
                                    <FiEdit2 />
                                  </button>
                                  <button
                                    className="icon-btn danger"
                                    onClick={() => handleDeleteMapping(mapping.mapping_id, mapping.mapping_name)}
                                    title="Delete mapping"
                                  >
                                    <FiTrash2 />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                })}
              </tbody>
            </table>
          )}
          
          {mappings.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={mappings.length}
            />
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Delete Mapping</h2>
              <button className="modal-close" onClick={cancelDelete}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <FiAlertCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500 }}>
                    Are you sure you want to delete this mapping?
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                    Mapping: <strong>{mappingToDelete?.name}</strong>
                  </p>
                  <p style={{ margin: 0, marginTop: '0.5rem', color: '#64748b', fontSize: '0.875em' }}>
                    This action cannot be undone. All field mappings and quality rules will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                <FiTrash2 /> Delete Mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Result Modal */}
      {executionModalOpen && executionResult && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{executionResult.success ? 'Execution Started' : 'Execution Failed'}</h2>
              <button className="modal-close" onClick={closeExecutionModal}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                {executionResult.success ? (
                  <FiCheckCircle size={48} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <FiXCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <div>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500 }}>
                    {executionResult.message}
                  </p>
                  {executionResult.jobId && (
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                      Job ID: <code style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>{executionResult.jobId}</code>
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeExecutionModal}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Mappings;
