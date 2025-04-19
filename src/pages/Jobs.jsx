import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getJobs, runJob, deleteJob } from '../api/jobsService';
import { getBusinessProcesses } from '../api/businessProcessesService';
import { useAuth } from '../context/AuthContext';
import '../styles/Jobs.css';

const Jobs = () => {
  const [jobs, setJobs] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProcess, setSelectedProcess] = useState('all');
  const { hasFeaturePermission } = useAuth();
  const navigate = useNavigate();
  
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await getJobs();
      if (response.success) {
        setJobs(response.data);
      } else {
        setError(response.error || 'Failed to fetch jobs');
      }
    } catch (err) {
      setError('An error occurred while fetching jobs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchBusinessProcesses = async () => {
    try {
      const response = await getBusinessProcesses();
      if (response.success) {
        setProcesses(response.data);
      }
    } catch (err) {
      console.error('Error fetching business processes:', err);
    }
  };
  
  useEffect(() => {
    fetchJobs();
    fetchBusinessProcesses();
  }, []);
  
  const handleRunJob = async (jobId) => {
    try {
      const response = await runJob(jobId);
      if (response.success) {
        // Show success message
        alert('Job started successfully!');
        // Refresh job list to show updated status
        fetchJobs();
      } else {
        setError(response.error || 'Failed to run job');
      }
    } catch (err) {
      setError('An error occurred while running job');
      console.error(err);
    }
  };
  
  const handleDeleteJob = async (jobId) => {
    if (window.confirm('Are you sure you want to delete this job? All job history will also be deleted.')) {
      try {
        const response = await deleteJob(jobId);
        if (response.success) {
          fetchJobs();
        } else {
          setError(response.error || 'Failed to delete job');
        }
      } catch (err) {
        setError('An error occurred while deleting job');
        console.error(err);
      }
    }
  };
  
  // Filter jobs by selected business process
  const filteredJobs = selectedProcess === 'all'
    ? jobs
    : jobs.filter(job => job.business_process_id === selectedProcess);
  
  if (loading) {
    return <div className="loading">Loading jobs...</div>;
  }
  
  return (
    <div className="jobs-container">
      <div className="page-header">
        <h1>Jobs</h1>
        <div className="header-actions">
          <div className="filter-group">
            <label htmlFor="process-filter">Business Process:</label>
            <select
              id="process-filter"
              value={selectedProcess}
              onChange={(e) => setSelectedProcess(e.target.value)}
            >
              <option value="all">All Processes</option>
              {processes.map(process => (
                <option key={process.id} value={process.id}>
                  {process.name}
                </option>
              ))}
            </select>
          </div>
          {hasFeaturePermission('job', 'write') && (
            <button 
              className="primary-button create-button"
              onClick={() => navigate('/jobs/create')}
            >
              <i className="fas fa-plus"></i> Create Job
            </button>
          )}
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {filteredJobs.length === 0 ? (
        <div className="no-data">
          <p>No jobs found.</p>
          {hasFeaturePermission('job', 'write') && (
            <button 
              className="primary-button"
              onClick={() => navigate('/jobs/create')}
            >
              Create your first job
            </button>
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
                <th>Source</th>
                <th>Target</th>
                <th>Runs</th>
                <th>Last Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/jobs/${job.id}`} className="job-name-link">
                      {job.name}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/business-processes/${job.business_process_id}`}>
                      {job.business_process_name}
                    </Link>
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
                            onClick={() => handleRunJob(job.id)}
                            title="Run Job"
                            disabled={job.status === 'running'}
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
      )}
    </div>
  );
};

export default Jobs;