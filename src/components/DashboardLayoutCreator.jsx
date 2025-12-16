import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import { FiGrid, FiPlus, FiMinus, FiX, FiMove, FiMaximize2, FiMinimize2, FiSettings } from 'react-icons/fi';
import { AnimationContainer, AnimatedButton } from './MicroAnimations';
import './DashboardLayoutCreator.css';

// Available widget types and their configurations
const WIDGET_TYPES = {
  'quality-score': {
    title: 'Data Quality Score',
    description: 'Overall quality score for your data files',
    icon: 'chart',
    minSize: [1, 1],
    defaultSize: [1, 1],
    maxSize: [2, 2]
  },
  'recent-files': {
    title: 'Recent Files',
    description: 'Recently uploaded or modified files',
    icon: 'list',
    minSize: [1, 1],
    defaultSize: [1, 2],
    maxSize: [2, 2]
  },
  'alerts': {
    title: 'Active Alerts',
    description: 'Current data quality alerts across files',
    icon: 'alert',
    minSize: [1, 1],
    defaultSize: [1, 1],
    maxSize: [2, 2]
  },
  'completeness-chart': {
    title: 'Data Completeness',
    description: 'Completeness metrics across all files',
    icon: 'chart',
    minSize: [1, 1],
    defaultSize: [2, 1],
    maxSize: [2, 2]
  },
  'timeliness-chart': {
    title: 'Data Freshness',
    description: 'Freshness and timeliness metrics',
    icon: 'chart',
    minSize: [1, 1],
    defaultSize: [1, 1],
    maxSize: [2, 2]
  },
  'lineage-summary': {
    title: 'Lineage Summary',
    description: 'Summary of file relationships and dependencies',
    icon: 'network',
    minSize: [1, 1],
    defaultSize: [2, 1],
    maxSize: [2, 2]
  },
  'recommendations': {
    title: 'Recommendations',
    description: 'Smart recommendations to improve data quality',
    icon: 'lightbulb',
    minSize: [1, 1],
    defaultSize: [1, 1],
    maxSize: [2, 2]
  },
  'quick-actions': {
    title: 'Quick Actions',
    description: 'Frequently used actions and shortcuts',
    icon: 'bolt',
    minSize: [1, 1],
    defaultSize: [1, 1],
    maxSize: [1, 1]
  },
  'data-trends': {
    title: 'Data Trends',
    description: 'Trend analysis of data quality over time',
    icon: 'trend',
    minSize: [1, 1],
    defaultSize: [2, 1],
    maxSize: [2, 2]
  },
  'achievement-badges': {
    title: 'Achievement Badges',
    description: 'Data reliability achievement badges',
    icon: 'award',
    minSize: [1, 1],
    defaultSize: [1, 1],
    maxSize: [2, 1]
  }
};

/**
 * Widget Item Component (Draggable)
 */
const SortableWidgetItem = ({ id, widget, onRemove, onResize, onConfigureWidget }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const widgetInfo = WIDGET_TYPES[widget.type] || { 
    title: 'Unknown Widget', 
    description: '', 
    defaultSize: [1, 1], 
    maxSize: [2, 2] 
  };

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    gridColumn: `span ${widget.width || widgetInfo.defaultSize[0]}`,
    gridRow: `span ${widget.height || widgetInfo.defaultSize[1]}`,
    zIndex: isDragging ? 999 : 1,
    opacity: isDragging ? 0.4 : 1
  };

  const handleResize = (action) => {
    if (!onResize) return;
    
    const currentWidth = widget.width || widgetInfo.defaultSize[0];
    const currentHeight = widget.height || widgetInfo.defaultSize[1];
    const [maxWidth, maxHeight] = widgetInfo.maxSize || [2, 2];
    const [minWidth, minHeight] = widgetInfo.minSize || [1, 1];
    
    let newWidth = currentWidth;
    let newHeight = currentHeight;
    
    if (action === 'expand-width' && currentWidth < maxWidth) {
      newWidth = currentWidth + 1;
    } else if (action === 'shrink-width' && currentWidth > minWidth) {
      newWidth = currentWidth - 1;
    } else if (action === 'expand-height' && currentHeight < maxHeight) {
      newHeight = currentHeight + 1;
    } else if (action === 'shrink-height' && currentHeight > minHeight) {
      newHeight = currentHeight - 1;
    } else if (action === 'maximize') {
      newWidth = maxWidth;
      newHeight = maxHeight;
    } else if (action === 'minimize') {
      newWidth = minWidth;
      newHeight = minHeight;
    }
    
    if (newWidth !== currentWidth || newHeight !== currentHeight) {
      onResize(id, newWidth, newHeight);
    }
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`dashboard-widget ${isDragging ? 'dragging' : ''}`}
    >
      <div className="widget-header">
        <h3>{widget.title || widgetInfo.title}</h3>
        
        <div className="widget-controls">
          <button 
            className="widget-control-button" 
            onClick={() => handleResize('shrink-width')}
            title="Decrease width"
          >
            <FiMinus />
          </button>
          
          <button 
            className="widget-control-button" 
            onClick={() => handleResize('expand-width')}
            title="Increase width"
          >
            <FiPlus />
          </button>
          
          <button 
            className="widget-control-button" 
            onClick={() => onConfigureWidget(id)}
            title="Configure widget"
          >
            <FiSettings />
          </button>
          
          <button 
            className="widget-control-button" 
            onClick={() => onRemove(id)}
            title="Remove widget"
          >
            <FiX />
          </button>
          
          <button 
            className="widget-control-button drag-handle" 
            {...attributes} 
            {...listeners}
            title="Drag to reposition"
          >
            <FiMove />
          </button>
        </div>
      </div>
      
      <div className="widget-content">
        <div className="widget-placeholder">
          {widget.type} Widget Content
        </div>
      </div>
    </div>
  );
};

