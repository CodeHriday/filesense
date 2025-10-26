/**
 * Cron Expression Describer
 * Converts cron expressions to human-readable frequency descriptions
 */

/**
 * Convert cron expression to human-readable text
 * @param {string} cronExpression - Standard cron expression (5 fields: min hour day month dayOfWeek)
 * @returns {string} Human-readable description
 */
function describeCronExpression(cronExpression) {
  if (!cronExpression || typeof cronExpression !== 'string') {
    return 'Custom Schedule';
  }

  const parts = cronExpression.trim().split(/\s+/);
  
  // Support both 5-field and 6-field cron (ignore seconds if present)
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.length === 6 ? parts.slice(1) : parts;
  
  // Check for common patterns
  
  // Every minute: * * * * *
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every Minute';
  }
  
  // Every N minutes: */N * * * *
  const everyNMinutes = minute.match(/^\*\/(\d+)$/);
  if (everyNMinutes && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = everyNMinutes[1];
    return `Every ${n} Minutes`;
  }
  
  // Hourly: 0 * * * * or specific minute
  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '0') {
      return 'Hourly';
    }
    return `Hourly (at :${minute.padStart(2, '0')})`;
  }
  
  // Every N hours: 0 */N * * *
  const everyNHours = hour.match(/^\*\/(\d+)$/);
  if (everyNHours && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = everyNHours[1];
    const time = minute === '0' ? '' : ` at :${minute.padStart(2, '0')}`;
    return `Every ${n} Hours${time}`;
  }
  
  // Daily: 0 0 * * *
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const time = formatTime(hour, minute);
    return `Daily at ${time}`;
  }
  
  // Weekly: 0 0 * * N (specific day)
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && !dayOfWeek.includes(',') && !dayOfWeek.includes('-') && !dayOfWeek.includes('/')) {
    const dayName = getDayName(dayOfWeek);
    const time = formatTime(hour, minute);
    return `Weekly on ${dayName} at ${time}`;
  }
  
  // Monthly: 0 0 1 * * (first day of month)
  if (month === '*' && dayOfWeek === '*' && dayOfMonth !== '*' && !dayOfMonth.includes(',') && !dayOfMonth.includes('-') && !dayOfMonth.includes('/')) {
    const time = formatTime(hour, minute);
    const ordinal = getOrdinal(dayOfMonth);
    return `Monthly on the ${ordinal} at ${time}`;
  }
  
  // Yearly: 0 0 1 1 * (Jan 1st)
  if (dayOfWeek === '*' && month !== '*' && !month.includes(',') && !month.includes('-') && !month.includes('/')) {
    const monthName = getMonthName(month);
    const ordinal = dayOfMonth === '*' ? '1st' : getOrdinal(dayOfMonth);
    const time = formatTime(hour, minute);
    return `Yearly on ${monthName} ${ordinal} at ${time}`;
  }
  
  // Multiple specific times per day
  if (hour.includes(',') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Multiple times daily`;
  }
  
  // Multiple days per week
  if (dayOfWeek.includes(',') && dayOfMonth === '*' && month === '*') {
    return `Multiple days per week`;
  }
  
  // Default to showing the expression
  return `Custom: ${cronExpression}`;
}

/**
 * Format hour and minute to readable time
 */
function formatTime(hour, minute) {
  const h = hour === '*' ? '00' : hour.padStart(2, '0');
  const m = minute === '*' ? '00' : minute.padStart(2, '0');
  
  const hourNum = parseInt(h);
  const minuteNum = parseInt(m);
  
  if (hourNum === 0 && minuteNum === 0) {
    return 'midnight';
  }
  if (hourNum === 12 && minuteNum === 0) {
    return 'noon';
  }
  
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const hour12 = hourNum % 12 || 12;
  const minuteStr = minuteNum > 0 ? `:${m}` : '';
  
  return `${hour12}${minuteStr} ${ampm}`;
}

/**
 * Get day name from cron day of week value (0-6, Sunday=0)
 */
function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = parseInt(dayOfWeek);
  return days[day] || dayOfWeek;
}

/**
 * Get month name from cron month value (1-12)
 */
function getMonthName(month) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const m = parseInt(month);
  return months[m - 1] || month;
}

/**
 * Get ordinal suffix for day (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(day) {
  const d = parseInt(day);
  if (d >= 11 && d <= 13) return `${d}th`;
  const lastDigit = d % 10;
  if (lastDigit === 1) return `${d}st`;
  if (lastDigit === 2) return `${d}nd`;
  if (lastDigit === 3) return `${d}rd`;
  return `${d}th`;
}

module.exports = {
  describeCronExpression
};
