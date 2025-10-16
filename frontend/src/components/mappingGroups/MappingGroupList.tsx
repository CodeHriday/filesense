import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import mappingGroupService, { MappingGroup } from '../../services/mappingGroupService';
import { THEME } from '../../config/config';

const MappingGroupList: React.FC = () => {
  const [groups, setGroups] = useState<MappingGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => {
    fetchMappingGroups();
  }, []);

  const fetchMappingGroups = async () => {
    try {
      setLoading(true);
      const data = await mappingGroupService.getAllMappingGroups();
      setGroups(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching mapping groups:', err);
      setError('Failed to load mapping groups. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (groupId: string) => {
    try {
      setExecuting(groupId);
      await mappingGroupService.executeMappingGroup(groupId);
      alert('Mapping group execution started successfully!');
    } catch (err) {
      console.error('Error executing mapping group:', err);
      setError('Failed to execute mapping group. Please try again later.');
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this mapping group?')) {
      return;
    }

    try {
      await mappingGroupService.deleteMappingGroup(groupId);
      setGroups(prevGroups => prevGroups.filter(g => g.group_id !== groupId));
    } catch (err) {
      console.error('Error deleting mapping group:', err);
      setError('Failed to delete mapping group. Please try again later.');
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading mapping groups...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: THEME.colors.secondary, margin: 0 }}>Mapping Groups</h2>
        <Link
          to="/mapping-groups/new"
          style={{
            backgroundColor: THEME.colors.primary,
            color: THEME.colors.white,
            padding: '8px 16px',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Create New Group
        </Link>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          No mapping groups found. Create one to get started!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {groups.map(group => (
            <div
              key={group.group_id}
              style={{
                backgroundColor: THEME.colors.white,
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '20px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 8px 0', color: THEME.colors.secondary }}>{group.group_name}</h3>
                  {group.description && (
                    <p style={{ margin: '0 0 12px 0', color: '#666' }}>{group.description}</p>
                  )}
                  <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#666' }}>
                    <span>Members: {group.member_count || 0}</span>
                    <span>Concurrency: {group.concurrency_limit}</span>
                    <span>Created: {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleExecute(group.group_id)}
                    disabled={executing === group.group_id}
                    style={{
                      backgroundColor: '#52c41a',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: executing === group.group_id ? 'not-allowed' : 'pointer',
                      opacity: executing === group.group_id ? 0.6 : 1
                    }}
                  >
                    {executing === group.group_id ? 'Executing...' : 'Execute'}
                  </button>
                  <Link
                    to={`/mapping-groups/${group.group_id}/edit`}
                    style={{
                      backgroundColor: THEME.colors.primary,
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      display: 'inline-block'
                    }}
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(group.group_id)}
                    style={{
                      backgroundColor: '#ff4d4f',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MappingGroupList;
