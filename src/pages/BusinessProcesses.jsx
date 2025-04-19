import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit, FiTrash, FiBriefcase, FiPlay } from 'react-icons/fi';
import { 
  getBusinessProcesses, 
  createBusinessProcess, 
  updateBusinessProcess, 
  deleteBusinessProcess 
} from '../api/businessProcessesService';
import { getUserGroups } from '../api/groupsService';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Loader from '../components/Loader';
import PageHeader from '../components/PageHeader';
import '../styles/BusinessProcesses.css';

const BusinessProcesses = () => {
  const [processes, setProcesses] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [currentProcess, setCurrentProcess] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    description: '', 
    group_id: '',
    status: 'active'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch business processes
      const processesResponse = await getBusinessProcesses();
      if (processesResponse.success) {
        setProcesses(processesResponse.data || []);
      } else {
        setError(processesResponse.message || 'Failed to fetch business processes');
      }
      
      // Fetch user groups for dropdown
      const groupsResponse = await getUserGroups();
      if (groupsResponse.success) {
        setUserGroups(groupsResponse.data || []);
      } else {
        console.error('Failed to fetch user groups');
      }
    } catch (err) {
      setError('An error occurred while fetching data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (process = null) => {
    if (process) {
      setCurrentProcess(process);
      setFormData({ 
        name: process.name, 
        description: process.description || '', 
        group_id: process.group_id,
        status: process.status || 'active'
      });
    } else {
      setCurrentProcess(null);
      // Set default group_id to first available user group if exists
      setFormData({ 
        name: '', 
        description: '', 
        group_id: userGroups.length > 0 ? userGroups[0].id : '',
        status: 'active'
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCurrentProcess(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Process name is required');
      return;
    }
    
    if (!formData.group_id) {
      setError('Group is required');
      return;
    }
    
    try {
      let response;
      
      if (currentProcess) {
        // Update existing process
        response = await updateBusinessProcess(currentProcess.id, formData);
      } else {
        // Create new process
        response = await createBusinessProcess(formData);
      }
      
      if (response.success) {
        fetchData();
        handleCloseModal();
      } else {
        setError(response.message || 'Failed to save business process');
      }
    } catch (err) {
      setError('An error occurred while saving the business process');
      console.error(err);
    }
  };

  const handleDeleteProcess = async (processId) => {
    if (window.confirm('Are you sure you want to delete this business process? All associated jobs will also be deleted.')) {
      try {
        const response = await deleteBusinessProcess(processId);
        
        if (response.success) {
          fetchData();
        } else {
          setError(response.message || 'Failed to delete business process');
        }
      } catch (err) {
        setError('An error occurred while deleting the business process');
        console.error(err);
      }
    }
  };

  // Helper to get group name from ID
  const getGroupName = (groupId) => {
    const group = userGroups.find(g => g.id === groupId);
    return group ? group.name : 'Unknown Group';
  };

  return (
    <div className="business-processes-container">
      <PageHeader
        title="Business Processes"
        icon={<FiBriefcase />}
        description="Create and manage business processes to organize your data workflows"
      />
      
      <div className="process-actions">
        <Button 
          primary 
          onClick={() => handleOpenModal()} 
          icon={<FiPlus />}
          disabled={userGroups.length === 0}
        >
          Create Business Process
        </Button>
      </div>
      
      {error && <div className="alert alert-error">{error}</div>}
      
      {loading ? (
        <Loader />
      ) : (
        <div className="processes-list">
          {processes.length === 0 ? (
            <div className="empty-state">
              <FiBriefcase size={48} />
              <h3>No Business Processes Found</h3>
              <p>Create your first business process to organize your data workflows</p>
              {userGroups.length === 0 ? (
                <div className="alert alert-warning">
                  You need to create a group first before you can create a business process
                </div>
              ) : (
                <Button primary onClick={() => handleOpenModal()}>Create Business Process</Button>
              )}
            </div>
          ) : (
            <div className="process-grid">
              {processes.map((process) => (
                <div className="process-card" key={process.id}>
                  <div className="process-card-header">
                    <h3>{process.name}</h3>
                    <span className={`status-badge status-${process.status || 'active'}`}>
                      {process.status || 'Active'}
                    </span>
                  </div>
                  
                  {process.description && <p className="process-description">{process.description}</p>}
                  
                  <div className="process-info">
                    <div className="info-item">
                      <span className="info-label">Group:</span>
                      <span className="info-value">{getGroupName(process.group_id)}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Jobs:</span>
                      <span className="info-value">{process.job_count || 0}</span>
                    </div>
                  </div>
                  
                  <div className="process-actions">
                    <Link 
                      to={`/business-processes/${process.id}`} 
                      className="icon-button"
                      title="View Jobs"
                    >
                      <FiPlay />
                    </Link>
                    <button 
                      className="icon-button" 
                      onClick={() => handleOpenModal(process)}
                      title="Edit Process"
                    >
                      <FiEdit />
                    </button>
                    <button 
                      className="icon-button" 
                      onClick={() => handleDeleteProcess(process.id)}
                      title="Delete Process"
                    >
                      <FiTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {showModal && (
        <Modal
          title={currentProcess ? `Edit Process: ${currentProcess.name}` : 'Create New Business Process'}
          onClose={handleCloseModal}
        >
          <form onSubmit={handleSubmit} className="process-form">
            <div className="form-group">
              <label htmlFor="name">Process Name*</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter process name"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                placeholder="Enter process description (optional)"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="group_id">Group*</label>
              <select
                id="group_id"
                name="group_id"
                value={formData.group_id}
                onChange={handleInputChange}
                required
              >
                <option value="">Select a group</option>
                {userGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            
            {currentProcess && (
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
            
            <div className="form-actions">
              <Button secondary onClick={handleCloseModal}>Cancel</Button>
              <Button primary type="submit">
                {currentProcess ? 'Update Process' : 'Create Process'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default BusinessProcesses;