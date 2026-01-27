/**
 * CalCascade Main Module
 *
 * エントリーポイントとトリガー管理
 */

/**
 * 初期セットアップ: ソースカレンダーごとにEventUpdatedトリガーを作成
 * 初回のみ手動実行
 */
function setupTriggers() {
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('設定エラー:');
    validation.errors.forEach(err => console.error('  - ' + err));
    return;
  }

  const config = getConfig();

  // 既存のトリガーを確認
  const existingTriggers = ScriptApp.getProjectTriggers();
  const existingCalendarIds = new Set();

  existingTriggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onCalendarChange') {
      existingCalendarIds.add(trigger.getTriggerSourceId());
    }
  });

  // 各ソースカレンダーにトリガーを作成
  config.sourceCalendarIds.forEach(calendarId => {
    if (existingCalendarIds.has(calendarId)) {
      log('トリガー既存: ' + calendarId);
      return;
    }

    try {
      ScriptApp.newTrigger('onCalendarChange')
        .forUserCalendar(calendarId)
        .onEventUpdated()
        .create();
      log('トリガー作成: ' + calendarId);
    } catch (e) {
      logError('トリガー作成エラー: ' + calendarId, e);
    }
  });

  log('トリガーセットアップ完了');
}

/**
 * カレンダー変更時に自動発火するコールバック
 * @param {Object} e - トリガーイベントオブジェクト
 */
function onCalendarChange(e) {
  if (!e || !e.calendarId) {
    logError('無効なトリガーイベント');
    return;
  }

  log('カレンダー変更検知: ' + e.calendarId);

  try {
    syncFromCalendar(e.calendarId);
  } catch (error) {
    logError('同期エラー: ' + e.calendarId, error);
  }
}

/**
 * 全ソースカレンダーからフル同期
 * 取りこぼし対応用、手動実行または定期実行で使用
 */
function fullSync() {
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('設定エラー:');
    validation.errors.forEach(err => console.error('  - ' + err));
    return;
  }

  const config = getConfig();
  log('=== フル同期開始 ===');

  config.sourceCalendarIds.forEach(calendarId => {
    try {
      syncFromCalendar(calendarId);
    } catch (e) {
      logError('同期エラー: ' + calendarId, e);
    }
  });

  log('=== フル同期完了 ===');
}

/**
 * Sync Tokenをリセットして次回フル同期を強制
 */
function resetSyncTokens() {
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();

  config.sourceCalendarIds.forEach(calendarId => {
    const key = 'SYNC_TOKEN_' + calendarId;
    props.deleteProperty(key);
    log('Sync Tokenリセット: ' + calendarId);
  });

  log('全Sync Tokenをリセットしました。次回実行時にフル同期されます。');
}

/**
 * 全トリガーを削除
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

  log('トリガー削除: ' + removed + '件');
}

/**
 * 現在の設定とトリガー状態を表示
 */
function showStatus() {
  const validation = validateConfig();
  const config = getConfig();
  const triggers = ScriptApp.getProjectTriggers();

  console.log('=== CalCascade ステータス ===\n');

  // 設定
  console.log('【設定】');
  if (validation.valid) {
    console.log('ソースカレンダー:');
    config.sourceCalendarIds.forEach(id => console.log('  - ' + id));
    console.log('ターゲットカレンダー: ' + config.targetCalendarId);
    console.log('同期範囲: ' + config.syncDaysAhead + '日先まで');
    console.log('イベントタイトル: ' + config.eventTitle);
  } else {
    console.log('✗ 設定エラー:');
    validation.errors.forEach(err => console.log('  - ' + err));
  }

  // トリガー
  console.log('\n【トリガー】');
  const calendarTriggers = triggers.filter(t => t.getHandlerFunction() === 'onCalendarChange');
  if (calendarTriggers.length > 0) {
    calendarTriggers.forEach(t => {
      console.log('  - ' + t.getTriggerSourceId() + ' (EventUpdated)');
    });
  } else {
    console.log('  トリガーなし（setupTriggersを実行してください）');
  }

  // Sync Token
  console.log('\n【Sync Token】');
  const props = PropertiesService.getScriptProperties();
  config.sourceCalendarIds.forEach(calendarId => {
    const token = props.getProperty('SYNC_TOKEN_' + calendarId);
    console.log('  ' + calendarId + ': ' + (token ? '保存済み' : '未取得'));
  });

  console.log('\n=== ステータス表示完了 ===');
}
