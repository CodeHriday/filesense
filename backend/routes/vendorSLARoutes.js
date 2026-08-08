const express = require('express');
const router = express.Router();
const pool = require('../db');
const { query: dbQuery } = require('../config/database');
const slaMonitorService = require('../services/slaMonitorService');
const slaCalculationService = require('../services/slaCalculationService');
const { systemLogger } = require('../utils/logger');

router.get('/status', async (req, res) => {
  try {
    const { vendor_id, agreement_id, status_filter } = req.query;
    
    let whereConditions = ['va.sla_enabled = true'];
    const params = [];
    let paramIndex = 1;

    if (vendor_id) {
      whereConditions.push(`va.vendor_id = $${paramIndex}`);
      params.push(vendor_id);
      paramIndex++;
    }

    if (agreement_id) {
      whereConditions.push(`va.id = $${paramIndex}`);
      params.push(agreement_id);
      paramIndex++;
    }

    const query = `
      SELECT 
        va.id,
        va.agreement_code,
        va.file_name,
        va.frequency_pattern,
        va.expected_arrival_time as arrival_time,
        va.arrival_days,
        va.alert_threshold_minutes,
        va.project_id,
        va.vendor_id,
        va.status as agreement_status,
        v.vendor_name as vendor_name,
        p.name as project_name,
        (
          SELECT MAX(created_at)
          FROM files f
          WHERE f.project_id = va.project_id
          AND f.filename LIKE '%' || va.file_name || '%'
        ) as last_file_arrival,
        (
          SELECT COUNT(*)
          FROM vendor_sla_violations vsv
          WHERE vsv.agreement_id = va.id
          AND vsv.resolved_at IS NULL
        ) as active_violations,
        (
          SELECT COUNT(*)
          FROM vendor_sla_violations vsv
          WHERE vsv.agreement_id = va.id
          AND vsv.created_at >= NOW() - INTERVAL '30 days'
        ) as violations_last_30_days
      FROM vendor_agreements va
      LEFT JOIN vendors v ON va.vendor_id = v.id
      LEFT JOIN projects p ON va.project_id = p.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY va.agreement_code
    `;

    const result = await dbQuery(query, params);
    const agreements = result.rows;

    const statusData = await Promise.all(agreements.map(async (agreement) => {
      const expectedArrival = slaCalculationService.calculateNextArrival(
        agreement.frequency_pattern,
        agreement.arrival_time,
        agreement.arrival_days
      );

      const arrivalWindow = slaCalculationService.getArrivalWindow(
        agreement.frequency_pattern,
        agreement.arrival_time,
        agreement.arrival_days,
        agreement.alert_threshold_minutes
      );

      let complianceStatus = 'unknown';
      let delayMinutes = null;

      if (arrivalWindow && agreement.last_file_arrival) {
        const lastArrival = new Date(agreement.last_file_arrival);
        const isViolated = slaCalculationService.isViolated(
          lastArrival,
          arrivalWindow.expectedArrival,
          arrivalWindow.deadline
        );

        if (isViolated) {
          complianceStatus = 'violated';
          delayMinutes = slaCalculationService.calculateDelay(
            lastArrival,
            arrivalWindow.expectedArrival
          ).delayMinutes;
        } else {
          complianceStatus = 'compliant';
        }
      } else if (arrivalWindow && !agreement.last_file_arrival) {
        complianceStatus = 'no_data';
      }

      return {
        agreement_id: agreement.id,
        agreement_code: agreement.agreement_code,
        file_name: agreement.file_name,
        vendor_name: agreement.vendor_name,
        project_name: agreement.project_name,
        frequency_pattern: agreement.frequency_pattern,
        arrival_time: agreement.arrival_time,
        arrival_days: agreement.arrival_days,
        alert_threshold_minutes: agreement.alert_threshold_minutes,
        expected_arrival: expectedArrival,
        last_file_arrival: agreement.last_file_arrival,
        compliance_status: complianceStatus,
        delay_minutes: delayMinutes,
        active_violations: parseInt(agreement.active_violations) || 0,
        violations_last_30_days: parseInt(agreement.violations_last_30_days) || 0,
        arrival_window: arrivalWindow
      };
    }));

    if (status_filter) {
      const filtered = statusData.filter(s => s.compliance_status === status_filter);
      return res.json({ success: true, data: filtered, total: filtered.length });
    }

    res.json({ success: true, data: statusData, total: statusData.length });
  } catch (error) {
    systemLogger.error('Error fetching SLA status', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/violations', async (req, res) => {
  try {
    const { vendor_id, agreement_id, resolved, limit = 100, offset = 0 } = req.query;
    
    let whereConditions = ['1=1'];
    const params = [];
    let paramIndex = 1;

    if (vendor_id) {
      whereConditions.push(`va.vendor_id = $${paramIndex}`);
      params.push(vendor_id);
      paramIndex++;
    }

    if (agreement_id) {
      whereConditions.push(`vsv.agreement_id = $${paramIndex}`);
      params.push(agreement_id);
      paramIndex++;
    }

    if (resolved !== undefined) {
      if (resolved === 'true') {
        whereConditions.push('vsv.resolved_at IS NOT NULL');
      } else {
        whereConditions.push('vsv.resolved_at IS NULL');
      }
    }

    params.push(parseInt(limit));
    const limitParam = paramIndex++;
    params.push(parseInt(offset));
    const offsetParam = paramIndex++;

    const query = `
      SELECT 
        vsv.id,
        vsv.agreement_id,
        vsv.expected_arrival_time,
        vsv.actual_arrival_time,
        vsv.delay_minutes,
        vsv.created_at,
        vsv.resolved_at,
        vsv.metadata,
        va.agreement_code,
        va.file_name,
        v.vendor_name as vendor_name,
        p.name as project_name
      FROM vendor_sla_violations vsv
      LEFT JOIN vendor_agreements va ON vsv.agreement_id = va.id
      LEFT JOIN vendors v ON va.vendor_id = v.id
      LEFT JOIN projects p ON va.project_id = p.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY vsv.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM vendor_sla_violations vsv
      LEFT JOIN vendor_agreements va ON vsv.agreement_id = va.id
      WHERE ${whereConditions.join(' AND ')}
    `;

    const [violationsResult, countResult] = await Promise.all([
      dbQuery(query, params),
      dbQuery(countQuery, params.slice(0, -2))
    ]);

    res.json({
      success: true,
      data: violationsResult.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    systemLogger.error('Error fetching SLA violations', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/test-check', async (req, res) => {
  try {
    const { agreement_id } = req.body;

    if (!agreement_id) {
      return res.status(400).json({ success: false, error: 'agreement_id is required' });
    }

    const agreementQuery = `
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
        va.sla_enabled,
        p.name as project_name
      FROM vendor_agreements va
      LEFT JOIN projects p ON va.project_id = p.id
      WHERE va.id = $1
    `;

    const result = await dbQuery(agreementQuery, [agreement_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agreement not found' });
    }

    const agreement = result.rows[0];

    if (!agreement.sla_enabled) {
      return res.status(400).json({ 
        success: false, 
        error: 'SLA monitoring is not enabled for this agreement' 
      });
    }

    const checkResult = await slaMonitorService.checkAgreementSLA(agreement);

    systemLogger.info('Manual SLA check triggered', { 
      agreementId: agreement_id, 
      status: checkResult.status 
    });

    res.json({
      success: true,
      data: checkResult
    });
  } catch (error) {
    systemLogger.error('Error running manual SLA check', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const summaryQuery = `
      WITH sla_agreements AS (
        SELECT 
          COUNT(*) as total_agreements,
          COUNT(*) FILTER (WHERE status = 'active') as active_agreements
        FROM vendor_agreements
        WHERE sla_enabled = true
      ),
      violations AS (
        SELECT 
          COUNT(*) as total_violations,
          COUNT(*) FILTER (WHERE resolved_at IS NULL) as active_violations,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as violations_last_7_days,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as violations_last_30_days
        FROM vendor_sla_violations
      )
      SELECT 
        sa.total_agreements,
        sa.active_agreements,
        v.total_violations,
        v.active_violations,
        v.violations_last_7_days,
        v.violations_last_30_days
      FROM sla_agreements sa, violations v
    `;

    const result = await dbQuery(summaryQuery);
    const summary = result.rows[0];

    res.json({
      success: true,
      data: {
        total_agreements: parseInt(summary.total_agreements) || 0,
        active_agreements: parseInt(summary.active_agreements) || 0,
        total_violations: parseInt(summary.total_violations) || 0,
        active_violations: parseInt(summary.active_violations) || 0,
        violations_last_7_days: parseInt(summary.violations_last_7_days) || 0,
        violations_last_30_days: parseInt(summary.violations_last_30_days) || 0,
        compliance_rate: summary.total_agreements > 0 
          ? ((summary.total_agreements - summary.active_violations) / summary.total_agreements * 100).toFixed(2)
          : 100
      }
    });
  } catch (error) {
    systemLogger.error('Error fetching SLA summary', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
