/**
 * CalCascade Utility Functions
 */

/**
 * カレンダーアクセスをテスト
 * 設定されたカレンダーにアクセスできるか確認する
 */
function testCalendarAccess() {
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('設定エラー:');
    validation.errors.forEach(err => console.error('  - ' + err));
    console.log('\nScript Propertiesを設定してください:');
    console.log('  GASエディタ → プロジェクトの設定 → スクリプトプロパティ');
    return;
  }

  const config = getConfig();
  console.log('=== CalCascade カレンダーアクセステスト ===\n');

  // ソースカレンダーのテスト
  console.log('【ソースカレンダー】');
  config.sourceCalendarIds.forEach(calendarId => {
    try {
      const calendar = CalendarApp.getCalendarById(calendarId);
      if (calendar) {
        console.log('✓ ' + calendarId + ' - アクセス可能 (' + calendar.getName() + ')');
      } else {
        console.log('✗ ' + calendarId + ' - カレンダーが見つかりません');
      }
    } catch (e) {
      console.log('✗ ' + calendarId + ' - エラー: ' + e.message);
    }
  });

  // ターゲットカレンダーのテスト
  console.log('\n【ターゲットカレンダー】');
  try {
    const targetCalendar = config.targetCalendarId === 'primary'
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(config.targetCalendarId);

    if (targetCalendar) {
      console.log('✓ ' + config.targetCalendarId + ' - アクセス可能 (' + targetCalendar.getName() + ')');

      // Calendar API Advanced Serviceのテスト
      try {
        Calendar.Events.list(config.targetCalendarId, { maxResults: 1 });
        console.log('✓ Calendar API Advanced Service - 有効');
      } catch (e) {
        console.log('✗ Calendar API Advanced Service - 無効または未設定');
        console.log('  → GASエディタ左側「サービス」→「+」→「Google Calendar API」を追加してください');
      }
    } else {
      console.log('✗ ' + config.targetCalendarId + ' - カレンダーが見つかりません');
    }
  } catch (e) {
    console.log('✗ ' + config.targetCalendarId + ' - エラー: ' + e.message);
  }

  console.log('\n=== テスト完了 ===');
}

/**
 * イベントの内容からハッシュを計算
 * 変更検知に使用
 * @param {Object} event - Calendar APIのイベントオブジェクト
 * @returns {string} ハッシュ文字列
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
 * 現在時刻から指定日数後のDateを取得
 * @param {number} days - 日数
 * @returns {Date} 計算後のDate
 */
function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * ログ出力（タイムスタンプ付き）
 * @param {string} message - ログメッセージ
 */
function log(message) {
  console.log('[' + new Date().toISOString() + '] ' + message);
}

/**
 * エラーログ出力
 * @param {string} message - エラーメッセージ
 * @param {Error} [error] - エラーオブジェクト
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
