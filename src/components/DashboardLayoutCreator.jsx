import React, { useState, useEffect } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiMove, FiMaximize2, FiMinimize2, FiX, FiSave, FiPlus, FiSettings } from 'react-icons/fi';
import axios from 'axios';
import './DashboardLayoutCreator.css';

// Available widgets
const AVAILABLE_WIDGETS = [
  {
    id: 'recent-files',
    name: 'Recent Files',
    description: 'Shows recently uploaded or modified files',
    icon: 'file',
    defaultSize: 'medium',
  },
  {
    id: 'quality-summary',
    name: 'Quality Summary',
    description: 'Overview of data quality across all files',
    icon: 'check-circle',
    defaultSize: 'medium',
  },
  {
    id: 'alerts',
    name: 'Recent Alerts',
    description: 'Recent data quality alerts',
    icon: 'alert-triangle',
    defaultSize: 'small',
  },
  {
    id: 'file-stats',
    name: 'File Statistics',
    description: 'Key statistics about your data files',
    icon: 'bar-chart-2',
    defaultSize: 'small',
  },
  {
    id: 'quality-trend',
    name: 'Quality Trend',
    description: 'Data quality trend over time',
    icon: 'trending-up',
    defaultSize: 'medium',
  },
  {
    id: 'storage-usage',
    name: 'Storage Usage',
    description: 'Storage usage by file type and size',
    icon: 'database',
    defaultSize: 'small',
  },
  {
    id: 'badges-progress',
    name: 'Badges Progress',
    description: 'Progress towards earning new badges',
    icon: 'award',
    defaultSize: 'small',
  },
  {
    id: 'recommendations',
    name: 'Recommendations',
    description: 'Smart recommendations for data improvements',
    icon: 'zap',
    defaultSize: 'medium',
  },
  {
    id: 'heatmap',
    name: 'Quality Heatmap',
    description: 'Visual heatmap of data quality metrics',
    icon: 'grid',
    defaultSize: 'large',
  },
  {
    id: 'lineage-summary',
    name: 'Lineage Summary',
    description: 'Summary of data lineage relationships',
    icon: 'git-branch',
    defaultSize: 'medium',
  }
];

// Sortable widget item
const SortableWidget = ({ id, widget, onRemove, onResize }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`dashboard-widget dashboard-widget-${widget.size || widget.defaultSize}`}
    >
      <div className="widget-header">
        <div className="widget-drag-handle" {...attributes} {...listeners}>
          <FiMove className="widget-icon" />
          <span className="widget-title">{widget.name}</span>
        </div>
        <div className="widget-controls">
          {widget.size !== 'small' && (
            <button 
              className="widget-control"
              onClick={() => onResize(id, 'small')}
              aria-label="Minimize widget"
            >
              <FiMinimize2 />
            </button>
          )}
          {widget.size !== 'large' && (
            <button 
              className="widget-control"
              onClick={() => onResize(id, 'large')}
              aria-label="Maximize widget"
            >
              <FiMaximize2 />
            </button>
          )}
          {widget.size !== 'medium' && widget.size !== widget.defaultSize && (
            <button 
              className="widget-control"
              onClick={() => onResize(id, 'medium')}
              aria-label="Reset widget size"
            >
              <FiSettings />
            </button>
          )}
          <button 
            className="widget-control widget-remove"
            onClick={() => onRemove(id)}
            aria-label="Remove widget"
          >
            <FiX />
          </button>
        </div>
      </div>
      <div className="widget-content">
        <div className="widget-placeholder">
          {widget.name} Content
          <p className="widget-description">{widget.description}</p>
        </div>
      </div>
    </div>
  );
};

