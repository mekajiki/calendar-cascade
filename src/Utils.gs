/**
 * CalCascade Utility Functions
 */

/**
 * Test calendar access
 * Verify access to configured calendars
 */
function testCalendarAccess() {
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('Configuration error:');
    validation.errors.forEach(err => console.error('  - ' + err));
    console.log('\nPlease set Script Properties:');
    console.log('  GAS Editor -> Project Settings -> Script Properties');
    return;
  }

  const config = getConfig();
  console.log('=== CalCascade Calendar Access Test ===\n');

  // Test source calendars
  console.log('[Source Calendars]');
  config.sourceCalendarIds.forEach(calendarId => {
    try {
      const calendar = CalendarApp.getCalendarById(calendarId);
      if (calendar) {
        console.log('OK: ' + calendarId + ' - Accessible (' + calendar.getName() + ')');
      } else {
        console.log('NG: ' + calendarId + ' - Calendar not found');
      }
    } catch (e) {
      console.log('NG: ' + calendarId + ' - Error: ' + e.message);
    }
  });

  // Test target calendar
  console.log('\n[Target Calendar]');
  try {
    const targetCalendar = config.targetCalendarId === 'primary'
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(config.targetCalendarId);

    if (targetCalendar) {
      console.log('OK: ' + config.targetCalendarId + ' - Accessible (' + targetCalendar.getName() + ')');

      // Test Calendar API Advanced Service
      try {
        Calendar.Events.list(config.targetCalendarId, { maxResults: 1 });
        console.log('OK: Calendar API Advanced Service - Enabled');
      } catch (e) {
        console.log('NG: Calendar API Advanced Service - Disabled or not configured');
        console.log('  -> Add Google Calendar API from Services menu in GAS Editor');
      }
    } else {
      console.log('NG: ' + config.targetCalendarId + ' - Calendar not found');
    }
  } catch (e) {
    console.log('NG: ' + config.targetCalendarId + ' - Error: ' + e.message);
  }

  console.log('\n=== Test Complete ===');
}

/**
 * Compute hash from event content
 * Used for change detection
 * @param {Object} event - Calendar API event object
 * @returns {string} Hash string
 */
function computeEventHash(event) {
  const content = [
    event.start?.dateTime || event.start?.date || '',
    event.end?.dateTime || event.end?.date || '',
    event.status || '',
  ].join('|');

  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, content)
  );
}

/**
 * Get Date after specified days from now
 * @param {number} days - Number of days
 * @returns {Date} Calculated Date
 */
function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Log output with timestamp
 * @param {string} message - Log message
 */
function log(message) {
  console.log('[' + new Date().toISOString() + '] ' + message);
}

/**
 * Error log output
 * @param {string} message - Error message
 * @param {Error} [error] - Error object
 */
function logError(message, error) {
  console.error('[' + new Date().toISOString() + '] ERROR: ' + message);
  if (error) {
    console.error('  ' + error.message);
    if (error.stack) {
      console.error('  ' + error.stack);
    }
  }
}
