/**
 * CronSchedulerService — execution dispatch unit tests
 *
 * Covers:
 *  - Traditional mapping: pool + string mapping_id passed correctly
 *  - Visual mapping:      VisualWorkflowExecutor.executeMapping() called with integer id
 *  - next_run updated after successful execution (cron and interval)
 *  - Unknown entity_type records failure and continues
 */

jest.mock('../db', () => {
  return { query: jest.fn() };
});

jest.mock('../services/jobExecutionEngine', () => ({
  executeTransformationJob: jest.fn()
}));

jest.mock('../services/mappingGroupExecutionEngine', () => ({
  executeMappingGroup: jest.fn()
}));

jest.mock('../services/nStepWorkflowExecutionEngine', () => ({
  executeNStepWorkflow: jest.fn()
}));

jest.mock('../services/AlertAggregationWorker', () => ({
  onScheduleExecuted: jest.fn()
}));

jest.mock('../services/BulkProfilingService', () => ({
  startJob: jest.fn()
}));

// VisualWorkflowExecutor is lazily required inside processDueSchedules.
// Define the mock so each constructed instance has jest.fn() methods;
// we inspect instances via VisualWorkflowExecutor.mock.results[n].value.
jest.mock('../services/visualWorkflowExecutor', () => ({
  VisualWorkflowExecutor: jest.fn().mockImplementation(() => ({
    execute: jest.fn(),
    executeMapping: jest.fn()
  }))
}));

// ------------------------------------------------------------------ imports --
// Must come AFTER jest.mock() declarations (which are hoisted).
const pool = require('../db');
const { executeTransformationJob } = require('../services/jobExecutionEngine');
const { VisualWorkflowExecutor } = require('../services/visualWorkflowExecutor');
const alertWorker = require('../services/AlertAggregationWorker');
const { processDueSchedules } = require('../services/cronSchedulerService');

// ------------------------------------------------------------------ helpers --

function makeSchedule(overrides = {}) {
  return {
    id: 1,
    entity_type: 'mapping',
    entity_id: 'TM-001',
    schedule_type: 'cron',
    cron_expression: '0 * * * *',
    interval_value: null,
    interval_unit: null,
    created_by: 42,
    ...overrides
  };
}

/** Wire pool.query: first call returns due schedules, rest return empty. */
function mockPoolForSchedules(schedules) {
  pool.query
    .mockResolvedValueOnce({ rows: schedules })
    .mockResolvedValue({ rows: [] });
}

// ------------------------------------------------------------------ setup ---

beforeEach(() => {
  // resetMocks:true clears implementations between tests; restore them here.
  executeTransformationJob.mockResolvedValue({ success: true, jobId: 'J1' });
  alertWorker.onScheduleExecuted.mockResolvedValue(undefined);

  // Re-wire each new VisualWorkflowExecutor instance with resolving jest.fn()s.
  // mockImplementation survives resetMocks when set in beforeEach.
  VisualWorkflowExecutor.mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true }),
    executeMapping: jest.fn().mockResolvedValue({ success: true })
  }));
});

// ------------------------------------------------------------------ tests ---

