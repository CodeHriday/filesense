import React, { useState, useEffect } from 'react';
import { FaCog, FaSave, FaTrash, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import ConfirmModal from './ConfirmModal';
import '../styles/global-page-styles.css';

const SystemSettings = () => {
  const [settings, setSettings] = useState([]);
  const [profileStats, setProfileStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [retentionCount, setRetentionCount] = useState(10);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  useEffect(() => {
    fetchSettings();
    fetchProfileStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      const data = await response.json();
      setSettings(data.settings);
      
      const retentionSetting = data.settings.find(s => s.setting_key === 'profile_retention_count');
      if (retentionSetting) {
        setRetentionCount(parseInt(retentionSetting.setting_value, 10));
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfileStats = async () => {
    try {
      const response = await fetch('/api/admin/profile-stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch profile stats');
      }

      const data = await response.json();
      setProfileStats(data.stats || []);
    } catch (err) {
      console.error('Error fetching profile stats:', err);
    }
  };

  const handleSaveRetentionCount = async () => {
    if (retentionCount < 1 || retentionCount > 100) {
      setError('Retention count must be between 1 and 100');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const response = await fetch('/api/admin/settings/profile_retention_count', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ value: retentionCount.toString() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update setting');
      }

      setMessage('Profile retention count updated successfully');
      await fetchSettings();
    } catch (err) {
      console.error('Error updating setting:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCleanupProfiles = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Action',
      message: `Are you sure you want to clean up old profiles? This will keep only the last ${retentionCount} profiles per mapping and delete all older ones.`,
      action: async () => {
        try {
          setCleaning(true);
          setError(null);
          setMessage(null);

          const response = await fetch('/api/admin/cleanup-profiles', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ retentionCount })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Cleanup failed');
          }

          const data = await response.json();
          setMessage(`Successfully deleted ${data.deletedCount} old profiles`);
          await fetchProfileStats();
        } catch (err) {
          console.error('Error cleaning up profiles:', err);
          setError(err.message);
        } finally {
          setCleaning(false);
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="gps-section" style={{ padding: '24px', textAlign: 'center' }}>
        <div className="gps-spinner" style={{ margin: '0 auto 16px' }}></div>
        <p className="gps-text-muted">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="gps-section" style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
      <div className="gps-section-header" style={{ marginBottom: '16px' }}>
        <h2 className="gps-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FaCog style={{ color: '#025043' }} />
          System Settings
        </h2>
        <p className="gps-page-subtitle" style={{ marginTop: '4px' }}>Configure application-wide settings</p>
      </div>

      {message && (
        <div className="gps-alert gps-alert--success" style={{ marginBottom: '16px' }}>
          <FaCheckCircle style={{ marginRight: '8px' }} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="gps-alert gps-alert--error" style={{ marginBottom: '16px' }}>
          <FaExclamationTriangle style={{ marginRight: '8px' }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Profile Retention</h3>
        <p className="gps-text-muted" style={{ fontSize: '10px', marginBottom: '16px' }}>
          Control how many transformation profile records to keep per mapping. Older profiles will be automatically deleted.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <label htmlFor="retention-count-input" className="gps-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Profiles to Retain per Mapping:</label>
          <input
            id="retention-count-input"
            type="number"
            value={retentionCount}
            onChange={(e) => setRetentionCount(parseInt(e.target.value, 10) || 1)}
            min="1"
            max="100"
            className="gps-input"
            style={{ width: '80px' }}
          />
          <button
            onClick={handleSaveRetentionCount}
            disabled={saving}
            className="gps-btn gps-btn--primary"
          >
            <FaSave style={{ marginRight: '6px' }} />
            {saving ? 'Saving...' : 'Save Setting'}
          </button>
          <button
            onClick={handleCleanupProfiles}
            disabled={cleaning}
            className="gps-btn gps-btn--danger"
          >
            <FaTrash style={{ marginRight: '6px' }} />
            {cleaning ? 'Cleaning...' : 'Run Cleanup Now'}
          </button>
        </div>

        {profileStats.length > 0 && (
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>Current Profile Counts by Mapping</h4>
            <div className="gps-table-container">
              <table className="gps-table">
                <thead>
                  <tr>
                    <th>Mapping Name</th>
                    <th>Total Profiles</th>
                    <th>Oldest Profile</th>
                    <th>Newest Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {profileStats.map((stat, idx) => (
                    <tr key={idx}>
                      <td>{stat.mapping_name}</td>
                      <td>{stat.total_profiles}</td>
                      <td>{new Date(stat.oldest_profile).toLocaleString()}</td>
                      <td>{new Date(stat.newest_profile).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.action?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        variant="warning"
      />
    </div>
  );
};

export default SystemSettings;
