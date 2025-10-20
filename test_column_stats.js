// Test script for calculateColumnStatistics function
const path = require('path');

// Load the jobExecutionEngine module
const jobEngine = require(path.join(__dirname, 'backend/services/jobExecutionEngine.js'));

// Create test data
const testRows = [
  { name: 'Alice', age: 25, status: 'active', amount: 100.50 },
  { name: 'Bob Smith', age: 30, status: 'inactive', amount: 250.75 },
  { name: 'Charlie Brown', age: 35, status: 'active', amount: 175.00 },
  { name: 'Dave', age: 28, status: 'pending', amount: 300.25 },
  { name: 'Eve Johnson Wilson', age: 32, status: 'active', amount: 225.50 }
];

const testSchema = [
  { name: 'name', type: 'string' },
  { name: 'age', type: 'integer' },
  { name: 'status', type: 'string' },
  { name: 'amount', type: 'decimal' }
];

console.log('Testing calculateColumnStatistics...\n');
console.log('Test Data:');
console.log(JSON.stringify(testRows, null, 2));
console.log('\nSchema:');
console.log(JSON.stringify(testSchema, null, 2));

// Call the function (need to access the private function)
// Since it's not exported, we'll need to test via the module

console.log('\n❌ Cannot test private function directly.');
console.log('The calculateColumnStatistics function is not exported.');
console.log('To test, we need to either:');
console.log('1. Export it temporarily from jobExecutionEngine.js');
console.log('2. Run an actual ETL transformation');
console.log('3. Add unit tests within the module\n');

process.exit(0);
