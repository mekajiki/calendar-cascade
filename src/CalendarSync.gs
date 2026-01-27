/**
 * CalCascade Calendar Sync Module
 *
 * Incremental sync using Sync Token to replicate source calendar changes
 * to target calendar as Out of Office events
 */

/**
 * Get changed events from specified calendar
 * If Sync Token exists, get only changes; otherwise, full initial fetch
 *
 * @param {string} calendarId - Source calendar ID
 * @returns {Object[]} Array of changed events
 */
function getChangedEvents(calendarId) {
  const props = PropertiesService.getScriptProperties();
  const syncTokenKey = 'SYNC_TOKEN_' + calendarId;
  const syncToken = props.getProperty(syncTokenKey);
  const config = getConfig();

  let options = {
    singleEvents: true,
    maxResults: 250,
  };

  if (syncToken) {
    // Incremental sync: get only changes with Sync Token
    options.syncToken = syncToken;
    log('Incremental sync: ' + calendarId);
  } else {
    // Initial: get only future events
    options.timeMin = new Date().toISOString();
    options.timeMax = addDays(config.syncDaysAhead).toISOString();
    log('Initial sync: ' + calendarId + ' (' + config.syncDaysAhead + ' days ahead)');
  }

  let allEvents = [];
  let pageToken = null;

  try {
    do {
      if (pageToken) {
        options.pageToken = pageToken;
      }

      const response = Calendar.Events.list(calendarId, options);
      if (response.items) {
        allEvents = allEvents.concat(response.items);
      }

      pageToken = response.nextPageToken;

      // Save Sync Token on last page
      if (!pageToken && response.nextSyncToken) {
        props.setProperty(syncTokenKey, response.nextSyncToken);
        log('Sync Token saved: ' + calendarId);
      }
    } while (pageToken);

  } catch (e) {
    // If Sync Token is invalid (410 Gone), reset and do full sync
    if (e.message.includes('410') || e.message.includes('Sync token')) {
      log('Sync Token invalid, resetting for full sync: ' + calendarId);
      props.deleteProperty(syncTokenKey);
      return getChangedEvents(calendarId);  // Recursive call
    }
    throw e;
  }

  log('Events fetched: ' + allEvents.length);
  return allEvents;
}

/**
 * Execute sync from source calendar
 * @param {string} sourceCalendarId - Source calendar ID
 */
function syncFromCalendar(sourceCalendarId) {
  const config = getConfig();
  log('Sync started: ' + sourceCalendarId + ' -> ' + config.targetCalendarId);

  const events = getChangedEvents(sourceCalendarId);

  let created = 0, updated = 0, deleted = 0, skipped = 0;

  events.forEach(event => {
    try {
      if (event.status === 'cancelled') {
        // Deleted event
        if (deleteTargetEvent(event.id, sourceCalendarId, config)) {
          deleted++;
        }
      } else {
        // Create or update
        const result = upsertTargetEvent(event, sourceCalendarId, config);
        if (result === 'created') created++;
        else if (result === 'updated') updated++;
        else skipped++;
      }
    } catch (e) {
      logError('Event processing error: ' + event.id, e);
    }
  });

  log('Sync complete: created=' + created + ', updated=' + updated + ', deleted=' + deleted + ', skipped=' + skipped);
}

/**
 * Create or update event on target calendar
 * @param {Object} sourceEvent - Source event
 * @param {string} sourceCalendarId - Source calendar ID
 * @param {Object} config - Configuration object
 * @returns {string} 'created', 'updated', or 'skipped'
 */
