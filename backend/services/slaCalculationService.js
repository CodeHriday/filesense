/**
 * SLA Calculation Service
 * Handles frequency pattern parsing and expected arrival window calculations for vendor SLA monitoring
 */

const { systemLogger } = require('../utils/logger');

class SLACalculationService {
  /**
   * Parse frequency pattern and calculate next expected arrival time
   * @param {string} frequencyPattern - daily|weekly|monthly|hourly (Note: 'custom' is not yet supported)
   * @param {string} arrivalTime - HH:MM format (e.g., "06:00")
   * @param {string} arrivalDays - JSON string with days (e.g., '["Monday","Wednesday"]' for weekly, '[1,15]' for monthly)
   * @param {Date} fromDate - Calculate from this date (defaults to now)
   * @returns {Date|null} Next expected arrival timestamp
   */
  calculateNextArrival(frequencyPattern, arrivalTime, arrivalDays, fromDate = new Date()) {
    try {
      if (!frequencyPattern || !arrivalTime) {
        systemLogger.warn('Missing frequency pattern or arrival time for SLA calculation');
        return null;
      }

      const [hours, minutes] = arrivalTime.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) {
        systemLogger.warn('Invalid arrival time format', { arrivalTime });
        return null;
      }

      switch (frequencyPattern.toLowerCase()) {
        case 'daily':
          return this._calculateDailyArrival(fromDate, hours, minutes);
        
        case 'weekly':
          return this._calculateWeeklyArrival(fromDate, hours, minutes, arrivalDays);
        
        case 'monthly':
          return this._calculateMonthlyArrival(fromDate, hours, minutes, arrivalDays);
        
        case 'hourly':
          return this._calculateHourlyArrival(fromDate, minutes);
        
        default:
          systemLogger.warn('Unsupported frequency pattern', { frequencyPattern });
          return null;
      }
    } catch (error) {
      systemLogger.error('Error calculating next arrival', { error: error.message, frequencyPattern });
      return null;
    }
  }

  /**
   * Calculate daily expected arrival
   * @private
   */
  _calculateDailyArrival(fromDate, hours, minutes) {
    const nextArrival = new Date(fromDate);
    nextArrival.setHours(hours, minutes, 0, 0);
    
    // If the time has already passed today, move to tomorrow
    if (nextArrival <= fromDate) {
      nextArrival.setDate(nextArrival.getDate() + 1);
    }
    
    return nextArrival;
  }

  /**
   * Calculate weekly expected arrival
   * @private
   */
  _calculateWeeklyArrival(fromDate, hours, minutes, arrivalDays) {
    if (!arrivalDays) {
      systemLogger.warn('arrival_days required for weekly frequency');
      return null;
    }

    let daysArray;
    try {
      daysArray = typeof arrivalDays === 'string' ? JSON.parse(arrivalDays) : arrivalDays;
    } catch (error) {
      systemLogger.warn('Invalid arrival_days JSON for weekly frequency', { arrivalDays });
      return null;
    }

    if (!Array.isArray(daysArray) || daysArray.length === 0) {
      systemLogger.warn('arrival_days must be non-empty array for weekly frequency');
      return null;
    }

    const dayMap = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };

    // Convert day names to numbers
    const targetDays = daysArray
      .map(day => dayMap[day.toLowerCase()])
      .filter(d => d !== undefined)
      .sort((a, b) => a - b);

    if (targetDays.length === 0) {
      systemLogger.warn('No valid days found in arrival_days for weekly frequency', { daysArray });
      return null;
    }

    const currentDay = fromDate.getDay();
    let nextArrival = new Date(fromDate);
    nextArrival.setHours(hours, minutes, 0, 0);

    // Find next occurrence - check up to 14 days to handle case where today's time passed
    for (let i = 0; i < 14; i++) {
      const checkDay = (currentDay + i) % 7;
      if (targetDays.includes(checkDay)) {
        const candidateDate = new Date(fromDate);
        candidateDate.setDate(fromDate.getDate() + i);
        candidateDate.setHours(hours, minutes, 0, 0);
        
        // Only return if this is in the future
        if (candidateDate > fromDate) {
          return candidateDate;
        }
      }
    }

    return null;
  }

  /**
   * Calculate monthly expected arrival
   * @private
   */
  _calculateMonthlyArrival(fromDate, hours, minutes, arrivalDays) {
    if (!arrivalDays) {
      systemLogger.warn('arrival_days required for monthly frequency');
      return null;
    }

    let daysArray;
    try {
      daysArray = typeof arrivalDays === 'string' ? JSON.parse(arrivalDays) : arrivalDays;
    } catch (error) {
      systemLogger.warn('Invalid arrival_days JSON for monthly frequency', { arrivalDays });
      return null;
    }

    if (!Array.isArray(daysArray) || daysArray.length === 0) {
      systemLogger.warn('arrival_days must be non-empty array for monthly frequency');
      return null;
    }

    // Convert to numbers and sort
    const targetDates = daysArray
      .map(d => parseInt(d))
      .filter(d => d >= 1 && d <= 31)
      .sort((a, b) => a - b);

    if (targetDates.length === 0) {
      systemLogger.warn('No valid dates found in arrival_days for monthly frequency', { daysArray });
      return null;
    }

    const currentDate = fromDate.getDate();
    let nextArrival = new Date(fromDate);
    nextArrival.setHours(hours, minutes, 0, 0);

    // Helper to get last day of month
    const getLastDayOfMonth = (date) => {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    // Find next occurrence in current month
    for (const targetDate of targetDates) {
      const lastDay = getLastDayOfMonth(nextArrival);
      const clampedDate = Math.min(targetDate, lastDay);
      
      if (clampedDate > currentDate || (clampedDate === currentDate && nextArrival > fromDate)) {
        nextArrival.setDate(clampedDate);
        return nextArrival;
      }
    }

    // No dates left in current month, move to next month
    nextArrival.setMonth(nextArrival.getMonth() + 1);
    nextArrival.setDate(1); // Set to 1st first to avoid overflow
    
    const lastDay = getLastDayOfMonth(nextArrival);
    const clampedDate = Math.min(targetDates[0], lastDay);
    nextArrival.setDate(clampedDate);
    
    return nextArrival;
  }

  /**
   * Calculate hourly expected arrival
   * @private
   */
  _calculateHourlyArrival(fromDate, minutes) {
    const nextArrival = new Date(fromDate);
    nextArrival.setMinutes(minutes, 0, 0);
    
    // If the time has already passed this hour, move to next hour
    if (nextArrival <= fromDate) {
      nextArrival.setHours(nextArrival.getHours() + 1);
    }
    
    return nextArrival;
  }

  /**
   * Check if SLA is violated
   * @param {Date} expectedArrivalTime - When file was expected
   * @param {number} thresholdMinutes - Grace period in minutes
   * @param {Date} currentTime - Current time (defaults to now)
   * @returns {boolean} True if SLA is violated
   */
  isViolated(expectedArrivalTime, thresholdMinutes = 60, currentTime = new Date()) {
    if (!expectedArrivalTime) {
      return false;
    }

    const deadline = new Date(expectedArrivalTime.getTime() + thresholdMinutes * 60 * 1000);
    return currentTime > deadline;
  }

  /**
   * Calculate delay in minutes
   * @param {Date} expectedArrivalTime - When file was expected
   * @param {Date} actualArrivalTime - When file actually arrived (or current time if not arrived)
   * @returns {number} Delay in minutes (0 if early or on time)
   */
  calculateDelay(expectedArrivalTime, actualArrivalTime = new Date()) {
    if (!expectedArrivalTime) {
      return 0;
    }

    const delayMs = actualArrivalTime.getTime() - expectedArrivalTime.getTime();
    const delayMinutes = Math.floor(delayMs / (60 * 1000));
    
    return Math.max(0, delayMinutes);
  }

  /**
   * Get expected arrival window details
   * @param {Object} agreement - Vendor agreement object with SLA fields
   * @param {Date} fromDate - Calculate from this date (defaults to now)
   * @returns {Object} Window details with expected time, deadline, and status
   */
  getArrivalWindow(agreement, fromDate = new Date()) {
    const {
      frequency_pattern,
      expected_arrival_time,
      arrival_days,
      alert_threshold_minutes = 60
    } = agreement;

    const expectedTime = this.calculateNextArrival(
      frequency_pattern,
      expected_arrival_time,
      arrival_days,
      fromDate
    );

    if (!expectedTime) {
      return null;
    }

    const deadline = new Date(expectedTime.getTime() + alert_threshold_minutes * 60 * 1000);
    const isViolated = fromDate > deadline;

    return {
      expectedArrivalTime: expectedTime,
      alertDeadline: deadline,
      thresholdMinutes: alert_threshold_minutes,
      isViolated,
      minutesUntilExpected: Math.floor((expectedTime.getTime() - fromDate.getTime()) / (60 * 1000)),
      minutesUntilDeadline: Math.floor((deadline.getTime() - fromDate.getTime()) / (60 * 1000))
    };
  }

  /**
   * Check if a file arrival satisfies the SLA
   * @param {Date} expectedArrivalTime - When file was expected
   * @param {Date} actualArrivalTime - When file actually arrived
   * @param {number} thresholdMinutes - Grace period in minutes
   * @returns {Object} Compliance details
   */
  checkCompliance(expectedArrivalTime, actualArrivalTime, thresholdMinutes = 60) {
    const deadline = new Date(expectedArrivalTime.getTime() + thresholdMinutes * 60 * 1000);
    const isCompliant = actualArrivalTime <= deadline;
    const delay = this.calculateDelay(expectedArrivalTime, actualArrivalTime);

    return {
      isCompliant,
      expectedArrivalTime,
      actualArrivalTime,
      deadline,
      delayMinutes: delay,
      status: isCompliant ? 'on_time' : 'late'
    };
  }
}

module.exports = new SLACalculationService();
