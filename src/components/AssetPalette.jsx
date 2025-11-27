import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import './AssetPalette.css';

function AssetPalette() {
  const [visualMappings, setVisualMappings] = useState([]);
  const [mappingGroups, setMappingGroups] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [activeTab, setActiveTab] = useState('mappings');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    try {
      const authHeaders = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const [mappingsRes, groupsRes, workflowsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/visual-mappings`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/mapping-groups`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/n-step-workflows`, { headers: authHeaders }),
      ]);

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        // Visual mappings API returns array directly with 'id' and 'name' fields
        const mappings = Array.isArray(data) ? data : [];
        setVisualMappings(mappings);
      } else {
        setVisualMappings([]);
      }

      if (groupsRes.ok) {
        const data = await groupsRes.json();
        setMappingGroups(Array.isArray(data.groups) ? data.groups : []);
      } else {
        setMappingGroups([]);
      }

      if (workflowsRes.ok) {
        const data = await workflowsRes.json();
        setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
      } else {
        setWorkflows([]);
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
      setVisualMappings([]);
      setMappingGroups([]);
      setWorkflows([]);
    }
  };

  const onDragStart = (event, assetType, asset) => {
    const dragData = {
      type: assetType,
      assetId: asset.id,
      assetName: asset.name,
    };
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const filterAssets = (assets) => {
    if (!searchTerm) return assets;
    return assets.filter((asset) =>
      asset.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const renderAssetList = (assets, type) => {
    const filtered = filterAssets(assets);

    if (filtered.length === 0) {
      return <div className="no-assets">No {type} found</div>;
    }

    return (
      <div className="asset-list">
        {filtered.map((asset) => (
          <div
            key={asset.id}
            className="asset-item"
            draggable
            onDragStart={(e) => onDragStart(e, type, asset)}
          >
            <div className="asset-icon">{getAssetIcon(type)}</div>
            <div className="asset-info">
              <div className="asset-name">{asset.name}</div>
              {asset.description && (
                <div className="asset-description">{asset.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const getAssetIcon = (type) => {
    switch (type) {
      case 'visual_mapping':
        return '🔄';
      case 'mapping_group':
        return '📦';
      case 'workflow':
        return '⚙️';
      default:
        return '📄';
    }
  };

  return (
    <div className="asset-palette">
      <div className="palette-header">
        <h3>Asset Library</h3>
        <input
          type="text"
          placeholder="Search assets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="palette-tabs">
        <button
          className={`tab ${activeTab === 'mappings' ? 'active' : ''}`}
          onClick={() => setActiveTab('mappings')}
        >
          Visual Mappings ({visualMappings.length})
        </button>
        <button
          className={`tab ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => setActiveTab('groups')}
        >
          Groups ({mappingGroups.length})
        </button>
        <button
          className={`tab ${activeTab === 'workflows' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          Workflows ({workflows.length})
        </button>
      </div>

      <div className="palette-content">
        {activeTab === 'mappings' && renderAssetList(visualMappings, 'visual_mapping')}
        {activeTab === 'groups' && renderAssetList(mappingGroups, 'mapping_group')}
        {activeTab === 'workflows' && renderAssetList(workflows, 'workflow')}
      </div>

      <div className="palette-footer">
        <small>Drag assets onto the canvas to build your workflow</small>
      </div>
    </div>
  );
}

export default AssetPalette;
