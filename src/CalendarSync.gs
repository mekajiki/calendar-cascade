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
  // One change often fires EventUpdated more than once. Without the lock,
  // concurrent runs read the same Sync Token, both miss the copy and both insert it.
  const lock = LockService.getScriptLock();
  lock.waitLock(5 * 60 * 1000);
  try {
    syncFromCalendarLocked(sourceCalendarId);
  } finally {
    lock.releaseLock();
  }
}

function syncFromCalendarLocked(sourceCalendarId) {
  const config = getConfig();
  log('Sync started: ' + sourceCalendarId + ' -> ' + config.targetCalendarId);

  const events = getChangedEvents(sourceCalendarId);

  let created = 0, updated = 0, deleted = 0, skipped = 0;

  events.forEach(event => {
    try {
      if (event.status === 'cancelled' || !isAcceptedEvent(event)) {
        // Deleted or not-accepted event: remove existing copy if any
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

  // Search for existing target event; drop duplicates left by earlier runs
  const [existingEvent, ...duplicates] = findTargetEvents(sourceEvent.id, sourceCalendarId, config);
  duplicates.forEach(event => {
    Calendar.Events.remove(config.targetCalendarId, event.id);
    log('Removed duplicate: ' + sourceEvent.id + ' -> ' + event.id);
  });
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
    reminders: {
      useDefault: false,
      overrides: [],
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
 * Search for target events corresponding to source event ID
 * Errors propagate: treating a failed search as "not found" would insert a duplicate
 * @param {string} sourceEventId - Source event ID
 * @param {string} sourceCalendarId - Source calendar ID
 * @param {Object} config - Configuration object
 * @returns {Object[]} Target events from the same source calendar (empty if none)
 */
function findTargetEvents(sourceEventId, sourceCalendarId, config) {
  const response = Calendar.Events.list(config.targetCalendarId, {
    privateExtendedProperty: config.tags.sourceEventId + '=' + sourceEventId,
    singleEvents: true,
    maxResults: 250,
  });
  return (response.items || []).filter(event =>
    event.extendedProperties?.private?.[config.tags.sourceCalendarId] === sourceCalendarId
  );
}

/**
 * Delete target event
 * @param {string} sourceEventId - Source event ID
 * @param {string} sourceCalendarId - Source calendar ID
 * @param {Object} config - Configuration object
 * @returns {boolean} True if any copy was deleted
 */
function deleteTargetEvent(sourceEventId, sourceCalendarId, config) {
  const existingEvents = findTargetEvents(sourceEventId, sourceCalendarId, config);

  existingEvents.forEach(event => {
    Calendar.Events.remove(config.targetCalendarId, event.id);
    log('Deleted: ' + sourceEventId + ' -> ' + event.id);
  });

  return existingEvents.length > 0;
}

/**
 * Check if the calendar owner is attending the event
 * Events without invitees (own events) count as attending
 * @param {Object} event - Calendar API event
 * @returns {boolean} True if attending
 */
function isAcceptedEvent(event) {
  if (!event.attendees) {
    return true;
  }
  const self = event.attendees.find(a => a.self);
  if (!self) {
    return true;
  }
  return self.responseStatus === 'accepted';
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
