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
  FiAlertCircle,
  FiSearch,
  FiFolder
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
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
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchInitData();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchMappings();
    }
  }, [selectedProjectId]);

  const fetchInitData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/transformations/init-data`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setProjects(response.data.projects || []);
      setMappings(response.data.mappings || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching init data:', err);
      setError(err.response?.data?.error || 'Failed to load mappings data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMappings = async () => {
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
      await fetchAllMappings();
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

  // Handle search with auto-population of project/subproject
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const matchedMapping = mappings.find(m => 
      m.mapping_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (matchedMapping) {
      setSelectedProjectId(String(matchedMapping.project_id));
      if (matchedMapping.sub_project_id) {
        setSelectedSubProjectId(String(matchedMapping.sub_project_id));
      } else {
        setSelectedSubProjectId('');
      }
      setCurrentPage(1);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
  };

  // Get subprojects for selected project
  const selectedProject = projects.find(p => Number(p.id) === Number(selectedProjectId));
  const availableSubProjects = selectedProject?.sub_projects || [];
  const projectHasSubProjects = availableSubProjects.length > 0;

  // Filter mappings based on selected project, subproject, and search query
  const filteredMappings = mappings.filter(mapping => {
    // Search filter
    if (searchQuery && !mapping.mapping_name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    if (!selectedProjectId) return false;
    
    const mappingProjectId = Number(mapping.project_id);
    const selectedProjId = Number(selectedProjectId);
    const matchesProject = mappingProjectId === selectedProjId;
    
    if (!matchesProject) return false;

    // If project has subprojects and none is selected
    if (projectHasSubProjects && !selectedSubProjectId) {
      // Allow project-level mappings (null sub_project_id) to show even without subproject selection
      // This enables search to work for project-level mappings
      if (!mapping.sub_project_id) {
        return true;
      }
      // Hide subproject-specific mappings until a subproject is selected
      return false;
    }

    // If a subproject is selected, show mappings from that subproject AND project-level mappings (null sub_project_id)
    if (selectedSubProjectId) {
      const mappingSubProjId = Number(mapping.sub_project_id);
      const selectedSubProjId = Number(selectedSubProjectId);
      // Show if it matches the selected subproject OR if it's a project-level mapping (no subproject)
      return mappingSubProjId === selectedSubProjId || !mapping.sub_project_id;
    }

    // Project has no subprojects, show all mappings (including project-level ones)
    return true;
  });

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentMappings = filteredMappings.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredMappings.length / itemsPerPage);

  // Conditional render AFTER all hooks
  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  // Render a table row for a mapping
  const renderMappingRow = (mapping) => {
    const fieldCount = Array.isArray(mapping.field_mappings) 
      ? mapping.field_mappings.length 
      : (typeof mapping.field_mappings === 'string' ? JSON.parse(mapping.field_mappings).length : 0);
    const rulesCount = mapping.anomaly_rules 
      ? (typeof mapping.anomaly_rules === 'object' ? Object.keys(mapping.anomaly_rules).length : 0) 
      : 0;
    
    // Construct complete source path
    const sourcePath = [];
    if (mapping.source_connection_name) sourcePath.push(mapping.source_connection_name);
    else if (mapping.vendor_agreement_name) sourcePath.push(mapping.vendor_agreement_name);
    if (mapping.file_path && mapping.file_path !== '') sourcePath.push(mapping.file_path);
    const sourceDisplay = sourcePath.length > 0 ? sourcePath.join('/') : (mapping.source_owner || '-');
    
    // Construct complete target path
    const targetPath = [];
    if (mapping.target_connection_name) targetPath.push(mapping.target_connection_name);
    if (mapping.target_file_path && mapping.target_file_path !== '') targetPath.push(mapping.target_file_path);
    const targetDisplay = targetPath.length > 0 ? targetPath.join('/') : (mapping.target_owner || '-');
    
    return (
      <tr key={mapping.id} style={{ fontFamily: 'Inter, sans-serif' }}>
        <td className="mapping-name-cell" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>
          <strong>{mapping.mapping_name}</strong>
        </td>
        <td style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>
          {sourceDisplay}
        </td>
        <td style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>
          <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '3px', fontFamily: 'Inter, monospace' }}>
            {mapping.file_path && mapping.file_path !== '' ? `${mapping.file_path}/` : ''}
            {mapping.file_name_pattern || mapping.source_file_pattern}
          </code>
        </td>
        <td style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>
          {targetDisplay}
        </td>
        <td style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>
          {mapping.target_file_name || '-'}
        </td>
        <td style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>{fieldCount}</td>
        <td style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>{rulesCount}</td>
        <td style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>{formatDate(mapping.created_at)}</td>
        <td style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '500' }}>
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
    <div className="page-container" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header with title and description */}
      <div className="page-header">
        <div className="header-content">
          <h1 style={{ fontSize: '1.1rem', fontWeight: 'bold', fontFamily: 'Inter, sans-serif' }}>Mapping Jobs</h1>
          <p style={{ color: '#037c6e', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>Create and manage data transformation mappings with file pattern matching and quality checks</p>
        </div>
      </div>
      
      {/* First Row: Search only */}
      <div style={{ marginBottom: '1rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search mapping jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem',
                outline: 'none',
                minWidth: '250px',
                fontFamily: 'Inter, sans-serif'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '0.25rem'
                }}
              >
                <FiXCircle size={16} />
              </button>
            )}
          </div>
          <button 
            type="submit"
            className="btn btn-primary"
            style={{ fontFamily: 'Inter, sans-serif', width: 'auto', padding: '0.5rem 1rem', whiteSpace: 'nowrap', flexGrow: 0, flexShrink: 0 }}
          >
            <FiSearch /> Search
          </button>
        </form>
      </div>
      
      {/* Second Row: Project, Subproject, and Create Button */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
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
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            minWidth: '200px',
            fontFamily: 'Inter, sans-serif'
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
          disabled={!selectedProjectId || !projectHasSubProjects}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            minWidth: '200px',
            opacity: (selectedProjectId && projectHasSubProjects) ? 1 : 0.5,
            fontFamily: 'Inter, sans-serif'
          }}
        >
          <option value="">Select Subproject</option>
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
          style={{ fontFamily: 'Inter, sans-serif', width: 'auto', padding: '0.5rem 1rem', whiteSpace: 'nowrap', flexGrow: 0, flexShrink: 0 }}
        >
          <FiPlus /> Create Mapping Job
        </button>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        {error && (
          <div className="error-message" style={{ margin: '1rem' }}>
            <FiAlertCircle /> {error}
          </div>
        )}

        <div className="mappings-table-container">
          {!selectedProjectId ? (
            <div className="empty-state" style={{ fontFamily: 'Inter, sans-serif' }}>
              <FiFolder size={48} />
              <h3 style={{ fontFamily: 'Inter, sans-serif' }}>No project selected</h3>
              <p style={{ fontFamily: 'Inter, sans-serif' }}>Please select a project from the dropdown above to view mapping jobs</p>
            </div>
          ) : mappings.length === 0 ? (
            <div className="empty-state" style={{ fontFamily: 'Inter, sans-serif' }}>
              <FiLayers size={48} />
              <h3 style={{ fontFamily: 'Inter, sans-serif' }}>No mappings yet</h3>
              <p style={{ fontFamily: 'Inter, sans-serif' }}>Create your first mapping to start transforming data files</p>
              <button 
                className="btn btn-primary"
                onClick={handleCreateMapping}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <FiPlus /> Create Mapping Job
              </button>
            </div>
          ) : filteredMappings.length === 0 ? (
            <div className="empty-state" style={{ fontFamily: 'Inter, sans-serif' }}>
              {projectHasSubProjects && !selectedSubProjectId ? (
                <>
                  <FiFolder size={48} />
                  <h3 style={{ fontFamily: 'Inter, sans-serif' }}>Select a subproject</h3>
                  <p style={{ fontFamily: 'Inter, sans-serif' }}>This project has subprojects. Please select a subproject to view mapping jobs</p>
                </>
              ) : (
                <>
                  <FiSearch size={48} />
                  <h3 style={{ fontFamily: 'Inter, sans-serif' }}>No mapping jobs found</h3>
                  <p style={{ fontFamily: 'Inter, sans-serif' }}>
                    {searchQuery ? `No mappings found matching "${searchQuery}"` : 
                    `No mappings found for the selected ${selectedSubProjectId ? 'subproject' : 'project'}`}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table className="mappings-table" style={{ width: '100%', fontFamily: 'Inter, sans-serif' }}>
                <thead>
                  <tr style={{ fontSize: '14px', fontWeight: '500', fontFamily: 'Inter, sans-serif' }}>
                    <th>Mapping Name</th>
                    <th>Source Path</th>
                    <th>Source File Pattern</th>
                    <th>Target Path</th>
                    <th>Target File Name</th>
                    <th>Fields</th>
                    <th>Quality Rules</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: '12px', fontWeight: '500', fontFamily: 'Inter, sans-serif' }}>
                  {currentMappings.map(mapping => renderMappingRow(mapping))}
                </tbody>
              </table>
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
          <div className="modal-content" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'Inter, sans-serif' }}>Delete Mapping</h2>
              <button className="modal-close" onClick={cancelDelete}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <FiAlertCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
                    Are you sure you want to delete this mapping?
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em', fontFamily: 'Inter, sans-serif' }}>
                    Mapping: <strong>{mappingToDelete?.name}</strong>
                  </p>
                  <p style={{ margin: 0, marginTop: '0.5rem', color: '#64748b', fontSize: '0.875em', fontFamily: 'Inter, sans-serif' }}>
                    This action cannot be undone. All field mappings and quality rules will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cancelDelete} style={{ fontFamily: 'Inter, sans-serif' }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} style={{ fontFamily: 'Inter, sans-serif' }}>
                <FiTrash2 /> Delete Mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Result Modal */}
      {executionModalOpen && executionResult && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'Inter, sans-serif' }}>{executionResult.success ? 'Execution Started' : 'Execution Failed'}</h2>
              <button className="modal-close" onClick={closeExecutionModal}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                {executionResult.success ? (
                  <FiCheckCircle size={48} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <FiXCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
                    {executionResult.message}
                  </p>
                  {executionResult.jobId && (
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em', fontFamily: 'Inter, sans-serif' }}>
                      Job ID: <code style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '3px', fontFamily: 'Inter, monospace' }}>{executionResult.jobId}</code>
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeExecutionModal} style={{ fontFamily: 'Inter, sans-serif' }}>
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
