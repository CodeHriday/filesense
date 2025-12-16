import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { FiPlus, FiEdit, FiTrash, FiBriefcase, FiPlay } from 'react-icons/fi';
import { 
  getBusinessProcesses, 
  createBusinessProcess, 
  updateBusinessProcess, 
  deleteBusinessProcess 
} from '../api/businessProcessesService';
import { getUserGroups } from '../api/groupsService';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/BusinessProcesses.css';

// Simple inline modal component to avoid component issues
const SimpleModal = ({ show, title, onClose, children }) => {
  if (!show) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          width: '100%',
          maxWidth: '600px'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{title}</h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

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
    group_id: ''
  });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

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
        setError(processesResponse.message || 'Failed to fetch workflows');
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
        group_id: process.group_id
      });
    } else {
      setCurrentProcess(null);
      // Set default group_id to first available user group if exists
      setFormData({ 
        name: '', 
        description: '', 
        group_id: userGroups.length > 0 ? userGroups[0].id : ''
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
        setError(response.message || 'Failed to save workflow');
      }
    } catch (err) {
      setError('An error occurred while saving the workflow');
      console.error(err);
    }
  };

  const handleDeleteProcess = async (processId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this workflow? All associated jobs will also be deleted.',
      action: async () => {
        try {
          const response = await deleteBusinessProcess(processId);
          
          if (response.success) {
            fetchData();
          } else {
            setError(response.message || 'Failed to delete workflow');
          }
        } catch (err) {
          setError('An error occurred while deleting the workflow');
          console.error(err);
        }
      }
    });
  };

  // Helper to get group name from ID
  const getGroupName = (groupId) => {
    const group = userGroups.find(g => g.id === groupId);
    return group ? group.name : 'Unknown Group';
  };

  return (
    <div className="business-processes-container">
      <PageHeader
        title="Workflows"
        icon={<FiBriefcase />}
        description="Create and manage workflows to organize your data processes"
      />
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => handleOpenModal()} 
          disabled={userGroups.length === 0}
          style={{
            backgroundColor: '#3366FF',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: userGroups.length === 0 ? 'not-allowed' : 'pointer',
            opacity: userGroups.length === 0 ? 0.5 : 1,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <FiPlus /> Create Workflow
        </button>
      </div>
      
      {error && <div style={{ color: 'red', padding: '12px', marginBottom: '20px', backgroundColor: '#ffeeee', borderRadius: '4px' }}>{error}</div>}
      
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div>
          {processes.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '50px 20px',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px'
            }}>
              <FiBriefcase size={48} style={{ marginBottom: '16px', color: '#999' }} />
              <h3>No Workflows Found</h3>
              <p>Create your first workflow to organize your data processes</p>
              {userGroups.length === 0 ? (
                <div style={{ 
                  color: '#856404', 
                  backgroundColor: '#fff3cd', 
                  padding: '12px', 
                  borderRadius: '4px', 
                  marginTop: '16px'
                }}>
                  You need to create a group first before you can create a workflow
                </div>
              ) : (
                <button 
                  onClick={() => handleOpenModal()}
                  style={{
                    backgroundColor: '#3366FF',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    marginTop: '16px'
                  }}
                >
                  Create Workflow
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {processes.map((process) => (
                <div key={process.id} style={{ 
                  border: '1px solid #e0e0e0', 
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    borderBottom: '1px solid #f0f0f0'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>{process.name}</h3>
                  </div>
                  
                  {process.description && (
                    <p style={{ padding: '0 16px', color: '#666' }}>{process.description}</p>
                  )}
                  
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', color: '#888', width: '80px' }}>Group:</span>
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>{getGroupName(process.group_id)}</span>
                    </div>
                    <div style={{ display: 'flex' }}>
                      <span style={{ fontSize: '14px', color: '#888', width: '80px' }}>Jobs:</span>
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>{process.job_count || 0}</span>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'flex',
                    justifyContent: 'flex-end',
                    padding: '12px 16px',
                    gap: '12px',
                    backgroundColor: '#f9f9f9'
                  }}>
                    <Link 
                      to={`/business-processes/${process.id}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#3366FF',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '20px'
                      }}
                      title="View Jobs"
                    >
                      <FiPlay />
                    </Link>
                    <button 
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#666',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '20px'
                      }}
                      onClick={() => handleOpenModal(process)}
                      title="Edit Process"
                    >
                      <FiEdit />
                    </button>
                    <button 
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ff4d4f',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '20px'
                      }}
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
      
      <SimpleModal
        show={showModal}
        title={currentProcess ? `Edit Process: ${currentProcess.name}` : 'Create New Workflow'}
        onClose={handleCloseModal}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="name" style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
              Process Name*
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="Enter process name"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '14px'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="description" style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={4}
              placeholder="Enter process description (optional)"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="group_id" style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
              Group*
            </label>
            <select
              id="group_id"
              name="group_id"
              value={formData.group_id}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="">Select a group</option>
              {userGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          

          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
            <button
              type="button"
              onClick={handleCloseModal}
              style={{
                backgroundColor: '#f0f0f0',
                color: '#333',
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            
            <button
              type="submit"
              style={{
                backgroundColor: '#3366FF',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {currentProcess ? 'Update Process' : 'Create Process'}
            </button>
          </div>
        </form>
      </SimpleModal>
      
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
SimpleModal.propTypes = {
  show: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired
};
export default BusinessProcesses;