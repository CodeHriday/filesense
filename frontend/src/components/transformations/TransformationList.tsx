import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Transformation, TransformationStatus } from '../../../../shared/types/transformations';
import transformationService from '../../services/transformationService';
import { THEME } from '../../config/config';

// Status badge styles
const statusStyles = {
  created: {
    bg: '#e6f7ff',
    text: '#0070cc',
    border: '#91d5ff'
  },
  running: {
    bg: '#fff7e6',
    text: '#d46b08',
    border: '#ffd591'
  },
  completed: {
    bg: '#f6ffed',
    text: '#389e0d',
    border: '#b7eb8f'
  },
  failed: {
    bg: '#fff1f0',
    text: '#cf1322',
    border: '#ffa39e'
  },
  scheduled: {
    bg: '#f9f0ff',
    text: '#722ed1',
    border: '#d3adf7'
  }
};

/**
 * TransformationList component displays a list of all available transformations
 */
const TransformationList: React.FC = () => {
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch transformations on component mount
  useEffect(() => {
    const fetchTransformations = async () => {
      try {
        setLoading(true);
        const data = await transformationService.getAllTransformations();
        setTransformations(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching transformations:', err);
        setError('Failed to load transformations. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchTransformations();
  }, []);

  // Handle executing a transformation
  const handleExecuteTransformation = async (id: string) => {
    try {
      await transformationService.executeTransformation(id);
      
      // Update the transformation status in the UI
      setTransformations(prevTransformations =>
        prevTransformations.map(transformation =>
          transformation.id === id
            ? { ...transformation, status: TransformationStatus.RUNNING }
            : transformation
        )
      );
      
      // Poll for status updates
      pollTransformationStatus(id);
    } catch (err) {
      console.error('Error executing transformation:', err);
      setError('Failed to execute transformation. Please try again later.');
    }
  };

  // Poll for status updates after executing a transformation
  const pollTransformationStatus = async (id: string) => {
    const maxAttempts = 10;
    let attempts = 0;

    const poll = async () => {
      try {
        const updatedTransformation = await transformationService.getTransformationById(id);

        // Update the transformation in the list
        setTransformations(prevTransformations =>
          prevTransformations.map(transformation =>
            transformation.id === id ? updatedTransformation : transformation
          )
        );

        // If still running and haven't reached max attempts, poll again
        if (
          updatedTransformation.status === TransformationStatus.RUNNING &&
          attempts < maxAttempts
        ) {
          attempts++;
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (err) {
        console.error('Error polling transformation status:', err);
      }
    };

    poll();
  };

  // Handle deleting a transformation
  const handleDeleteTransformation = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this transformation?')) {
      return;
    }

    try {
      await transformationService.deleteTransformation(id);
      
      // Remove the deleted transformation from the list
      setTransformations(prevTransformations =>
        prevTransformations.filter(transformation => transformation.id !== id)
      );
    } catch (err) {
      console.error('Error deleting transformation:', err);
      setError('Failed to delete transformation. Please try again later.');
    }
  };

  // Render status badge
  const renderStatusBadge = (status: TransformationStatus) => {
    const style = statusStyles[status.toLowerCase() as keyof typeof statusStyles] || statusStyles.created;
    
    return (
      <span
        style={{
          backgroundColor: style.bg,
          color: style.text,
          border: `1px solid ${style.border}`,
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          textTransform: 'uppercase'
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="transformations-list-container" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: THEME.colors.secondary, margin: 0 }}>Data Transformations</h2>
        <Link
          to="/transformations/new"
          style={{
            backgroundColor: THEME.colors.primary,
            color: THEME.colors.white,
            padding: '8px 16px',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Create New Transformation
        </Link>
      </div>

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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Loading transformations...</p>
        </div>
      ) : transformations.length === 0 ? (
        <div
          style={{
            backgroundColor: THEME.colors.background,
            padding: '40px',
            borderRadius: '4px',
            textAlign: 'center'
          }}
        >
          <h3>No transformations found</h3>
          <p>
            Get started by creating your first transformation to process and
            transform your data.
          </p>
          <Link
            to="/transformations/new"
            style={{
              backgroundColor: THEME.colors.primary,
              color: THEME.colors.white,
              padding: '8px 16px',
              borderRadius: '4px',
              textDecoration: 'none',
              display: 'inline-block',
              marginTop: '12px'
            }}
          >
            Create Transformation
          </Link>
        </div>
      ) : (
        <div className="transformations-table">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: THEME.colors.white,
              borderRadius: '4px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: THEME.colors.background }}>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Project</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Last Updated</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transformations.map((transformation) => (
                <tr
                  key={transformation.id}
                  style={{
                    borderBottom: `1px solid ${THEME.colors.background}`
                  }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    {(transformation as any).project_name || 'Default Project'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link
                      to={`/transformations/${transformation.id}`}
                      style={{
                        color: THEME.colors.primary,
                        textDecoration: 'none',
                        fontWeight: 'bold'
                      }}
                    >
                      {transformation.name}
                    </Link>
                    {transformation.description && (
                      <div style={{ fontSize: '12px', color: THEME.colors.lightText, marginTop: '4px' }}>
                        {transformation.description.length > 60
                          ? `${transformation.description.substring(0, 60)}...`
                          : transformation.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {transformation.transform_type}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {renderStatusBadge(transformation.status)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {new Date(transformation.updated_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <Link
                        to={`/transformations/${transformation.id}`}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: THEME.colors.background,
                          color: THEME.colors.secondary,
                          textDecoration: 'none',
                          fontSize: '12px'
                        }}
                      >
                        View
                      </Link>
                      <Link
                        to={`/transformations/${transformation.id}/edit`}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: THEME.colors.background,
                          color: THEME.colors.primary,
                          textDecoration: 'none',
                          fontSize: '12px'
                        }}
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleExecuteTransformation(transformation.id)}
                        disabled={transformation.status === TransformationStatus.RUNNING}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: transformation.status === TransformationStatus.RUNNING
                            ? '#f0f0f0'
                            : '#e6f7ff',
                          color: transformation.status === TransformationStatus.RUNNING
                            ? '#999'
                            : '#0070cc',
                          border: 'none',
                          cursor: transformation.status === TransformationStatus.RUNNING
                            ? 'not-allowed'
                            : 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        {transformation.status === TransformationStatus.RUNNING
                          ? 'Running...'
                          : 'Execute'}
                      </button>
                      <button
                        onClick={() => handleDeleteTransformation(transformation.id)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#fff1f0',
                          color: '#cf1322',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TransformationList;