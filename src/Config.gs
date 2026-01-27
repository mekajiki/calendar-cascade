/**
 * CalCascade Configuration Module
 *
 * Calendar IDs are retrieved from Script Properties (not included in source code)
 *
 * Setup:
 *   GAS Editor -> Project Settings -> Script Properties
 *
 * Required properties:
 *   SOURCE_CALENDAR_IDS - Source calendar IDs (comma-separated for multiple)
 *   TARGET_CALENDAR_ID  - Target calendar ID (defaults to 'primary')
 */

/**
 * Get configuration object
 * @returns {Object} Configuration object
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    // Retrieved from Script Properties (comma-separated for multiple)
    sourceCalendarIds: parseCalendarIds(props.getProperty('SOURCE_CALENDAR_IDS')),
    targetCalendarId: props.getProperty('TARGET_CALENDAR_ID') || 'primary',

    // Fixed settings
    syncDaysAhead: 90,
    eventTitle: 'Private Block',
    declineMessage: 'Busy with personal matters.',

    // Tags for incremental sync (extendedProperties key names)
    tags: {
      sourceEventId: 'calcascade_source_event_id',
      sourceCalendarId: 'calcascade_source_calendar_id',
      contentHash: 'calcascade_content_hash',
    },
  };
}

/**
 * Parse comma-separated calendar ID string
 * @param {string} value - Comma-separated string
 * @returns {string[]} Array of calendar IDs
 */
function parseCalendarIds(value) {
  if (!value) {
    return [];
  }
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Validate configuration
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validateConfig() {
  const config = getConfig();
  const errors = [];

  if (config.sourceCalendarIds.length === 0) {
    errors.push('SOURCE_CALENDAR_IDS is not set');
  }

  if (!config.targetCalendarId) {
    errors.push('TARGET_CALENDAR_ID is not set');
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}