const WidgetGallery = ({ onAddWidget, activeWidgets }) => {
  return (
    <div className="widget-gallery">
      <h3>Available Widgets</h3>
      <div className="gallery-widgets">
        {AVAILABLE_WIDGETS.map(widget => {
          const isActive = activeWidgets.some(active => active.id === widget.id);
          return (
            <div 
              key={widget.id} 
              className={`gallery-widget ${isActive ? 'gallery-widget-active' : ''}`}
              onClick={() => !isActive && onAddWidget(widget)}
            >
              <div className="gallery-widget-icon">
                <span className="widget-icon-placeholder">{widget.icon.charAt(0).toUpperCase()}</span>
              </div>
              <div className="gallery-widget-info">
                <div className="gallery-widget-name">{widget.name}</div>
                <div className="gallery-widget-description">{widget.description}</div>
              </div>
              {isActive ? (
                <span className="widget-added-indicator">Added</span>
              ) : (
                <button 
                  className="widget-add-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddWidget(widget);
                  }}
                >
                  <FiPlus />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DashboardLayoutCreator = () => {
  const [activeLayout, setActiveLayout] = useState('default');
  const [layouts, setLayouts] = useState({
    default: {
      name: 'Default Layout',
      widgets: [
        { ...AVAILABLE_WIDGETS.find(w => w.id === 'recent-files'), size: 'medium' },
        { ...AVAILABLE_WIDGETS.find(w => w.id === 'quality-summary'), size: 'medium' },
        { ...AVAILABLE_WIDGETS.find(w => w.id === 'alerts'), size: 'small' },
        { ...AVAILABLE_WIDGETS.find(w => w.id === 'quality-trend'), size: 'medium' }
      ]
    }
  });
  const [showGallery, setShowGallery] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  
  // Load saved layouts from localStorage on mount
  useEffect(() => {
    const savedLayouts = localStorage.getItem('dfo-dashboard-layouts');
    if (savedLayouts) {
      try {
        setLayouts(JSON.parse(savedLayouts));
      } catch (error) {
        console.error('Failed to parse saved layouts:', error);
      }
    }
  }, []);
  
  // Define sensors for drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  // Get current active widgets
  const activeWidgets = layouts[activeLayout]?.widgets || [];
  
  // Handle widget reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      setLayouts(prev => {
        const oldIndex = activeWidgets.findIndex(widget => widget.id === active.id);
        const newIndex = activeWidgets.findIndex(widget => widget.id === over.id);
        
        return {
          ...prev,
          [activeLayout]: {
            ...prev[activeLayout],
            widgets: arrayMove(activeWidgets, oldIndex, newIndex)
          }
        };
      });
    }
  };
  
  // Add a widget to the layout
  const handleAddWidget = (widget) => {
    setLayouts(prev => ({
      ...prev,
      [activeLayout]: {
        ...prev[activeLayout],
        widgets: [...prev[activeLayout].widgets, { ...widget, size: widget.defaultSize }]
      }
    }));
    setShowGallery(false);
  };
  
  // Remove a widget from the layout
  const handleRemoveWidget = (widgetId) => {
    setLayouts(prev => ({
      ...prev,
      [activeLayout]: {
        ...prev[activeLayout],
        widgets: prev[activeLayout].widgets.filter(w => w.id !== widgetId)
      }
    }));
  };
  
  // Resize a widget
  const handleResizeWidget = (widgetId, newSize) => {
    setLayouts(prev => ({
      ...prev,
      [activeLayout]: {
        ...prev[activeLayout],
        widgets: prev[activeLayout].widgets.map(w => 
          w.id === widgetId ? { ...w, size: newSize } : w
        )
      }
    }));
  };
  
  // Save layout
  const saveLayout = async () => {
    setIsSaving(true);
    setSavedMessage('');
    
    try {
      // Save to localStorage
      localStorage.setItem('dfo-dashboard-layouts', JSON.stringify(layouts));
      
      // Also save to server if we implement that
      try {
        await axios.post('/api/user/dashboard-layouts', { layouts });
      } catch (error) {
        // Fail silently, as we've saved to localStorage already
        console.warn('Failed to save layouts to server, saved to localStorage only');
      }
      
      setSavedMessage('Layout saved successfully!');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save layout:', error);
      setSavedMessage('Failed to save layout. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="dashboard-layout-creator">
      <div className="layout-controls">
        <h2>Customize Dashboard Layout</h2>
        
        <div className="layout-actions">
          <button 
            className="layout-action-button primary"
            onClick={() => setShowGallery(!showGallery)}
          >
            <FiPlus /> {showGallery ? 'Hide Gallery' : 'Add Widget'}
          </button>
          
          <button 
            className="layout-action-button"
            onClick={saveLayout}
            disabled={isSaving}
          >
            <FiSave /> {isSaving ? 'Saving...' : 'Save Layout'}
          </button>
        </div>
        
        {savedMessage && (
          <div className={`save-message ${savedMessage.includes('Failed') ? 'error' : 'success'}`}>
            {savedMessage}
          </div>
        )}
      </div>
      
      {showGallery && (
        <WidgetGallery 
          onAddWidget={handleAddWidget} 
          activeWidgets={activeWidgets} 
        />
      )}
      
      <div className="layout-preview">
        <h3>Layout Preview</h3>
        
        <div className="dashboard-grid">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={activeWidgets.map(widget => widget.id)}
              strategy={rectSortingStrategy}
            >
              {activeWidgets.map(widget => (
                <SortableWidget 
                  key={widget.id}
                  id={widget.id}
                  widget={widget}
                  onRemove={handleRemoveWidget}
                  onResize={handleResizeWidget}
                />
              ))}
            </SortableContext>
          </DndContext>
          
          {activeWidgets.length === 0 && (
            <div className="empty-layout">
              <p>Your dashboard is empty. Click "Add Widget" to add widgets to your dashboard.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayoutCreator;