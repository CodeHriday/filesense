import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiEdit2, FiTrash2, FiCpu, FiClock, FiFilter } from 'react-icons/fi';
import { Modal, Button, Table, Tooltip } from '../components/common';
import LoadingSpinner from '../components/LoadingSpinner';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getJobGroupById, updateJobGroup, addJobToGroup, removeJobFromGroup } from '../api/jobGroupsService';
import { getJobs } from '../api/jobsService';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/JobGroups.css';

const JobGroupDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  
  const [jobGroup, setJobGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [availableJobs, setAvailableJobs] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });
  
  const canEdit = hasPermission('job_group', 'write');
  
  useEffect(() => {
    fetchData();
  }, [id]);
  
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get group details
      const response = await getJobGroupById(id);
      
      if (response.success) {
        setJobGroup(response.data);
        setFormData({
          name: response.data.name,
          description: response.data.description || ''
        });
      } else {
        setError('Failed to fetch group details');
        addToast('error', 'Error', 'Failed to fetch group details');
      }
    } catch (err) {
      console.error('Error fetching group details:', err);
      setError('An unexpected error occurred');
      addToast('error', 'Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchAvailableJobs = async () => {
    try {
      const response = await getJobs();
      
      if (response.success) {
        // Get all jobs that are not already in the group
        const groupJobIds = (jobGroup.jobs || []).map(job => job.id);
        const filteredJobs = response.data.filter(job => !groupJobIds.includes(job.id));
        setAvailableJobs(filteredJobs);
      } else {
        addToast('error', 'Error', 'Failed to fetch available jobs');
      }
    } catch (err) {
      console.error('Error fetching available jobs:', err);
      addToast('error', 'Error', 'An unexpected error occurred');
    }
  };
  
  const handleUpdateGroup = async () => {
    if (!formData.name.trim()) {
      addToast('error', 'Validation Error', 'Group name is required');
      return;
    }
    
    try {
      const response = await updateJobGroup(id, formData);
      
      if (response.success) {
        setJobGroup({ ...jobGroup, ...formData });
        addToast('success', 'Success', 'Group updated successfully');
        setIsEditModalOpen(false);
      } else {
        addToast('error', 'Error', response.message || 'Failed to update group');
      }
    } catch (err) {
      console.error('Error updating group:', err);
      addToast('error', 'Error', 'An unexpected error occurred');
    }
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };
  
  const handleAddJobsClick = async () => {
    await fetchAvailableJobs();
    setSelectedJobs([]);
    setIsAddJobModalOpen(true);
  };
  
  const handleJobSelectionChange = (jobId) => {
    if (selectedJobs.includes(jobId)) {
      setSelectedJobs(selectedJobs.filter(id => id !== jobId));
    } else {
      setSelectedJobs([...selectedJobs, jobId]);
    }
  };
  
  const handleAddJobsToGroup = async () => {
    if (selectedJobs.length === 0) {
      addToast('info', 'Info', 'No jobs selected');
      return;
    }
    
    try {
      const promises = selectedJobs.map(jobId => addJobToGroup(id, jobId));
      await Promise.all(promises);
      
      addToast('success', 'Success', 'Jobs added to group successfully');
      setIsAddJobModalOpen(false);
      fetchData(); // Refresh data
    } catch (err) {
      console.error('Error adding jobs to group:', err);
      addToast('error', 'Error', 'An unexpected error occurred');
    }
  };
  
  const handleRemoveJobFromGroup = async (jobId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to remove this job from the group?',
      action: async () => {
        try {
          const response = await removeJobFromGroup(id, jobId);
          
          if (response.success) {
            setJobGroup({
              ...jobGroup,
              jobs: jobGroup.jobs.filter(job => job.id !== jobId)
            });
            addToast('success', 'Success', 'Job removed from group successfully');
          } else {
            addToast('error', 'Error', response.message || 'Failed to remove job from group');
          }
        } catch (err) {
          console.error('Error removing job from group:', err);
          addToast('error', 'Error', 'An unexpected error occurred');
        }
      }
    });
  };
  
  const getFilteredAvailableJobs = () => {
    if (!searchTerm.trim()) return availableJobs;
    
    return availableJobs.filter(job => 
      job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };
  
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };
  
  if (loading) {
    return <LoadingSpinner fullPage={true} />;
  }
  
  if (error || !jobGroup) {
    return (
      <div className="job-group-detail">
        <div className="error-message">
          {error || 'Group not found'}
        </div>
        <Button variant="secondary" onClick={() => navigate('/job-groups')}>
          <FiArrowLeft /> Back to Groups
        </Button>
      </div>
    );
  }
  
  return (
    <div className="group-detail">
      <div className="group-detail-header">
        <Button variant="secondary" onClick={() => navigate('/job-groups')}>
          <FiArrowLeft /> Back to Groups
        </Button>
        
        {canEdit && (
          <div className="group-actions">
            <Button 
              variant="primary" 
              onClick={() => setIsEditModalOpen(true)}
            >
              <FiEdit2 /> Edit Group
            </Button>
          </div>
        )}
      </div>
      
      <h1>{jobGroup.name}</h1>
      <p className="group-description">{jobGroup.description || 'No description provided'}</p>
      
      <div className="group-created-by">
        <small>Created by {jobGroup.created_by_name || 'Unknown'} at {formatDate(jobGroup.created_at)}</small>
      </div>
      
      <div className="job-list-section">
        <div className="section-header">
          <h2>Jobs in this Group</h2>
          {canEdit && (
            <Button 
              variant="primary" 
              onClick={handleAddJobsClick}
            >
              <FiPlus /> Add Jobs
            </Button>
          )}
        </div>
        
        {(!jobGroup.jobs || jobGroup.jobs.length === 0) ? (
          <div className="empty-jobs">
            <p>No jobs in this group</p>
            {canEdit && (
              <Button 
                variant="primary" 
                onClick={handleAddJobsClick}
              >
                <FiPlus /> Add Jobs
              </Button>
            )}
          </div>
        ) : (
          <Table 
            data={jobGroup.jobs}
            columns={[
              { header: 'Name', accessor: 'name' },
              { header: 'Business Process', accessor: 'process_name' },
              { header: 'Status', accessor: 'status' },
              { header: 'Created At', accessor: 'created_at', cell: (row) => formatDate(row.created_at) },
              { 
                header: 'Actions',
                cell: (row) => (
                  <div className="table-actions">
                    <Tooltip content="View Job">
                      <Button 
                        variant="icon" 
                        onClick={() => navigate(`/jobs/${row.id}`)}
                      >
                        <FiCpu />
                      </Button>
                    </Tooltip>
                    
                    {canEdit && (
                      <Tooltip content="Remove from Group">
                        <Button 
                          variant="icon" 
                          onClick={() => handleRemoveJobFromGroup(row.id)}
                        >
                          <FiTrash2 />
                        </Button>
                      </Tooltip>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
      
      {/* Edit Group Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        className="group-modal"
      >
        <h2>Edit Group</h2>
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
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateGroup}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Add Jobs Modal */}
      <Modal
        isOpen={isAddJobModalOpen}
        onClose={() => setIsAddJobModalOpen(false)}
        className="add-job-modal"
      >
        <h2>Add Jobs to Group</h2>
        
        <input
          type="text"
          className="job-selection-search"
          placeholder="Search jobs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        {availableJobs.length === 0 ? (
          <p>No jobs available to add</p>
        ) : (
          <div className="job-selection-list">
            {getFilteredAvailableJobs().map(job => (
              <div key={job.id} className="job-selection-item">
                <input
                  type="checkbox"
                  className="job-selection-item-checkbox"
                  checked={selectedJobs.includes(job.id)}
                  onChange={() => handleJobSelectionChange(job.id)}
                  id={`job-${job.id}`}
                />
                <label htmlFor={`job-${job.id}`} className="job-selection-item-name">
                  {job.name}
                </label>
              </div>
            ))}
          </div>
        )}
        
        <div className="job-selection-actions">
          <Button variant="secondary" onClick={() => setIsAddJobModalOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleAddJobsToGroup}
            disabled={selectedJobs.length === 0}
          >
            Add Selected Jobs
          </Button>
        </div>
      </Modal>
      
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

export default JobGroupDetail;