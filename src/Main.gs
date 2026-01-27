/**
 * CalCascade Main Module
 *
 * Entry point and trigger management
 */

/**
 * Initial setup: Create EventUpdated trigger for each source calendar
 * Run manually only once
 */
function setupTriggers() {
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('Configuration error:');
    validation.errors.forEach(err => console.error('  - ' + err));
    return;
  }

  const config = getConfig();

  // Check existing triggers
  const existingTriggers = ScriptApp.getProjectTriggers();
  const existingCalendarIds = new Set();

  existingTriggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onCalendarChange') {
      existingCalendarIds.add(trigger.getTriggerSourceId());
    }
  });

  // Create trigger for each source calendar
  config.sourceCalendarIds.forEach(calendarId => {
    if (existingCalendarIds.has(calendarId)) {
      log('Trigger exists: ' + calendarId);
      return;
    }

    try {
      ScriptApp.newTrigger('onCalendarChange')
        .forUserCalendar(calendarId)
        .onEventUpdated()
        .create();
      log('Trigger created: ' + calendarId);
    } catch (e) {
      logError('Trigger creation error: ' + calendarId, e);
    }
  });

  log('Trigger setup complete');
}

/**
 * Callback fired automatically on calendar change
 * @param {Object} e - Trigger event object
 */
function onCalendarChange(e) {
  if (!e || !e.calendarId) {
    logError('Invalid trigger event');
    return;
  }

  log('Calendar change detected: ' + e.calendarId);

  try {
    syncFromCalendar(e.calendarId);
  } catch (error) {
    logError('Sync error: ' + e.calendarId, error);
  }
}

/**
 * Full sync from all source calendars
 * For catching missed events, run manually or on schedule
 */
function fullSync() {
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('Configuration error:');
    validation.errors.forEach(err => console.error('  - ' + err));
    return;
  }

  const config = getConfig();
  log('=== Full sync started ===');

  config.sourceCalendarIds.forEach(calendarId => {
    try {
      syncFromCalendar(calendarId);
    } catch (e) {
      logError('Sync error: ' + calendarId, e);
    }
  });

  log('=== Full sync complete ===');
}

/**
 * Reset Sync Tokens to force full sync on next run
 */
function resetSyncTokens() {
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();

  config.sourceCalendarIds.forEach(calendarId => {
    const key = 'SYNC_TOKEN_' + calendarId;
    props.deleteProperty(key);
    log('Sync Token reset: ' + calendarId);
  });

  log('All Sync Tokens reset. Full sync will run on next execution.');
}

/**
 * Remove all triggers
 */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onCalendarChange') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  log('Triggers removed: ' + removed);
}

/**
 * Display current configuration and trigger status
 */
function showStatus() {
  const validation = validateConfig();
  const config = getConfig();
  const triggers = ScriptApp.getProjectTriggers();

  console.log('=== CalCascade Status ===\n');

  // Configuration
  console.log('[Configuration]');
  if (validation.valid) {
    console.log('Source calendars:');
    config.sourceCalendarIds.forEach(id => console.log('  - ' + id));
    console.log('Target calendar: ' + config.targetCalendarId);
    console.log('Sync range: ' + config.syncDaysAhead + ' days ahead');
    console.log('Event title: ' + config.eventTitle);
  } else {
    console.log('NG: Configuration error:');
    validation.errors.forEach(err => console.log('  - ' + err));
  }

  // Triggers
  console.log('\n[Triggers]');
  const calendarTriggers = triggers.filter(t => t.getHandlerFunction() === 'onCalendarChange');
  if (calendarTriggers.length > 0) {
    calendarTriggers.forEach(t => {
      console.log('  - ' + t.getTriggerSourceId() + ' (EventUpdated)');
    });
  } else {
    console.log('  No triggers (run setupTriggers)');
  }

  // Sync Token
  console.log('\n[Sync Token]');
  const props = PropertiesService.getScriptProperties();
  config.sourceCalendarIds.forEach(calendarId => {
    const token = props.getProperty('SYNC_TOKEN_' + calendarId);
    console.log('  ' + calendarId + ': ' + (token ? 'Saved' : 'Not acquired'));
  });

  console.log('\n=== Status display complete ===');
}
