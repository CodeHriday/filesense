import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiSave, FiX } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import DualListSelector from '../components/DualListSelector';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';

const MappingGroupForm = () => {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const isEdit = !!groupId;

  const [formData, setFormData] = useState({
    group_name: '',
    description: '',
    concurrency_limit: 5
  });
  const [members, setMembers] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTransformations();
    if (isEdit) {
      fetchMappingGroup();
      fetchMembers();
    }
  }, [groupId]);

  const fetchTransformations = async () => {
    try {
      const response = await axios.get('/api/transformations');
      const data = response.data;
      // API returns {mappings: [...], total, limit, offset}
      const mappings = data.mappings || [];
      setTransformations(Array.isArray(mappings) ? mappings : []);
    } catch (err) {
      console.error('Error fetching transformations:', err);
      setTransformations([]); // Set empty array on error
    }
  };

  const fetchMappingGroup = async () => {
    try {
      const response = await axios.get(`/api/mapping-groups/${groupId}`);
      setFormData({
        group_name: response.data.group_name,
        description: response.data.description || '',
        concurrency_limit: response.data.concurrency_limit
      });
    } catch (err) {
      console.error('Error fetching mapping group:', err);
      setError('Failed to load mapping group');
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await axios.get(`/api/mapping-groups/${groupId}/members`);
      const data = response.data;
      // Ensure we always set an array
      setMembers(Array.isArray(data) ? data : (data.members || []));
    } catch (err) {
      console.error('Error fetching members:', err);
      setMembers([]); // Set empty array on error
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isEdit) {
        // Backend expects: name, description, max_concurrency
        await axios.put(`/api/mapping-groups/${groupId}`, {
          name: formData.group_name,
          description: formData.description,
          max_concurrency: formData.concurrency_limit
        });
      } else {
        // Backend expects: name, description, max_concurrency
        const response = await axios.post('/api/mapping-groups', {
          name: formData.group_name,
          description: formData.description,
          max_concurrency: formData.concurrency_limit
        });
        const newGroupId = response.data.group?.id || response.data.id;
        
        // Add members if any were selected
        if (members.length > 0 && newGroupId) {
          for (let i = 0; i < members.length; i++) {
            await axios.post(`/api/mapping-groups/${newGroupId}/members`, {
              mapping_id: members[i].mapping_id,
              execution_order: i + 1
            });
          }
        }
      }
      navigate('/mapping-groups');
    } catch (err) {
      console.error('Error saving mapping group:', err);
      setError('Failed to save mapping group');
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEdit && !formData.group_name) {
    return <LoadingSpinner message="Loading mapping group..." />;
  }

  return (
    <PageTransition>
      <div className="mapping-group-form-page">
        <PageHeader
          title={isEdit ? 'Edit Mapping Group' : 'Create New Mapping Group'}
          subtitle={isEdit ? 'Update mapping group configuration' : 'Configure a new batch transformation group'}
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        <div className="form-container">
          <form onSubmit={handleSubmit} className="data-form">
            <div className="form-group">
              <label>Group Name *</label>
              <input
                type="text"
                value={formData.group_name}
                onChange={e => setFormData({ ...formData, group_name: e.target.value })}
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Concurrency Limit: {formData.concurrency_limit}</label>
              <input
                type="range"
                min="1"
                max="10"
                value={formData.concurrency_limit}
                onChange={e => setFormData({ ...formData, concurrency_limit: parseInt(e.target.value) })}
                className="form-slider"
              />
              <div className="slider-labels">
                <span>1 (Sequential)</span>
                <span>10 (Max Parallel)</span>
              </div>
            </div>

            <div className="members-section">
              <h3>Group Members</h3>
              <DualListSelector
                availableItems={transformations.filter(t => 
                  !members.some(m => m.mapping_id === t.mapping_id)
                )}
                selectedItems={members}
                onSelectionChange={setMembers}
                availableTitle="Available Mappings"
                selectedTitle="Selected Mappings"
                itemLabelKey="mapping_name"
                itemValueKey="mapping_id"
              />
            </div>

            <div className="form-actions">
              <button type="submit" disabled={loading} className="btn btn-primary">
                <FiSave /> {loading ? 'Saving...' : isEdit ? 'Update Group' : 'Create Group'}
              </button>
              <button type="button" onClick={() => navigate('/mapping-groups')} className="btn btn-secondary">
                <FiX /> Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageTransition>
  );
};

export default MappingGroupForm;
