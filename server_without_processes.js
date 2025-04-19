// This is a modified version of server.js with Business Processes, Jobs, and Groups endpoints removed

// Add these replacements to server.js:

// Business Processes API - REMOVED
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

// Jobs API - REMOVED
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

// Groups API - REMOVED
app.get('/api/groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

app.get('/api/user/groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: 'This feature has been removed' });
});

// Job Groups API - REMOVED
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