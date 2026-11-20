# アヒルと子どもと大人の銭湯探検

Kiroween 2026向けの3D協力パズルです。実際の3Dモデルで作ったアヒル・子ども・大人を切り替え、肩越し視点で銭湯を探検します。

> 制作・検証中：3キャラクターとハットは参照画像 → MeshyのImage to 3D → Blender調整を経て組み込み済みです。人間のモデルは着衣・入浴状態を切り替える静的モデルで、骨格アニメーションは未実装。環境と一部の小物は仮形状です。素材は [アセット台帳](assets/ledger.csv)、統合・通常操作の検証状況は [Crew開発記録](docs/crew-pilot.md) と [肩越し視点の作業記録](.kiro/specs/shoulder-view/tasks.md) を参照してください。

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
| WASD / 矢印 | カメラに合わせて移動。全体マップではW／上がマップの上方向 |
| J / L・マウスドラッグ | 肩越しカメラを左右に回す |
| Shift | 走る（石鹸を踏むとゲームオーバー） |
| Tab | 操作キャラクターの切替（アヒル → 子ども → 大人） |
| E / Enter | 拾う・渡す・払う・開ける・被せる・抱える・池に置く。受け渡し確認中は「渡す」 |
| Esc | 受け渡しをやめる |
| T | タオルで体を拭く（乾いていて近くに濡れたアヒルがいればアヒルを拭く） |
| G | 更衣室のロッカー前で服を着る／脱ぐ |
| C | 全体マップ視点の切替 |
| R | ゲームオーバー時：直前の再開地点から再開。クリア後：最初から |
| Q / V / F | マナー違反の行動（タオルを湯船へ／サウナで大声／サウナで押す）。試すとゲームオーバー |

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

本体のコードは [MIT License](LICENSE) で提供します。Meshy生成3D素材とそのBlender調整版には **CC BY 4.0** が適用されます。[第三者ライセンスと素材の出典](THIRD_PARTY_NOTICES.md) はビルド時に `dist/` へ自動同梱します。その他の素材も個別の利用条件を [台帳](assets/ledger.csv) に記録します。
