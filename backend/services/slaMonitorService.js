/**
 * SLA Monitor Service
 * Monitors vendor agreement file arrival SLAs and creates violation records
 */

const ServiceBase = require('./ServiceBase');
const slaCalculationService = require('./slaCalculationService');

class SLAMonitorService extends ServiceBase {
  constructor(dbPool, logger) {
    super(dbPool, logger);
  }
  /**
   * Process all active vendor agreements with SLA monitoring enabled
   * @returns {Object} Summary of processing results
   */
  async processVendorSLAs() {
    const startTime = Date.now();
    const results = {
      processed: 0,
      violations: 0,
      compliant: 0,
      errors: [],
      details: []
    };

    try {
      // Get all active agreements with SLA enabled
      const agreementsQuery = `
        SELECT 
          va.id,
          va.agreement_code,
          va.file_name,
          va.frequency_pattern,
          va.expected_arrival_time,
          va.arrival_days,
          va.alert_threshold_minutes,
          va.project_id,
          va.vendor_id,
          p.name as project_name
        FROM vendor_agreements va
        LEFT JOIN projects p ON va.project_id = p.id
        WHERE va.sla_enabled = true
        AND va.status = 'active'
        AND va.frequency_pattern IS NOT NULL
        AND va.expected_arrival_time IS NOT NULL
      `;

      const agreementsResult = await this.executeQuery(agreementsQuery);
      const agreements = agreementsResult.rows;

      this.logger.info('Processing SLA checks for vendor agreements', {
        agreementCount: agreements.length
      });

      // Process each agreement
      for (const agreement of agreements) {
        try {
          const result = await this.checkAgreementSLA(agreement);
          results.processed++;
          results.details.push(result);

          if (result.status === 'violation') {
            results.violations++;
          } else if (result.status === 'compliant') {
            results.compliant++;
          }
        } catch (error) {
          this.logger.error('Error checking SLA for agreement', {
            agreementId: agreement.id,
            error: error.message
          });
          results.errors.push({
            agreementId: agreement.id,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;
      this.logger.info('SLA monitoring completed', {
        processed: results.processed,
        violations: results.violations,
        compliant: results.compliant,
        errors: results.errors.length,
        durationMs: duration
      });

      return results;
    } catch (error) {
      this.logger.error('Error in SLA monitoring service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Check SLA for a single vendor agreement
   * @param {Object} agreement - Vendor agreement record
   * @returns {Object} Check result
   */
  async checkAgreementSLA(agreement) {
    const now = new Date();

    // Calculate expected arrival window
    const window = slaCalculationService.getArrivalWindow(agreement, now);

    if (!window) {
      return {
        agreementId: agreement.id,
        agreementCode: agreement.agreement_code,
        status: 'skipped',
        reason: 'Unable to calculate arrival window'
      };
    }

    // If not yet in violation window, no action needed
    if (!window.isViolated) {
      return {
        agreementId: agreement.id,
        agreementCode: agreement.agreement_code,
        status: 'pending',
        expectedArrival: window.expectedArrivalTime,
        minutesUntilDeadline: window.minutesUntilDeadline
      };
    }

    // Check if file arrived within the expected window
    const fileArrived = await this.checkFileArrival(
      agreement.project_id,
      agreement.file_name,
      window.expectedArrivalTime,
      window.alertDeadline
    );

    if (fileArrived) {
      // File arrived - check if we need to resolve existing violation
      await this.resolveViolation(agreement.id, window.expectedArrivalTime, fileArrived);

      return {
        agreementId: agreement.id,
        agreementCode: agreement.agreement_code,
        status: 'compliant',
        expectedArrival: window.expectedArrivalTime,
        actualArrival: fileArrived.created_at,
        delayMinutes: slaCalculationService.calculateDelay(
          window.expectedArrivalTime,
          fileArrived.created_at
        )
      };
    }

    // No file arrived - create or update violation
    const violation = await this.recordViolation(agreement, window);

    return {
      agreementId: agreement.id,
      agreementCode: agreement.agreement_code,
      status: 'violation',
      expectedArrival: window.expectedArrivalTime,
      deadline: window.alertDeadline,
      delayMinutes: window.minutesUntilDeadline * -1, // Negative = late
      violationId: violation.id,
      alertSent: violation.alert_sent
    };
  }

  /**
   * Check if file arrived within expected window
   * @param {number} projectId - Project ID
   * @param {string} fileName - Expected file name (may contain wildcards)
   * @param {Date} expectedTime - Expected arrival time
   * @param {Date} deadline - Deadline (expected + threshold)
   * @returns {Object|null} File record if found
   */
  async checkFileArrival(projectId, fileName, expectedTime, deadline) {
    try {
      // Convert wildcards to SQL LIKE pattern
      const filePattern = fileName.replace(/\*/g, '%');
      const hasWildcard = filePattern.includes('%');

      const query = `
        SELECT id, file_id, filename, created_at
        FROM files
        WHERE project_id = $1
        AND created_at >= $2
        AND created_at <= $3
        ${hasWildcard ? 'AND filename LIKE $4' : 'AND filename = $4'}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.executeQuery(query, [projectId, expectedTime, deadline, filePattern]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      this.logger.error('Error checking file arrival', {
        projectId,
        fileName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Record SLA violation and create alert event
   * @param {Object} agreement - Vendor agreement
   * @param {Object} window - Arrival window details
   * @returns {Object} Violation record
   */
  async recordViolation(agreement, window) {
    const now = new Date();

    try {
      // Check if violation already exists for this time window
      const existingQuery = `
        SELECT id, alert_sent, alert_sent_at
        FROM vendor_sla_violations
        WHERE agreement_id = $1
        AND expected_arrival_time = $2
        AND resolved = false
      `;

      const existingResult = await this.executeQuery(existingQuery, [
        agreement.id,
        window.expectedArrivalTime
      ]);

      if (existingResult.rows.length > 0) {
        // Violation already recorded
        return existingResult.rows[0];
      }

      // Create new violation record
      const insertQuery = `
        INSERT INTO vendor_sla_violations (
          agreement_id,
          expected_arrival_time,
          violation_detected_at,
          alert_sent,
          resolved,
          delay_minutes,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const delayMinutes = slaCalculationService.calculateDelay(
        window.expectedArrivalTime,
        now
      );

      const metadata = {
        agreement_code: agreement.agreement_code,
        file_name: agreement.file_name,
        project_name: agreement.project_name,
        frequency_pattern: agreement.frequency_pattern,
        alert_threshold_minutes: agreement.alert_threshold_minutes
      };

      const insertResult = await this.executeQuery(insertQuery, [
        agreement.id,
        window.expectedArrivalTime,
        now,
        false, // alert_sent will be set by alert integration
        false, // resolved
        delayMinutes,
        JSON.stringify(metadata)
      ]);

      const violation = insertResult.rows[0];

      this.logger.info('SLA violation recorded', {
        agreementId: agreement.id,
        agreementCode: agreement.agreement_code,
        expectedTime: window.expectedArrivalTime,
        delayMinutes
      });

      // Create alert event for email notification
      await this.createAlertEvent(violation, agreement);

      return violation;
    } catch (error) {
      this.logger.error('Error recording SLA violation', {
        agreementId: agreement.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create alert event for SLA violation
   * @param {Object} violation - Violation record
   * @param {Object} agreement - Vendor agreement
   */
  async createAlertEvent(violation, agreement) {
    try {
      const insertEventQuery = `
        INSERT INTO alert_events (
          entity_type,
          entity_id,
          event_type,
          status,
          vendor_sla_violation_id,
          metadata,
          occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;

      const message = `File "${agreement.file_name}" for agreement "${agreement.agreement_code}" did not arrive on schedule. Expected by ${violation.expected_arrival_time.toISOString()}, currently ${violation.delay_minutes} minutes late.`;

      const eventMetadata = {
        agreement_id: agreement.id,
        agreement_code: agreement.agreement_code,
        file_name: agreement.file_name,
        project_id: agreement.project_id,
        project_name: agreement.project_name,
        frequency_pattern: agreement.frequency_pattern,
        expected_arrival_time: violation.expected_arrival_time,
        delay_minutes: violation.delay_minutes,
        alert_threshold_minutes: agreement.alert_threshold_minutes,
        vendor_id: agreement.vendor_id,
        message: message
      };

      const result = await this.executeQuery(insertEventQuery, [
        'vendor_sla',
        agreement.id.toString(), // entity_id as string
        'sla_violation',
        'failure', // SLA violations are always failures
        violation.id,
        JSON.stringify(eventMetadata),
        violation.violation_detected_at
      ]);

      this.logger.info('Alert event created for SLA violation', {
        violationId: violation.id,
        eventId: result.rows[0].id,
        agreementId: agreement.id
      });
    } catch (error) {
      this.logger.error('Error creating alert event for SLA violation', {
        violationId: violation.id,
        error: error.message
      });
      // Don't throw - violation was recorded, alert event failure shouldn't break the flow
    }
  }

  /**
   * Resolve existing SLA violation when file arrives
   * @param {number} agreementId - Agreement ID
   * @param {Date} expectedTime - Expected arrival time
   * @param {Object} file - File record that arrived
   */
  async resolveViolation(agreementId, expectedTime, file) {
    try {
      const updateQuery = `
        UPDATE vendor_sla_violations
        SET 
          resolved = true,
          resolved_at = $1,
          file_id = $2,
          actual_arrival_time = $3,
          updated_at = $1
        WHERE agreement_id = $4
        AND expected_arrival_time = $5
        AND resolved = false
        RETURNING id
      `;

      const result = await this.executeQuery(updateQuery, [
        new Date(),
        file.file_id,
        file.created_at,
        agreementId,
        expectedTime
      ]);

      if (result.rows.length > 0) {
        this.logger.info('SLA violation resolved', {
          agreementId,
          violationId: result.rows[0].id,
          fileId: file.file_id
        });
      }
    } catch (error) {
      this.logger.error('Error resolving SLA violation', {
        agreementId,
        error: error.message
      });
    }
  }
}

module.exports = SLAMonitorService;
