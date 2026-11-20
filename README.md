# アヒルと子どもと大人の銭湯探検

Kiroween 2026向けの3D協力パズルです。実際の3Dモデルで作ったアヒル・子ども・大人を切り替え、肩越し視点で銭湯を探検します。

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

| キー | 操作 |
| --- | --- |
| WASD / 矢印 | カメラに合わせて移動。全体マップではW／上がマップの上方向 |
| J / L・マウスドラッグ | 肩越しカメラを左右に回す |
| Shift | 走る（石鹸を踏むとゲームオーバー） |
| Tab | 操作キャラクターの切替（アヒル → 子ども → 大人） |
| E / Enter | その場でできること1つ（画面の「E: …」と同じ）。浴室の出口（更衣室の扉）かサウナの扉の前で体を拭く／ロッカー前で服を着る・脱ぐ／拾う・渡す・払う・開ける・被せる・抱える・池に置く／他に何もなければタオルを頭にのせる・手に持つ（アヒルは不可）。受け渡し確認中は「渡す」 |
| Esc | 受け渡しをやめる |
| C | 全体マップ視点の切替 |
| R | ゲームオーバー時：直前の再開地点から再開。クリア後：最初から |
| Q / V / F | 条件を満たすとゲームオーバー。Q：人間が水中で手持ちタオルを湯船へつける（頭のタオルは対象外）／V：人間がサウナで大声を出す／F：サウナで届く距離の人を押す。アヒルでは発動せず、マイクは使いません |

画面上部の「目的」に次にやることが、その下に今押せるキーが表示されます。

アヒルは水の上（湯船・小さな穴へ続く水路・穴の中・池）だけを泳げます。湯船と水路は床で離れているので、最初は子どもがEでアヒルを抱え、「水路の入口」でEを押して水路に下ろします（操作はアヒルに切り替わります）。帽子を被せた後は大人が抱えて池へ運びます。下ろせるのは湯船か水路のそば（または池の入口で池へ）だけです。

## この環境での注意：Chrome拡張 Vimium

ChromeのVimium拡張を有効にしていると、`D`・`J` などのキーをVimiumが横取りし、ゲームに届きません。2026-11-20にCodexがChromeを操作して確認したところ、Vimiumの**挿入モード（`I`キー）**にすると正常に操作できました。拡張機能の設定は変更していません。

- ゲーム画面で `I` を押して挿入モードにしてから遊ぶ（`Esc` で挿入モードが解除される場合は、もう一度 `I`）。
- または、このページだけVimiumを無効にする。

## 構成

- `src/core/` 純粋なゲームロジック（`tick`、アクション、親子の同伴、F1〜F7、チェックポイント、不変条件、案内文）
- `src/sim/`、`src/level/` 当たり判定・移動・池の流れ、仮のレベル配置（メートル単位）
- `src/view/`、`src/input/`、`src/loop.ts`、`src/main.ts` 描画（Three.js）、カメラ、HUD、キーボード、60 Hz固定ステップ
- 仕様：`.kiro/specs/prototype-core-gameplay/`（requirements / design / tasks / progress）
- 進め方：`.kiro/steering/project-autonomy.md`、企画：`KIRO_HANDOFF.md`

ゲーム内の施設ルール・料金（サウナ代500円など）は架空施設のものです。実在の銭湯に共通するルールとしては紹介しません。

## 公開前の確認

`main`の更新で、GitHub Actionsが公開情報検査・テスト・Pages用ビルドを実行し、成功した最新mainの`dist/`だけを自動公開します。PRは同じ検査を行います。手動再実行、復旧、提出版の固定については [デプロイ手順](docs/deployment.md) を参照してください。

作業前後とpush/PR作成の直前に `npm run check:publication` を実行します。公開用ビルドには `python3 scripts/check-publication.py --root dist` も実行します。検出時は値を出力せず、ファイル・行・分類のみを表示して失敗します。検査対象と限界はスクリプト冒頭に記載しています。履歴・画像等のメタデータ・素材の権利は別途確認が必要であり、合格だけで漏えいがないとは保証できません。

`.kiro` の開発証跡は内容を確認して公開対象に残します。大会の条件と未完了事項は [規約確認](docs/kiroween-review.md)、定期実行の登録状態と設定案は [定期開発](docs/periodic-development.md) を参照してください。

本体のコードは [MIT License](LICENSE) で提供します。Meshy生成3D素材とそのBlender調整版には **CC BY 4.0** が適用されます。[第三者ライセンスと素材の出典](THIRD_PARTY_NOTICES.md) はビルド時に `dist/` へ自動同梱します。その他の素材も個別の利用条件を [台帳](assets/ledger.csv) に記録します。


## English overview

**Sento Duck Explorer** is a 3D cooperative puzzle set in a fictional Japanese public bathhouse. Switch between Duck, Child and Adult: Child carries Duck to a separate water channel, Duck retrieves a family coin, Adult pays for sauna access, Child retrieves and equips Duck's hat, and Adult carries Duck to a hidden pond. Guide the hat-wearing Duck along the current to the goal. The facility, rules and 500-yen sauna fee are fictional.

**Status:** the three characters and hat use real models produced through reference image → Meshy Image to 3D → Blender. Human poses are static; the environment and remaining props are provisional. Full normal-input routes and selected failure/recovery checks have been recorded, with overview-assisted positioning and exact version boundaries in [the verification record](docs/shoulder-view-verification.md). No exclusively shoulder-view playthrough, learning effect or demo video is claimed. The loader/property-test merge integration passed 219 automated tests and the production build; browser checks were not repeated for these merges. The development demo is deployed to [GitHub Pages](https://shunkat.github.io/sento-duck-explorer/) by the [deployment workflow](https://github.com/shunkat/sento-duck-explorer/actions/workflows/pages.yml), which records each deployment's result.

Use the npm commands above to run, test and build. See the [English submission draft](docs/submission-en.md) and [asset inventory](docs/assets-and-licenses.md).

| Key | Action |
| --- | --- |
| WASD / arrows | Camera-relative movement; fixed map directions in the overview |
| J / L or mouse drag | Turn the shoulder camera |
| Shift | Run; stepping on soap causes F3 |
| Tab | Switch Duck → Child → Adult |
| E / Enter | Perform the displayed contextual action: dry at a bath-side exit, change clothes at the locker, collect/transfer items, pay, unlock, equip, carry or place Duck. Otherwise move the human's towel between hand and head. Confirm a transfer dialog. |
| Esc | Cancel a transfer |
| C | Toggle the overview |
| R | Resume the last checkpoint after failure; start again after clearing |
| Q / V / F | Conditional rule-break actions: a human dips a held towel in bath water, shouts in the sauna, or pushes a nearby person in the sauna. No microphone is used. |

Duck swims only on water. Before the hat, Child carries it across the dry gap and places it at the coin-channel entrance; afterward Adult carries it to the pond. T and G have no action. If Vimium captures movement keys, enter its insert mode with I.

Code is [MIT](LICENSE). Meshy-generated and Blender-adjusted models are **CC BY 4.0**, with separate credits in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the [asset ledger](assets/ledger.csv).