/**
 * Widget Item for Drag Overlay
 */
const DragOverlayWidget = ({ widget }) => {
  const widgetInfo = WIDGET_TYPES[widget.type] || { 
    title: 'Unknown Widget', 
    defaultSize: [1, 1] 
  };

  return (
    <div 
      className="dashboard-widget dragging-overlay"
      style={{
        width: `${(widget.width || widgetInfo.defaultSize[0]) * 100}%`,
        height: `${(widget.height || widgetInfo.defaultSize[1]) * 120}px`,
      }}
    >
      <div className="widget-header">
        <h3>{widget.title || widgetInfo.title}</h3>
      </div>
      <div className="widget-content">
        <div className="widget-placeholder">
          {widget.type} Widget Content
        </div>
      </div>
    </div>
  );
};

/**
 * Add Widget Panel
 */
const AddWidgetPanel = ({ onAddWidget, onClose }) => {
  return (
    <div className="add-widget-panel">
      <div className="panel-header">
        <h2>Add Widget</h2>
        <button onClick={onClose} className="close-button">
          <FiX />
        </button>
      </div>
      
      <div className="widget-options">
        {Object.entries(WIDGET_TYPES).map(([type, info]) => (
          <AnimationContainer 
            key={type} 
            animationType="fade" 
            className="widget-option"
            duration={300}
          >
            <button 
              className="widget-option-button" 
              onClick={() => onAddWidget(type)}
            >
              <div className="widget-option-icon">{getWidgetIcon(info.icon)}</div>
              <div className="widget-option-info">
                <h4>{info.title}</h4>
                <p>{info.description}</p>
              </div>
            </button>
          </AnimationContainer>
        ))}
      </div>
    </div>
  );
};

/**
 * Helper function to get icon for widget type
 */
const getWidgetIcon = (iconType) => {
  switch (iconType) {
    case 'chart':
      return <span className="material-icon">📊</span>;
    case 'list':
      return <span className="material-icon">📋</span>;
    case 'alert':
      return <span className="material-icon">🚨</span>;
    case 'network':
      return <span className="material-icon">🔄</span>;
    case 'lightbulb':
      return <span className="material-icon">💡</span>;
    case 'bolt':
      return <span className="material-icon">⚡</span>;
    case 'trend':
      return <span className="material-icon">📈</span>;
    case 'award':
      return <span className="material-icon">🏆</span>;
    default:
      return <span className="material-icon">📊</span>;
  }
};

/**
 * Main Dashboard Layout Creator Component
 */