function upsertTargetEvent(sourceEvent, sourceCalendarId, config) {
  // Skip all-day events and past events
  if (isAllDayEvent(sourceEvent)) {
    return 'skipped';
  }

  if (isPastEvent(sourceEvent)) {
    return 'skipped';
  }

  // Search for existing target event
  const existingEvent = findTargetEvent(sourceEvent.id, sourceCalendarId, config);
  const newHash = computeEventHash(sourceEvent);

  if (existingEvent) {
    // If existing event found, check for changes with hash
    const existingHash = existingEvent.extendedProperties?.private?.[config.tags.contentHash];
    if (existingHash === newHash) {
      return 'skipped';  // No changes
    }

    // Update
    const updatedEvent = buildOutOfOfficeEvent(sourceEvent, sourceCalendarId, config, newHash);
    Calendar.Events.update(updatedEvent, config.targetCalendarId, existingEvent.id);
    log('Updated: ' + sourceEvent.id + ' -> ' + existingEvent.id);
    return 'updated';
  } else {
    // Create new
    const newEvent = buildOutOfOfficeEvent(sourceEvent, sourceCalendarId, config, newHash);
    const created = Calendar.Events.insert(newEvent, config.targetCalendarId);
    log('Created: ' + sourceEvent.id + ' -> ' + created.id);
    return 'created';
  }
}

/**
 * Build Out of Office event object
 * @param {Object} sourceEvent - Source event
 * @param {string} sourceCalendarId - Source calendar ID
 * @param {Object} config - Configuration object
 * @param {string} hash - Content hash
 * @returns {Object} Calendar API event object
 */
function buildOutOfOfficeEvent(sourceEvent, sourceCalendarId, config, hash) {
  return {
    summary: config.eventTitle,
    start: sourceEvent.start,
    end: sourceEvent.end,
    eventType: 'outOfOffice',
    transparency: 'opaque',
    outOfOfficeProperties: {
      autoDeclineMode: 'declineOnlyNewConflictingInvitations',
      declineMessage: config.declineMessage,
    },
    extendedProperties: {
      private: {
        [config.tags.sourceEventId]: sourceEvent.id,
        [config.tags.sourceCalendarId]: sourceCalendarId,
        [config.tags.contentHash]: hash,
      },
    },
  };
}

/**
 * Search for target event corresponding to source event ID
 * @param {string} sourceEventId - Source event ID
 * @param {string} sourceCalendarId - Source calendar ID
 * @param {Object} config - Configuration object
 * @returns {Object|null} Target event, or null if not found
 */
function findTargetEvent(sourceEventId, sourceCalendarId, config) {
  // Search by extendedProperties private property
  const query = config.tags.sourceEventId + '=' + sourceEventId;

  try {
    const response = Calendar.Events.list(config.targetCalendarId, {
      privateExtendedProperty: query,
      singleEvents: true,
      maxResults: 10,
    });

    if (response.items && response.items.length > 0) {
      // Find event from same source calendar
      for (const event of response.items) {
        const eventSourceCalendarId = event.extendedProperties?.private?.[config.tags.sourceCalendarId];
        if (eventSourceCalendarId === sourceCalendarId) {
          return event;
        }
      }
    }
  } catch (e) {
    logError('Target event search error', e);
  }

  return null;
}

/**
 * Delete target event
 * @param {string} sourceEventId - Source event ID
 * @param {string} sourceCalendarId - Source calendar ID
 * @param {Object} config - Configuration object
 * @returns {boolean} True if deletion succeeded
 */
function deleteTargetEvent(sourceEventId, sourceCalendarId, config) {
  const existingEvent = findTargetEvent(sourceEventId, sourceCalendarId, config);

  if (existingEvent) {
    try {
      Calendar.Events.remove(config.targetCalendarId, existingEvent.id);
      log('Deleted: ' + sourceEventId + ' -> ' + existingEvent.id);
      return true;
    } catch (e) {
      // Ignore if already deleted
      if (!e.message.includes('404')) {
        logError('Event deletion error', e);
      }
    }
  }

  return false;
}

/**
 * Check if event is all-day event
 * @param {Object} event - Calendar API event
 * @returns {boolean} True if all-day event
 */
function isAllDayEvent(event) {
  return !!(event.start?.date && !event.start?.dateTime);
}

/**
 * Check if event is in the past
 * @param {Object} event - Calendar API event
 * @returns {boolean} True if past event
 */
function isPastEvent(event) {
  const endTime = event.end?.dateTime || event.end?.date;
  if (!endTime) return false;
  return new Date(endTime) < new Date();
}
