import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
  getJobById, 
  updateJob,
  deleteJob,
  runJob
} from '../api/jobsService';
import { getBusinessProcessById } from '../api/businessProcessesService';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/JobDetail.css';

const JobDetail = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [businessProcess, setBusinessProcess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedJob, setEditedJob] = useState({
    name: '',
    description: '',
    status: 'draft'
  });
  const { hasFeaturePermission } = useAuth();
  const navigate = useNavigate();
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });
  
  const fetchJob = async () => {
    setLoading(true);
    try {
      const response = await getJobById(id);
      if (response.success) {
        setJob(response.data);
        setEditedJob({
          name: response.data.name,
          description: response.data.description || '',
          status: response.data.status || 'draft'
        });
        
        // Fetch business process details
        const processResponse = await getBusinessProcessById(response.data.business_process_id);
        if (processResponse.success) {
          setBusinessProcess(processResponse.data);
        }
      } else {
        setError(response.error || 'Failed to fetch job');
      }
    } catch (err) {
      setError('An error occurred while fetching job');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchJob();
  }, [id]);
  
  const handleUpdateJob = async () => {
    try {
      const response = await updateJob(id, {
        ...job,
        name: editedJob.name,
        description: editedJob.description,
        status: editedJob.status
      });
      if (response.success) {
        setIsEditing(false);
        fetchJob();
      } else {
        setError(response.error || 'Failed to update job');
      }
    } catch (err) {
      setError('An error occurred while updating job');
      console.error(err);
    }
  };
  
  const handleDeleteJob = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this job? All job history will also be deleted.',
      action: async () => {
        try {
          const response = await deleteJob(id);
          if (response.success) {
            navigate('/jobs');
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
  
  const handleRunJob = async () => {
    try {
      const response = await runJob(id);
      if (response.success) {
        alert('Job started successfully!');
        fetchJob(); // Refresh job data
      } else {
        setError(response.error || 'Failed to run job');
      }
    } catch (err) {
      setError('An error occurred while running job');
      console.error(err);
    }
  };
  
  if (loading) {
    return <LoadingSpinner fullPage={true} />;
  }
  
  if (!job) {
    return (
      <div className="job-detail-container">
        <div className="error-message">
          Job not found or you don't have permission to view it.
        </div>
        <Link to="/jobs" className="back-link">
          Back to Jobs
        </Link>
      </div>
    );
  }
  
  return (
    <div className="job-detail-container">
      <div className="page-header">
        <div className="header-left">
          <Link to="/jobs" className="back-link">
            <i className="fas fa-arrow-left"></i> Back to Jobs
          </Link>
          {!isEditing && <h1>{job.name}</h1>}
        </div>
        <div className="header-actions">
          {!isEditing && job.status !== 'running' && hasFeaturePermission('job', 'write') && (
            <button 
              className="primary-button"
              onClick={handleRunJob}
            >
              <i className="fas fa-play"></i> Run Job
            </button>
          )}
          {!isEditing && hasFeaturePermission('job', 'write') && (
            <>
              <button 
                className="secondary-button"
                onClick={() => setIsEditing(true)}
              >
                <i className="fas fa-edit"></i> Edit
              </button>
              <button 
                className="danger-button"
                onClick={handleDeleteJob}
              >
                <i className="fas fa-trash"></i> Delete
              </button>
            </>
          )}
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {/* Job Status Badge */}
      <div className="job-status">
        <span className={`status-badge status-${job.status}`}>
          {job.status || 'draft'}
        </span>
      </div>
      
      {isEditing ? (
        <div className="edit-form">
          <div className="form-group">
            <label htmlFor="job-name">Name</label>
            <input
              id="job-name"
              type="text"
              value={editedJob.name}
              onChange={(e) => setEditedJob({...editedJob, name: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label htmlFor="job-description">Description</label>
            <textarea
              id="job-description"
              value={editedJob.description}
              onChange={(e) => setEditedJob({...editedJob, description: e.target.value})}
              rows="3"
            />
          </div>
          <div className="form-group">
            <label htmlFor="job-status">Status</label>
            <select
              id="job-status"
              value={editedJob.status}
              onChange={(e) => setEditedJob({...editedJob, status: e.target.value})}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div className="form-actions">
            <button 
              className="secondary-button"
              onClick={() => {
                setIsEditing(false);
                setEditedJob({
                  name: job.name,
                  description: job.description || '',
                  status: job.status || 'draft'
                });
              }}
            >
              Cancel
            </button>
            <button 
              className="primary-button"
              onClick={handleUpdateJob}
              disabled={!editedJob.name}
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="job-info">
          <div className="info-section">
            <h3>Description</h3>
            <p>{job.description || 'No description provided.'}</p>
          </div>
          
          <div className="info-section">
            <h3>Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Workflow:</span>
                <span className="detail-value">
                  <Link to={`/business-processes/${job.business_process_id}`}>
                    {job.business_process_name || businessProcess?.name || 'Unknown'}
                  </Link>
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Created By:</span>
                <span className="detail-value">{job.created_by_name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Created:</span>
                <span className="detail-value">
                  {new Date(job.created_at).toLocaleString()}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Last Updated:</span>
                <span className="detail-value">
                  {new Date(job.updated_at).toLocaleString()}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Source:</span>
                <span className="detail-value">
                  {job.source_connection_id ? 'Configured' : 'Not configured'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Target:</span>
                <span className="detail-value">
                  {job.target_connection_id ? 'Configured' : 'Not configured'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="info-section">
            <h3>Configuration</h3>
            <div className="configuration-panels">
              <div className="config-panel">
                <h4>Validation Settings</h4>
                <div className="config-content">
                  {job.validation_settings?.enabled ? (
                    <p>Validation enabled with {job.validation_settings?.rules?.length || 0} rules.</p>
                  ) : (
                    <p>Validation disabled.</p>
                  )}
                </div>
              </div>
              
              <div className="config-panel">
                <h4>Error Handling</h4>
                <div className="config-content">
                  <p>
                    Stop on error: {job.error_handling_settings?.stop_on_error ? 'Yes' : 'No'}<br />
                    Max errors: {job.error_handling_settings?.max_errors || 100}<br />
                    Log level: {job.error_handling_settings?.log_level || 'warning'}
                  </p>
                </div>
              </div>
              
              <div className="config-panel">
                <h4>Notifications</h4>
                <div className="config-content">
                  <p>
                    On success: {job.notification_settings?.email_on_success ? 'Yes' : 'No'}<br />
                    On failure: {job.notification_settings?.email_on_failure ? 'Yes' : 'No'}<br />
                    Recipients: {job.notification_settings?.recipients?.length || 0}
                  </p>
                </div>
              </div>
              
              <div className="config-panel">
                <h4>Schedule</h4>
                <div className="config-content">
                  <p>
                    Type: {job.schedule_settings?.type || 'manual'}<br />
                    {job.schedule_settings?.type === 'cron' && (
                      <>
                        Expression: {job.schedule_settings?.cron_expression}<br />
                        Start date: {job.schedule_settings?.start_date 
                          ? new Date(job.schedule_settings.start_date).toLocaleString()
                          : 'Not set'}
                      </>
                    )}
                    Status: {job.schedule_settings?.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="section-header">
        <h2>Run History</h2>
      </div>
      
      {job.history && job.history.length > 0 ? (
        <div className="run-history-container">
          <table className="run-history-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Duration</th>
                <th>Records Processed</th>
                <th>Records Failed</th>
                <th>Triggered By</th>
              </tr>
            </thead>
            <tbody>
              {job.history.map(run => (
                <tr key={run.id}>
                  <td>
                    <span className={`status-badge status-${run.status}`}>
                      {run.status}
                    </span>
                  </td>
                  <td>{new Date(run.start_time).toLocaleString()}</td>
                  <td>
                    {run.end_time 
                      ? new Date(run.end_time).toLocaleString() 
                      : 'In progress'}
                  </td>
                  <td>
                    {run.end_time 
                      ? calculateDuration(new Date(run.start_time), new Date(run.end_time))
                      : 'Running...'}
                  </td>
                  <td>{run.records_processed || 0}</td>
                  <td>{run.records_failed || 0}</td>
                  <td>{run.triggered_by || 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="no-data">
          <p>This job has not been run yet.</p>
          {hasFeaturePermission('job', 'write') && job.status !== 'running' && (
            <button 
              className="primary-button"
              onClick={handleRunJob}
            >
              Run this job
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

// Helper function to calculate duration
const calculateDuration = (startTime, endTime) => {
  const diff = Math.abs(endTime - startTime);
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return `${minutes} min ${remainingSeconds} sec`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hr ${remainingMinutes} min`;
};

export default JobDetail;