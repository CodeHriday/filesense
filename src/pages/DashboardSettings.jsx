import React, { useState, useEffect } from 'react';
import { FiSave, FiRotateCcw, FiEye, FiSettings, FiLayout } from 'react-icons/fi';
import DashboardLayoutCreator from '../components/DashboardLayoutCreator';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition, AnimatedButton, SuccessAnimation } from '../components/MicroAnimations';
import ContextualTooltip from '../components/ContextualTooltip';
import axios from 'axios';
import './DashboardSettings.css';

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
  
  // Load saved settings on initial render
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Try to load settings from server API
        const response = await axios.get('/api/user/dashboard-settings');
        const settings = response.data;
        
        if (settings.layout && Array.isArray(settings.layout)) {
          setDashboardLayout(settings.layout);
          setSavedLayout(settings.layout);
        } else {
          // Set empty array if layout is not an array
          setDashboardLayout([]);
          setSavedLayout([]);
        }
        
        if (settings.theme) {
          setThemeSettings({
            ...themeSettings, // Keep default values as fallback
            ...settings.theme // Override with saved settings
          });
        }
      } catch (error) {
        console.warn('Failed to load dashboard settings from server, loading from localStorage');
        
        // Fall back to localStorage if server isn't available
        const savedLayoutString = localStorage.getItem('dfo-dashboard-layout');
        const savedThemeString = localStorage.getItem('dfo-dashboard-theme');
        
        // Default to empty array for layout
        let loadedLayout = [];
        
        if (savedLayoutString) {
          try {
            const parsedLayout = JSON.parse(savedLayoutString);
            if (Array.isArray(parsedLayout)) {
              loadedLayout = parsedLayout;
            } else {
              console.warn('Saved layout is not an array, using empty array');
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
              ...themeSettings, // Keep default values as fallback
              ...theme // Override with saved settings
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
  
  // Handle saving the layout
  const handleSaveLayout = async (layout) => {
    setDashboardLayout(layout);
    setSavedLayout(layout);
    
    try {
      // Try to save to server API
      await axios.post('/api/user/dashboard-settings', {
        layout,
        theme: themeSettings
      });
      
      // Show success message
      setSuccessMessage('Dashboard layout saved successfully');
      setShowSuccessMessage(true);
    } catch (error) {
      console.warn('Failed to save dashboard settings to server, saving to localStorage', error);
      
      // Fall back to localStorage
      localStorage.setItem('dfo-dashboard-layout', JSON.stringify(layout));
      
      // Show success message
      setSuccessMessage('Dashboard layout saved locally');
      setShowSuccessMessage(true);
    }
  };
  
  // Handle theme changes
  const handleThemeChange = (setting, value) => {
    const newThemeSettings = {
      ...themeSettings,
      [setting]: value
    };
    
    setThemeSettings(newThemeSettings);
  };
  
  // Save theme settings
  const saveThemeSettings = async () => {
    try {
      // Try to save to server API
      await axios.post('/api/user/dashboard-settings', {
        layout: dashboardLayout,
        theme: themeSettings
      });
      
      // Save to localStorage as backup
      localStorage.setItem('dfo-dashboard-theme', JSON.stringify(themeSettings));
      
      // Show success message
      setSuccessMessage('Theme settings saved successfully');
      setShowSuccessMessage(true);
    } catch (error) {
      console.warn('Failed to save theme settings to server, saving to localStorage', error);
      
      // Fall back to localStorage
      localStorage.setItem('dfo-dashboard-theme', JSON.stringify(themeSettings));
      
      // Show success message
      setSuccessMessage('Theme settings saved locally');
      setShowSuccessMessage(true);
    }
  };
  
  // Reset to defaults
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
      <div className="dashboard-settings-page">
        <header className="page-header">
          <h1>
            <FiSettings className="page-header-icon" /> Dashboard Settings
          </h1>
          <div className="header-actions">
            <AnimatedButton
              icon={<FiEye />}
              onClick={() => setPreviewMode(!previewMode)}
              variant={previewMode ? 'primary' : 'secondary'}
            >
              {previewMode ? 'Exit Preview' : 'Preview'}
            </AnimatedButton>
            
            <AnimatedButton
              icon={<FiRotateCcw />}
              onClick={resetToDefaults}
              variant="secondary"
            >
              Reset to Defaults
            </AnimatedButton>
          </div>
        </header>
        
        {showSuccessMessage && (
          <SuccessAnimation
            message={successMessage}
            onComplete={() => setShowSuccessMessage(false)}
          />
        )}
        
        <div className="settings-tabs">
          <button 
            className={`settings-tab ${previewMode ? '' : 'active'}`}
            onClick={() => setPreviewMode(false)}
          >
            <FiSettings /> Settings
          </button>
          <button 
            className={`settings-tab ${previewMode ? 'active' : ''}`}
            onClick={() => setPreviewMode(true)}
          >
            <FiEye /> Preview
          </button>
        </div>
        
        {!previewMode ? (
          <div className="settings-container">
            <section className="settings-section">
              <h2>
                <FiLayout className="section-icon" /> Dashboard Layout
                <ContextualTooltip
                  content="Customize your dashboard by adding, removing, resizing, and rearranging widgets. Drag widgets to reposition them."
                  position="right"
                  interactive={true}
                />
              </h2>
              
              <div className="dashboard-layout-container">
                {loading ? (
                  <LoadingSpinner size="small" message="Loading your dashboard layout..." />
                ) : (
                  <DashboardLayoutCreator
                    initialLayout={dashboardLayout}
                    onSaveLayout={handleSaveLayout}
                    maxColumns={2}
                  />
                )}
              </div>
            </section>
            
            <section className="settings-section">
              <h2>
                <FiSettings className="section-icon" /> Appearance
                <ContextualTooltip
                  content="Customize the appearance of your dashboard, including color scheme, accent color, and text size."
                  position="right"
                  interactive={true}
                />
              </h2>
              
              <div className="theme-settings">
                <div className="settings-group">
                  <label className="settings-label">Color Scheme</label>
                  <div className="settings-options">
                    <button 
                      className={`theme-option ${themeSettings.colorScheme === 'light' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('colorScheme', 'light')}
                    >
                      <div className="color-preview light"></div>
                      <span>Light</span>
                    </button>
                    <button 
                      className={`theme-option ${themeSettings.colorScheme === 'dark' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('colorScheme', 'dark')}
                    >
                      <div className="color-preview dark"></div>
                      <span>Dark</span>
                    </button>
                    <button 
                      className={`theme-option ${themeSettings.colorScheme === 'system' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('colorScheme', 'system')}
                    >
                      <div className="color-preview system"></div>
                      <span>System</span>
                    </button>
                  </div>
                </div>
                
                <div className="settings-group">
                  <label className="settings-label">Accent Color</label>
                  <div className="settings-options">
                    {['#2196f3', '#4caf50', '#f44336', '#ff9800', '#9c27b0', '#607d8b'].map(color => (
                      <button 
                        key={color}
                        className={`color-option ${themeSettings.accentColor === color ? 'active' : ''}`}
                        onClick={() => handleThemeChange('accentColor', color)}
                        style={{ backgroundColor: color }}
                        title={color}
                      ></button>
                    ))}
                    <input
                      type="color"
                      value={themeSettings.accentColor || '#2196f3'} 
                      onChange={(e) => handleThemeChange('accentColor', e.target.value)}
                      className="color-picker"
                    />
                  </div>
                </div>
                
                <div className="settings-group">
                  <label className="settings-label">Text Size</label>
                  <div className="settings-options size-options">
                    <button 
                      className={`size-option ${themeSettings.fontSize === 'small' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('fontSize', 'small')}
                    >
                      <span className="size-preview small">A</span>
                      <span>Small</span>
                    </button>
                    <button 
                      className={`size-option ${themeSettings.fontSize === 'medium' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('fontSize', 'medium')}
                    >
                      <span className="size-preview medium">A</span>
                      <span>Medium</span>
                    </button>
                    <button 
                      className={`size-option ${themeSettings.fontSize === 'large' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('fontSize', 'large')}
                    >
                      <span className="size-preview large">A</span>
                      <span>Large</span>
                    </button>
                  </div>
                </div>
                
                <div className="settings-group toggles">
                  <div className="toggle-option">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={!!themeSettings.compactMode}
                        onChange={(e) => handleThemeChange('compactMode', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                      <span>Compact Mode</span>
                    </label>
                    <ContextualTooltip
                      content="Reduces spacing and padding to fit more content on screen"
                      position="right"
                    />
                  </div>
                  
                  <div className="toggle-option">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={themeSettings.animationsEnabled !== false}
                        onChange={(e) => handleThemeChange('animationsEnabled', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                      <span>Enable Animations</span>
                    </label>
                    <ContextualTooltip
                      content="Enables interface animations and transitions"
                      position="right"
                    />
                  </div>
                </div>
                
                <div className="settings-actions">
                  <AnimatedButton
                    icon={<FiSave />}
                    onClick={saveThemeSettings}
                    variant="primary"
                  >
                    Save Appearance Settings
                  </AnimatedButton>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="preview-container">
            <div className={`dashboard-preview ${themeSettings.colorScheme} ${themeSettings.fontSize} ${themeSettings.compactMode ? 'compact' : ''}`}>
              <div className="preview-header">
                <h2>Dashboard Preview</h2>
                <p>This is how your dashboard will look with the current settings.</p>
              </div>
              
              <div className="dashboard-preview-content">
                <DashboardLayoutCreator
                  initialLayout={dashboardLayout}
                  readOnly={true}
                  maxColumns={2}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default DashboardSettings;