describe('processDueSchedules — execution dispatch', () => {

  // ─── traditional mapping ────────────────────────────────────────────────

  describe('entity_type: mapping', () => {
    test('calls executeTransformationJob with (pool, entity_id_string, userId, options)', async () => {
      const schedule = makeSchedule({ entity_id: 'TM-ABC', created_by: 7 });
      mockPoolForSchedules([schedule]);

      await processDueSchedules();

      expect(executeTransformationJob).toHaveBeenCalledTimes(1);
      const [passedPool, passedId, passedUserId, passedOpts] =
        executeTransformationJob.mock.calls[0];

      // pool must be the actual pool module, not an integer or undefined
      expect(passedPool).toBe(pool);
      // mapping_id is varchar — must stay a string
      expect(passedId).toBe('TM-ABC');
      expect(typeof passedId).toBe('string');
      expect(passedUserId).toBe(7);
      expect(passedOpts).toMatchObject({ scheduleId: 1 });
    });

    test('updates next_run after successful execution (cron schedule)', async () => {
      mockPoolForSchedules([makeSchedule()]);

      await processDueSchedules();

      const updateCall = pool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('UPDATE schedules')
      );
      expect(updateCall).toBeDefined();
      const [, params] = updateCall;
      // UPDATE schedules SET last_run=$1, next_run=$2 WHERE id=$3
      expect(params[2]).toBe(1);
      expect(params[1]).toBeInstanceOf(Date);
    });

    test('updates next_run after successful execution (interval schedule)', async () => {
      const schedule = makeSchedule({
        schedule_type: 'interval',
        cron_expression: null,
        interval_value: 2,
        interval_unit: 'hour'
      });
      mockPoolForSchedules([schedule]);

      await processDueSchedules();

      const updateCall = pool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('UPDATE schedules')
      );
      expect(updateCall).toBeDefined();
      const nextRun = updateCall[1][1];
      expect(nextRun).toBeInstanceOf(Date);
      const diffMs = nextRun.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(1 * 60 * 60 * 1000); // > 1 h
      expect(diffMs).toBeLessThan(3 * 60 * 60 * 1000);    // < 3 h
    });
  });

  // ─── visual mapping ─────────────────────────────────────────────────────

  describe('entity_type: visual_mapping', () => {
    test('creates VisualWorkflowExecutor(null, userId) and calls executeMapping(int_id)', async () => {
      const schedule = makeSchedule({
        entity_type: 'visual_mapping',
        entity_id: '13',
        created_by: 5
      });
      mockPoolForSchedules([schedule]);

      await processDueSchedules();

      expect(VisualWorkflowExecutor).toHaveBeenCalledTimes(1);
      const [ctorWorkflowId, ctorUserId] = VisualWorkflowExecutor.mock.calls[0];
      // workflowId should be null — executing a mapping, not a workflow
      expect(ctorWorkflowId).toBeNull();
      expect(ctorUserId).toBe(5);

      // Get the instance the constructor returned
      const vmInstance = VisualWorkflowExecutor.mock.results[0].value;
      expect(vmInstance.executeMapping).toHaveBeenCalledTimes(1);
      expect(vmInstance.executeMapping).toHaveBeenCalledWith(13); // parseInt('13')
    });

    test('updates next_run after successful VM mapping execution', async () => {
      const schedule = makeSchedule({
        entity_type: 'visual_mapping',
        entity_id: '13',
        schedule_type: 'cron',
        cron_expression: '0 0 * * *'
      });
      mockPoolForSchedules([schedule]);

      await processDueSchedules();

      const updateCall = pool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('UPDATE schedules')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1][2]).toBe(1); // schedule id
      expect(updateCall[1][1]).toBeInstanceOf(Date);
    });
  });

  // ─── no due schedules ───────────────────────────────────────────────────

  describe('no due schedules', () => {
    test('returns processed: 0 without calling any executor', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processDueSchedules();

      expect(result.processed).toBe(0);
      expect(executeTransformationJob).not.toHaveBeenCalled();
      expect(VisualWorkflowExecutor).not.toHaveBeenCalled();
    });
  });

  // ─── unknown entity_type ────────────────────────────────────────────────

  describe('unknown entity_type', () => {
    test('records the bad schedule as failed but still processes subsequent schedules', async () => {
      const badSchedule = makeSchedule({ id: 99, entity_type: 'nonexistent_type' });
      const goodSchedule = makeSchedule({ id: 100, entity_id: 'TM-GOOD' });
      mockPoolForSchedules([badSchedule, goodSchedule]);

      const result = await processDueSchedules();

      const badEntry = result.schedules.find(s => s.scheduleId === 99);
      expect(badEntry).toBeDefined();
      expect(badEntry.success).toBe(false);

      // Good schedule should still have been attempted
      expect(executeTransformationJob).toHaveBeenCalledTimes(1);
    });
  });
});
