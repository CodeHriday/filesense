import React, { useState, useEffect } from 'react';
import { FiBookOpen, FiTrendingUp, FiBarChart2, FiPieChart, FiActivity } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import './DataStories.css';

// This is a placeholder for the actual data that would come from the API
const SAMPLE_STORIES = [
  {
    id: 1,
    title: 'Monthly Revenue Growth Analysis',
    description: 'Interactive visualization showing revenue trends with regional breakdown and growth indicators.',
    fileIds: ['file123', 'file456'],
    createdAt: '2025-04-15T14:30:00Z',
    lastUpdated: '2025-04-17T09:15:00Z',
    visualizations: [
      {
        type: 'line',
        title: 'Monthly Revenue (2024-2025)',
        dataUrl: 'https://example.com/api/data/revenue-growth',
        config: { annotations: true, trendline: true }
      },
      {
        type: 'map',
        title: 'Regional Revenue Distribution',
        dataUrl: 'https://example.com/api/data/revenue-map',
        config: { colorGradient: true, interactive: true }
      }
    ],
    insights: [
      'Revenue increased 24% year-over-year with strongest growth in Q2',
      'Western region showed highest growth rate at 32%, while Southern region lagged at 14%',
      'Product category A contributed 65% of overall growth'
    ],
    tags: ['revenue', 'growth', 'regional']
  },
  {
    id: 2,
    title: 'Customer Acquisition Cost Trends',
    description: 'Analysis of customer acquisition costs across different marketing channels and customer segments.',
    fileIds: ['file789', 'file012'],
    createdAt: '2025-04-10T11:20:00Z',
    lastUpdated: '2025-04-16T16:45:00Z',
    visualizations: [
      {
        type: 'bar',
        title: 'CAC by Marketing Channel',
        dataUrl: 'https://example.com/api/data/cac-channels',
        config: { stacked: true, annotations: true }
      },
      {
        type: 'scatter',
        title: 'CAC vs Customer Lifetime Value',
        dataUrl: 'https://example.com/api/data/cac-ltv',
        config: { trendline: true, quadrants: true }
      }
    ],
    insights: [
      'Social media channels show lowest CAC at $42 average',
      'Email marketing CAC decreased 18% after campaign optimization',
      'Premium customer segment has 3.2x higher LTV despite 40% higher CAC'
    ],
    tags: ['marketing', 'acquisition', 'costs']
  },
  {
    id: 3,
    title: 'Product Quality Metrics',
    description: 'Visualizations of product quality metrics, defect rates, and customer satisfaction correlation.',
    fileIds: ['file345', 'file678'],
    createdAt: '2025-04-05T09:45:00Z',
    lastUpdated: '2025-04-14T13:30:00Z',
    visualizations: [
      {
        type: 'gauge',
        title: 'Overall Quality Score',
        dataUrl: 'https://example.com/api/data/quality-score',
        config: { thresholds: true, historical: true }
      },
      {
        type: 'heatmap',
        title: 'Defect Distribution by Product Component',
        dataUrl: 'https://example.com/api/data/defect-heatmap',
        config: { annotations: true }
      }
    ],
    insights: [
      'Overall quality score improved from 87% to 94% over the past quarter',
      'Component X showed highest defect rate reduction (62%) after process change',
      'Customer satisfaction ratings show 89% correlation with quality score improvements'
    ],
    tags: ['quality', 'defects', 'improvement']
  }
];

