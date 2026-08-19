jest.mock('../src/middleware/cache', () => ({
  createCacheMiddleware: () => (_req, _res, next) => next()
}));

const express = require('express');
const request = require('supertest');
const dashboardRouter = require('../routes/dashboard');
const {
  repairBootstrapAdminRoles,
  getPrerequisiteStatus
} = require('../migrations/repairCleanPublishDashboardPrerequisites');
const createGetUserProjectsFunction = require('../migrations/createGetUserProjectsFunction');

function makeDashboardApp({ ready, user }) {
  const app = express();
  const query = jest.fn().mockResolvedValue({ rows: [{ count: '0' }] });

  app.locals.databasePrerequisites = { ready };
  app.locals.pool = { query };
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/dashboard', dashboardRouter);

  return { app, query };
}

describe('dashboard database prerequisites', () => {
  test('returns a retryable response while database prerequisites are not ready', async () => {
    const { app, query } = makeDashboardApp({
      ready: false,
      user: { id: 1, roles: ['Admin'] }
    });

    const response = await request(app).get('/api/dashboard/metrics');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'Dashboard is initializing. Please retry shortly.',
      retryable: true
    });
    expect(query).not.toHaveBeenCalled();
  });

  test('returns zero-valued empty metrics for an Admin without project-scoping queries', async () => {
    const { app, query } = makeDashboardApp({
      ready: true,
      user: { id: 1, roles: ['Admin'] }
    });

    const response = await request(app).get('/api/dashboard/metrics');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      metrics: { projects: 0, files: 0, schedules: 0, jobs: 0, anomalies: 0 }
    });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls.some(([sql]) => sql.includes('get_user_projects'))).toBe(false);
  });

  test('returns zero-valued empty metrics for a project-scoped user through the access function', async () => {
    const { app, query } = makeDashboardApp({
      ready: true,
      user: { id: 42, roles: [] }
    });

    const response = await request(app).get('/api/dashboard/metrics');

    expect(response.status).toBe(200);
    expect(response.body.metrics).toEqual({
      projects: 0,
      files: 0,
      schedules: 0,
      jobs: 0,
      anomalies: 0
    });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls.every(([sql, params]) => {
      return sql.includes('get_user_projects') && params[0] === 42;
    })).toBe(true);
  });

  test('creates the public project-access routine in the schema migration source', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({}),
      release: jest.fn()
    };

    await createGetUserProjectsFunction({ connect: jest.fn().mockResolvedValue(client) });

    expect(client.query.mock.calls.some(([sql]) => (
      sql.includes('CREATE FUNCTION public.get_user_projects')
    ))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => (
      sql.includes('public.project_members')
        && sql.includes('public.access_group_members')
        && sql.includes('public.project_access_groups')
    ))).toBe(true);
  });

  test('only repairs roleless bootstrap admins', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rowCount: 3 }),
      release: jest.fn()
    };
    const dbPool = { connect: jest.fn().mockResolvedValue(client) };

    await repairBootstrapAdminRoles(dbPool);

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    const roleRepairCall = client.query.mock.calls.find(([sql]) => (
      sql.includes('INSERT INTO user_roles')
    ));
    expect(roleRepairCall[1]).toEqual([['Admin', 'Vendor Manager', 'Governance Manager']]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('reports missing routine or a roleless bootstrap account as not ready', async () => {
    const dbPool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            project_access_function_exists: false,
            bootstrap_admin_has_admin_role: true,
            bootstrap_admin_exists: true
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            project_access_function_exists: true,
            bootstrap_admin_has_admin_role: false,
            bootstrap_admin_exists: true
          }]
        })
    };

    await expect(getPrerequisiteStatus(dbPool)).resolves.toMatchObject({ ready: false });
    await expect(getPrerequisiteStatus(dbPool)).resolves.toMatchObject({ ready: false });
  });
});