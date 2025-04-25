import React, { Suspense, lazy, useState } from 'react';

// Instead of directly importing components, we lazy load them
// This component won't be loaded until it's needed
const HeavyComponent = lazy(() => {
  // Simulating a delay to show loading state
  return new Promise(resolve => {
    // Delay import by 1.5 seconds to simulate network latency
    setTimeout(() => {
      resolve(import('./HeavyComponent'));
    }, 1500);
  });
});

// Fallback loading component
const LoadingComponent = () => (
  <div className="loading-component">
    <div className="loader"></div>
    <p>Loading component...</p>
  </div>
);

const LazyLoadingExample = () => {
  const [showHeavyComponent, setShowHeavyComponent] = useState(false);

  return (
    <div className="lazy-loading-example">
      <h2>Lazy Loading Example</h2>
      <p>
        This example demonstrates React's lazy loading capabilities to defer loading
        components until they're actually needed, reducing initial bundle size.
      </p>
      
      <button 
        onClick={() => setShowHeavyComponent(prev => !prev)}
        className="toggle-button"
      >
        {showHeavyComponent ? 'Hide' : 'Show'} Heavy Component
      </button>
      
      {/* Suspense provides a fallback while the lazy component loads */}
      {showHeavyComponent && (
        <Suspense fallback={<LoadingComponent />}>
          <HeavyComponent />
        </Suspense>
      )}
      
      <div className="info-box">
        <h4>Why Lazy Loading?</h4>
        <ul>
          <li>Reduces initial bundle size</li>
          <li>Improves initial load time</li>
          <li>Loads components only when needed</li>
          <li>Works well with code splitting</li>
          <li>Ideal for rarely-used or large components</li>
        </ul>
      </div>
    </div>
  );
};

export default LazyLoadingExample;