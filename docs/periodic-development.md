# 定期開発の設定と実施状態

2026-11-20。ユーザーから、機密情報とハッカソン適合性を確認しながら定期的に進める依頼を受領。

## 状態

**登録済み・ACTIVE。** [shunkat/sento-duck-explorer](https://github.com/shunkat/sento-duck-explorer) をPublic・MITで新規公開し、ローカル `origin/main` と公開先の一致を確認した。ユーザーがGitHubのブラウザー認証とKiro App接続を行い、CodexがGitHub設定の「Only select repositories」「Selected 1 repository」と対象名の一致を確認した。Scheduleを登録・有効化し、一覧のACTIVE表示と対象リポジトリを確認した。初回を手動実行し、公開mainの取得と[PR #1](https://github.com/shunkat/sento-duck-explorer/pull/1)の作成を確認した。

初回は英語文書のみの変更。最初の `npm ci` は依存取得時に403となった。設定画面ではNetwork accessが `Repository access only`、Custom allowed domainsが空だった。ユーザーの明示承認後、アクセスレベルを維持したまま `registry.npmjs.org` 1件だけを追加・保存し、再度Editを開いて永続化を確認した。

同じクラウド環境で通常の `npm ci` が成功し、Node v22.23.4 / npm 11.4.2で83件のテストと本番ビルドが成功。機密情報検査はソース・index 118検査、配布物3検査でいずれも検出0だった。ミラーや制限回避は使っていない。最初の失敗、過去のMacでの成功、許可追加後のクラウドでの成功を別の実績として記録する。

ブラウザー確認は初回に未実施。Kiro WebのツールカタログにはPlaywright Powerがあり、Kiro Web公式もChrome/Playwright等の提供を説明している。単に未ロードであることを利用不能と扱わず、次回は提供された公式手順でPowerをロードしてローカル開発サーバーの検証を進める。実際にロードできない場合だけ、具体的なエラーを記録する。

2026-11-20、ユーザーは `shunkat/sento-duck-explorer` のPublic・MITでの新規公開、このリポジトリだけへのKiro Agent接続、毎時開発の有効化を明示承認した。MITライセンスを採用済み。

Kiro Webの定期実行はクラウド環境でリポジトリを取得して作業し、PRを返す。ローカルIDEの画面を監視して再開する機能ではない。新たな権限を無断で付与せず、全リポジトリを選ばない。[Schedule](https://kiro.dev/docs/web/automations/)、[GitHub接続](https://kiro.dev/docs/web/github/)

## 登録済み設定

- 名称：Sento Duck — hourly development and review
- 頻度：毎時。Kiro Webの最短間隔は1時間、時刻はUTC評価。
- 有効期限：締切直前まで。以下の重複しない3個のCRONを登録し、保存後も値が保持されていることを確認した。次回日時の専用表示は確認できていないため、時刻はCRONから判断する。

```text
cron(0 * 20-30 11 ? 2026)
cron(0 * 1-3 12 ? 2026)
cron(0 0-21 4 12 ? 2026)
```

最終開始は2026-12-05 06:00 JST。開始済みの実行も07:00 JST以後は提出対象へ書き込まない。公開・提出後は固定した版を維持する。

## 登録済みの運用指示

以下は2026-11-20 14:35 JST頃にKiro Webで更新・保存し、再表示して確認した登録済みPromptの全文（1,796文字）。対象は `shunkat/sento-duck-explorer` のみで、選択ブランチは `main`。EnabledとACTIVEを確認し、既存の3個のCRONは維持した。変更はレビュー用PRにまとめ、自動マージしない。

```text
対象は shunkat/sento-duck-explorer のみ。銭湯の3D協力パズル Sento Duck Explorer をKiro主体で完成に近づけてください。毎回、KIRO_HANDOFF.md、.kiro/steering、既存Spec、docs/kiroween-review.md、docs/periodic-development.md、docs/crew-pilot.md、直近の進捗と進行中PRを読み、未完了作業を一つまとまった単位で進めてください。既存PRの指摘解消を優先し、重複作業や他の実行の変更を上書きしません。他の実行が同じ作業中なら変更せず報告し、作業がなければ空のPRを作らないでください。

実行開始時と外部書き込み直前に現在時刻を確認し、2026-12-04 22:00 UTC（12月5日07:00 JST）以後は提出対象を変更しないでください。提出済みの固定版も自動で書き換えません。

作業前後とpush/PR作成直前に python3 scripts/check-publication.py を実行してください。認証情報、個人用リンク、私用パス、会話・操作ログ、環境ファイル、鍵の疑いがあれば外部書き込みを止め、値を伏せて場所と種類だけ報告してください。検出ルールを弱めず、自動検査だけで完全保証とせず差分・履歴・配布物も点検してください。ビルド後は python3 scripts/check-publication.py --root dist も実行してください。.kiroの提出証跡は内容を確認して残してください。

公開コミットのauthor/committerとCo-authored-by等のフッターにも私用メールを含めません。公開用ハンドルとGitHubのnoreplyを使い、push前にメタデータを確認してください。ファイル検査のPASSだけでコミットメタデータも確認済みとは扱わないでください。

実際の3Dキャラクターモデルによる三人称の肩越し視点が必須です。固定方向の追従カメラや仮の球・カプセルだけで完成と扱いません。3キャラクター、クリアルート、F1〜F7、親子同伴、帽子を被ったアヒル本人のゴールを維持してください。最終モデルの画像→Image to 3D→Blender調整→ゲーム組み込みを省かないでください。Costume Contestは候補で、機能に役立つ穏やかな怪異演出が未完成です。通常の判断は根拠付きで暫定採用し、確定済み仕様を勝手に変更しないでください。

Crew試行中は肩越し視点Spec、カメラ・入力・表示、実モデル接続と通常操作の検証をローカルCrewが担当します。Codexはオリジナル画像→Meshy Free/Meshy 6 Lite→Blender調整→GLBと出典記録を担当します。Webは進行中PR #1〜#3の独立レビューと各PR内の指摘修正を優先し、PR #3のModelAdapterを担当します。PR #3のplaceHatがsocket位置だけコピーし回転を継承しない問題を確認・修正し、帽子がDuckの旋回に追従する回帰検査をしてください。Crewの実装を重複作成せず、ModelAdapterとの接続責務をdocs/crew-pilot.mdと既存Specで確認してください。素材のCC BY 4.0とコードMITを混同しません。最終アセットSpecは公開済みなので既存Specを読み、同じSpecを重複作成しません。ブラウザーの未実施を成功と書かず、mainに未マージの成果を適用済みと扱いません。変更に必要なテストと npm run build を通し、素材の出典・権利・再配布可否、第三者ライセンス、英語提出物を確認してください。KiroとCodex等の担当・実際の使用機能を正確に記録し、未検証の学習効果を実績として書かないでください。

安全な差分と検証結果が揃えばレビュー用PRにまとめてください。mainへの直接push、マージ、新たな課金やクレジット追加購入、権限付与、デプロイ、動画公開、Devpost提出は行いません。結果は完了内容・検証・機密情報と規約の確認・残作業・次回の一手を短く報告し、機密値を本文やログへ書かないでください。
```

## 初回有効化時の検証記録

1. 確認済み：所有者 `shunkat`、Public、MIT、公開mainとローカルの一致。
2. 確認済み：83件のテスト、ビルド、ソース・Git index・配布物の機密情報検査。コミットは公開用ハンドルとGitHub noreplyを使用。
3. 確認済み：Kiro Agentのアクセス対象は当該リポジトリ1件のみ。
4. 確認済み：期限付き3個のCRON、対象リポジトリ、一覧のACTIVE。毎時00分の設定で、次回日時の専用表示は未確認。
5. 確認済み：初回が公開mainをcloneし、文書作成・機密検査を経てPR #1を作成。独立レビューの指摘を修正後、クラウドで83件のテスト・ビルド・ソースと配布物の機密検査が成功。最終head `da8adda` をCodexが独立再レビューし、追加の必須指摘なし、全5コミットの公開用メタデータとmainとの競合なしを確認した。PRは未マージ。ブラウザー検証は次回作業として残る。
6. 確認済み：GitHubのSecret scanning・Push protectionは有効。確認時のopen secret alertsは0件。ただし検出範囲外の情報がない保証ではない。
