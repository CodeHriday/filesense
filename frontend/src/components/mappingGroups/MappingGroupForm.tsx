import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import mappingGroupService, { MappingGroup, MappingGroupMember } from '../../services/mappingGroupService';
import transformationService from '../../services/transformationService';
import { Transformation } from '../../../../shared/types/transformations';
import { THEME } from '../../config/config';

const MappingGroupForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    group_name: '',
    description: '',
    concurrency_limit: 5
  });
  const [members, setMembers] = useState<MappingGroupMember[]>([]);
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [selectedMapping, setSelectedMapping] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTransformations();
    if (isEdit && id) {
      fetchMappingGroup(id);
      fetchMembers(id);
    }
  }, [id, isEdit]);

  const fetchTransformations = async () => {
    try {
      const data = await transformationService.getAllTransformations();
      setTransformations(data);
    } catch (err) {
      console.error('Error fetching transformations:', err);
    }
  };

  const fetchMappingGroup = async (groupId: string) => {
    try {
      const group = await mappingGroupService.getMappingGroupById(groupId);
      setFormData({
        group_name: group.group_name,
        description: group.description || '',
        concurrency_limit: group.concurrency_limit
      });
    } catch (err) {
      console.error('Error fetching mapping group:', err);
      setError('Failed to load mapping group');
    }
  };

  const fetchMembers = async (groupId: string) => {
    try {
      const memberData = await mappingGroupService.getGroupMembers(groupId);
      setMembers(memberData);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isEdit && id) {
        await mappingGroupService.updateMappingGroup(id, formData);
      } else {
        await mappingGroupService.createMappingGroup(formData);
      }
      navigate('/mapping-groups');
    } catch (err) {
      console.error('Error saving mapping group:', err);
      setError('Failed to save mapping group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedMapping || !id) return;

    try {
      const executionOrder = members.length + 1;
      const newMember = await mappingGroupService.addMember(id, selectedMapping, executionOrder);
      setMembers([...members, newMember]);
      setSelectedMapping('');
    } catch (err) {
      console.error('Error adding member:', err);
      setError('Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!id) return;

    try {
      await mappingGroupService.removeMember(id, memberId);
      setMembers(members.filter(m => m.member_id !== memberId));
    } catch (err) {
      console.error('Error removing member:', err);
      setError('Failed to remove member');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ color: THEME.colors.secondary, marginBottom: '20px' }}>
        {isEdit ? 'Edit Mapping Group' : 'Create New Mapping Group'}
      </h2>

      {error && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Group Name *
          </label>
          <input
            type="text"
            value={formData.group_name}
            onChange={e => setFormData({ ...formData, group_name: e.target.value })}
            required
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Concurrency Limit: {formData.concurrency_limit}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={formData.concurrency_limit}
            onChange={e => setFormData({ ...formData, concurrency_limit: parseInt(e.target.value) })}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
            <span>1 (Sequential)</span>
            <span>10 (Max Parallel)</span>
          </div>
        </div>

        {isEdit && id && (
          <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <h3 style={{ marginTop: 0 }}>Group Members</h3>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <select
                value={selectedMapping}
                onChange={e => setSelectedMapping(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: '4px'
                }}
              >
                <option value="">Select a transformation...</option>
                {transformations.map(t => (
                  <option key={t.id} value={t.id}>{t.mapping_name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddMember}
                disabled={!selectedMapping}
                style={{
                  backgroundColor: THEME.colors.primary,
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: selectedMapping ? 'pointer' : 'not-allowed',
                  opacity: selectedMapping ? 1 : 0.6
                }}
              >
                Add Member
              </button>
            </div>

            {members.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No members added yet</p>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {members.map(member => (
                  <div
                    key={member.member_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px',
                      backgroundColor: 'white',
                      borderRadius: '4px'
                    }}
                  >
                    <span>
                      {member.execution_order}. {member.mapping_name || member.mapping_id}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.member_id)}
                      style={{
                        backgroundColor: '#ff4d4f',
                        color: 'white',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: THEME.colors.primary,
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Saving...' : isEdit ? 'Update Group' : 'Create Group'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/mapping-groups')}
            style={{
              backgroundColor: '#f0f0f0',
              color: '#333',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default MappingGroupForm;
