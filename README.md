# CalCascade

個人カレンダーの予定を仕事用カレンダーに **Out of Office** イベントとして自動ブロックする Google Apps Script プロジェクト。

## 概要

- 個人アカウントのカレンダーに入れた予定を、仕事用アカウントのプライマリカレンダーに「Private Block」として自動反映
- 他者から見ると「不在」として表示される
- カレンダー変更時に即時同期（EventUpdated トリガー + Sync Token）

## 機能

- **リアルタイム同期**: カレンダー変更時に即時発火
- **差分同期**: Sync Token で変更イベントのみ取得
- **Out of Office イベント**: 新規の予定招待を自動辞退
- **複数カレンダー対応**: 複数のソースカレンダーを同期可能

## セットアップ

### 前提条件

- Node.js 20+
- [clasp](https://github.com/google/clasp) がインストール済み
- Google Apps Script プロジェクトを作成済み

### 1. リポジトリをクローン

```bash
git clone https://github.com/Mekajiki/calendar-cascade.git
cd calendar-cascade
npm install
```

### 2. clasp 設定

```bash
# clasp にログイン（初回のみ）
npx clasp login

# .clasp.json を作成（既存プロジェクトにリンク）
npx clasp clone <SCRIPT_ID> --rootDir src
# または新規作成
npx clasp create --title "CalCascade" --rootDir src
```

### 3. GAS にプッシュ

```bash
npm run push
```

### 4. GAS エディタで設定

1. `npm run open` でブラウザで開く

2. **Calendar API Advanced Service を有効化**
   - 左側「サービス」→「+」→「Google Calendar API」を追加

3. **Script Properties を設定**
   - プロジェクトの設定 → スクリプトプロパティ
   - 以下を追加:

   | プロパティ名 | 値の例 |
   |------------|-------|
   | `SOURCE_CALENDAR_IDS` | `personal@gmail.com, family@group.calendar.google.com` |
   | `TARGET_CALENDAR_ID` | `primary` |

### 5. 動作確認

1. `testCalendarAccess` を実行してカレンダーアクセス確認
2. `setupTriggers` を実行してトリガーを設定
3. `showStatus` で設定状態を確認

### 6. 個人カレンダーの共有設定

**重要**: 個人カレンダーを仕事用アカウントに共有する必要があります。

1. 個人アカウントで Google カレンダーを開く
2. 設定 → カレンダーの設定 → 特定のユーザーと共有
3. 仕事用アカウントを追加（「予定の詳細を表示」以上の権限）

## 使用方法

セットアップ完了後は自動で動作します。

- **個人カレンダーに予定を追加** → 仕事用カレンダーに「Private Block」が作成される
- **予定を編集/削除** → 自動で反映される

### 手動操作

| 関数 | 説明 |
|------|------|
| `fullSync()` | 全カレンダーをフル同期 |
| `resetSyncTokens()` | Sync Token をリセット（次回フル同期） |
| `showStatus()` | 現在の設定状態を表示 |
| `removeTriggers()` | 全トリガーを削除 |

## GitHub Actions 自動デプロイ

`main` ブランチの `src/` 配下が変更されると自動でプッシュされます。

### 必要な Secrets

| Secret 名 | 内容 |
|-----------|------|
| `CLASPRC_JSON` | `~/.clasprc.json` の内容 |
| `CLASP_JSON` | `.clasp.json` の内容 |

```bash
# ~/.clasprc.json の内容を取得
cat ~/.clasprc.json
```

## 注意事項

- GAS は**仕事用アカウント**で実行してください（Out of Office イベントは primary にのみ作成可能）
- Calendar API Advanced Service は clasp push では有効化されません。GAS エディタで手動有効化が必要です
- `.clasp.json` には各自の script ID が入るため、`.gitignore` に追加済み

## ディレクトリ構成

```
calendar-cascade/
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions デプロイ
├── src/
│   ├── appsscript.json     # GAS マニフェスト
│   ├── Config.gs           # 設定モジュール
│   ├── Main.gs             # エントリーポイント
│   ├── CalendarSync.gs     # コア同期ロジック
│   └── Utils.gs            # ユーティリティ
├── .clasp.json             # clasp 設定（gitignore）
├── .claspignore            # clasp 除外設定
├── .gitignore
├── package.json
└── README.md
```

## ライセンス

MIT
