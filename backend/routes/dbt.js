const express = require('express');
const router = express.Router();
const { getContainer } = require('../di/bootstrapper');

router.get('/models', async (req, res) => {
  try {
    const container = getContainer();
    const dbtService = container.get('dbtService');
    
    const models = await dbtService.listModels();
    res.json(models);
  } catch (error) {
    console.error('Error listing DBT models:', error);
    res.status(500).json({ error: 'Failed to list DBT models' });
  }
});

router.get('/models/:modelId', async (req, res) => {
  try {
    const container = getContainer();
    const dbtService = container.get('dbtService');
    
    const model = await dbtService.getModel(req.params.modelId);
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    res.json(model);
  } catch (error) {
    console.error('Error getting DBT model:', error);
    res.status(500).json({ error: 'Failed to get DBT model' });
  }
});

router.post('/discover', async (req, res) => {
  try {
    const container = getContainer();
    const dbtService = container.get('dbtService');
    const userId = req.user?.username || 'system';
    
    const result = await dbtService.discoverModels(userId);
    res.json(result);
  } catch (error) {
    console.error('Error discovering DBT models:', error);
    res.status(500).json({ error: 'Failed to discover DBT models' });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const container = getContainer();
    const dbtService = container.get('dbtService');
    const userId = req.user?.username || 'system';
    
    const { command = 'run', modelsSelector, triggerType = 'manual' } = req.body;
    
    const result = await dbtService.executeDbt(command, userId, {
      modelsSelector,
      triggerType
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error executing DBT command:', error);
    res.status(500).json({ error: 'Failed to execute DBT command', message: error.message });
  }
});

router.get('/executions', async (req, res) => {
  try {
    const container = getContainer();
    const dbtService = container.get('dbtService');
    
    const limit = parseInt(req.query.limit) || 50;
    const executions = await dbtService.getExecutions(limit);
    
    res.json(executions);
  } catch (error) {
    console.error('Error getting DBT executions:', error);
    res.status(500).json({ error: 'Failed to get DBT executions' });
  }
});

router.get('/executions/:executionId', async (req, res) => {
  try {
    const container = getContainer();
    const dbtService = container.get('dbtService');
    
    const execution = await dbtService.getExecution(req.params.executionId);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json(execution);
  } catch (error) {
    console.error('Error getting DBT execution:', error);
    res.status(500).json({ error: 'Failed to get DBT execution' });
  }
});

module.exports = router;
