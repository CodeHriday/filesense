/**
 * DBT Routes - stub
 * Placeholder so the server can start while DBT integration is not yet implemented.
 */
const express = require('express');
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ enabled: false, message: 'DBT integration not configured' });
});

module.exports = router;
