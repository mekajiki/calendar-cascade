/**
 * CalCascade Configuration Module
 *
 * カレンダーIDはScript Propertiesから取得（ソースコードに含めない）
 *
 * 設定方法:
 *   GASエディタ → プロジェクトの設定 → スクリプトプロパティ
 *
 * 必要なプロパティ:
 *   SOURCE_CALENDAR_IDS - ソースカレンダーID（カンマ区切りで複数指定可）
 *   TARGET_CALENDAR_ID  - ターゲットカレンダーID（省略時は 'primary'）
 */

/**
 * 設定オブジェクトを取得
 * @returns {Object} 設定オブジェクト
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    // Script Propertiesから取得（カンマ区切りで複数指定可）
    sourceCalendarIds: parseCalendarIds(props.getProperty('SOURCE_CALENDAR_IDS')),
    targetCalendarId: props.getProperty('TARGET_CALENDAR_ID') || 'primary',

    // 固定設定
    syncDaysAhead: 90,
    eventTitle: 'Private Block',
    declineMessage: 'Busy with personal matters.',

    // 差分同期用タグ（extendedPropertiesのキー名）
    tags: {
      sourceEventId: 'calcascade_source_event_id',
      sourceCalendarId: 'calcascade_source_calendar_id',
      contentHash: 'calcascade_content_hash',
    },
  };
}

/**
 * カンマ区切りのカレンダーID文字列をパース
 * @param {string} value - カンマ区切りの文字列
 * @returns {string[]} カレンダーIDの配列
 */
function parseCalendarIds(value) {
  if (!value) {
    return [];
  }
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * 設定が有効かどうかを検証
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validateConfig() {
  const config = getConfig();
  const errors = [];

  if (config.sourceCalendarIds.length === 0) {
    errors.push('SOURCE_CALENDAR_IDS が設定されていません');
  }

  if (!config.targetCalendarId) {
    errors.push('TARGET_CALENDAR_ID が設定されていません');
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}
