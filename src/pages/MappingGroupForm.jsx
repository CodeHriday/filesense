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
    project_id: '',
    sub_project_id: '',
    group_name: '',
    description: '',
    concurrency_limit: 5
  });
  const [members, setMembers] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProjects();
    fetchTransformations();
    if (isEdit) {
      fetchMappingGroup();
      fetchMembers();
    }
  }, [groupId]);

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);
      const response = await axios.get('/api/projects');
      const allProjects = response.data || [];
      // Filter to show only parent projects (no parent_project_id)
      setProjects(allProjects.filter(p => !p.parent_project_id));
    } catch (err) {
      console.error('Error fetching projects:', err);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchSubProjects = async (parentProjectId) => {
    if (!parentProjectId) {
      setSubProjects([]);
      return;
    }
    
    try {
      const response = await axios.get('/api/projects');
      const allProjects = response.data || [];
      const filteredSubProjects = allProjects.filter(p => p.parent_project_id === parseInt(parentProjectId));
      setSubProjects(filteredSubProjects);
    } catch (err) {
      console.error('Error fetching sub-projects:', err);
      setSubProjects([]);
    }
  };

  const handleProjectChange = async (projectId) => {
    setFormData({
      ...formData,
      project_id: projectId,
      sub_project_id: ''
    });
    await fetchSubProjects(projectId);
  };

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
      const projectId = response.data.project_id || '';
      setFormData({
        project_id: projectId,
        sub_project_id: response.data.sub_project_id || '',
        group_name: response.data.group_name,
        description: response.data.description || '',
        concurrency_limit: response.data.concurrency_limit
      });
      
      // Fetch subprojects if project is set
      if (projectId) {
        await fetchSubProjects(projectId);
      }
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
        // Backend expects: name, description, max_concurrency, sub_project_id
        // Note: project_id cannot be changed after creation for security
        await axios.put(`/api/mapping-groups/${groupId}`, {
          name: formData.group_name,
          description: formData.description,
          max_concurrency: formData.concurrency_limit,
          sub_project_id: formData.sub_project_id || null
        });

        // Sync members using atomic PUT endpoint
        // This replaces all members in a single database transaction
        const membersPayload = members.map((m, index) => ({
          mapping_id: m.mapping_id,
          execution_order: index + 1
        }));
        
        await axios.put(`/api/mapping-groups/${groupId}/members`, {
          members: membersPayload
        });
      } else {
        // Backend expects: name, description, max_concurrency, project_id, sub_project_id
        const response = await axios.post('/api/mapping-groups', {
          name: formData.group_name,
          description: formData.description,
          max_concurrency: formData.concurrency_limit,
          project_id: formData.project_id,
          sub_project_id: formData.sub_project_id || null
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
              <label htmlFor="project-select">Project *</label>
              <select
                id="project-select"
                value={formData.project_id}
                onChange={e => handleProjectChange(e.target.value)}
                required
                disabled={isEdit || loadingProjects}
                className="form-input"
              >
                <option value="">Select a project...</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {isEdit && (
                <small style={{ display: 'block', marginTop: '0.25rem', color: '#64748b' }}>
                  Project cannot be changed after creation
                </small>
              )}
            </div>

            {formData.project_id && (
              <div className="form-group">
                <label htmlFor="subproject-select">Sub-Project (Optional)</label>
                <select
                  id="subproject-select"
                  value={formData.sub_project_id}
                  onChange={e => setFormData({ ...formData, sub_project_id: e.target.value })}
                  disabled={isEdit}
                  className="form-input"
                >
                  <option value="">None (Parent Project Level)</option>
                  {subProjects.map(subProject => (
                    <option key={subProject.id} value={subProject.id}>
                      {subProject.name}
                    </option>
                  ))}
                </select>
                {isEdit && (
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#64748b' }}>
                    Sub-project cannot be changed after creation
                  </small>
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="group-name-input">Group Name *</label>
              <input
                id="group-name-input"
                type="text"
                value={formData.group_name}
                onChange={e => setFormData({ ...formData, group_name: e.target.value })}
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="group-description">Description</label>
              <textarea
                id="group-description"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="concurrency-range">Concurrency Limit: {formData.concurrency_limit}</label>
              <input
                id="concurrency-range"
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
