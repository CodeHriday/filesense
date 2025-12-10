import React, { useState } from 'react';
import Callback from '../components/PerformanceOptimizations/Callback';
import LazyLoading from '../components/PerformanceOptimizations/LazyLoading';
import VirtualizedList from '../components/PerformanceOptimizations/VirtualizedList';
import './PerformanceOptimizations.css';

const PerformanceOptimizations = () => {
  const [activeTab, setActiveTab] = useState('overview');

  // Helper function to determine which content to display
  const renderTabContent = () => {
    switch (activeTab) {
      case 'memo':
        return <Callback />;
      case 'lazy':
        return <LazyLoading />;
      case 'virtualized':
        return <VirtualizedList />;
      default:
        return <Overview setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="performance-optimizations">
      <h1>Performance Optimization Techniques</h1>
      <p className="lead">
        Explore various React performance optimization techniques to make your application faster and more efficient.
      </p>

      <div className="tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={activeTab === 'memo' ? 'active' : ''}
          onClick={() => setActiveTab('memo')}
        >
          Memo & Callback
        </button>
        <button
          className={activeTab === 'lazy' ? 'active' : ''}
          onClick={() => setActiveTab('lazy')}
        >
          Lazy Loading
        </button>
        <button
          className={activeTab === 'virtualized' ? 'active' : ''}
          onClick={() => setActiveTab('virtualized')}
        >
          Virtualized Lists
        </button>
      </div>

      <div className="tab-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

// Overview component explaining performance optimization techniques
const Overview = ({ setActiveTab }) => {
  const optimizationTechniques = [
    {
      id: 'memo',
      title: 'React.memo & useCallback',
      description: 'Prevent unnecessary re-renders with React.memo for components and useCallback for functions.',
      benefits: [
        'Reduces wasteful renders',
        'Prevents expensive calculations',
        'Maintains stable function references'
      ]
    },
    {
      id: 'lazy',
      title: 'Lazy Loading & Code Splitting',
      description: 'Load components only when needed to reduce initial bundle size.',
      benefits: [
        'Smaller initial download',
        'Faster initial rendering',
        'Better resource utilization'
      ]
    },
    {
      id: 'virtualized',
      title: 'Virtualized Lists',
      description: 'Render only visible items in large lists for better performance.',
      benefits: [
        'Efficient DOM usage',
        'Smooth scrolling with large datasets',
        'Lower memory consumption'
      ]
    },
    {
      id: 'debounce',
      title: 'Debouncing & Throttling',
      description: 'Control the rate of execution for expensive operations.',
      benefits: [
        'Prevents excessive calculations',
        'Smoother user experience',
        'Reduces server requests'
      ]
    }
  ];

  return (
    <div className="overview-container">
      <h2>Performance Optimization Overview</h2>
      <p>
        Performance optimization is crucial for delivering a smooth user experience,
        especially as your application grows. React provides several tools and patterns
        to help you optimize rendering and reduce unnecessary work.
      </p>

      <div className="techniques-grid">
        {optimizationTechniques.map(technique => (
          <div className="technique-card" key={technique.id}>
            <h3>{technique.title}</h3>
            <p>{technique.description}</p>
            <ul>
              {technique.benefits.map((benefit, index) => (
                <li key={index}>{benefit}</li>
              ))}
            </ul>
            {technique.id !== 'debounce' && (
              <button onClick={() => setActiveTab(technique.id)}>
                See Example
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="performance-tips">
        <h3>Additional Performance Tips</h3>
        <ul>
          <li>
            <strong>Proper key usage:</strong> Always use stable, unique keys for list items
          </li>
          <li>
            <strong>useReducer for complex state:</strong> Consider useReducer instead of multiple useState hooks
          </li>
          <li>
            <strong>Avoid inline object creation:</strong> Define objects outside render to prevent unnecessary re-renders
          </li>
          <li>
            <strong>Web workers:</strong> Move expensive computations off the main thread
          </li>
          <li>
            <strong>Bundle optimization:</strong> Use tools like Webpack bundle analyzer to identify large dependencies
          </li>
          <li>
            <strong>Avoid prop drilling:</strong> Use Context or state management libraries for shared state
          </li>
          <li>
            <strong>Windowing for large lists:</strong> Use libraries like react-window or react-virtualized
          </li>
        </ul>
      </div>
    </div>
  );
};

export default PerformanceOptimizations;