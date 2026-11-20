# アヒルと子どもと大人の銭湯探検（仮モデル版）

Kiroween 2026向けの3D協力パズルの**仮モデル版**です。箱・球・カプセルだけで、アヒル・子ども・大人の3キャラクターを切り替え、10ステップのクリアルートを遊べます。

> 状態：仮モデルでの試作です。最終モデルの必須工程（参照画像 → Image to 3D → Blenderで調整 → ゲームに組み込み）は**まだ実施していません**。この版を最終作品の完成とは扱いません。

## 起動

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
| WASD / 矢印 | 移動（画面の上が奥） |
| Shift | 走る（石鹸を踏むとゲームオーバー） |
| Tab | 操作キャラクターの切替（アヒル → 子ども → 大人） |
| E / Enter | 拾う・渡す・払う・開ける・被せる・抱える・池に置く。受け渡し確認中は「渡す」 |
| Esc | 受け渡しをやめる |
| T | タオルで体を拭く（乾いていて近くに濡れたアヒルがいればアヒルを拭く） |
| G | 更衣室のロッカー前で服を着る／脱ぐ |
| C | 全体マップ視点の切替 |
| R | ゲームオーバー時：直前の再開地点から再開。クリア後：最初から |
| Q / V / F | マナー違反の行動。条件を満たすときだけゲームオーバーになります。Q：子どもか大人が湯船のお湯の中にいるとき（タオルを湯船につける）／V：子どもか大人がサウナ室にいるとき（サウナで大声。サウナ以外では案内が出るだけ）／F：サウナで、押せる距離に他の人がいるとき（押す）。それ以外では続行します。アヒルでは発動しません。マイクは使いません |

画面上部の「目的」に次にやることが、その下に今押せるキーが表示されます。

## この環境での注意：Chrome拡張 Vimium

ChromeのVimium拡張を有効にしていると、`T`・`D` などのキーをVimiumが横取りし、ゲームに届きません。2026-11-20にCodexがChromeを操作して確認したところ、Vimiumの**挿入モード（`I`キー）**にすると正常に操作できました。拡張機能の設定は変更していません。

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

作業前後とpush/PR作成の直前に `npm run check:publication` を実行します。公開用ビルドには `python3 scripts/check-publication.py --root dist` も実行します。検出時は値を出力せず、ファイル・行・分類のみを表示して失敗します。検査対象と限界はスクリプト冒頭に記載しています。履歴・画像等のメタデータ・素材の権利は別途確認が必要であり、合格だけで漏えいがないとは保証できません。

`.kiro` の開発証跡は内容を確認して公開対象に残します。大会の条件と未完了事項は [規約確認](docs/kiroween-review.md)、定期実行の登録状態と設定案は [定期開発](docs/periodic-development.md) を参照してください。

本体のコードは [MIT License](LICENSE) で提供します。依存ライブラリの [第三者ライセンス](THIRD_PARTY_NOTICES.md) はビルド時に `dist/` へ自動同梱します。今後追加する第三者素材にはそれぞれの利用条件が適用されます。

---

## English overview

**Sento Duck Explorer** is a 3D cooperative puzzle for Kiroween 2026, set in a fictional Japanese public bathhouse. You switch between a duck, a child and an adult, and combine their abilities in a 10-step route: the duck finds a coin in a tiny hole, the adult pays the sauna fee and gets the key, the child slips through the sauna crowd to fetch a sauna hat, and the adult carries the hat-wearing duck to a hidden pond. Breaking a bathhouse manner (rules F1 to F7, such as putting a towel in the bath, entering the sauna wet, or going from the changing room to reception or outside unclothed) ends the attempt, and you resume from the latest checkpoint. The facility, its rules and the 500-yen sauna fee are fictional.

**Status:** placeholder models only (procedural primitive geometry generated in code). The final Image to 3D and Blender pipeline has not been done. Only the first half of the route has been checked in a browser. There is no deployed URL or demo video yet, and no learning effect is claimed. In the earlier cloud run `npm ci` failed with HTTP 403 (repository-access-only sandbox), so tests and build were **not run** and no browser check was done here. The 83 passing tests are an earlier verification on the Mac side (2026-11-20), not a result of that run. In a later run on 2026-11-20 UTC (Node v22.23.4, npm 11.4.2, `registry.npmjs.org` allowlisted), `npm ci` succeeded, `npm test` passed 83 tests in 9 files, `npm run build` succeeded, and `check-publication.py` passed for the repository and for `dist`. Still no browser check. See [docs/submission-en.md](docs/submission-en.md) and [docs/assets-and-licenses.md](docs/assets-and-licenses.md).

### Run

```sh
npm install
npm run dev      # http://127.0.0.1:5173/
npm test         # vitest --run
npm run build    # type check + production build
npm run check:publication
```

### Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move (up on screen is away from you) |
| Shift | Run (stepping on soap ends the attempt) |
| Tab | Switch character (duck, child, adult) |
| E / Enter | Pick up, hand over, pay, open, put the hat on, carry, place in the pond. Confirms a handover. |
| Esc | Cancel a handover |
| T | Dry off with the towel (dries a nearby wet duck if you are dry) |
| G | Dress or undress at the changing-room lockers |
| C | Toggle the overview camera |
| R | After game over: resume from the last checkpoint. After clearing: restart. |
| Q / V / F | Deliberate rule-break actions. Each ends the attempt only under its condition: Q when the child or adult dips the towel while in the bath water, V when the child or adult is in the sauna (a nuisance-shout action), F when an NPC is within pushing reach in the sauna. Otherwise the attempt continues (V outside the sauna only shows a prompt). The duck cannot trigger these. The game does not listen to a microphone. |

If the Vimium Chrome extension is on, press `I` for insert mode so keys such as `T` reach the game.

The code is under the [MIT License](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
