import React, { useState, useEffect } from 'react';
import { FaCog, FaSave, FaTrash, FaInfoCircle } from 'react-icons/fa';
import './SystemSettings.css';

const SystemSettings = () => {
  const [settings, setSettings] = useState([]);
  const [profileStats, setProfileStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [retentionCount, setRetentionCount] = useState(10);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

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
      
      // Set profile retention count from settings
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
    if (!window.confirm(`Are you sure you want to clean up old profiles? This will keep only the last ${retentionCount} profiles per mapping and delete all older ones.`)) {
      return;
    }

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
  };

  if (loading) {
    return (
      <div className="system-settings-container">
        <div className="settings-loading">
          <div className="spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="system-settings-container">
      <div className="settings-header">
        <FaCog className="settings-icon" />
        <h2>System Settings</h2>
        <p className="settings-subtitle">Configure application-wide settings</p>
      </div>

      {message && (
        <div className="settings-message-banner success">
          <FaInfoCircle />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="settings-message-banner error">
          <FaInfoCircle />
          <span>{error}</span>
        </div>
      )}

      <div className="settings-section">
        <h3>Profile Retention</h3>
        <p className="section-description">
          Control how many transformation profile records to keep per mapping. Older profiles will be automatically deleted.
        </p>

        <div className="setting-item">
          <label htmlFor="retentionCount">Profiles to Retain per Mapping:</label>
          <div className="setting-controls">
            <input
              type="number"
              id="retentionCount"
              value={retentionCount}
              onChange={(e) => setRetentionCount(parseInt(e.target.value, 10) || 1)}
              min="1"
              max="100"
              className="retention-input"
            />
            <button
              onClick={handleSaveRetentionCount}
              disabled={saving}
              className="btn-save"
            >
              <FaSave /> {saving ? 'Saving...' : 'Save Setting'}
            </button>
            <button
              onClick={handleCleanupProfiles}
              disabled={cleaning}
              className="btn-cleanup"
            >
              <FaTrash /> {cleaning ? 'Cleaning...' : 'Run Cleanup Now'}
            </button>
          </div>
        </div>

        {profileStats.length > 0 && (
          <div className="profile-stats">
            <h4>Current Profile Counts by Mapping</h4>
            <table className="stats-table">
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
        )}
      </div>
    </div>
  );
};

export default SystemSettings;
