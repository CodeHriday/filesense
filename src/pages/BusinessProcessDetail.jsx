import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  getBusinessProcessById, 
  updateBusinessProcess,
  deleteBusinessProcess 
} from '../api/businessProcessesService';
import { getUserGroups } from '../api/groupsService';
import { deleteJob } from '../api/jobsService';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/BusinessProcessDetail.css';

const BusinessProcessDetail = () => {
  const { id } = useParams();
  const [process, setProcess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userGroups, setUserGroups] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProcess, setEditedProcess] = useState({
    name: '',
    description: '',
    group_id: ''
  });
  const { hasFeaturePermission } = useAuth();
  const navigate = useNavigate();
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });
  
  const fetchProcess = async () => {
    setLoading(true);
    try {
      const response = await getBusinessProcessById(id);
      if (response.success) {
        setProcess(response.data);
        setEditedProcess({
          name: response.data.name,
          description: response.data.description || '',
          group_id: response.data.group_id
        });
      } else {
        setError(response.error || 'Failed to fetch workflow');
      }
    } catch (err) {
      setError('An error occurred while fetching workflow');
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
      }
    } catch (err) {
      console.error('Error fetching user groups:', err);
    }
  };
  
  useEffect(() => {
    fetchProcess();
    fetchUserGroups();
  }, [id]);
  
  const handleUpdateProcess = async () => {
    try {
      const response = await updateBusinessProcess(id, editedProcess);
      if (response.success) {
        setIsEditing(false);
        fetchProcess();
      } else {
        setError(response.error || 'Failed to update workflow');
      }
    } catch (err) {
      setError('An error occurred while updating workflow');
      console.error(err);
    }
  };
  
  const handleDeleteProcess = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this workflow? All associated jobs will also be deleted.',
      action: async () => {
        try {
          const response = await deleteBusinessProcess(id);
          if (response.success) {
            navigate('/business-processes');
          } else {
            setError(response.error || 'Failed to delete workflow');
          }
        } catch (err) {
          setError('An error occurred while deleting workflow');
          console.error(err);
        }
      }
    });
  };
  
  const handleDeleteJob = async (jobId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this job? All job history will also be deleted.',
      action: async () => {
        try {
          const response = await deleteJob(jobId);
          if (response.success) {
            fetchProcess();
          } else {
            setError(response.error || 'Failed to delete job');
          }
        } catch (err) {
          setError('An error occurred while deleting job');
          console.error(err);
        }
      }
    });
  };
  
  if (loading) {
    return <div className="loading">Loading workflow...</div>;
  }
  
  if (!process) {
    return (
      <div className="business-process-detail-container">
        <div className="error-message">
          Workflow not found or you don't have permission to view it.
        </div>
        <Link to="/business-processes" className="back-link">
          Back to Workflows
        </Link>
      </div>
    );
  }
  
  return (
    <div className="business-process-detail-container">
      <div className="page-header">
        <div className="header-left">
          <Link to="/business-processes" className="back-link">
            <i className="fas fa-arrow-left"></i> Back to Workflows
          </Link>
          {!isEditing && <h1>{process.name}</h1>}
        </div>
        <div className="header-actions">
          {!isEditing && hasFeaturePermission('business_process', 'write') && (
            <>
              <button 
                className="secondary-button"
                onClick={() => setIsEditing(true)}
              >
                <i className="fas fa-edit"></i> Edit
              </button>
              <button 
                className="danger-button"
                onClick={handleDeleteProcess}
              >
                <i className="fas fa-trash"></i> Delete
              </button>
            </>
          )}
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {isEditing ? (
        <div className="edit-form">
          <div className="form-group">
            <label htmlFor="process-name">Name</label>
            <input
              id="process-name"
              type="text"
              value={editedProcess.name}
              onChange={(e) => setEditedProcess({...editedProcess, name: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label htmlFor="process-description">Description</label>
            <textarea
              id="process-description"
              value={editedProcess.description}
              onChange={(e) => setEditedProcess({...editedProcess, description: e.target.value})}
              rows="3"
            />
          </div>
          <div className="form-group">
            <label htmlFor="process-group">Group</label>
            <select
              id="process-group"
              value={editedProcess.group_id}
              onChange={(e) => setEditedProcess({...editedProcess, group_id: e.target.value})}
            >
              {userGroups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button 
              className="secondary-button"
              onClick={() => {
                setIsEditing(false);
                setEditedProcess({
                  name: process.name,
                  description: process.description || '',
                  group_id: process.group_id
                });
              }}
            >
              Cancel
            </button>
            <button 
              className="primary-button"
              onClick={handleUpdateProcess}
              disabled={!editedProcess.name}
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="process-info">
          <div className="info-section">
            <h3>Description</h3>
            <p>{process.description || 'No description provided.'}</p>
          </div>
          <div className="info-section">
            <h3>Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Group:</span>
                <span className="detail-value">{process.group_name || 'Default'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Created By:</span>
                <span className="detail-value">{process.created_by_name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Created:</span>
                <span className="detail-value">
                  {new Date(process.created_at).toLocaleString()}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Last Updated:</span>
                <span className="detail-value">
                  {new Date(process.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="section-header">
        <h2>Jobs</h2>
        {hasFeaturePermission('job', 'write') && (
          <button 
            className="primary-button"
            onClick={() => navigate(`/jobs/create?process=${id}`)}
          >
            <i className="fas fa-plus"></i> Add Job
          </button>
        )}
      </div>
      
      {process.jobs && process.jobs.length > 0 ? (
        <div className="jobs-table-container">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Source</th>
                <th>Target</th>
                <th>Runs</th>
                <th>Last Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {process.jobs.map(job => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/jobs/${job.id}`}>{job.name}</Link>
                  </td>
                  <td>
                    <span className={`status-badge status-${job.status}`}>
                      {job.status || 'draft'}
                    </span>
                  </td>
                  <td>{job.source_connection_id ? 'Configured' : 'Not configured'}</td>
                  <td>{job.target_connection_id ? 'Configured' : 'Not configured'}</td>
                  <td>{job.run_count || 0}</td>
                  <td>
                    {job.last_run_time 
                      ? new Date(job.last_run_time).toLocaleString() 
                      : 'Never run'}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button 
                        className="icon-button view"
                        onClick={() => navigate(`/jobs/${job.id}`)}
                        title="View Job"
                      >
                        <i className="fas fa-eye"></i>
                      </button>
                      {hasFeaturePermission('job', 'write') && (
                        <>
                          <button 
                            className="icon-button edit"
                            onClick={() => navigate(`/jobs/${job.id}/edit`)}
                            title="Edit Job"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button 
                            className="icon-button run"
                            onClick={() => navigate(`/jobs/${job.id}/run`)}
                            title="Run Job"
                          >
                            <i className="fas fa-play"></i>
                          </button>
                          <button 
                            className="icon-button delete"
                            onClick={() => handleDeleteJob(job.id)}
                            title="Delete Job"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="no-data">
          <p>No jobs have been added to this workflow yet.</p>
          {hasFeaturePermission('job', 'write') && (
            <button 
              className="primary-button"
              onClick={() => navigate(`/jobs/create?process=${id}`)}
            >
              Add your first job
            </button>
          )}
        </div>
      )}
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.action?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        variant="danger"
      />
    </div>
  );
};

export default BusinessProcessDetail;