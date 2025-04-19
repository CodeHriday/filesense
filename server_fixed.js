// Import the original server.js with modifications to fix the Business Processes, Jobs, and Groups API endpoints.

// These are the API endpoints that need to be modified in the original server.js file:

// 1. Replace all Business Processes API endpoints with:
app.get('/api/business-processes', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.get('/api/business-processes/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.post('/api/business-processes', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.put('/api/business-processes/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.delete('/api/business-processes/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

// 2. Replace all Jobs API endpoints with:
app.get('/api/jobs', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.get('/api/jobs/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.post('/api/jobs', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.put('/api/jobs/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.delete('/api/jobs/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.post('/api/jobs/:id/run', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

// 3. Replace all Groups API endpoints with:
app.get('/api/groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.get('/api/user/groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

// 4. Replace all Job Groups API endpoints with:
app.get('/api/job-groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.get('/api/job-groups/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.post('/api/job-groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.put('/api/job-groups/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.delete('/api/job-groups/:id', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.post('/api/job-groups/:id/jobs', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.delete('/api/job-groups/:groupId/jobs/:jobId', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});