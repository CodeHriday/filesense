import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit, FiTrash, FiUsers, FiArrowRight, FiList } from 'react-icons/fi';
import { getGroups, createGroup, updateGroup, deleteGroup } from '../api/groupsService';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/Groups.css';
import PropTypes from 'prop-types';


// Simple inline modal component to avoid component issues
const SimpleModal = ({ show, title, onClose, children }) => {
  if (!show) return null;
  
  return (
    <div className="modal-overlay" style={{
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

// Simple button component
const SimpleButton = ({ primary, secondary, onClick, type = 'button', children }) => {
  const buttonStyle = {
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '14px',
    transition: 'background-color 0.2s'
  };
  
  if (primary) {
    buttonStyle.backgroundColor = '#3366FF';
    buttonStyle.color = 'white';
  } else if (secondary) {
    buttonStyle.backgroundColor = '#f0f0f0';
    buttonStyle.color = '#333';
  }
  
  return (
    <button 
      style={buttonStyle} 
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
};

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await getGroups();
      if (response.success) {
        setGroups(response.data || []);
      } else {
        setError(response.message || 'Failed to fetch groups');
      }
    } catch (err) {
      setError('An error occurred while fetching groups');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    console.log("Opening create modal");
    setCurrentGroup(null);
    setFormData({
      name: '',
      description: ''
    });
    setShowModal(true);
  };

  const openEditModal = (group) => {
    console.log("Opening edit modal for", group.name);
    setCurrentGroup(group);
    setFormData({
      name: group.name,
      description: group.description || ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    console.log("Closing modal");
    setShowModal(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Group name is required');
      return;
    }
    
    try {
      let response;
      
      if (currentGroup) {
        // Update existing group
        response = await updateGroup(currentGroup.id, formData);
      } else {
        // Create new group
        response = await createGroup(formData);
      }
      
      if (response.success) {
        fetchGroups();
        closeModal();
      } else {
        setError(response.message || 'Failed to save group');
      }
    } catch (err) {
      setError('An error occurred while saving the group');
      console.error(err);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this group?',
      action: async () => {
        try {
          const response = await deleteGroup(groupId);
          
          if (response.success) {
            fetchGroups();
          } else {
            setError(response.message || 'Failed to delete group');
          }
        } catch (err) {
          setError('An error occurred while deleting the group');
          console.error(err);
        }
      }
    });
  };

  return (
    <div className="groups-container">
      <PageHeader
        title="Groups"
        icon={<FiUsers />}
        description="Create and manage groups to organize your business processes"
      />
      
      <div className="groups-actions" style={{ marginBottom: '20px' }}>
        <button 
          onClick={openCreateModal}
          style={{
            backgroundColor: '#3366FF',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <FiPlus /> Create Group
        </button>
      </div>
      
      {error && <div className="alert alert-error" style={{ color: 'red', marginBottom: '20px' }}>{error}</div>}
      
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="groups-list">
          {groups.length === 0 ? (
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
              <FiUsers size={48} style={{ marginBottom: '16px', color: '#999' }} />
              <h3>No Groups Found</h3>
              <p>Create your first group to organize your business processes</p>
              <button 
                onClick={openCreateModal}
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
                Create Group
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {groups.map((group) => (
                <div key={group.id} style={{ 
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
                    <h3 style={{ margin: 0, fontSize: '18px' }}>{group.name}</h3>
                    <div>
                      <button
                        onClick={() => openEditModal(group)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '5px',
                          marginRight: '5px'
                        }}
                        title="Edit Group"
                      >
                        <FiEdit />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '5px'
                        }}
                        title="Delete Group"
                      >
                        <FiTrash />
                      </button>
                    </div>
                  </div>
                  
                  {group.description && (
                    <p style={{ padding: '0 16px', color: '#666' }}>{group.description}</p>
                  )}
                  
                  <div style={{ 
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #f0f0f0',
                    backgroundColor: '#f9f9f9'
                  }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FiUsers size={14} />
                        <span>{group.user_count || 0} Users</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FiList size={14} />
                        <span>{group.process_count || 0} Processes</span>
                      </div>
                    </div>
                    
                    <Link to={`/groups/${group.id}/processes`} style={{ 
                      textDecoration: 'none',
                      color: '#3366FF',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '14px'
                    }}>
                      View Processes <FiArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <SimpleModal
        show={showModal}
        title={currentGroup ? `Edit Group: ${currentGroup.name}` : 'Create New Group'}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="name" style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
              Group Name*
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="Enter group name"
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
              rows={3}
              placeholder="Enter group description (optional)"
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
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={closeModal}
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
              {currentGroup ? 'Update Group' : 'Create Group'}
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
SimpleButton.propTypes = {
  primary: PropTypes.bool,
  secondary: PropTypes.bool,
  onClick: PropTypes.func,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  children: PropTypes.node.isRequired
};

SimpleButton.defaultProps = {
  primary: false,
  secondary: false,
  type: 'button'
};

export default Groups;