import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit, FiTrash, FiUsers, FiArrowRight, FiList } from 'react-icons/fi';
import { getGroups, createGroup, updateGroup, deleteGroup } from '../api/groupsService';
import Modal from '../components/Modal';
import Button from '../components/common/Button';
import Loader from '../components/Loader';
import PageHeader from '../components/PageHeader';
import '../styles/Groups.css';

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
  
  console.log("Groups component rendering, showModal:", showModal);

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

  const handleOpenModal = (group = null) => {
    console.log("handleOpenModal called!", { group });
    
    if (group) {
      setCurrentGroup(group);
      setFormData({
        name: group.name,
        description: group.description || ''
      });
    } else {
      setCurrentGroup(null);
      setFormData({
        name: '',
        description: ''
      });
    }
    
    console.log("Setting showModal to true");
    setShowModal(true);
    // Force a re-render to ensure the modal opens
    setTimeout(() => {
      console.log("After setting showModal, value is:", showModal);
    }, 0);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCurrentGroup(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
        handleCloseModal();
      } else {
        setError(response.message || 'Failed to save group');
      }
    } catch (err) {
      setError('An error occurred while saving the group');
      console.error(err);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
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
  };

  return (
    <div className="groups-container">
      <PageHeader
        title="Groups"
        icon={<FiUsers />}
        description="Create and manage groups to organize your business processes"
      />
      
      <div className="groups-actions">
        <Button 
          primary={true} 
          onClick={() => handleOpenModal()}
          icon={<FiPlus />}
        >
          Create Group
        </Button>
      </div>
      
      {error && <div className="alert alert-error">{error}</div>}
      
      {loading ? (
        <Loader />
      ) : (
        <div className="groups-list">
          {groups.length === 0 ? (
            <div className="empty-state">
              <FiUsers size={48} />
              <h3>No Groups Found</h3>
              <p>Create your first group to organize your business processes</p>
              <Button primary={true} onClick={() => handleOpenModal()}>Create Group</Button>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="group-card">
                <div className="group-card-header">
                  <h3 className="group-card-title">{group.name}</h3>
                  <div className="group-card-actions">
                    <button
                      className="icon-button"
                      onClick={() => handleOpenModal(group)}
                      title="Edit Group"
                    >
                      <FiEdit />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => handleDeleteGroup(group.id)}
                      title="Delete Group"
                    >
                      <FiTrash />
                    </button>
                  </div>
                </div>
                
                {group.description && (
                  <p className="group-card-description">{group.description}</p>
                )}
                
                <div className="group-card-footer">
                  <div className="group-card-stats">
                    <div className="group-card-stat">
                      <FiUsers size={14} />
                      <span>{group.user_count || 0} Users</span>
                    </div>
                    <div className="group-card-stat">
                      <FiList size={14} />
                      <span>{group.process_count || 0} Processes</span>
                    </div>
                  </div>
                  
                  <Link to={`/groups/${group.id}/processes`} className="group-card-link">
                    View Processes <FiArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      
      {showModal && (
        <Modal
          title={currentGroup ? `Edit Group: ${currentGroup.name}` : 'Create New Group'}
          onClose={handleCloseModal}
        >
          <form onSubmit={handleSubmit} className="group-form">
            <div className="form-group">
              <label htmlFor="name">Group Name*</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter group name"
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
                placeholder="Enter group description (optional)"
              />
            </div>
            
            <div className="form-actions">
              <Button secondary={true} onClick={handleCloseModal}>Cancel</Button>
              <Button primary={true} type="submit">
                {currentGroup ? 'Update Group' : 'Create Group'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Groups;