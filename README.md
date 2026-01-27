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

## アーキテクチャ

```
┌─────────────────┐      共有        ┌─────────────────┐
│  個人アカウント   │ ──────────────▶ │  仕事用アカウント  │
│                 │   (読み取り権限)   │                 │
│  📅 個人カレンダー │                 │  🔧 GAS実行      │
└─────────────────┘                 │       │         │
                                    │       ▼         │
                                    │  📅 仕事用primary │
                                    │   (OOOイベント)   │
                                    └─────────────────┘
```

**重要**: GAS は**仕事用アカウント**で実行する必要があります。Out of Office イベントは自分の primary カレンダーにしか作成できないためです。

## セットアップ

### Step 1: 個人カレンダーを仕事用アカウントに共有

1. **個人アカウント**で [Google カレンダー](https://calendar.google.com) を開く
2. 左側のカレンダー名の「⋮」→「設定と共有」
3. 「特定のユーザーまたはグループと共有する」→「ユーザーやグループを追加」
4. 仕事用アカウントのメールアドレスを入力
5. 権限は「予定の表示（すべての予定の詳細）」以上を選択
6. 「送信」

### Step 2: カレンダー ID を確認

カレンダー ID の調べ方:

1. [Google カレンダー](https://calendar.google.com) を開く
2. 左側のカレンダー名の「⋮」→「設定と共有」
3. 下にスクロールして「カレンダーの統合」セクション
4. 「カレンダー ID」をコピー

| カレンダー | ID の例 |
|-----------|--------|
| Gmail の primary | `yourname@gmail.com` または `primary` |
| Google Workspace の primary | `yourname@company.com` または `primary` |
| 追加カレンダー | `xxx@group.calendar.google.com` |

### Step 3: GAS プロジェクトを作成（仕事用アカウントで）

```bash
# リポジトリをクローン
git clone https://github.com/Mekajiki/calendar-cascade.git
cd calendar-cascade
npm install

# 仕事用アカウントで clasp にログイン
npx clasp login

# GAS プロジェクトを新規作成
npx clasp create --title "CalCascade" --rootDir src

# .clasp.json をプロジェクトルートに移動（src/ 内に作成された場合）
mv src/.clasp.json .clasp.json 2>/dev/null || true

# プッシュ
npm run push
```

### Step 4: Script Properties を設定

1. `npm run open` で GAS エディタを開く
2. 左側の「⚙️ プロジェクトの設定」をクリック
3. 下にスクロールして「スクリプト プロパティ」
4. 「スクリプト プロパティを追加」で以下を設定:

| プロパティ | 値 | 説明 |
|-----------|-----|------|
| `SOURCE_CALENDAR_IDS` | `personal@gmail.com` | 個人カレンダーの ID（カンマ区切りで複数可） |
| `TARGET_CALENDAR_ID` | `primary` | 仕事用カレンダーの ID（通常は `primary`） |

### Step 5: 動作確認

GAS エディタで:

1. `testCalendarAccess` を実行 → カレンダーにアクセスできるか確認
2. `setupTriggers` を実行 → EventUpdated トリガーを設定
3. `showStatus` を実行 → 設定状態を確認

### Step 6: テスト

1. 個人カレンダーに予定を追加
2. 仕事用カレンダーに「Private Block」OOO イベントが作成されることを確認
3. 予定を編集/削除 → 反映されることを確認

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

## トラブルシューティング

### カレンダーにアクセスできない

- 個人カレンダーが仕事用アカウントに共有されているか確認
- 共有権限が「予定の表示（すべての予定の詳細）」以上か確認
- `testCalendarAccess` でエラーメッセージを確認

### OOO イベントが作成されない

- GAS が仕事用アカウントで実行されているか確認
- `TARGET_CALENDAR_ID` が `primary` または自分のカレンダーか確認
- 実行ログでエラーを確認（GAS エディタ → 実行数）

### 同期が遅れる

- EventUpdated トリガーは最大数分の遅延があります
- `fullSync()` で手動同期可能

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
