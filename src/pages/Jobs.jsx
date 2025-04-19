import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit, FiTrash, FiPlay, FiClock, FiCheck, FiX } from 'react-icons/fi';
import { getJobs, createJob, updateJob, deleteJob, startJob } from '../api/jobsService';
import { getBusinessProcesses } from '../api/businessProcessesService';
import Modal from '../components/Modal';
import Button from '../components/common/Button';
import Loader from '../components/Loader';
import PageHeader from '../components/PageHeader';
import '../styles/Jobs.css';

const Jobs = () => {
  const [jobs, setJobs] = useState([]);
  const [businessProcesses, setBusinessProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    business_process_id: '',
    status: 'active',
    source_connection_id: null,
    target_connection_id: null,
    validation_settings: {},
    error_handling_settings: {},
    notification_settings: {},
    schedule_settings: {}
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch jobs
      const jobsResponse = await getJobs();
      if (jobsResponse.success) {
        setJobs(jobsResponse.data || []);
      } else {
        setError(jobsResponse.message || 'Failed to fetch jobs');
      }
      
      // Fetch business processes for dropdown
      const processesResponse = await getBusinessProcesses();
      if (processesResponse.success) {
        setBusinessProcesses(processesResponse.data || []);
      } else {
        console.error('Failed to fetch business processes');
      }
    } catch (err) {
      setError('An error occurred while fetching data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (job = null) => {
    console.log("Opening modal for job:", job);
    console.log("Available business processes:", businessProcesses);
    
    if (job) {
      setCurrentJob(job);
      setFormData({
        name: job.name,
        description: job.description || '',
        business_process_id: job.business_process_id,
        status: job.status || 'active',
        source_connection_id: job.source_connection_id || null,
        target_connection_id: job.target_connection_id || null,
        validation_settings: job.validation_settings || {},
        error_handling_settings: job.error_handling_settings || {},
        notification_settings: job.notification_settings || {},
        schedule_settings: job.schedule_settings || {}
      });
    } else {
      setCurrentJob(null);
      // Set default business_process_id to first available process if exists
      setFormData({
        name: '',
        description: '',
        business_process_id: businessProcesses.length > 0 ? businessProcesses[0].id : '',
        status: 'active',
        source_connection_id: null,
        target_connection_id: null,
        validation_settings: {},
        error_handling_settings: {},
        notification_settings: {},
        schedule_settings: {}
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCurrentJob(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("==================== JOB FORM SUBMISSION ====================");
    console.log("Form submitted with data:", formData);
    
    if (!formData.name.trim()) {
      setError('Job name is required');
      console.error("Validation error: Job name is required");
      return;
    }
    
    if (!formData.business_process_id) {
      setError('Business process is required');
      console.error("Validation error: Business process is required");
      return;
    }
    
    try {
      let response;
      
      // Ensure business_process_id is an integer (not UUID)
      const jobData = {
        ...formData,
        business_process_id: parseInt(formData.business_process_id, 10),
        // Set created_by field (this is required by the server)
        created_by: 2,  // Using the admin user ID
        // Add default values for required fields
        status: formData.status || 'active',
        validation_settings: formData.validation_settings || {},
        error_handling_settings: formData.error_handling_settings || {},
        notification_settings: formData.notification_settings || {},
        schedule_settings: formData.schedule_settings || {}
      };
      
      console.log("Sending job data to API:", JSON.stringify(jobData, null, 2));
      console.log("Business process ID:", jobData.business_process_id, "Type:", typeof jobData.business_process_id);
      
      if (currentJob) {
        // Update existing job
        console.log(`Updating job with ID: ${currentJob.id}`);
        response = await updateJob(currentJob.id, jobData);
      } else {
        // Create new job
        console.log('Creating new job via createJob API call');
        response = await createJob(jobData);
      }
      
      console.log("API response:", response);
      
      if (response && response.success) {
        console.log("Job saved successfully!");
        fetchData();
        handleCloseModal();
      } else {
        console.error("Failed to save job. Response:", response);
        if (response && response.status === 401) {
          console.error("Authentication error - token may be invalid or expired");
          setError('Authentication error. Please refresh the page and try again.');
        } else {
          setError((response && response.message) || 'Failed to save job');
        }
      }
    } catch (err) {
      console.error("Caught exception while saving job:", err);
      console.error("Error details:", err.stack || 'No stack trace available');
      setError('An error occurred while saving the job');
    }
    console.log("==================== END JOB FORM SUBMISSION ====================");
  };

  const handleDeleteJob = async (jobId) => {
    if (window.confirm('Are you sure you want to delete this job?')) {
      try {
        const response = await deleteJob(jobId);
        
        if (response.success) {
          fetchData();
        } else {
          setError(response.message || 'Failed to delete job');
        }
      } catch (err) {
        setError('An error occurred while deleting the job');
        console.error(err);
      }
    }
  };

  const handleRunJob = async (jobId) => {
    try {
      setLoading(true);
      const response = await startJob(jobId);
      
      if (response.success) {
        // Show success message
        alert('Job started successfully');
        // Refresh job data after a short delay
        setTimeout(() => {
          fetchData();
        }, 1000);
      } else {
        setError(response.message || 'Failed to run job');
      }
    } catch (err) {
      setError('An error occurred while running the job');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get business process name from ID
  const getProcessName = (processId) => {
    // Ensure processId is treated as a number for comparison
    const numericId = typeof processId === 'string' ? parseInt(processId, 10) : processId;
    console.log("Looking for process with ID:", numericId, "Type:", typeof numericId);
    console.log("Available processes:", businessProcesses);
    
    const process = businessProcesses.find(p => p.id === numericId);
    return process ? process.name : 'Unknown Process';
  };

  // Format last run time
  const formatLastRunTime = (timestamp) => {
    if (!timestamp) return 'Never';
    
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="jobs-container">
      <PageHeader
        title="Jobs"
        icon={<FiPlay />}
        description="Create and manage jobs for your business processes"
      />
      
      <div className="jobs-actions">
        <Button 
          primary 
          onClick={() => handleOpenModal()} 
          icon={<FiPlus />}
          disabled={businessProcesses.length === 0}
        >
          Create Job
        </Button>
      </div>
      
      {error && <div className="alert alert-error">{error}</div>}
      
      {loading ? (
        <Loader />
      ) : (
        <div className="jobs-list">
          {jobs.length === 0 ? (
            <div className="empty-state">
              <FiPlay size={48} />
              <h3>No Jobs Found</h3>
              <p>Create your first job to start processing data</p>
              {businessProcesses.length === 0 ? (
                <div className="alert alert-warning">
                  You need to create a business process first before you can create a job
                </div>
              ) : (
                <Button primary onClick={() => handleOpenModal()}>Create Job</Button>
              )}
            </div>
          ) : (
            <div className="jobs-table-container">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Business Process</th>
                    <th>Status</th>
                    <th>Last Run</th>
                    <th>Run Count</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link to={`/jobs/${job.id}`} className="job-name-link">
                          {job.name}
                        </Link>
                        {job.description && (
                          <div className="job-description">{job.description}</div>
                        )}
                      </td>
                      <td>{getProcessName(job.business_process_id)}</td>
                      <td>
                        <span className={`status-badge status-${job.status || 'active'}`}>
                          {job.status || 'Active'}
                        </span>
                      </td>
                      <td>{formatLastRunTime(job.last_run_time)}</td>
                      <td>{job.run_count || 0}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="icon-button"
                            onClick={() => handleRunJob(job.id)}
                            title="Run Job"
                            disabled={job.status === 'inactive'}
                          >
                            <FiPlay />
                          </button>
                          <button
                            className="icon-button"
                            onClick={() => handleOpenModal(job)}
                            title="Edit Job"
                          >
                            <FiEdit />
                          </button>
                          <button
                            className="icon-button"
                            onClick={() => handleDeleteJob(job.id)}
                            title="Delete Job"
                          >
                            <FiTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {showModal && (
        <Modal
          title={currentJob ? `Edit Job: ${currentJob.name}` : 'Create New Job'}
          onClose={handleCloseModal}
        >
          <form onSubmit={(e) => {
            console.log("Form submitted!");
            handleSubmit(e);
          }} className="job-form">
            <div className="form-group">
              <label htmlFor="name">Job Name*</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter job name"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                placeholder="Enter job description (optional)"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="business_process_id">Business Process*</label>
              <select
                id="business_process_id"
                name="business_process_id"
                value={formData.business_process_id}
                onChange={(e) => {
                  console.log("Selected process ID:", e.target.value);
                  handleInputChange(e);
                }}
                required
              >
                <option value="">Select a business process</option>
                {businessProcesses.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </select>
            </div>
            
            {currentJob && (
              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            )}
            
            {/* In a full implementation, we would add fields for:
                - Source and target connections
                - Validation settings
                - Error handling
                - Notifications
                - Schedule settings
            */}
            
            <div className="form-actions">
              <Button secondary onClick={handleCloseModal}>Cancel</Button>
              <Button primary type="submit">
                {currentJob ? 'Update Job' : 'Create Job'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Jobs;