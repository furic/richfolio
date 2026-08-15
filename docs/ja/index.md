---
title: ホーム
layout: home
nav_order: 1
lang: ja
permalink: /
---

# Richfolio

メンテナンス不要のポートフォリオ監視システムです。目標配分を一度設定すれば、毎日の配分ギャップ、AI による買いシグナル、関連ニュースをまとめたブリーフが、メールと Telegram で自動的に届きます。完全に GitHub Actions 上で動作します。

**すべて無料枠で運用できます。サーバー不要、ダッシュボード不要、継続的なコストもありません。**

---

## できること

毎朝、Richfolio はライブの市場データを取得し、配分分析を実行して AI による買い推奨を生成し、洗練されたレポートをあなたの受信トレイと Telegram に届けます。

![毎日のブリーフ](../screenshots/morning-debrief.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

| コンポーネント | サービス | コスト |
|------|------|------|
| 価格とファンダメンタル | Yahoo Finance | 無料 |
| 暗号資産クロスペア | crypto.com 公開 API | 無料（キー不要） |
| ニュース | NewsAPI.org | 無料（1 日 100 リクエスト） |
| AI 分析 | Google Gemini 2.5 Flash | 無料（1 日約 20 リクエスト） |
| メール | Resend.com | 無料（月 3,000 通） |
| Telegram | Telegram Bot API | 無料 |
| スケジューラ | GitHub Actions | 無料（cron） |

---

## こんな方におすすめ

Richfolio は**あなたの代わりに銘柄を選ぶことはしません**。すでに自分が信じる株式、ETF、暗号資産のポートフォリオを持っていることが前提です。

Richfolio が行うのは、**毎日ポートフォリオを監視**し、**いつ**買うべきかを判断する手助けです。価格、テクニカル指標、ニュースのセンチメント、配分ギャップを追跡し、AI が最適なエントリーのタイミングを浮かび上がらせます。

- **あなたがポートフォリオを用意する** — シンプルな JSON 設定で目標配分を一度だけ指定します
- **Richfolio がシグナルを提供する** — 買い推奨、指値価格、詳細分析を生成します
- **最終的な判断はあなた** — すべての購入はあなたの決断であり、ツールは提案するだけです

**コーディング不要。** リポジトリを fork し、約 10 分かけて無料 API のアカウントを登録し、キーを GitHub の Settings に貼り付ければ完了です。あとは GitHub Actions ですべて自動的に走り、月額 $0 で動作します。

---

## ドキュメント

| ページ | 説明 |
|------|------|
| [機能](features) | Richfolio で何ができるか — 10 項目の機能を詳しく解説 |
| [はじめに](getting-started) | fork・設定・デプロイの 4 ステップ |
| [設定](configuration) | `CONFIG_JSON` のフィールドリファレンス、ティッカー形式、Tips |
| [API キー](api-keys) | Resend、NewsAPI、Gemini、Telegram の段階的セットアップ |
| [デプロイ](deployment) | GitHub Actions、Secret、スケジュールのカスタマイズ |
| [仕組み](how-it-works) | アーキテクチャ、データパイプライン、分析ロジック |
| [ローカル開発](local-development) | 上級ユーザー向け — カスタマイズや手動実行のためのローカル運用 |
| [トラブルシューティング](troubleshooting) | よくあるエラーと対処法 |
| [参考資料](references) | 設計の元となった先行プロジェクト |
