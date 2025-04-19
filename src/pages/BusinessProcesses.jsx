import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  getBusinessProcesses, 
  createBusinessProcess,
  deleteBusinessProcess 
} from '../api/businessProcessesService';
import { getUserGroups } from '../api/groupsService';
import { useAuth } from '../context/AuthContext';
import '../styles/BusinessProcesses.css';

const BusinessProcesses = () => {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userGroups, setUserGroups] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProcess, setNewProcess] = useState({
    name: '',
    description: '',
    group_id: ''
  });
  const { hasFeaturePermission } = useAuth();
  const navigate = useNavigate();
  
  const fetchProcesses = async () => {
    setLoading(true);
    try {
      const response = await getBusinessProcesses();
      if (response.success) {
        setProcesses(response.data);
      } else {
        setError(response.error || 'Failed to fetch business processes');
      }
    } catch (err) {
      setError('An error occurred while fetching business processes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchUserGroups = async () => {
    try {
      const response = await getUserGroups();
      if (response.success) {
        setUserGroups(response.data);
        
        // Set default group if available
        if (response.data.length > 0 && !newProcess.group_id) {
          setNewProcess({
            ...newProcess,
            group_id: response.data[0].id
          });
        }
      }
    } catch (err) {
      console.error('Error fetching user groups:', err);
    }
  };
  
  useEffect(() => {
    fetchProcesses();
    fetchUserGroups();
  }, []);
  
  const handleCreateProcess = async () => {
    try {
      const response = await createBusinessProcess(newProcess);
      if (response.success) {
        setShowCreateModal(false);
        setNewProcess({ name: '', description: '', group_id: userGroups[0]?.id || '' });
        fetchProcesses();
      } else {
        setError(response.error || 'Failed to create business process');
      }
    } catch (err) {
      setError('An error occurred while creating business process');
      console.error(err);
    }
  };
  
  const handleDeleteProcess = async (id) => {
    if (window.confirm('Are you sure you want to delete this business process? All associated jobs will also be deleted.')) {
      try {
        const response = await deleteBusinessProcess(id);
        if (response.success) {
          fetchProcesses();
        } else {
          setError(response.error || 'Failed to delete business process');
        }
      } catch (err) {
        setError('An error occurred while deleting business process');
        console.error(err);
      }
    }
  };
  
  if (loading) {
    return <div className="loading">Loading business processes...</div>;
  }
  
  return (
    <div className="business-processes-container">
      <div className="page-header">
        <h1>Business Processes</h1>
        {hasFeaturePermission('business_process', 'write') && (
          <button 
            className="primary-button create-button"
            onClick={() => setShowCreateModal(true)}
          >
            Create Business Process
          </button>
        )}
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {processes.length === 0 ? (
        <div className="no-data">
          <p>No business processes found.</p>
          {hasFeaturePermission('business_process', 'write') && (
            <button 
              className="primary-button"
              onClick={() => setShowCreateModal(true)}
            >
              Create your first business process
            </button>
          )}
        </div>
      ) : (
        <div className="process-cards">
          {processes.map(process => (
            <div className="process-card" key={process.id}>
              <div className="process-card-header">
                <h3>{process.name}</h3>
                <div className="process-actions">
                  {hasFeaturePermission('business_process', 'write') && (
                    <>
                      <button 
                        className="icon-button edit"
                        onClick={() => navigate(`/business-processes/${process.id}/edit`)}
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button 
                        className="icon-button delete"
                        onClick={() => handleDeleteProcess(process.id)}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="process-description">
                {process.description || 'No description provided.'}
              </p>
              <div className="process-meta">
                <span>Group: {process.group_name || 'Default'}</span>
                <span>Created by: {process.created_by_name}</span>
                <span>Jobs: {process.job_count || 0}</span>
              </div>
              <div className="process-card-footer">
                <Link 
                  to={`/business-processes/${process.id}`}
                  className="view-details-link"
                >
                  View Details
                </Link>
                {hasFeaturePermission('job', 'write') && (
                  <button 
                    className="secondary-button"
                    onClick={() => navigate(`/jobs/create?process=${process.id}`)}
                  >
                    Add Job
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Create Business Process Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create Business Process</h2>
              <button 
                className="close-button"
                onClick={() => setShowCreateModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="process-name">Name</label>
                <input
                  id="process-name"
                  type="text"
                  value={newProcess.name}
                  onChange={(e) => setNewProcess({...newProcess, name: e.target.value})}
                  placeholder="Enter business process name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="process-description">Description</label>
                <textarea
                  id="process-description"
                  value={newProcess.description}
                  onChange={(e) => setNewProcess({...newProcess, description: e.target.value})}
                  placeholder="Enter description"
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label htmlFor="process-group">Group</label>
                <select
                  id="process-group"
                  value={newProcess.group_id}
                  onChange={(e) => setNewProcess({...newProcess, group_id: e.target.value})}
                >
                  {userGroups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="secondary-button"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button 
                className="primary-button"
                onClick={handleCreateProcess}
                disabled={!newProcess.name}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessProcesses;