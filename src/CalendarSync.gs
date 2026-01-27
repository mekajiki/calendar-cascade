/**
 * CalCascade Calendar Sync Module
 *
 * Sync Tokenを使用した差分同期でソースカレンダーの変更を
 * ターゲットカレンダーにOut of Officeイベントとして反映
 */

/**
 * 指定カレンダーから変更イベントを取得
 * Sync Tokenがあれば差分のみ、なければ初回フル取得
 *
 * @param {string} calendarId - ソースカレンダーID
 * @returns {Object[]} 変更されたイベントの配列
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
    // 差分同期: Sync Tokenで変更分のみ取得
    options.syncToken = syncToken;
    log('差分同期: ' + calendarId);
  } else {
    // 初回: 未来の予定のみ取得
    options.timeMin = new Date().toISOString();
    options.timeMax = addDays(config.syncDaysAhead).toISOString();
    log('初回同期: ' + calendarId + ' (' + config.syncDaysAhead + '日先まで)');
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

      // 最後のページでSync Tokenを保存
      if (!pageToken && response.nextSyncToken) {
        props.setProperty(syncTokenKey, response.nextSyncToken);
        log('Sync Token保存: ' + calendarId);
      }
    } while (pageToken);

  } catch (e) {
    // Sync Tokenが無効になった場合（410 Gone）はリセットしてフル同期
    if (e.message.includes('410') || e.message.includes('Sync token')) {
      log('Sync Tokenが無効、リセットしてフル同期: ' + calendarId);
      props.deleteProperty(syncTokenKey);
      return getChangedEvents(calendarId);  // 再帰呼び出し
    }
    throw e;
  }

  log('取得イベント数: ' + allEvents.length);
  return allEvents;
}

/**
 * ソースカレンダーから同期を実行
 * @param {string} sourceCalendarId - ソースカレンダーID
 */
function syncFromCalendar(sourceCalendarId) {
  const config = getConfig();
  log('同期開始: ' + sourceCalendarId + ' → ' + config.targetCalendarId);

  const events = getChangedEvents(sourceCalendarId);

  let created = 0, updated = 0, deleted = 0, skipped = 0;

  events.forEach(event => {
    try {
      if (event.status === 'cancelled') {
        // 削除されたイベント
        if (deleteTargetEvent(event.id, sourceCalendarId, config)) {
          deleted++;
        }
      } else {
        // 作成または更新
        const result = upsertTargetEvent(event, sourceCalendarId, config);
        if (result === 'created') created++;
        else if (result === 'updated') updated++;
        else skipped++;
      }
    } catch (e) {
      logError('イベント処理エラー: ' + event.id, e);
    }
  });

  log('同期完了: 作成=' + created + ', 更新=' + updated + ', 削除=' + deleted + ', スキップ=' + skipped);
}

/**
 * ターゲットカレンダーにイベントを作成または更新
 * @param {Object} sourceEvent - ソースイベント
 * @param {string} sourceCalendarId - ソースカレンダーID
 * @param {Object} config - 設定オブジェクト
 * @returns {string} 'created', 'updated', または 'skipped'
 */
function upsertTargetEvent(sourceEvent, sourceCalendarId, config) {
  // 終日イベントや過去のイベントはスキップ
  if (isAllDayEvent(sourceEvent)) {
    return 'skipped';
  }

  if (isPastEvent(sourceEvent)) {
    return 'skipped';
  }

  // 既存のターゲットイベントを検索
  const existingEvent = findTargetEvent(sourceEvent.id, sourceCalendarId, config);
  const newHash = computeEventHash(sourceEvent);

  if (existingEvent) {
    // 既存イベントがある場合、ハッシュで変更を確認
    const existingHash = existingEvent.extendedProperties?.private?.[config.tags.contentHash];
    if (existingHash === newHash) {
      return 'skipped';  // 変更なし
    }

    // 更新
    const updatedEvent = buildOutOfOfficeEvent(sourceEvent, sourceCalendarId, config, newHash);
    Calendar.Events.update(updatedEvent, config.targetCalendarId, existingEvent.id);
    log('更新: ' + sourceEvent.id + ' → ' + existingEvent.id);
    return 'updated';
  } else {
    // 新規作成
    const newEvent = buildOutOfOfficeEvent(sourceEvent, sourceCalendarId, config, newHash);
    const created = Calendar.Events.insert(newEvent, config.targetCalendarId);
    log('作成: ' + sourceEvent.id + ' → ' + created.id);
    return 'created';
  }
}

/**
 * Out of Officeイベントオブジェクトを構築
 * @param {Object} sourceEvent - ソースイベント
 * @param {string} sourceCalendarId - ソースカレンダーID
 * @param {Object} config - 設定オブジェクト
 * @param {string} hash - コンテンツハッシュ
 * @returns {Object} Calendar APIイベントオブジェクト
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
 * ソースイベントIDに対応するターゲットイベントを検索
 * @param {string} sourceEventId - ソースイベントID
 * @param {string} sourceCalendarId - ソースカレンダーID
 * @param {Object} config - 設定オブジェクト
 * @returns {Object|null} ターゲットイベント、見つからない場合はnull
 */
function findTargetEvent(sourceEventId, sourceCalendarId, config) {
  // extendedPropertiesのprivateプロパティで検索
  const query = config.tags.sourceEventId + '=' + sourceEventId;

  try {
    const response = Calendar.Events.list(config.targetCalendarId, {
      privateExtendedProperty: query,
      singleEvents: true,
      maxResults: 10,
    });

    if (response.items && response.items.length > 0) {
      // 同じソースカレンダーからのイベントを探す
      for (const event of response.items) {
        const eventSourceCalendarId = event.extendedProperties?.private?.[config.tags.sourceCalendarId];
        if (eventSourceCalendarId === sourceCalendarId) {
          return event;
        }
      }
    }
  } catch (e) {
    logError('ターゲットイベント検索エラー', e);
  }

  return null;
}

/**
 * ターゲットイベントを削除
 * @param {string} sourceEventId - ソースイベントID
 * @param {string} sourceCalendarId - ソースカレンダーID
 * @param {Object} config - 設定オブジェクト
 * @returns {boolean} 削除成功時true
 */
function deleteTargetEvent(sourceEventId, sourceCalendarId, config) {
  const existingEvent = findTargetEvent(sourceEventId, sourceCalendarId, config);

  if (existingEvent) {
    try {
      Calendar.Events.remove(config.targetCalendarId, existingEvent.id);
      log('削除: ' + sourceEventId + ' → ' + existingEvent.id);
      return true;
    } catch (e) {
      // 既に削除済みの場合は無視
      if (!e.message.includes('404')) {
        logError('イベント削除エラー', e);
      }
    }
  }

  return false;
}

/**
 * 終日イベントかどうかを判定
 * @param {Object} event - Calendar APIイベント
 * @returns {boolean} 終日イベントの場合true
 */
function isAllDayEvent(event) {
  return !!(event.start?.date && !event.start?.dateTime);
}

/**
 * 過去のイベントかどうかを判定
 * @param {Object} event - Calendar APIイベント
 * @returns {boolean} 過去のイベントの場合true
 */
function isPastEvent(event) {
  const endTime = event.end?.dateTime || event.end?.date;
  if (!endTime) return false;
  return new Date(endTime) < new Date();
}
