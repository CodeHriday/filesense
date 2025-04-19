import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiClipboard, FiUsers } from 'react-icons/fi';
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
        setError('Failed to fetch groups');
        addToast('error', 'Error', 'Failed to fetch groups');
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
  
  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      addToast('error', 'Validation Error', 'Group name is required');
      return;
    }
    
    try {
      const response = await createJobGroup(formData);
      
      if (response.success) {
        addToast('success', 'Success', 'Group created successfully');
        setJobGroups([...jobGroups, response.data]);
        setIsCreateModalOpen(false);
        setFormData({ name: '', description: '' });
        await fetchData(); // Refresh data
      } else {
        addToast('error', 'Error', response.message || 'Failed to create group');
      }
    } catch (err) {
      console.error('Error creating group:', err);
      addToast('error', 'Error', 'An unexpected error occurred');
    }
  };
  
  const handleDeleteGroup = async (id) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      try {
        const response = await deleteJobGroup(id);
        
        if (response.success) {
          addToast('success', 'Success', 'Group deleted successfully');
          setJobGroups(jobGroups.filter(group => group.id !== id));
        } else {
          addToast('error', 'Error', response.message || 'Failed to delete group');
        }
      } catch (err) {
        console.error('Error deleting group:', err);
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
        <h1 className="job-groups-title">Groups</h1>
        {canCreate && (
          <div className="job-groups-actions">
            <Button 
              variant="primary" 
              onClick={() => setIsCreateModalOpen(true)}
            >
              <FiPlus /> Create Group
            </Button>
          </div>
        )}
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {!loading && jobGroups.length === 0 ? (
        <div className="empty-job-groups">
          <FiClipboard size={48} />
          <p>No groups found</p>
          {canCreate && (
            <Button 
              variant="primary" 
              onClick={() => setIsCreateModalOpen(true)}
            >
              <FiPlus /> Create Your First Group
            </Button>
          )}
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="group-name-column">Group Name</th>
                <th className="description-column">Description</th>
                <th className="jobs-column">Jobs</th>
                <th className="created-by-column">Created By</th>
                {canCreate && <th className="actions-column">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {jobGroups.map(group => (
                <tr key={group.id} onClick={() => handleGroupClick(group.id)}>
                  <td className="group-name-cell">{group.name}</td>
                  <td>{group.description || 'No description'}</td>
                  <td className="jobs-cell">{group.job_count || 0}</td>
                  <td>
                    <div className="created-by-cell">
                      <FiUsers size={14} />
                      <span>{group.created_by_name || 'Unknown'}</span>
                    </div>
                  </td>
                  {canCreate && (
                    <td>
                      <div className="table-actions">
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
                              handleDeleteGroup(group.id);
                            }}
                          >
                            <FiTrash2 />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Create Group Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        className="group-modal"
      >
        <h2>Create Group</h2>
        <div className="group-form">
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
          <div className="group-form-buttons">
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateGroup}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default JobGroups;