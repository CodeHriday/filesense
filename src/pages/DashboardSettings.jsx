import React, { useState, useEffect } from 'react';
import { FiSave, FiRotateCcw, FiEye, FiSettings, FiLayout } from 'react-icons/fi';
import DashboardLayoutCreator from '../components/DashboardLayoutCreator';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition, SuccessAnimation } from '../components/MicroAnimations';
import ContextualTooltip from '../components/ContextualTooltip';
import axios from 'axios';
import '../styles/global-page-styles.css';

const DashboardSettings = () => {
  const [dashboardLayout, setDashboardLayout] = useState([]);
  const [savedLayout, setSavedLayout] = useState([]);
  const [themeSettings, setThemeSettings] = useState({
    colorScheme: 'light',
    accentColor: '#2196f3',
    fontSize: 'medium',
    compactMode: false,
    animationsEnabled: true
  });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get('/api/user/dashboard-settings');
        const settings = response.data;
        
        if (settings.layout && Array.isArray(settings.layout)) {
          setDashboardLayout(settings.layout);
          setSavedLayout(settings.layout);
        } else {
          setDashboardLayout([]);
          setSavedLayout([]);
        }
        
        if (settings.theme) {
          setThemeSettings({
            ...themeSettings,
            ...settings.theme
          });
        }
      } catch (error) {
        console.warn('Failed to load dashboard settings from server, loading from localStorage');
        
        const savedLayoutString = localStorage.getItem('dfo-dashboard-layout');
        const savedThemeString = localStorage.getItem('dfo-dashboard-theme');
        
        let loadedLayout = [];
        
        if (savedLayoutString) {
          try {
            const parsedLayout = JSON.parse(savedLayoutString);
            if (Array.isArray(parsedLayout)) {
              loadedLayout = parsedLayout;
            }
          } catch (e) {
            console.error('Error parsing saved layout', e);
          }
        }
        
        setDashboardLayout(loadedLayout);
        setSavedLayout(loadedLayout);
        
        if (savedThemeString) {
          try {
            const theme = JSON.parse(savedThemeString);
            setThemeSettings({
              ...themeSettings,
              ...theme
            });
          } catch (e) {
            console.error('Error parsing saved theme', e);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, []);
  
  const handleSaveLayout = async (layout) => {
    setDashboardLayout(layout);
    setSavedLayout(layout);
    
    try {
      await axios.post('/api/user/dashboard-settings', {
        layout,
        theme: themeSettings
      });
      
      setSuccessMessage('Dashboard layout saved successfully');
      setShowSuccessMessage(true);
    } catch (error) {
      console.warn('Failed to save dashboard settings to server, saving to localStorage', error);
      localStorage.setItem('dfo-dashboard-layout', JSON.stringify(layout));
      setSuccessMessage('Dashboard layout saved locally');
      setShowSuccessMessage(true);
    }
  };
  
  const handleThemeChange = (setting, value) => {
    const newThemeSettings = {
      ...themeSettings,
      [setting]: value
    };
    setThemeSettings(newThemeSettings);
  };
  
  const saveThemeSettings = async () => {
    try {
      await axios.post('/api/user/dashboard-settings', {
        layout: dashboardLayout,
        theme: themeSettings
      });
      
      localStorage.setItem('dfo-dashboard-theme', JSON.stringify(themeSettings));
      setSuccessMessage('Theme settings saved successfully');
      setShowSuccessMessage(true);
    } catch (error) {
      console.warn('Failed to save theme settings to server, saving to localStorage', error);
      localStorage.setItem('dfo-dashboard-theme', JSON.stringify(themeSettings));
      setSuccessMessage('Theme settings saved locally');
      setShowSuccessMessage(true);
    }
  };
  
  const resetToDefaults = () => {
    setThemeSettings({
      colorScheme: 'light',
      accentColor: '#2196f3',
      fontSize: 'medium',
      compactMode: false,
      animationsEnabled: true
    });
    setDashboardLayout([]);
    setSavedLayout([]);
  };
  
  return (
    <PageTransition>
      <div className="gps-page-container">
        <div className="gps-page-header">
          <div className="gps-page-header-left">
            <h1 className="gps-page-title">
              <FiSettings style={{ marginRight: '8px', color: '#025043' }} />
              Dashboard Settings
            </h1>
            <p className="gps-page-subtitle">Customize your dashboard layout and appearance</p>
          </div>
          <div className="gps-header-actions">
            <button
              className={`gps-btn ${previewMode ? 'gps-btn--primary' : 'gps-btn--secondary'}`}
              onClick={() => setPreviewMode(!previewMode)}
            >
              <FiEye />
              {previewMode ? 'Exit Preview' : 'Preview'}
            </button>
            
            <button
              className="gps-btn gps-btn--secondary"
              onClick={resetToDefaults}
            >
              <FiRotateCcw />
              Reset to Defaults
            </button>
          </div>
        </div>
        
        {showSuccessMessage && (
          <SuccessAnimation
            message={successMessage}
            onComplete={() => setShowSuccessMessage(false)}
          />
        )}
        
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <button 
            className={`gps-btn ${!previewMode ? 'gps-btn--primary' : 'gps-btn--secondary'}`}
            onClick={() => setPreviewMode(false)}
            style={{ borderRadius: '4px 4px 0 0' }}
          >
            <FiSettings /> Settings
          </button>
          <button 
            className={`gps-btn ${previewMode ? 'gps-btn--primary' : 'gps-btn--secondary'}`}
            onClick={() => setPreviewMode(true)}
            style={{ borderRadius: '4px 4px 0 0' }}
          >
            <FiEye /> Preview
          </button>
        </div>
        
        {!previewMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="gps-section" style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div className="gps-section-header">
                <h2 className="gps-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiLayout style={{ color: '#025043' }} />
                  Dashboard Layout
                  <ContextualTooltip
                    content="Customize your dashboard by adding, removing, resizing, and rearranging widgets. Drag widgets to reposition them."
                    position="right"
                    interactive={true}
                  />
                </h2>
              </div>
              
              <div style={{ marginTop: '16px' }}>
                {loading ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <DashboardLayoutCreator
                    initialLayout={dashboardLayout}
                    onSaveLayout={handleSaveLayout}
                    maxColumns={2}
                  />
                )}
              </div>
            </div>
            
            <div className="gps-section" style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div className="gps-section-header">
                <h2 className="gps-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiSettings style={{ color: '#025043' }} />
                  Appearance
                  <ContextualTooltip
                    content="Customize the appearance of your dashboard, including color scheme, accent color, and text size."
                    position="right"
                    interactive={true}
                  />
                </h2>
              </div>
              
              <div style={{ marginTop: '16px' }}>
                <div className="gps-form-group" style={{ marginBottom: '20px' }}>
                  <label className="gps-label">Color Scheme</label>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    {[
                      { value: 'light', label: 'Light', bg: '#ffffff', border: '#e2e8f0' },
                      { value: 'dark', label: 'Dark', bg: '#1f2937', border: '#374151' },
                      { value: 'system', label: 'System', bg: 'linear-gradient(135deg, #fff 50%, #1f2937 50%)', border: '#9ca3af' }
                    ].map(scheme => (
                      <button 
                        key={scheme.value}
                        className={`gps-btn ${themeSettings.colorScheme === scheme.value ? 'gps-btn--primary' : 'gps-btn--secondary'}`}
                        onClick={() => handleThemeChange('colorScheme', scheme.value)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <div style={{ 
                          width: '20px', 
                          height: '20px', 
                          borderRadius: '4px', 
                          background: scheme.bg, 
                          border: `1px solid ${scheme.border}` 
                        }}></div>
                        <span>{scheme.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="gps-form-group" style={{ marginBottom: '20px' }}>
                  <label className="gps-label">Accent Color</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                    {['#2196f3', '#4caf50', '#f44336', '#ff9800', '#9c27b0', '#607d8b'].map(color => (
                      <button 
                        key={color}
                        onClick={() => handleThemeChange('accentColor', color)}
                        style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '50%', 
                          backgroundColor: color,
                          border: themeSettings.accentColor === color ? '3px solid #333' : '2px solid #e2e8f0',
                          cursor: 'pointer'
                        }}
                        title={color}
                      ></button>
                    ))}
                    <input
                      type="color"
                      value={themeSettings.accentColor || '#2196f3'} 
                      onChange={(e) => handleThemeChange('accentColor', e.target.value)}
                      style={{ width: '32px', height: '32px', padding: 0, border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer' }}
                    />
                  </div>
                </div>
                
                <div className="gps-form-group" style={{ marginBottom: '20px' }}>
                  <label className="gps-label">Text Size</label>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    {[
                      { value: 'small', label: 'Small', preview: '12px' },
                      { value: 'medium', label: 'Medium', preview: '14px' },
                      { value: 'large', label: 'Large', preview: '16px' }
                    ].map(size => (
                      <button 
                        key={size.value}
                        className={`gps-btn ${themeSettings.fontSize === size.value ? 'gps-btn--primary' : 'gps-btn--secondary'}`}
                        onClick={() => handleThemeChange('fontSize', size.value)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <span style={{ fontSize: size.preview, fontWeight: 600 }}>A</span>
                        <span>{size.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="gps-form-group" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label className="gps-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={!!themeSettings.compactMode}
                        onChange={(e) => handleThemeChange('compactMode', e.target.checked)}
                      />
                      <span>Compact Mode</span>
                      <ContextualTooltip
                        content="Reduces spacing and padding to fit more content on screen"
                        position="right"
                      />
                    </label>
                    
                    <label className="gps-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={themeSettings.animationsEnabled !== false}
                        onChange={(e) => handleThemeChange('animationsEnabled', e.target.checked)}
                      />
                      <span>Enable Animations</span>
                      <ContextualTooltip
                        content="Enables interface animations and transitions"
                        position="right"
                      />
                    </label>
                  </div>
                </div>
                
                <div style={{ marginTop: '24px' }}>
                  <button
                    className="gps-btn gps-btn--primary"
                    onClick={saveThemeSettings}
                  >
                    <FiSave />
                    Save Appearance Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div className={`${themeSettings.colorScheme} ${themeSettings.fontSize} ${themeSettings.compactMode ? 'compact' : ''}`}>
              <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Dashboard Preview</h2>
                <p style={{ fontSize: '10px', color: '#666' }}>This is how your dashboard will look with the current settings.</p>
              </div>
              
              <DashboardLayoutCreator
                initialLayout={dashboardLayout}
                readOnly={true}
                maxColumns={2}
              />
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default DashboardSettings;
