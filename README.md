# アヒルと子どもと大人の銭湯探検

Kiroween 2026向けの3D探検パズルです。アヒルから始まり、牛乳びんを飲んで子ども、大人へと育ちながら、肩越し視点で銭湯を探検します。大人になって玄関から外へ出たらクリアです。

> 制作・検証中：3キャラクターとハットは参照画像 → MeshyのImage to 3D → Blender調整を経て組み込み済みです。人間のモデルは着衣・入浴状態を切り替える静的モデルで、骨格アニメーションは未実装。環境と一部の小物は仮形状です。素材は [アセット台帳](assets/ledger.csv)、統合・通常操作の検証状況は [Crew開発記録](docs/crew-pilot.md) と [肩越し視点の作業記録](.kiro/specs/shoulder-view/tasks.md) を参照してください。

## 起動

開発中デモの公開先：[Sento Duck Explorer](https://shunkat.github.io/sento-duck-explorer/)。PCのキーボードとマウスで遊べます。公開状況と対象コミットは [GitHub Actions](https://github.com/shunkat/sento-duck-explorer/actions/workflows/pages.yml) で確認できます。

```sh
npm install
npm run dev      # http://127.0.0.1:5173/
npm test         # vitest --run（全テスト）
npm run build    # 型チェック + 本番ビルド
npm run check:publication # 公開候補ファイルとGit indexの機密情報検査（Python 3）
```

## 操作
視点は自分で回した向きのまま動きます（自動では回りません）。移動は今見ている向きが基準です。
| キー | 操作 |
| --- | --- |
| WASD / 矢印 | 今見ている向きを基準に移動 |
| マウス / 右ドラッグ / J・L | 視点を回す。キャンバスをクリックするとポインターを捕捉（Escで解放して設定を開く）。設定で感度・上下反転・ドラッグのみを選べます |
| Space | 視点を正面（キャラクターの向き）へ戻す |
| Shift | 走る（石鹸を踏むとゲームオーバー） |
| E / Enter | 光っている対象を1つ使う。牛乳びんを飲んで育つ／浴室の出口の前で体を拭く／ロッカー前で服を着る・脱ぐ／高い取っ手の戸を開ける（大人だけ）。対象がなければ何も起きません |
| T | タオルを手と頭で持ち替える（人間のみ） |
| 右上のマップをタップ / C | 常時表示のミニマップを全画面に拡大。マップ表示中は一時停止 |
| 閉じる / Esc / C | 全画面マップを閉じ、探検に戻る |
| R / 画面の再開ボタン | ゲームオーバー時：直前の再開地点から再開。クリア後：最初から |
| Q / V / F | 条件を満たすとゲームオーバー。Q：人間が水中で手持ちタオルを湯船へつける（頭のタオルは対象外）／V：人間がサウナで大声を出す／F：サウナで届く距離の人を押す。アヒルでは発動せず、マイクは使いません |
スマホ（iPhone Safari / Android Chrome）では、左のスティックで移動、右側のドラッグで視点、右下のボタンで近くの対象を使い、「正面へ」で視点を戻します。「走る」はタップで入／切（止まると自動で切れます）、「その他」からタオルの持ち替え・タオルを湯につける・声を出す・押すを選べます。キーボード、Pointer Lock、全画面、画面の向き固定は不要で、横向きがおすすめですが縦向きでも遊べます。ページを離れる／アプリを切り替えると一時停止し、戻ったら「続ける」で再開します。再開地点はメモリ上だけなので、ページを再読み込みすると最初からになります。
使える対象は輪郭と近くの文字で示します（文字が壁に隠れる・画面外に出るときは画面下の小さな表示になります）。設定の「操作ヘルプを表示」をオフにすると、輪郭と対象の表示も消えます（スマホの操作ボタン・地図・失敗理由・再開ボタンは残ります）。軽量描画（解像度を下げる）も設定にあります。スマホの描画解像度は標準で最大1.5倍、軽量で1.25倍に制限しますが、FPSの改善は実機で未測定です。実機（iPhone / Android）での確認はまだ行っていません。体を拭くなどの注意は、扉の手前や浴室のポスターを見てください。
操作系とスマホ対応の実装はKiroが担当しました（`.kiro/specs/shoulder-view` に仕様・設計・タスクを記録）。
流れ（2026-11-21〜、配置は仮）：アヒルは水の上だけを泳げます。湯船から奥の水路を泳いで浅い湯だまりへ行き、牛乳びん（1本目）を飲むと子どもになります。子どもは子ども用のせまい通り道を通って広い休憩所の牛乳びん（2本目）を飲み、大人になります。大人は高い掛け金の戸を開け、体を拭いて更衣室で服を着て、受付と玄関（下足箱）を通り、外へ出る戸（取っ手が高い）を開けて外へ出るとクリアです。子どものあいだは見守りの大人がそばにいます。サウナ・露天風呂・庭と池は寄り道で、クリアには関係しません。再開地点は開始時・子どもに育った時・大人に育った時です。

仮の間取りは、玄関（下足箱）→ 受付・ロビー → ついたてのある更衣室 → 浴室（拭く場所・かけ湯・洗い場・奥の湯船と水路）、浴室の東にサウナと露天、その先の庭と池です。遊べるのは男湯です。ロビーには女湯の入口（のれんと段差）だけがあり、中はありません。大人や子どもで入ろうとすると受付の人に注意されてゲームオーバー（F8）、アヒルは段差を越えられません。実在の建物の図面ではなく、設備は仮形状です。

## この環境での注意：Chrome拡張 Vimium

ChromeのVimium拡張を有効にしていると、`D`・`J` などのキーをVimiumが横取りし、ゲームに届きません。2026-11-20にCodexがChromeを操作して確認したところ、Vimiumの**挿入モード（`I`キー）**にすると正常に操作できました。拡張機能の設定は変更していません。

- ゲーム画面で `I` を押して挿入モードにしてから遊ぶ（`Esc` で挿入モードが解除される場合は、もう一度 `I`）。
- または、このページだけVimiumを無効にする。

## 構成

- `src/core/` 純粋なゲームロジック（`tick`、アクション、成長、見守りの大人、F1〜F8、チェックポイント、不変条件、案内文）
- `src/sim/`、`src/level/` 当たり判定・移動、仮のレベル配置（メートル単位）
- `src/view/`、`src/input/`、`src/loop.ts`、`src/main.ts` 描画（Three.js）、カメラ、HUD、キーボード、60 Hz固定ステップ
- 仕様：`.kiro/specs/prototype-core-gameplay/`（requirements / design / tasks / progress）
- 進め方：`.kiro/steering/project-autonomy.md`、企画：`KIRO_HANDOFF.md`

ゲーム内の施設ルールは架空施設のものです（このゲームの施設ではサウナは入浴料に含まれる設定）。実在の銭湯に共通するルールとしては紹介しません。

## 公開前の確認

`main`の更新で、GitHub Actionsが公開情報検査・テスト・Pages用ビルドを実行し、成功した最新mainの`dist/`だけを自動公開します。PRは同じ検査を行います。手動再実行、復旧、提出版の固定については [デプロイ手順](docs/deployment.md) を参照してください。

作業前後とpush/PR作成の直前に `npm run check:publication` を実行します。公開用ビルドには `python3 scripts/check-publication.py --root dist` も実行します。検出時は値を出力せず、ファイル・行・分類のみを表示して失敗します。検査対象と限界はスクリプト冒頭に記載しています。履歴・画像等のメタデータ・素材の権利は別途確認が必要であり、合格だけで漏えいがないとは保証できません。

`.kiro` の開発証跡は内容を確認して公開対象に残します。大会の条件と未完了事項は [規約確認](docs/kiroween-review.md)、定期実行の登録状態と設定案は [定期開発](docs/periodic-development.md) を参照してください。

本体のコードは [MIT License](LICENSE) で提供します。Meshy生成3D素材とそのBlender調整版には **CC BY 4.0** が適用されます。[第三者ライセンスと素材の出典](THIRD_PARTY_NOTICES.md) はビルド時に `dist/` へ自動同梱します。その他の素材も個別の利用条件を [台帳](assets/ledger.csv) に記録します。


## English overview

**Sento Duck Explorer** is a 3D exploration puzzle set in a fictional Japanese public bathhouse. You start as a rubber duck and grow into a child, then an adult, by drinking milk bottles placed along the way. Leave the bathhouse through the front entrance as the adult to clear. The facility and its rules are fictional. (Since 2026-11-21; the earlier three-character switching version is kept in the records below.)

**Status:** the three characters and hat use real models produced through reference image → Meshy Image to 3D → Blender. Human poses are static; the environment and remaining props are provisional. Full normal-input routes and selected failure/recovery checks have been recorded, with overview-assisted positioning and exact version boundaries in [the verification record](docs/shoulder-view-verification.md). No exclusively shoulder-view playthrough, learning effect or demo video is claimed. The loader/property-test merge integration passed 219 automated tests and the production build; browser checks were not repeated for these merges. The development demo is deployed to [GitHub Pages](https://shunkat.github.io/sento-duck-explorer/) by the [deployment workflow](https://github.com/shunkat/sento-duck-explorer/actions/workflows/pages.yml), which records each deployment's result.

Use the npm commands above to run, test and build. See the [English submission draft](docs/submission-en.md) and [asset inventory](docs/assets-and-licenses.md).

| Key | Action |
| --- | --- |
| WASD / arrows | Camera-relative movement; fixed map directions in the overview |
| J / L or mouse drag | Turn the shoulder camera |
| Shift | Run; stepping on soap causes F3 |
| E / Enter | Perform the displayed contextual action: drink a milk bottle and grow, dry at a bath-side exit, change clothes at the locker, open a door with a high handle (Adult only). Otherwise move the human's towel between hand and head. |
| Tap the top-right map / C | Expand the always-visible minimap; gameplay pauses while the map is open |
| Close / Esc / C | Close the map and return to the same shoulder view |
| R | Resume the last checkpoint after failure; start again after clearing |
| Q / V / F | Conditional rule-break actions: a human dips a held towel in bath water, shouts in the sauna, or pushes a nearby person in the sauna. No microphone is used. |

Duck swims only on water: from the tub along the trough into a shallow pool with the first milk bottle. The child walks a child-sized passage to a wider room with the second bottle. The adult opens a high-latch gate, dries off, dresses in the changing room, walks through reception and the shoe-locker entrance, and opens the street door (high handle) to step outside. A non-player adult watches over the child. The sauna, open-air bath, garden and pond are optional. Checkpoints: start, after growing into the child, after growing into the adult. If Vimium captures movement keys, enter its insert mode with I.

The provisional floor plan runs genkan (shoe lockers) → reception and lobby → screened changing room → bath hall (drying spot, kakeyu, washing stations, rear tub and coin trough), with the sauna and open-air area to the east and a garden leading to the pond. The playable wing is the men's bath. The lobby has only the entrance to the women's bath (noren and a raised step); trying to walk in as Adult or Child gets a reprimand from the receptionist and a game over (F8), and Duck cannot climb the step. It is an original design, not a real building's plan, and its fixtures are provisional shapes.

Code is [MIT](LICENSE). Meshy-generated and Blender-adjusted models are **CC BY 4.0**, with separate credits in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the [asset ledger](assets/ledger.csv).
