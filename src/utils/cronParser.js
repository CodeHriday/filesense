/**
 * Parse cron expression to human-readable format
 * @param {string} cronExpression - Cron expression (e.g., "0 3 * * *")
 * @returns {string} Human-readable description
 */
export const parseCronExpression = (cronExpression) => {
  if (!cronExpression || cronExpression === '* * * * *') {
    return 'Every minute';
  }

  const parts = cronExpression.trim().split(' ');
  if (parts.length < 5) {
    return 'Custom';
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Daily pattern: "0 3 * * *" (every day at 3:00 AM)
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '0' && hour !== '*') {
      const h = parseInt(hour);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return `Daily at ${displayHour}:00 ${ampm}`;
    }
    if (minute !== '*' && hour !== '*') {
      const h = parseInt(hour);
      const m = parseInt(minute);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return `Daily at ${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
  }

  // Weekly pattern: "0 3 * * 1" (every Monday at 3:00 AM)
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && !dayOfWeek.includes(',') && !dayOfWeek.includes('-')) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[parseInt(dayOfWeek) % 7];
    if (minute === '0' && hour !== '*') {
      const h = parseInt(hour);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return `Weekly on ${dayName} at ${displayHour}:00 ${ampm}`;
    }
  }

  // Monthly pattern: "0 3 1 * *" (first day of every month at 3:00 AM)
  if (dayOfMonth !== '*' && !dayOfMonth.includes(',') && !dayOfMonth.includes('-') && month === '*' && dayOfWeek === '*') {
    const day = parseInt(dayOfMonth);
    if (minute === '0' && hour !== '*') {
      const h = parseInt(hour);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return `Monthly on day ${day} at ${displayHour}:00 ${ampm}`;
    }
  }

  // Hourly pattern: "0 * * * *" (every hour)
  if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '0') {
      return 'Hourly';
    }
    return `Hourly at ${minute} minutes past`;
  }

  return 'Custom schedule';
};
