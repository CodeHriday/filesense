const VisualWorkflowExecutor = require('./backend/services/visualWorkflowExecutor');

async function testVisualWorkflow() {
  try {
    console.log('🧪 Testing Visual Workflow Execution...\n');
    
    // Test workflow ID 2 (simple 2-job workflow)
    const workflowId = 2;
    const userId = 1;
    
    console.log(`Executing workflow ID: ${workflowId}`);
    console.log(`User ID: ${userId}\n`);
    
    const executor = new VisualWorkflowExecutor(workflowId, userId);
    const result = await executor.execute();
    
    console.log('✅ Execution Result:');
    console.log(JSON.stringify(result, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testVisualWorkflow();
