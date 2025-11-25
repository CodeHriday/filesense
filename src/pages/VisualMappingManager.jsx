import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  FaPlus, 
  FaEdit, 
  FaTrash, 
  FaPlay, 
  FaSearch,
  FaFilter,
  FaHistory
} from 'react-icons/fa';

const VisualMappingManager = () => {
  const navigate = useNavigate();
  
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedSubProject, setSelectedSubProject] = useState('');
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  
  const [selectedMappings, setSelectedMappings] = useState(new Set());
  
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyMappingId, setHistoryMappingId] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  
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
    const statusClasses = {
      pending: 'badge-pending',
      running: 'badge-running',
      completed: 'badge-completed',
      failed: 'badge-failed',
      cancelled: 'badge-cancelled'
    };
    return statusClasses[status] || 'badge-default';
  };
  
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Visual Mappings</h1>
          <p className="page-subtitle">Manage visual ETL mapping configurations</p>
        </div>
        <div className="page-header-right">
          <button onClick={handleCreate} className="btn-primary">
            <FaPlus /> Create Visual Mapping
          </button>
        </div>
      </div>
      
      {error && (
        <div className="page-alert page-alert-error">
          {error}
          <button onClick={() => setError(null)} className="page-alert-close">&times;</button>
        </div>
      )}
      
      {success && (
        <div className="page-alert page-alert-success">
          {success}
          <button onClick={() => setSuccess(null)} className="page-alert-close">&times;</button>
        </div>
      )}
      
      <div className="page-filters">
        <div className="page-filter-group">
          <FaSearch className="page-filter-icon" />
          <input
            type="text"
            placeholder="Search mappings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="page-filter-input"
          />
        </div>
        
        <div className="page-filter-group">
          <FaFilter className="page-filter-icon" />
          <select
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setSelectedSubProject('');
            }}
            className="page-filter-select"
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        
        {selectedProject && (
          <div className="page-filter-group">
            <FaFilter className="page-filter-icon" />
            <select
              value={selectedSubProject}
              onChange={(e) => setSelectedSubProject(e.target.value)}
              className="page-filter-select"
            >
              <option value="">All Sub-Projects</option>
              {Array.isArray(subProjects) && subProjects.map(sp => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </div>
        )}
        
        {selectedMappings.size > 0 && (
          <div className="page-bulk-actions">
            <span className="page-bulk-count">{selectedMappings.size} selected</span>
            <button onClick={handleBulkExecute} className="btn-primary btn-sm">
              <FaPlay /> Run Selected
            </button>
            <button onClick={handleBulkDelete} className="btn-danger btn-sm">
              <FaTrash /> Delete Selected
            </button>
          </div>
        )}
      </div>
      
      {loading ? (
        <div className="page-loading">Loading visual mappings...</div>
      ) : (
        <div className="page-table-container">
          <table className="page-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
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
                  <td colSpan="10" className="page-table-empty">
                    No visual mappings found. Create your first visual mapping to get started.
                  </td>
                </tr>
              ) : (
                filteredMappings.map(mapping => (
                  <tr key={mapping.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedMappings.has(mapping.id)}
                        onChange={() => toggleSelectMapping(mapping.id)}
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => handleEdit(mapping.id)}
                        className="page-table-link"
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
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleEdit(mapping.id)}
                          className="action-btn"
                          title="Edit"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleExecute(mapping.id)}
                          className="action-btn action-btn-success"
                          title="Run"
                        >
                          <FaPlay />
                        </button>
                        <button
                          onClick={() => handleShowHistory(mapping.id)}
                          className="action-btn"
                          title="Execution History"
                        >
                          <FaHistory />
                        </button>
                        <button
                          onClick={() => handleDelete(mapping.id, mapping.name)}
                          className="action-btn action-btn-danger"
                          title="Delete"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Execution History</h2>
              <button onClick={() => setShowHistoryModal(false)} className="modal-close">&times;</button>
            </div>
            <div className="modal-body">
              {executionHistory.length === 0 ? (
                <p className="text-muted">No execution history found.</p>
              ) : (
                <table className="page-table">
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
                        <td style={{ fontFamily: 'monospace', fontSize: '9px' }}>{exec.execution_id}</td>
                        <td>
                          <span className={`badge ${getStatusBadge(exec.status)}`}>
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
