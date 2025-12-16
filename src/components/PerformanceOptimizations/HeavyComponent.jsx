import React, { useState, useEffect } from 'react';

// This component simulates a heavy component that's expensive to load
const HeavyComponent = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate data fetching
    const fetchData = async () => {
      // Wait for 1 second to simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate fake data
      const generatedData = Array.from({ length: 50 }, (_, index) => ({
        id: index,
        title: `Item ${index}`,
        description: `This is a detailed description for item ${index}. It contains a lot of text to simulate a complex data object.`,
        value: Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 1000),
        timestamp: new Date().toISOString()
      }));
      
      setData(generatedData);
      setLoading(false);
    };
    
    fetchData();
  }, []);
  
  // Render some complex UI with the data
  return (
    <div className="heavy-component">
      <h3>Heavy Component</h3>
      <p>This component was loaded lazily and is now fully rendered.</p>
      
      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
          <p>Loaded {data.length} items</p>
          <div className="data-grid">
            {data.slice(0, 5).map(item => (
              <div key={item.id} className="data-card">
                <h4>{item.title}</h4>
                <p>{item.description}</p>
                <div className="data-footer">
                  <span>Value: {item.value}</span>
                  <span>Created: {new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {data.length > 5 && <p>... and {data.length - 5} more items</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default HeavyComponent;