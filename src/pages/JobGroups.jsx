import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiClipboard, FiUsers, FiClock } from 'react-icons/fi';
import { Modal, Button, Tooltip } from '../components/common';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getJobGroups, createJobGroup, deleteJobGroup } from '../api/jobGroupsService';
import { getJobs } from '../api/jobsService';
import '../styles/JobGroups.css';

const JobGroups = () => {
  const [jobGroups, setJobGroups] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission('job_group', 'write');
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get all job groups
      const jobGroupsResponse = await getJobGroups();
      if (jobGroupsResponse.success) {
        setJobGroups(jobGroupsResponse.data);
      } else {
        setError('Failed to fetch job groups');
        addToast('error', 'Error', 'Failed to fetch job groups');
      }
      
      // Get all jobs
      const jobsResponse = await getJobs();
      if (jobsResponse.success) {
        setJobs(jobsResponse.data);
      }
      
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('An unexpected error occurred');
      addToast('error', 'Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateJobGroup = async () => {
    if (!formData.name.trim()) {
      addToast('error', 'Validation Error', 'Group name is required');
      return;
    }
    
    try {
      const response = await createJobGroup(formData);
      
      if (response.success) {
        addToast('success', 'Success', 'Job group created successfully');
        setJobGroups([...jobGroups, response.data]);
        setIsCreateModalOpen(false);
        setFormData({ name: '', description: '' });
        await fetchData(); // Refresh data
      } else {
        addToast('error', 'Error', response.message || 'Failed to create job group');
      }
    } catch (err) {
      console.error('Error creating job group:', err);
      addToast('error', 'Error', 'An unexpected error occurred');
    }
  };
  
  const handleDeleteJobGroup = async (id) => {
    if (window.confirm('Are you sure you want to delete this job group?')) {
      try {
        const response = await deleteJobGroup(id);
        
        if (response.success) {
          addToast('success', 'Success', 'Job group deleted successfully');
          setJobGroups(jobGroups.filter(group => group.id !== id));
        } else {
          addToast('error', 'Error', response.message || 'Failed to delete job group');
        }
      } catch (err) {
        console.error('Error deleting job group:', err);
        addToast('error', 'Error', 'An unexpected error occurred');
      }
    }
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };
  
  const handleGroupClick = (id) => {
    navigate(`/job-groups/${id}`);
  };
  
  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }
  
  return (
    <div className="job-groups-container">
      <div className="job-groups-header">
        <h1 className="job-groups-title">Job Groups</h1>
        <div className="job-groups-actions">
          {canCreate && (
            <Button 
              variant="primary" 
              onClick={() => setIsCreateModalOpen(true)}
            >
              <FiPlus /> Create Job Group
            </Button>
          )}
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {!loading && jobGroups.length === 0 ? (
        <div className="empty-job-groups">
          <FiClipboard size={48} />
          <p>No job groups found</p>
          {canCreate && (
            <Button 
              variant="primary" 
              onClick={() => setIsCreateModalOpen(true)}
            >
              <FiPlus /> Create Your First Job Group
            </Button>
          )}
        </div>
      ) : (
        <div className="job-groups-grid">
          {jobGroups.map(group => (
            <div key={group.id} className="job-group-card">
              <h3 onClick={() => handleGroupClick(group.id)} style={{ cursor: 'pointer' }}>
                {group.name}
              </h3>
              <p>{group.description || 'No description'}</p>
              
              <div className="job-group-stats">
                <div className="job-group-stat">
                  <span className="job-group-stat-value">{group.job_count || 0}</span>
                  <span className="job-group-stat-label">Jobs</span>
                </div>
              </div>
              
              <div className="job-group-created-by">
                <FiUsers size={12} />
                <span>Created by {group.created_by_name || 'Unknown'}</span>
              </div>
              
              {canCreate && (
                <div className="job-group-actions">
                  <Tooltip content="Edit">
                    <Button 
                      variant="icon" 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/job-groups/${group.id}/edit`);
                      }}
                    >
                      <FiEdit2 />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Delete">
                    <Button 
                      variant="icon" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteJobGroup(group.id);
                      }}
                    >
                      <FiTrash2 />
                    </Button>
                  </Tooltip>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Create Job Group Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        className="job-group-modal"
      >
        <h2>Create Job Group</h2>
        <div className="job-group-form">
          <div>
            <label htmlFor="name">Group Name *</label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter group name"
              required
            />
          </div>
          <div>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Enter group description"
            />
          </div>
          <div className="job-group-form-buttons">
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateJobGroup}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default JobGroups;