const DashboardLayoutCreator = ({ 
  initialLayout = [],
  onSaveLayout,
  readOnly = false,
  maxColumns = 2,
  maxRows = 4
}) => {
  const [widgets, setWidgets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [layoutChanged, setLayoutChanged] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Initialize from prop
  useEffect(() => {
    // Generate random ID for widgets
    const generateLocalId = () => {
      return `widget-${Math.random().toString(36).substr(2, 9)}`;
    };

    // Ensure initialLayout is always treated as an array
    if (initialLayout && Array.isArray(initialLayout) && initialLayout.length > 0) {
      setWidgets(initialLayout.map(item => ({
        ...item,
        id: item.id || generateLocalId()
      })));
    } else {
      // Default layout if none provided
      setWidgets([
        { 
          id: generateLocalId(), 
          type: 'quality-score', 
          width: 1, 
          height: 1,
          position: 0
        },
        { 
          id: generateLocalId(), 
          type: 'recent-files', 
          width: 1, 
          height: 2,
          position: 1
        },
        { 
          id: generateLocalId(), 
          type: 'alerts', 
          width: 1, 
          height: 1,
          position: 2
        },
        { 
          id: generateLocalId(), 
          type: 'recommendations', 
          width: 1, 
          height: 1,
          position: 3
        }
      ]);
    }
  }, [initialLayout]);
  
  // Generate random ID for widgets
  const generateId = () => {
    return `widget-${Math.random().toString(36).substr(2, 9)}`;
  };
  
  // Handle drag start
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };
  
  // Handle drag end and reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        // Update positions for proper saving
        return newItems.map((item, index) => ({
          ...item,
          position: index
        }));
      });
      
      setLayoutChanged(true);
    }
    
    setActiveId(null);
  };
  
  // Add a new widget
  const handleAddWidget = (widgetType) => {
    const widgetInfo = WIDGET_TYPES[widgetType];
    if (!widgetInfo) return;
    
    const newWidget = {
      id: generateId(),
      type: widgetType,
      width: widgetInfo.defaultSize[0],
      height: widgetInfo.defaultSize[1],
      position: widgets.length
    };
    
    setWidgets([...widgets, newWidget]);
    setShowAddPanel(false);
    setLayoutChanged(true);
  };
  
  // Remove a widget
  const handleRemoveWidget = (widgetId) => {
    setWidgets(widgets.filter(w => w.id !== widgetId)
      .map((item, index) => ({
        ...item,
        position: index
      }))
    );
    setLayoutChanged(true);
  };
  
  // Resize a widget
  const handleResizeWidget = (widgetId, newWidth, newHeight) => {
    setWidgets(widgets.map(widget => 
      widget.id === widgetId 
        ? { ...widget, width: newWidth, height: newHeight }
        : widget
    ));
    setLayoutChanged(true);
  };
  
  // Configure a widget
  const handleConfigureWidget = (widgetId) => {
    // This is a placeholder for future widget configuration
    console.log('Configure widget:', widgetId);
    // In a real implementation, this would open a configuration panel
  };
  
  // Save the current layout
  const handleSaveLayout = () => {
    if (onSaveLayout) {
      onSaveLayout(widgets);
      setLayoutChanged(false);
    }
  };
  
  // Find the currently active widget
  const activeWidget = activeId ? widgets.find((item) => item.id === activeId) : null;
  
  return (
    <div className="dashboard-layout-creator">
      {!readOnly && (
        <div className="layout-toolbar">
          <AnimatedButton 
            icon={<FiGrid />}
            onClick={() => setShowAddPanel(true)}
            variant="primary"
          >
            Add Widget
          </AnimatedButton>
          
          <AnimatedButton 
            icon={<FiMaximize2 />}
            onClick={() => {
              // This would implement auto-arranging functionality
              console.log('Auto-arrange widgets');
            }}
            variant="secondary"
          >
            Auto Arrange
          </AnimatedButton>
          
          {layoutChanged && (
            <AnimatedButton 
              onClick={handleSaveLayout}
              variant="success"
            >
              Save Layout
            </AnimatedButton>
          )}
        </div>
      )}
      
      <div 
        className="dashboard-grid" 
        style={{ 
          gridTemplateColumns: `repeat(${maxColumns}, 1fr)` 
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToParentElement]}
        >
          <SortableContext
            items={widgets.map((w) => w.id)}
            strategy={rectSortingStrategy}
          >
            {widgets.map((widget) => (
              <SortableWidgetItem
                key={widget.id}
                id={widget.id}
                widget={widget}
                onRemove={!readOnly ? handleRemoveWidget : undefined}
                onResize={!readOnly ? handleResizeWidget : undefined}
                onConfigureWidget={!readOnly ? handleConfigureWidget : undefined}
              />
            ))}
          </SortableContext>
          
          <DragOverlay>
            {activeWidget ? (
              <DragOverlayWidget widget={activeWidget} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      
      {showAddPanel && (
        <AddWidgetPanel 
          onAddWidget={handleAddWidget}
          onClose={() => setShowAddPanel(false)}
        />
      )}
    </div>
  );
};
DashboardLayoutCreator.propTypes = {
  initialLayout: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      type: PropTypes.string.isRequired,
      width: PropTypes.number,
      height: PropTypes.number,
      position: PropTypes.number
    })
  ),
  onSaveLayout: PropTypes.func,
  readOnly: PropTypes.bool,
  maxColumns: PropTypes.number,
  maxRows: PropTypes.number
};

DashboardLayoutCreator.defaultProps = {
  initialLayout: [],
  readOnly: false,
  maxColumns: 2,
  maxRows: 4
};

export default DashboardLayoutCreator;