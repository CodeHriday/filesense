import React, { useState } from 'react';
import DashboardLayoutCreator from '../components/DashboardLayoutCreator';
import { FiSettings, FiLayout, FiEye, FiRefreshCw } from 'react-icons/fi';
import './DashboardSettings.css';

const DashboardSettings = () => {
  const [activeTab, setActiveTab] = useState('layout');
  
  return (
    <div className="dashboard-settings-container">
      <h1 className="page-title">
        <FiSettings className="page-title-icon" />
        Dashboard Settings
      </h1>
      
      <div className="settings-tabs">
        <button 
          className={`settings-tab ${activeTab === 'layout' ? 'active' : ''}`}
          onClick={() => setActiveTab('layout')}
        >
          <FiLayout className="tab-icon" />
          Layout Customization
        </button>
        <button 
          className={`settings-tab ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          <FiEye className="tab-icon" />
          Preferences
        </button>
        <button 
          className={`settings-tab ${activeTab === 'reset' ? 'active' : ''}`}
          onClick={() => setActiveTab('reset')}
        >
          <FiRefreshCw className="tab-icon" />
          Reset Dashboard
        </button>
      </div>
      
      <div className="settings-content">
        {activeTab === 'layout' && (
          <div className="tab-content">
            <p className="tab-description">
              Customize your dashboard layout by adding, removing, and rearranging widgets. 
              Changes will be saved to your profile and applied when you view the dashboard.
            </p>
            <DashboardLayoutCreator />
          </div>
        )}
        
        {activeTab === 'preferences' && (
          <div className="tab-content">
            <h2 className="tab-subtitle">Dashboard Preferences</h2>
            <p className="tab-description">
              Customize how your dashboard works and appears.
            </p>
            
            <div className="preferences-section">
              <h3>Appearance</h3>
              <div className="preference-item">
                <label className="switch">
                  <input type="checkbox" />
                  <span className="slider round"></span>
                </label>
                <div className="preference-details">
                  <span className="preference-name">Compact Mode</span>
                  <span className="preference-description">Use more compact widget layout to fit more on screen</span>
                </div>
              </div>
              
              <div className="preference-item">
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="slider round"></span>
                </label>
                <div className="preference-details">
                  <span className="preference-name">Show Widget Headers</span>
                  <span className="preference-description">Display header with title for each widget</span>
                </div>
              </div>
            </div>
            
            <div className="preferences-section">
              <h3>Behavior</h3>
              <div className="preference-item">
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="slider round"></span>
                </label>
                <div className="preference-details">
                  <span className="preference-name">Auto-refresh</span>
                  <span className="preference-description">Automatically refresh dashboard data</span>
                </div>
              </div>
              
              <div className="preference-select">
                <label>Refresh interval</label>
                <select className="form-control">
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="300" selected>5 minutes</option>
                  <option value="600">10 minutes</option>
                  <option value="never">Never</option>
                </select>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'reset' && (
          <div className="tab-content">
            <h2 className="tab-subtitle">Reset Dashboard</h2>
            <p className="tab-description">
              Reset your dashboard to the default layout. This will remove all your custom widgets 
              and layouts. This action cannot be undone.
            </p>
            
            <div className="reset-actions">
              <button className="btn-reset">
                Reset to Default Layout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardSettings;