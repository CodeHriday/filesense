import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './VisualMappingManager.css';
import { 
  FaPlus, 
  FaSearch,
  FaFilter,
  FaHistory,
  FaCopy
} from 'react-icons/fa';
import { FiEdit2, FiTrash2, FiPlay } from 'react-icons/fi';

const VisualMappingManager = () => {
  const navigate = useNavigate();
  
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedSubProject, setSelectedSubProject] = useState('');
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  
  // Selected items for bulk actions
  const [selectedMappings, setSelectedMappings] = useState(new Set());
  
  // Execution history modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyMappingId, setHistoryMappingId] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  
  // Load projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get('/api/projects');
        setProjects(response.data);
      } catch (error) {
        console.error('Error fetching projects:', error);
      }
    };
    fetchProjects();
  }, []);
  
  // Load subprojects when project changes
  useEffect(() => {
    const fetchSubProjects = async () => {
      if (!selectedProject) {
        setSubProjects([]);
        return;
      }
      try {
        const response = await axios.get(`/api/projects/${selectedProject}/sub-projects`);
        setSubProjects(response.data);
      } catch (error) {
        console.error('Error fetching subprojects:', error);
        setSubProjects([]);
      }
    };
    fetchSubProjects();
  }, [selectedProject]);
  
  // Load mappings
  useEffect(() => {
    fetchMappings();
  }, [selectedProject, selectedSubProject]);
  
  const fetchMappings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {};
      if (selectedProject) params.project_id = selectedProject;
      if (selectedSubProject) params.sub_project_id = selectedSubProject;
      
      const response = await axios.get('/api/visual-mappings', { params });
      setMappings(response.data);
    } catch (error) {
      console.error('Error fetching visual mappings:', error);
      setError('Failed to load visual mappings');
    } finally {
      setLoading(false);
    }
  };
  
  const filteredMappings = mappings.filter(mapping => {
    if (searchQuery.trim() === '') return true;
    const query = searchQuery.toLowerCase();
    return (
      mapping.name.toLowerCase().includes(query) ||
      (mapping.description && mapping.description.toLowerCase().includes(query)) ||
      (mapping.project_name && mapping.project_name.toLowerCase().includes(query))
    );
  });
  
  const handleCreate = () => {
    navigate('/visual-mappings/new');
  };
  
  const handleEdit = (mappingId) => {
    navigate(`/visual-mappings/${mappingId}`);
  };
  
  const handleDelete = async (mappingId, mappingName) => {
    if (!window.confirm(`Are you sure you want to delete "${mappingName}"?`)) {
      return;
    }
    
    try {
      await axios.delete(`/api/visual-mappings/${mappingId}`);
      setSuccess('Visual mapping deleted successfully');
      fetchMappings();
    } catch (error) {
      console.error('Error deleting mapping:', error);
      setError(error.response?.data?.error || 'Failed to delete mapping');
    }
  };
  
  const handleClone = async (mappingId, mappingName) => {
    try {
      const response = await axios.post(`/api/visual-mappings/${mappingId}/clone`);
      if (response.data.success && response.data.mapping?.id) {
        setSuccess(`Cloned "${mappingName}" successfully`);
        // Navigate to the new cloned mapping for editing
        navigate(`/visual-mappings/${response.data.mapping.id}`);
      } else {
        setError(response.data.error || 'Failed to clone mapping');
      }
    } catch (error) {
      console.error('Error cloning mapping:', error);
      setError(error.response?.data?.error || 'Failed to clone mapping');
    }
  };
  
  const handleExecute = async (mappingId) => {
    try {
      const response = await axios.post(`/api/visual-mappings/${mappingId}/execute`);
      setSuccess(`Execution started: ${response.data.execution_id}`);
    } catch (error) {
      console.error('Error executing mapping:', error);
      setError(error.response?.data?.error || 'Failed to execute mapping');
    }
  };
  
  const handleShowHistory = async (mappingId) => {
    setHistoryMappingId(mappingId);
    setShowHistoryModal(true);
    
    try {
      const response = await axios.get(`/api/visual-mappings/${mappingId}/executions`);
      setExecutionHistory(response.data);
    } catch (error) {
      console.error('Error fetching execution history:', error);
      setError('Failed to load execution history');
    }
  };
  
  const toggleSelectMapping = (mappingId) => {
    const newSelected = new Set(selectedMappings);
    if (newSelected.has(mappingId)) {
      newSelected.delete(mappingId);
    } else {
      newSelected.add(mappingId);
    }
    setSelectedMappings(newSelected);
  };
  
  const toggleSelectAll = () => {
    if (selectedMappings.size === filteredMappings.length) {
      setSelectedMappings(new Set());
    } else {
      setSelectedMappings(new Set(filteredMappings.map(m => m.id)));
    }
  };
  
  const handleBulkDelete = async () => {
    if (selectedMappings.size === 0) return;
    
    if (!window.confirm(`Delete ${selectedMappings.size} selected visual mappings?`)) {
      return;
    }
    
    try {
      await Promise.all(
        Array.from(selectedMappings).map(id => axios.delete(`/api/visual-mappings/${id}`))
      );
      setSuccess(`Deleted ${selectedMappings.size} visual mappings`);
      setSelectedMappings(new Set());
      fetchMappings();
    } catch (error) {
      console.error('Error deleting mappings:', error);
      setError('Failed to delete some mappings');
    }
  };
  
  const handleBulkExecute = async () => {
    if (selectedMappings.size === 0) return;
    
    try {
      await Promise.all(
        Array.from(selectedMappings).map(id => axios.post(`/api/visual-mappings/${id}/execute`))
      );
      setSuccess(`Started execution for ${selectedMappings.size} visual mappings`);
      setSelectedMappings(new Set());
    } catch (error) {
      console.error('Error executing mappings:', error);
      setError('Failed to execute some mappings');
    }
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };
  
  const getStatusBadge = (status) => {
    const statusColors = {
      pending: 'badge-pending',
      running: 'badge-running',
      completed: 'badge-completed',
      failed: 'badge-failed',
      cancelled: 'badge-cancelled'
    };
    return statusColors[status] || 'badge-default';
  };
  
  return (
    <div className="visual-mapping-manager">
      <div className="visual-mapping-manager-header">
        <div className="visual-mapping-manager-header-left">
          <h1 className="visual-mapping-manager-title">Visual Mappings</h1>
          <p className="visual-mapping-manager-subtitle">
            Manage visual ETL mapping configurations
          </p>
        </div>
        <div className="visual-mapping-manager-header-right">
          <button onClick={handleCreate} className="visual-mapping-manager-btn-primary">
            <FaPlus /> Create Visual Mapping
          </button>
        </div>
      </div>
      
      {error && (
        <div className="visual-mapping-manager-alert visual-mapping-manager-alert-error">
          {error}
          <button onClick={() => setError(null)} className="visual-mapping-manager-alert-close" aria-label="Close error message">×</button>
        </div>
      )}
      
      {success && (
        <div className="visual-mapping-manager-alert visual-mapping-manager-alert-success">
          {success}
          <button onClick={() => setSuccess(null)} className="visual-mapping-manager-alert-close" aria-label="Close success message">×</button>
        </div>
      )}
      
      {/* Filters */}
      <div className="visual-mapping-manager-filters">
        <div className="visual-mapping-manager-filter-group">
          <FaSearch className="visual-mapping-manager-filter-icon" />
          <label htmlFor="search-mappings-input" className="sr-only">Search mappings</label>
          <input
            id="search-mappings-input"
            type="text"
            placeholder="Search mappings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="visual-mapping-manager-search-input"
          />
        </div>
        
        <div className="visual-mapping-manager-filter-group">
          <FaFilter className="visual-mapping-manager-filter-icon" />
          <label htmlFor="project-filter-select" className="sr-only">Filter by project</label>
          <select
            id="project-filter-select"
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setSelectedSubProject('');
            }}
            className="visual-mapping-manager-filter-select"
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        
        {selectedProject && (
          <div className="visual-mapping-manager-filter-group">
            <FaFilter className="visual-mapping-manager-filter-icon" />
            <label htmlFor="subproject-filter-select" className="sr-only">Filter by sub-project</label>
            <select
              id="subproject-filter-select"
              value={selectedSubProject}
              onChange={(e) => setSelectedSubProject(e.target.value)}
              className="visual-mapping-manager-filter-select"
            >
              <option value="">All Sub-Projects</option>
              {Array.isArray(subProjects) && subProjects.map(sp => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </div>
        )}
        
        {selectedMappings.size > 0 && (
          <div className="visual-mapping-manager-bulk-actions">
            <span className="visual-mapping-manager-bulk-count">
              {selectedMappings.size} selected
            </span>
            <button onClick={handleBulkExecute} className="visual-mapping-manager-bulk-btn">
              <FiPlay /> Run Selected
            </button>
            <button onClick={handleBulkDelete} className="visual-mapping-manager-bulk-btn visual-mapping-manager-bulk-btn-danger">
              <FiTrash2 /> Delete Selected
            </button>
          </div>
        )}
      </div>
      
      {/* Mappings Table */}
      {loading ? (
        <div className="visual-mapping-manager-loading">Loading visual mappings...</div>
      ) : (
        <div className="visual-mapping-manager-table-container">
          <table className="visual-mapping-manager-table">
            <thead>
              <tr>
                <th>
                  <label htmlFor="select-all-mappings" className="sr-only">Select all mappings</label>
                  <input
                    id="select-all-mappings"
                    type="checkbox"
                    checked={selectedMappings.size === filteredMappings.length && filteredMappings.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Name</th>
                <th>Description</th>
                <th>Project</th>
                <th>Sub-Project</th>
                <th>Nodes</th>
                <th>Last Executed</th>
                <th>Executions</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMappings.length === 0 ? (
                <tr>
                  <td colSpan="10" className="visual-mapping-manager-empty">
                    No visual mappings found. Create your first visual mapping to get started.
                  </td>
                </tr>
              ) : (
                filteredMappings.map(mapping => (
                  <tr key={mapping.id}>
                    <td>
                      <label htmlFor={`select-mapping-${mapping.id}`} className="sr-only">Select {mapping.name}</label>
                      <input
                        id={`select-mapping-${mapping.id}`}
                        type="checkbox"
                        checked={selectedMappings.has(mapping.id)}
                        onChange={() => toggleSelectMapping(mapping.id)}
                      />
                    </td>
                    <td className="visual-mapping-manager-name-cell">
                      <button
                        onClick={() => handleEdit(mapping.id)}
                        className="visual-mapping-manager-link"
                      >
                        {mapping.name}
                      </button>
                    </td>
                    <td>{mapping.description || '-'}</td>
                    <td>{mapping.project_name || '-'}</td>
                    <td>{mapping.sub_project_name || '-'}</td>
                    <td>{mapping.graph_data?.nodes?.length || 0}</td>
                    <td>{formatDate(mapping.last_executed_at)}</td>
                    <td>{mapping.execution_count || 0}</td>
                    <td>{formatDate(mapping.created_at)}</td>
                    <td className="visual-mapping-manager-actions">
                      <button
                        onClick={() => handleEdit(mapping.id)}
                        className="visual-mapping-manager-action-btn visual-mapping-manager-action-btn-edit"
                        title="Edit"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        onClick={() => handleExecute(mapping.id)}
                        className="visual-mapping-manager-action-btn visual-mapping-manager-action-btn-run"
                        title="Run"
                      >
                        <FiPlay />
                      </button>
                      <button
                        onClick={() => handleShowHistory(mapping.id)}
                        className="visual-mapping-manager-action-btn visual-mapping-manager-action-btn-history"
                        title="Execution History"
                      >
                        <FaHistory />
                      </button>
                      <button
                        onClick={() => handleClone(mapping.id, mapping.name)}
                        className="visual-mapping-manager-action-btn visual-mapping-manager-action-btn-clone"
                        title="Clone"
                      >
                        <FaCopy />
                      </button>
                      <button
                        onClick={() => handleDelete(mapping.id, mapping.name)}
                        className="visual-mapping-manager-action-btn visual-mapping-manager-action-btn-danger"
                        title="Delete"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Execution History Modal */}
      {showHistoryModal && (
        <div className="visual-mapping-manager-modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="visual-mapping-manager-modal" onClick={(e) => e.stopPropagation()}>
            <div className="visual-mapping-manager-modal-header">
              <h2 id="history-modal-title">Execution History</h2>
              <button 
                onClick={() => setShowHistoryModal(false)} 
                className="visual-mapping-manager-modal-close"
                aria-label="Close execution history modal"
              >
                ×
              </button>
            </div>
            <div className="visual-mapping-manager-modal-body">
              {executionHistory.length === 0 ? (
                <p>No execution history found.</p>
              ) : (
                <table className="visual-mapping-manager-history-table">
                  <thead>
                    <tr>
                      <th>Execution ID</th>
                      <th>Status</th>
                      <th>Rows Processed</th>
                      <th>Started At</th>
                      <th>Completed At</th>
                      <th>Triggered By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionHistory.map(exec => (
                      <tr key={exec.id}>
                        <td className="visual-mapping-manager-exec-id">{exec.execution_id}</td>
                        <td>
                          <span className={`visual-mapping-manager-badge ${getStatusBadge(exec.status)}`}>
                            {exec.status}
                          </span>
                        </td>
                        <td>{exec.rows_processed?.toLocaleString() || 0}</td>
                        <td>{formatDate(exec.started_at)}</td>
                        <td>{formatDate(exec.completed_at)}</td>
                        <td>{exec.triggered_by_username || 'System'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualMappingManager;
