import React, { useState, useCallback } from 'react';
import Memo from './Memo';

const CallbackExample = () => {
  const [count, setCount] = useState(0);
  const [dataVersion, setDataVersion] = useState(1);
  
  // Sample data that's expensive to process
  const data = React.useMemo(() => {
    return Array.from({ length: 100 }, (_, i) => ({
      id: i,
      value: Math.random() * 100,
      version: dataVersion
    }));
  }, [dataVersion]); // Only regenerate when dataVersion changes
  
  // Without useCallback, this function would be recreated on every render
  // causing the memoized child component to re-render unnecessarily
  const incrementCount = () => {
    setCount(c => c + 1);
  };
  
  // With useCallback, the function reference remains stable between renders
  // as long as dependencies don't change
  const memoizedIncrementCount = useCallback(() => {
    setCount(c => c + 1);
  }, []); // Empty dependency array means this callback never changes
  
  // This function changes the data being passed to the expensive component
  const updateData = useCallback(() => {
    setDataVersion(v => v + 1);
  }, []);
  
  return (
    <div className="callback-example">
      <h2>useCallback Example</h2>
      <p>
        This example demonstrates how useCallback helps prevent unnecessary re-renders
        of child components that rely on function props.
      </p>
      
      <div className="controls">
        <p>Parent count: {count}</p>
        <p>Data version: {dataVersion}</p>
        <button onClick={incrementCount}>
          Increment Count (Regular Function)
        </button>
        <button onClick={memoizedIncrementCount}>
          Increment Count (useCallback)
        </button>
        <button onClick={updateData}>
          Update Data
        </button>
        <p className="note">
          <strong>Note:</strong> When using the regular function, the memoized component
          will re-render even though its data hasn't changed. With useCallback, it will
          only re-render when the data actually changes.
        </p>
      </div>
      
      <div className="expensive-component-wrapper">
        <Memo 
          data={data} 
          onClick={memoizedIncrementCount} 
        />
      </div>
    </div>
  );
};

export default CallbackExample;