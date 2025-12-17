const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { safePath, isSafeFilename } = require('../utils/pathValidator');

class DBTService {
  constructor(db, auditService) {
    this.db = db;
    this.auditService = auditService;
    this.dbtProjectPath = path.join(process.cwd(), 'dbt_project');
  }

  async listModels() {
    const result = await this.db.query(`
      SELECT 
        model_id,
        model_name,
        model_path,
        model_type,
        materialization,
        description,
        tags,
        upstream_models,
        downstream_models,
        source_tables,
        last_compiled_at,
        last_run_at,
        last_run_status,
        last_run_duration_ms,
        row_count,
        byte_size,
        config,
        created_at,
        updated_at
      FROM dbt_models
      ORDER BY model_path, model_name
    `);
    return result.rows;
  }

  async getModel(modelId) {
    const result = await this.db.query(
      `SELECT * FROM dbt_models WHERE model_id = $1`,
      [modelId]
    );
    return result.rows[0] || null;
  }

  async discoverModels(userId) {
    try {
      const modelsPath = path.join(this.dbtProjectPath, 'models');
      const models = [];

      const scanDirectory = async (dir, prefix = '') => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          // Validate filename to prevent path traversal
          if (!isSafeFilename(entry.name)) {
            console.warn(`Skipping unsafe filename: ${entry.name}`);
            continue;
          }
          
          // Use safe path joining to prevent directory traversal
          const fullPath = safePath(dir, entry.name);
          // Also use safePath for relative path construction (even though prefix is controlled)
          const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;

          if (entry.isDirectory()) {
            await scanDirectory(fullPath, relativePath);
          } else if (entry.name.endsWith('.sql')) {
            const modelName = entry.name.replace('.sql', '');
            const content = await fs.readFile(fullPath, 'utf-8');
            
            // Use a more specific regex to avoid ReDoS - limit the content length and be more specific
            const configMatch = content.match(/config\(([^)]{0,1000})\)/);
            let materialization = 'view';
            let tags = [];
            
            if (configMatch) {
              const configContent = configMatch[1];
              const matMatch = configContent.match(/materialized=['"](\w+)['"]/);
              if (matMatch) materialization = matMatch[1];
              
              const tagsMatch = configContent.match(/tags=\[([^\]]{0,200})\]/);
              if (tagsMatch) {
                tags = tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
              }
            }

            const sourceMatch = content.match(/source\(['"](\w+)['"], *['"](\w+)['"]\)/g);
            const sourceTables = sourceMatch ? sourceMatch.map(s => {
              const match = s.match(/source\(['"](\w+)['"], *['"](\w+)['"]\)/);
              return match ? `${match[1]}.${match[2]}` : null;
            }).filter(Boolean) : [];

            const refMatch = content.match(/ref\(['"](\w+)['"]\)/g);
            const upstreamModels = refMatch ? refMatch.map(r => {
              const match = r.match(/ref\(['"](\w+)['"]\)/);
              return match ? match[1] : null;
            }).filter(Boolean) : [];

            models.push({
              model_name: modelName,
              model_path: relativePath.replace(/\\/g, '/'),
              model_type: prefix.split('/')[0] || 'staging',
              materialization,
              tags,
              upstream_models: upstreamModels,
              source_tables: sourceTables,
              description: null
            });
          }
        }
      };

      await scanDirectory(modelsPath);

      for (const model of models) {
        await this.db.query(`
          INSERT INTO dbt_models (
            model_name, model_path, model_type, materialization, tags, 
            upstream_models, source_tables, description, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          ON CONFLICT (model_name) 
          DO UPDATE SET
            model_path = $2,
            model_type = $3,
            materialization = $4,
            tags = $5,
            upstream_models = $6,
            source_tables = $7,
            updated_at = NOW()
        `, [
          model.model_name,
          model.model_path,
          model.model_type,
          model.materialization,
          model.tags,
          model.upstream_models,
          model.source_tables,
          model.description
        ]);
      }

      if (this.auditService && userId) {
        await this.auditService.logAction({
          userId,
          entityType: 'dbt',
          action: 'DISCOVER',
          status: 'SUCCESS',
          changes: { models_discovered: models.length }
        });
      }

      return { discovered: models.length, models };
    } catch (error) {
      console.error('Error discovering DBT models:', error);
      throw error;
    }
  }

  async executeDbt(command, userId, options = {}) {
    const executionUuid = uuidv4();
    const { modelsSelector, triggerType = 'manual' } = options;

    const allowedCommands = ['run', 'test', 'compile', 'build', 'snapshot', 'seed', 'docs'];
    if (!allowedCommands.includes(command)) {
      throw new Error(`Invalid DBT command. Allowed commands: ${allowedCommands.join(', ')}`);
    }

    if (modelsSelector && !/^[a-zA-Z0-9_\s\-\.\+:]+$/.test(modelsSelector)) {
      throw new Error('Invalid models selector. Only alphanumeric characters, spaces, hyphens, underscores, dots, colons, and plus signs are allowed.');
    }

    let executionId;
    try {
      const insertResult = await this.db.query(`
        INSERT INTO dbt_executions (
          execution_uuid, command, models_selector, triggered_by, 
          trigger_type, status, started_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
        RETURNING execution_id
      `, [
        executionUuid,
        command,
        modelsSelector || null,
        userId || 'system',
        triggerType,
        'running'
      ]);
      executionId = insertResult.rows[0].execution_id;

      const dbtArgs = [command];
      if (modelsSelector) {
        dbtArgs.push('--models', modelsSelector);
      }

      const startTime = Date.now();
      const { stdout, stderr, exitCode } = await this.runDbtCommand(dbtArgs);
      const duration = Date.now() - startTime;

      const results = this.parseDbtOutput(stdout);
      const status = exitCode === 0 ? 'success' : 'failed';

      await this.db.query(`
        UPDATE dbt_executions
        SET 
          status = $1,
          completed_at = NOW(),
          duration_ms = $2,
          models_run = $3,
          models_success = $4,
          models_failed = $5,
          logs = $6,
          error_message = $7,
          results = $8,
          updated_at = NOW()
        WHERE execution_id = $9
      `, [
        status,
        duration,
        results.modelsRun,
        results.modelsSuccess,
        results.modelsFailed,
        stdout,
        exitCode !== 0 ? stderr : null,
        JSON.stringify(results.details),
        executionId
      ]);

      if (results.modelResults) {
        for (const modelResult of results.modelResults) {
          await this.db.query(`
            UPDATE dbt_models
            SET 
              last_run_at = NOW(),
              last_run_status = $1,
              last_run_duration_ms = $2,
              updated_at = NOW()
            WHERE model_name = $3
          `, [
            modelResult.status,
            modelResult.execution_time,
            modelResult.model_name
          ]);
        }
      }

      if (this.auditService && userId) {
        await this.auditService.logAction({
          userId,
          entityType: 'dbt',
          entityId: executionId.toString(),
          action: 'EXECUTE',
          status: status.toUpperCase(),
          changes: {
            command,
            models_selector: modelsSelector,
            models_run: results.modelsRun,
            models_success: results.modelsSuccess,
            models_failed: results.modelsFailed,
            duration_ms: duration
          }
        });
      }

      return {
        executionId,
        executionUuid,
        status,
        duration,
        results
      };

    } catch (error) {
      if (executionId) {
        await this.db.query(`
          UPDATE dbt_executions
          SET 
            status = 'failed',
            completed_at = NOW(),
            error_message = $1,
            updated_at = NOW()
          WHERE execution_id = $2
        `, [error.message, executionId]);
      }

      if (this.auditService && userId) {
        await this.auditService.logAction({
          userId,
          entityType: 'dbt',
          entityId: executionId ? executionId.toString() : null,
          action: 'EXECUTE',
          status: 'FAILED',
          changes: { error: error.message }
        });
      }

      throw error;
    }
  }

  async runDbtCommand(args) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const dbtProcess = spawn('dbt', args, { // NOSONAR S4036 - PATH controlled in deployment environment, dbt command with validated args and no shell execution
        cwd: this.dbtProjectPath,
        env: { ...process.env },
        shell: false
      });

      dbtProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      dbtProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      dbtProcess.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });

      dbtProcess.on('error', (error) => {
        resolve({ stdout, stderr: error.message, exitCode: 1 });
      });
    });
  }

  parseDbtOutput(output) {
    const results = {
      modelsRun: 0,
      modelsSuccess: 0,
      modelsFailed: 0,
      modelsSkipped: 0,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      details: [],
      modelResults: []
    };

    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Completed successfully')) {
        results.modelsSuccess++;
        results.modelsRun++;
      } else if (line.includes('ERROR') || line.includes('FAIL')) {
        results.modelsFailed++;
        results.modelsRun++;
      }

      // Use a more specific regex to avoid ReDoS vulnerability
      const modelMatch = line.match(/^(\w+) ([\w.]+) \.\.\. \[(\w+) in ([\d.]+)s\]$/);
      if (modelMatch) {
        const [, action, modelName, status, time] = modelMatch;
        results.modelResults.push({
          action,
          model_name: modelName,
          status: status.toLowerCase(),
          execution_time: Math.floor(parseFloat(time) * 1000)
        });
      }
    }

    const summaryMatch = output.match(/Done\. +PASS=(\d+) +WARN=(\d+) +ERROR=(\d+) +SKIP=(\d+) +TOTAL=(\d+)/);
    if (summaryMatch) {
      results.modelsSuccess = parseInt(summaryMatch[1]);
      results.modelsFailed = parseInt(summaryMatch[3]);
      results.modelsSkipped = parseInt(summaryMatch[4]);
      results.modelsRun = parseInt(summaryMatch[5]);
    }

    return results;
  }

  async getExecutions(limit = 50) {
    const result = await this.db.query(`
      SELECT 
        execution_id,
        execution_uuid,
        command,
        models_selector,
        triggered_by,
        trigger_type,
        status,
        started_at,
        completed_at,
        duration_ms,
        models_run,
        models_success,
        models_failed,
        models_skipped,
        error_message,
        created_at
      FROM dbt_executions
      ORDER BY started_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  async getExecution(executionId) {
    const result = await this.db.query(`
      SELECT * FROM dbt_executions WHERE execution_id = $1
    `, [executionId]);
    return result.rows[0] || null;
  }
}

module.exports = DBTService;
