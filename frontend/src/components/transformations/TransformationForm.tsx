import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Transformation,
  TransformationType,
  CreateTransformationRequest,
  JoinTransformConfig,
  FilterTransformConfig,
  AggregateTransformConfig,
  MapTransformConfig,
  CleanseTransformConfig,
  LookupTransformConfig
} from '../../../../shared/types/transformations';

// Import API and theme config later after moving configuration files
const API_BASE_URL = '/api';
const THEME = {
  colors: {
    primary: '#0079C1',    // Blumetra blue
    secondary: '#333333',  // Dark gray
    accent: '#FF5722',     // Orange accent
    background: '#F4F7F9', // Light gray background
    text: '#333333',       // Text color
    lightText: '#666666',  // Secondary text
    white: '#FFFFFF'       // White
  }
};

interface FileOption {
  id: string;
  filename: string;
}

/**
 * TransformationForm component for creating and editing transformations
 */
const TransformationForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  // File options for source and target files
  const [fileOptions, setFileOptions] = useState<FileOption[]>([]);
  
  // Form state
  const [formData, setFormData] = useState<CreateTransformationRequest>({
    name: '',
    description: '',
    source_file_id: '',
    target_file_id: '',
    transform_type: TransformationType.TRANSFORM,
    transform_config: {}
  });
  
  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch files for dropdown options
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/files`);
        setFileOptions(
          response.data.map((file: any) => ({
            id: file.file_id,
            filename: file.filename
          }))
        );
      } catch (err) {
        console.error('Error fetching files:', err);
        setError('Failed to load file list. Please try again later.');
      }
    };

    fetchFiles();
  }, []);

  // Fetch transformation data if in edit mode
  useEffect(() => {
    if (isEditMode && id) {
      const fetchTransformation = async () => {
        try {
          setLoading(true);
          const response = await axios.get(`${API_BASE_URL}/transformations/${id}`);
          setFormData(response.data);
          setError(null);
        } catch (err) {
          console.error('Error fetching transformation:', err);
          setError('Failed to load transformation. Please try again later.');
        } finally {
          setLoading(false);
        }
      };

      fetchTransformation();
    }
  }, [isEditMode, id]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      if (isEditMode && id) {
        // Update existing transformation
        await axios.put(`${API_BASE_URL}/transformations/${id}`, formData);
        setSuccess('Transformation updated successfully');
      } else {
        // Create new transformation
        await axios.post(`${API_BASE_URL}/transformations`, formData);
        setSuccess('Transformation created successfully');
      }
      
      // Navigate back to list after short delay
      setTimeout(() => {
        navigate('/transformations');
      }, 1500);
    } catch (err) {
      console.error('Error saving transformation:', err);
      setError('Failed to save transformation. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === 'transform_type') {
      // When transformation type changes, reset the config
      setFormData({
        ...formData,
        [name]: value,
        transform_config: getDefaultConfigForType(value as TransformationType)
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  // Get default configuration based on transformation type
  const getDefaultConfigForType = (type: TransformationType): any => {
    switch (type) {
      case TransformationType.JOIN:
        return {
          joinType: 'inner',
          sourceKey: '',
          targetKey: '',
          secondaryFileId: '',
          sourceColumns: [],
          targetColumns: []
        } as JoinTransformConfig;
      case TransformationType.FILTER:
        return {
          filterConditions: [{ column: '', operator: '=', value: '' }],
          operator: 'AND',
          sourceColumns: [],
          targetColumns: []
        } as FilterTransformConfig;
      case TransformationType.AGGREGATE:
        return {
          groupByColumns: [],
          aggregations: [{ column: '', operation: 'SUM', alias: '' }],
          sourceColumns: [],
          targetColumns: []
        } as AggregateTransformConfig;
      case TransformationType.MAP:
        return {
          columnMappings: [{ sourceColumn: '', targetColumn: '', transformation: '' }],
          sourceColumns: [],
          targetColumns: []
        } as MapTransformConfig;
      case TransformationType.CLEANSE:
        return {
          rules: [{ column: '', actions: ['TRIM'], parameters: {} }],
          sourceColumns: [],
          targetColumns: []
        } as CleanseTransformConfig;
      case TransformationType.LOOKUP:
        return {
          lookupTable: '',
          lookupKey: '',
          sourceKey: '',
          fieldsToInclude: [],
          sourceColumns: [],
          targetColumns: []
        } as LookupTransformConfig;
      default:
        return {
          sourceColumns: [],
          targetColumns: []
        };
    }
  };

  // Handle configuration changes
  const handleConfigChange = (config: any) => {
    setFormData({
      ...formData,
      transform_config: config
    });
  };

  // Render configuration form based on transformation type
  const renderConfigForm = () => {
    switch (formData.transform_type) {
      case TransformationType.JOIN:
        return renderJoinConfigForm();
      case TransformationType.FILTER:
        return renderFilterConfigForm();
      case TransformationType.AGGREGATE:
        return renderAggregateConfigForm();
      case TransformationType.MAP:
        return renderMapConfigForm();
      case TransformationType.CLEANSE:
        return renderCleanseConfigForm();
      case TransformationType.LOOKUP:
        return renderLookupConfigForm();
      default:
        return (
          <div style={{ padding: '16px', backgroundColor: THEME.colors.background, borderRadius: '4px' }}>
            <p>Configure transformation settings below.</p>
          </div>
        );
    }
  };

  // Render join configuration form
  const renderJoinConfigForm = () => {
    const config = formData.transform_config as JoinTransformConfig;
    
    return (
      <div style={{ padding: '16px', backgroundColor: THEME.colors.background, borderRadius: '4px' }}>
        <h3>Join Configuration</h3>
        
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="joinType" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Join Type
          </label>
          <select
            id="joinType"
            value={config.joinType}
            onChange={(e) => {
              handleConfigChange({
                ...config,
                joinType: e.target.value
              });
            }}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          >
            <option value="inner">Inner Join</option>
            <option value="left">Left Join</option>
            <option value="right">Right Join</option>
            <option value="full">Full Join</option>
          </select>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="sourceKey" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Source Key Column
          </label>
          <input
            id="sourceKey"
            type="text"
            value={config.sourceKey}
            onChange={(e) => {
              handleConfigChange({
                ...config,
                sourceKey: e.target.value
              });
            }}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="secondaryFileId" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Secondary File
          </label>
          <select
            id="secondaryFileId"
            value={config.secondaryFileId}
            onChange={(e) => {
              handleConfigChange({
                ...config,
                secondaryFileId: e.target.value
              });
            }}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          >
            <option value="">Select Secondary File</option>
            {fileOptions.map((file) => (
              <option key={file.id} value={file.id}>
                {file.filename}
              </option>
            ))}
          </select>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="targetKey" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Target Key Column
          </label>
          <input
            id="targetKey"
            type="text"
            value={config.targetKey}
            onChange={(e) => {
              handleConfigChange({
                ...config,
                targetKey: e.target.value
              });
            }}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
        </div>
      </div>
    );
  };

  // Placeholder for other configuration forms
  const renderFilterConfigForm = () => {
    return (
      <div style={{ padding: '16px', backgroundColor: THEME.colors.background, borderRadius: '4px' }}>
        <h3>Filter Configuration</h3>
        <p>Filter configuration form (will be implemented)</p>
      </div>
    );
  };

  const renderAggregateConfigForm = () => {
    return (
      <div style={{ padding: '16px', backgroundColor: THEME.colors.background, borderRadius: '4px' }}>
        <h3>Aggregate Configuration</h3>
        <p>Aggregate configuration form (will be implemented)</p>
      </div>
    );
  };

  const renderMapConfigForm = () => {
    return (
      <div style={{ padding: '16px', backgroundColor: THEME.colors.background, borderRadius: '4px' }}>
        <h3>Map Configuration</h3>
        <p>Map configuration form (will be implemented)</p>
      </div>
    );
  };

  const renderCleanseConfigForm = () => {
    return (
      <div style={{ padding: '16px', backgroundColor: THEME.colors.background, borderRadius: '4px' }}>
        <h3>Cleanse Configuration</h3>
        <p>Cleanse configuration form (will be implemented)</p>
      </div>
    );
  };

  const renderLookupConfigForm = () => {
    return (
      <div style={{ padding: '16px', backgroundColor: THEME.colors.background, borderRadius: '4px' }}>
        <h3>Lookup Configuration</h3>
        <p>Lookup configuration form (will be implemented)</p>
      </div>
    );
  };

  if (loading && !formData.name) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Loading transformation...</p>
      </div>
    );
  }

  return (
    <div className="transformation-form-container" style={{ padding: '20px' }}>
      <h2 style={{ color: THEME.colors.secondary, marginBottom: '20px' }}>
        {isEditMode ? 'Edit Transformation' : 'Create New Transformation'}
      </h2>

      {error && (
        <div
          style={{
            backgroundColor: '#fff1f0',
            border: '1px solid #ffa39e',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '20px',
            color: '#cf1322'
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            backgroundColor: '#f6ffed',
            border: '1px solid #b7eb8f',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '20px',
            color: '#389e0d'
          }}
        >
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          style={{
            backgroundColor: THEME.colors.white,
            padding: '24px',
            borderRadius: '4px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="name"
              style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
            >
              Transformation Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="description"
              style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1, marginBottom: '16px' }}>
              <label
                htmlFor="source_file_id"
                style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
              >
                Source File
              </label>
              <select
                id="source_file_id"
                name="source_file_id"
                value={formData.source_file_id || ''}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              >
                <option value="">Select Source File</option>
                {fileOptions.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.filename}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, marginBottom: '16px' }}>
              <label
                htmlFor="target_file_id"
                style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
              >
                Target File (Optional)
              </label>
              <select
                id="target_file_id"
                name="target_file_id"
                value={formData.target_file_id || ''}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              >
                <option value="">Select Target File</option>
                {fileOptions.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.filename}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="transform_type"
              style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
            >
              Transformation Type *
            </label>
            <select
              id="transform_type"
              name="transform_type"
              value={formData.transform_type}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            >
              <option value={TransformationType.JOIN}>Join</option>
              <option value={TransformationType.FILTER}>Filter</option>
              <option value={TransformationType.AGGREGATE}>Aggregate</option>
              <option value={TransformationType.TRANSFORM}>Transform</option>
              <option value={TransformationType.MAP}>Map</option>
              <option value={TransformationType.CLEANSE}>Cleanse</option>
              <option value={TransformationType.ENRICH}>Enrich</option>
              <option value={TransformationType.LOOKUP}>Lookup</option>
            </select>
          </div>
        </div>

        {renderConfigForm()}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigate('/transformations')}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: `1px solid ${THEME.colors.secondary}`,
              backgroundColor: THEME.colors.white,
              color: THEME.colors.secondary,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: THEME.colors.primary,
              color: THEME.colors.white,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Saving...' : isEditMode ? 'Update Transformation' : 'Create Transformation'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TransformationForm;