const DataStories = () => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState(null);
  const [currentView, setCurrentView] = useState('list'); // list, detail, editor
  
  useEffect(() => {
    // Simulate API fetch
    const fetchStories = async () => {
      try {
        setLoading(true);
        // Mock API delay
        await new Promise(resolve => setTimeout(resolve, 800));
        setStories(SAMPLE_STORIES);
      } catch (error) {
        console.error('Error fetching data stories:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStories();
  }, []);
  
  const getVisualizationIcon = (type) => {
    switch (type) {
      case 'line': return <FiTrendingUp />;
      case 'bar': return <FiBarChart2 />;
      case 'pie': return <FiPieChart />;
      case 'scatter': return <FiActivity />;
      case 'gauge': return <FiActivity />;
      case 'map': return <FiActivity />;
      case 'heatmap': return <FiActivity />;
      default: return <FiBarChart2 />;
    }
  };
  
  const handleStoryClick = (story) => {
    setActiveStory(story);
    setCurrentView('detail');
  };
  
  const renderListView = () => (
    <>
      <div className="stories-header">
        <h1><FiBookOpen className="header-icon" /> Interactive Data Storytelling</h1>
        <p>Create and explore interactive data narratives that communicate insights and patterns.</p>
        <button className="new-story-btn" onClick={() => setCurrentView('editor')}>
          Create New Story
        </button>
      </div>
      
      <div className="stories-grid">
        {stories.map(story => (
          <div 
            key={story.id} 
            className="story-card"
            onClick={() => handleStoryClick(story)}
          >
            <div className="story-header">
              <h3>{story.title}</h3>
              <div className="story-meta">
                <span>Updated {new Date(story.lastUpdated).toLocaleDateString()}</span>
                <span>{story.visualizations.length} visualizations</span>
              </div>
            </div>
            <p className="story-description">{story.description}</p>
            <div className="story-preview">
              {story.visualizations.slice(0, 2).map((viz, index) => (
                <div key={index} className="viz-preview">
                  {getVisualizationIcon(viz.type)}
                  <span>{viz.type}</span>
                </div>
              ))}
            </div>
            <div className="story-tags">
              {story.tags.map((tag, index) => (
                <span key={index} className="story-tag">{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
  
  const renderDetailView = () => {
    if (!activeStory) return null;
    
    return (
      <div className="story-detail">
        <div className="story-detail-header">
          <button 
            className="back-button"
            onClick={() => setCurrentView('list')}
          >
            Back to Stories
          </button>
          <h1>{activeStory.title}</h1>
          <p className="story-detail-description">{activeStory.description}</p>
          <div className="story-detail-meta">
            <span>Created {new Date(activeStory.createdAt).toLocaleDateString()}</span>
            <span>Last updated {new Date(activeStory.lastUpdated).toLocaleDateString()}</span>
          </div>
        </div>
        
        <div className="story-visualizations">
          {activeStory.visualizations.map((viz, index) => (
            <div key={index} className="visualization-card">
              <div className="viz-header">
                {getVisualizationIcon(viz.type)}
                <h3>{viz.title}</h3>
              </div>
              <div className="viz-placeholder">
                <div className="viz-placeholder-icon">
                  {getVisualizationIcon(viz.type)}
                </div>
                <p>Interactive {viz.type} chart would render here</p>
              </div>
              <div className="viz-controls">
                <button className="viz-control-btn">Export</button>
                <button className="viz-control-btn">Share</button>
                <button className="viz-control-btn">Details</button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="story-insights">
          <h2>Key Insights</h2>
          <ul className="insights-list">
            {activeStory.insights.map((insight, index) => (
              <li key={index}>{insight}</li>
            ))}
          </ul>
        </div>
        
        <div className="story-actions">
          <button className="story-action-btn primary">Edit Story</button>
          <button className="story-action-btn">Share</button>
          <button className="story-action-btn">Export PDF</button>
        </div>
      </div>
    );
  };
  
  const renderEditorView = () => (
    <div className="story-editor">
      <div className="editor-header">
        <button 
          className="back-button"
          onClick={() => setCurrentView('list')}
        >
          Cancel
        </button>
        <h1>Create New Data Story</h1>
      </div>
      
      <div className="editor-form">
        <div className="form-group">
          <label htmlFor="story-title-input">Story Title</label>
          <input id="story-title-input" type="text" placeholder="Enter a descriptive title" className="editor-input" />
        </div>
        
        <div className="form-group">
          <label htmlFor="story-description">Description</label>
          <textarea id="story-description" placeholder="Enter a short description of this data story" className="editor-textarea"></textarea>
        </div>
        
        <div className="form-group">
          <label htmlFor="data-files-select">Select Data Files</label>
          <div className="file-selector">
            <select id="data-files-select" className="editor-select">
              <option value="">Select a data file</option>
              <option value="file1">sales_data.csv</option>
              <option value="file2">customer_metrics.csv</option>
              <option value="file3">production_quality.csv</option>
            </select>
            <button id="add-file-btn" className="add-file-btn">Add</button>
          </div>
          <div className="selected-files">
            <p>No files selected</p>
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="add-viz-btn">Visualizations</label>
          <button id="add-viz-btn" className="add-viz-btn">Add Visualization</button>
          <div className="viz-placeholder editor-placeholder">
            <p>Add visualizations to tell your data story</p>
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="insight-input">Key Insights</label>
          <div className="insight-editor">
            <input id="insight-input" type="text" placeholder="Add a key insight" className="editor-input" />
            <button id="add-insight-btn" className="add-insight-btn">Add</button>
          </div>
          <div className="insights-placeholder">
            <p>No insights added yet</p>
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="tags-input">Tags</label>
          <div className="tag-editor">
            <input id="tags-input" type="text" placeholder="Add tags (e.g., sales, quarterly)" className="editor-input" />
            <button id="add-tag-btn" className="add-tag-btn">Add</button>
          </div>
          <div className="tags-placeholder">
            <p>No tags added yet</p>
          </div>
        </div>
        
        <div className="editor-actions">
          <button className="editor-action-btn primary">Save Story</button>
          <button className="editor-action-btn">Preview</button>
          <button className="editor-action-btn" onClick={() => setCurrentView('list')}>Cancel</button>
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="data-stories-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {currentView === 'list' && renderListView()}
          {currentView === 'detail' && renderDetailView()}
          {currentView === 'editor' && renderEditorView()}
        </>
      )}
    </div>
  );
};

export default DataStories;