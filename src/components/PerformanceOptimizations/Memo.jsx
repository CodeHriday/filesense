import React, { memo } from 'react';
import PropTypes from 'prop-types';

// A simple example component to demonstrate React.memo
const ExpensiveComponent = ({ data, onClick }) => {
  console.log('ExpensiveComponent rendered with data:', data);
  
  // Simulate an expensive calculation
  const processedData = React.useMemo(() => {
    console.log('Heavy calculation running...');
    // Simulating a CPU-intensive operation
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
      result += (crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * i;
    }
    return data.map(item => ({ ...item, value: item.value * 2 + result / 1000000000 }));
  }, [data]); // Only recalculate when data changes
  
  return (
    <div className="expensive-component">
      <h3>Expensive Component (Memoized)</h3>
      <p>This component only re-renders when its props actually change.</p>
      <button onClick={onClick}>Trigger parent re-render</button>
      <div className="data-preview">
        <strong>Processed data (first 3 items):</strong>
        <pre>{JSON.stringify(processedData.slice(0, 3), null, 2)}</pre>
      </div>
    </div>
  );
};
ExpensiveComponent.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.number.isRequired
    })
  ).isRequired,
  onClick: PropTypes.func.isRequired
};
// Using memo to avoid unnecessary re-renders
export default memo(ExpensiveComponent, (prevProps, nextProps) => {
  // Custom comparison function (optional)
  // Return true if passing nextProps would render the same result as prevProps
  return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
});