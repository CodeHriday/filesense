import React, { useState, useEffect, useRef } from 'react';

// A simple virtualized list implementation
const VirtualizedList = () => {
  const [items, setItems] = useState([]);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const listRef = useRef(null);
  const itemHeight = 50; // Height of each item in pixels
  
  // Generate a large dataset
  useEffect(() => {
    const generateItems = () => {
      return Array.from({ length: 10000 }, (_, index) => ({
        id: index,
        text: `Item ${index}`,
        description: `This is item number ${index} in our virtualized list demonstration.`
      }));
    };
    
    setItems(generateItems());
  }, []);
  
  // Handle scroll events to update visible items
  const handleScroll = () => {
    if (listRef.current) {
      const { scrollTop, clientHeight } = listRef.current;
      
      // Calculate which items should be visible
      const startIndex = Math.floor(scrollTop / itemHeight);
      const endIndex = Math.min(
        startIndex + Math.ceil(clientHeight / itemHeight) + 5, // Add buffer
        items.length
      );
      
      setVisibleRange({ start: startIndex, end: endIndex });
    }
  };
  
  // Calculate total scroll height
  const totalHeight = items.length * itemHeight;
  
  // Get only the items that should be visible
  const visibleItems = items.slice(visibleRange.start, visibleRange.end);
  
  return (
    <div className="virtualized-list-container">
      <h2>Virtualized List</h2>
      <p>
        This list efficiently renders {items.length} items by only creating DOM elements
        for the items currently visible in the viewport.
      </p>
      
      <div 
        ref={listRef}
        className="virtualized-list"
        style={{ 
          height: '300px', 
          overflowY: 'auto',
          border: '1px solid #ccc',
          position: 'relative'
        }}
        onScroll={handleScroll}
      >
        {/* Spacer div that creates the scroll area */}
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {/* Only render visible items, positioned absolutely */}
          {visibleItems.map((item, index) => (
            <div
              key={item.id}
              className="list-item"
              style={{
                position: 'absolute',
                top: `${(visibleRange.start + index) * itemHeight}px`,
                height: `${itemHeight}px`,
                left: 0,
                right: 0,
                padding: '10px',
                borderBottom: '1px solid #eee',
                backgroundColor: item.id % 2 === 0 ? '#f9f9f9' : '#fff'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{item.text}</div>
              <div style={{ fontSize: '0.8rem' }}>{item.description}</div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="stats">
        <p>Total items: {items.length}</p>
        <p>Rendered items: {visibleItems.length}</p>
        <p>Current range: {visibleRange.start} - {visibleRange.end}</p>
      </div>
      
      <div className="info-box" style={{ marginTop: '20px' }}>
        <h4>Benefits of Virtualization:</h4>
        <ul>
          <li>Renders only what's visible in the viewport</li>
          <li>Drastically reduces DOM nodes</li>
          <li>Improves scrolling performance</li>
          <li>Memory efficient for large datasets</li>
          <li>Enables smooth handling of thousands of items</li>
        </ul>
      </div>
    </div>
  );
};

export default VirtualizedList;