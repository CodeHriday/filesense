import React, { useState, useEffect, useMemo } from 'react';
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
  FiAlertCircle,
  FiSearch,
  FiChevronDown,
  FiChevronRight,
  FiFolder
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { 
  groupMappingsByProject, 
  initializeExpansionState, 
  autoExpandMatchingSections 
} from '../utils/mappingGrouping';
import './Mappings.css';

function Mappings() {
  const { hasWritePermission, hasExecutePermission, currentUser } = useAuth();
  const navigate = useNavigate();
  const [mappings, setMappings] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState(null);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedSubProjectId, setSelectedSubProjectId] = useState('');
  const [expansionState, setExpansionState] = useState({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchData();
    } else {
      setMappings([]);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setProjects(response.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err.response?.data?.error || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!selectedProjectId) return;
    
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

  // Filter mappings based on selected project and subproject
  const filteredMappings = mappings.filter(mapping => {
    if (!selectedProjectId) return false;
    
    const mappingProjectId = Number(mapping.project_id);
    const selectedProjId = Number(selectedProjectId);
    const matchesProject = mappingProjectId === selectedProjId;
    
    if (!selectedSubProjectId) {
      return matchesProject;
    }
    
    const mappingSubProjId = Number(mapping.sub_project_id);
    const selectedSubProjId = Number(selectedSubProjectId);
    const matchesSubProject = mappingSubProjId === selectedSubProjId;
    return matchesProject && matchesSubProject;
  });

  // Get subprojects for selected project
  const selectedProject = projects.find(p => Number(p.id) === Number(selectedProjectId));
  const availableSubProjects = selectedProject?.sub_projects || [];

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentMappings = filteredMappings.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredMappings.length / itemsPerPage);

  // Group mappings by project and subproject hierarchy
  const groupedProjects = useMemo(() => {
    return groupMappingsByProject(currentMappings);
  }, [currentMappings]);

  // Initialize expansion state when grouped data changes
  useEffect(() => {
    if (groupedProjects.length > 0 && !initialized) {
      // Initialize with all sections collapsed by default (first load)
      setExpansionState(initializeExpansionState(groupedProjects, false));
      setInitialized(true);
    }
  }, [groupedProjects, initialized]);

  // Conditional render AFTER all hooks
  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  // Toggle expansion for a project or subproject
  const toggleExpansion = (key) => {
    setExpansionState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Render a table row for a mapping
  const renderMappingRow = (mapping) => {
    const fieldCount = Array.isArray(mapping.field_mappings) 
      ? mapping.field_mappings.length 
      : (typeof mapping.field_mappings === 'string' ? JSON.parse(mapping.field_mappings).length : 0);
    const rulesCount = mapping.anomaly_rules 
      ? (typeof mapping.anomaly_rules === 'object' ? Object.keys(mapping.anomaly_rules).length : 0) 
      : 0;
    
    return (
      <tr key={mapping.id}>
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
                className="action-icon-btn execute-btn"
                onClick={() => handleExecuteMapping(mapping.mapping_id)}
                title="Execute mapping"
              >
                <FiPlay />
              </button>
            )}
            {hasWritePermission('transformation') && (
              <>
                <button
                  className="action-icon-btn edit-btn"
                  onClick={() => handleEditMapping(mapping.mapping_id)}
                  title="Edit mapping"
                >
                  <FiEdit2 />
                </button>
                <button
                  className="action-icon-btn delete-btn"
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
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <h1 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Mapping Jobs</h1>
          <p style={{ color: '#037c6e', fontSize: '0.875rem' }}>Create and manage data transformation mappings with file pattern matching and quality checks</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedSubProjectId('');
              setCurrentPage(1);
            }}
            style={{
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '0.9rem',
              outline: 'none',
              minWidth: '200px'
            }}
          >
            <option value="">Select Project</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          
          <select
            value={selectedSubProjectId}
            onChange={(e) => {
              setSelectedSubProjectId(e.target.value);
              setCurrentPage(1);
            }}
            disabled={!selectedProjectId}
            style={{
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '0.9rem',
              outline: 'none',
              minWidth: '200px',
              opacity: selectedProjectId ? 1 : 0.5
            }}
          >
            <option value="">All Subprojects</option>
            {availableSubProjects.map(subProject => (
              <option key={subProject.id} value={subProject.id}>
                {subProject.name}
              </option>
            ))}
          </select>
          
          <button 
            className="btn btn-primary"
            onClick={handleCreateMapping}
            disabled={!hasWritePermission('transformation')}
          >
            <FiPlus /> Create Mapping Job
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
          {!selectedProjectId ? (
            <div className="empty-state">
              <FiFolder size={48} />
              <h3>No project selected</h3>
              <p>Please select a project from the dropdown above to view mapping jobs</p>
            </div>
          ) : mappings.length === 0 ? (
            <div className="empty-state">
              <FiLayers size={48} />
              <h3>No mappings yet</h3>
              <p>Create your first mapping to start transforming data files</p>
              <button 
                className="btn btn-primary"
                onClick={handleCreateMapping}
              >
                <FiPlus /> Create Mapping Job
              </button>
            </div>
          ) : filteredMappings.length === 0 ? (
            <div className="empty-state">
              <FiFolder size={48} />
              <h3>No mapping jobs found</h3>
              <p>No mappings found for the selected project{selectedSubProjectId ? ' and subproject' : ''}</p>
            </div>
          ) : (
            <div>
              {groupedProjects.map(project => {
                const projectKey = `project-${project.projectId}`;
                const isProjectExpanded = expansionState[projectKey];

                return (
                  <div key={project.projectId} style={{ marginBottom: '1rem' }}>
                    {/* Project Header */}
                    <div
                      onClick={() => toggleExpansion(projectKey)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: 'white',
                        color: '#6b7280',
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontWeight: '500',
                        fontSize: '0.8125rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {isProjectExpanded ? (
                        <FiChevronDown size={14} style={{ color: '#6b7280' }} />
                      ) : (
                        <FiChevronRight size={14} style={{ color: '#6b7280' }} />
                      )}
                      <span style={{ flex: 1 }}>Project : {project.projectName}</span>
                      <span
                        style={{
                          color: '#9ca3af',
                          fontSize: '0.75rem',
                          fontWeight: '400'
                        }}
                      >
                        {project.mappingsCount} {project.mappingsCount === 1 ? 'mapping' : 'mappings'}
                      </span>
                    </div>

                    {/* Project Content */}
                    {isProjectExpanded && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {/* Subprojects */}
                        {project.subprojects.map(subproject => {
                          const subprojectKey = `subproject-${project.projectId}-${subproject.subProjectId}`;
                          const isSubprojectExpanded = expansionState[subprojectKey];

                          return (
                            <div key={subproject.subProjectId} style={{ marginBottom: '0.75rem' }}>
                              {/* Subproject Header */}
                              <div
                                onClick={() => toggleExpansion(subprojectKey)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.4rem 0.75rem',
                                  background: 'white',
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  marginLeft: '1.5rem',
                                  fontWeight: '400',
                                  fontSize: '0.75rem',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                {isSubprojectExpanded ? (
                                  <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                                ) : (
                                  <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                                )}
                                <span style={{ flex: 1, color: '#9ca3af' }}>{subproject.subProjectName}</span>
                                <span
                                  style={{
                                    color: '#d1d5db',
                                    fontSize: '0.6875rem',
                                    fontWeight: '400'
                                  }}
                                >
                                  {subproject.mappingsCount}
                                </span>
                              </div>

                              {/* Subproject Mappings Table */}
                              {isSubprojectExpanded && subproject.items.length > 0 && (
                                <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                  <table className="mappings-table" style={{ fontSize: '0.8125rem', width: '100%' }}>
                                    <thead>
                                      <tr style={{ fontSize: '0.8125rem', fontWeight: 'bold' }}>
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
                                    <tbody style={{ fontSize: '0.8125rem', fontWeight: 'normal' }}>
                                      {subproject.items.map(mapping => renderMappingRow(mapping))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Unassigned Mappings (no subproject) */}
                        {project.unassignedMappings.length > 0 && (
                          <div style={{ marginBottom: '0.75rem' }}>
                            {(() => {
                              const unassignedKey = `subproject-${project.projectId}-unassigned`;
                              const isUnassignedExpanded = expansionState[unassignedKey];

                              return (
                                <>
                                  {/* Unassigned Header */}
                                  <div
                                    onClick={() => toggleExpansion(unassignedKey)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      padding: '0.4rem 0.75rem',
                                      background: 'white',
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                      marginLeft: '1.5rem',
                                      fontWeight: '400',
                                      fontSize: '0.75rem',
                                      transition: 'all 0.2s ease'
                                    }}
                                  >
                                    {isUnassignedExpanded ? (
                                      <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                                    ) : (
                                      <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                                    )}
                                    <FiAlertCircle size={12} style={{ color: '#d1d5db' }} />
                                    <span style={{ flex: 1, color: '#9ca3af' }}>No Subproject</span>
                                    <span
                                      style={{
                                        color: '#d1d5db',
                                        fontSize: '0.6875rem',
                                        fontWeight: '400'
                                      }}
                                    >
                                      {project.unassignedMappings.length}
                                    </span>
                                  </div>

                                  {/* Unassigned Mappings Table */}
                                  {isUnassignedExpanded && (
                                    <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                      <table className="mappings-table" style={{ fontSize: '0.8125rem', width: '100%' }}>
                                        <thead>
                                          <tr style={{ fontSize: '0.8125rem', fontWeight: 'bold' }}>
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
                                        <tbody style={{ fontSize: '0.8125rem', fontWeight: 'normal' }}>
                                          {project.unassignedMappings.map(mapping => renderMappingRow(mapping))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {filteredMappings.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={filteredMappings.length}
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
