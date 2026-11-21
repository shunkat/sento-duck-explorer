# Blender 素材品質を上げる比較・評価・修正ループ

調査日: 2026-11-21。対象は風呂椅子・湯桶の外観改善。課金、新しいプラグインの導入、実プレイは行っていない。このノートは調査と既存画像の観察に限る。

## 比較画像と数値検査をどう使い分けるか

### Takeaway

基準画像・旧版・候補を同じカメラ、照明、マテリアル、色管理で比較する。機械的な適合性、参照への一致、仕上げの自然さは別項目で判定する。参照と投影が合っていない画像のピクセル差を、形状誤差として扱わない。

### Cited Findings

- Blender自身のレンダー検査は基準画像との比較を行い、新画像・基準画像・差分をHTMLで目視確認できる。GPUや実行環境によって差が出るため、閾値の扱いも明示している。[Blender Render Tests](https://developer.blender.org/docs/handbook/testing/render/)
- Blender開発ガイドは、自動テストだけでなく、既存の制作ファイルを開いた確認、実利用するアーティストの参加を含む手動検査を重視している。これはBlender本体開発の文脈であり、個別モデルの美的品質基準そのものではない。[Testing New Code & Refactors](https://developer.blender.org/docs/handbook/guidelines/testing_changes_refactors/)

### Inferences

- 本件の「面数内、manifold、寸法内、テスト成功」は導入可能性の検査であり、輪郭や足先が自然である証明にはならない。
- 修正のたびにカメラや照明を変更すると形状改善と演出改善を区別できない。レビュー用シーンは固定し、形状変更と色変更を別パスで確認する。
- 参照が単一の透視画像の場合、最初に投影を合わせる。椅子の座面の縁、湯桶の上縁の楕円などを使い、yaw・pitch・焦点距離・画像内スケールを合わせた後で輪郭を評価する。これは今回の提案であり、単一画像から正確な三次元寸法を復元できるという意味ではない。
- 自動差分は「どこが変わったか」の案内として使い、変化を自動的に改善と判定しない。

### Gaps

- 参照画像に正投影図・実寸・レンズ情報がなく、三次元の正解形状は一意に確定しない。
- 本調査では、この方式の業界全体での採用率は調べていない。「みんなが同じ方式」とは断定しない。

## どの表示で形状の粗さを発見するか

### Takeaway

見栄え用の一枚に加えて、clay、silhouette、強めの反射を使った表面確認を行う。正面・側面・斜め・上・下で重要部分を観察し、同じ視点で旧版と候補を比較する。

### Cited Findings

- WorkbenchにはStudioとMatCapの照明表示があり、通常のシーンライトとは独立して形状を表示できる。[Workbench Lighting](https://docs.blender.org/manual/en/5.0/render/workbench/lighting.html)
- Solid表示は簡易照明を用い、Studio/MatCapのハイライトとCavity表示を使える。[Viewport Shading](https://docs.blender.org/manual/en/5.2/editors/3dview/display/shading.html)
- Blenderの色管理では露出が変換前の明るさを変え、AgXは高露出の色を低彩度化する。このため、明るい黄色が淡く見える原因はbase colorだけとは限らない。[Displays and Views](https://docs.blender.org/manual/en/5.0/render/color_management/displays_views.html)

### Inferences

本件に導入するレビュー用パス:

1. **clay**: 全候補に同じ中間色・roughnessを適用。座面と脚の連続性、縁の厚み、凹みを見る。
2. **silhouette**: 黒い形状と単色背景。足先、穴、巻き縁、厚み、外周の多角形感を見る。投影を合わせた参照、旧版、候補を並べる。
3. **raking/reflection**: 適度に反射する均一材質と長いArea Light。角張り・波打ち・不自然な丸まりをハイライトの連続性で探す。これはMatCapの代わりに現在のheadless rendererで実行可能な提案。
4. **final material**: 本番色とroughness。比較中はview transform、exposure、white balance、world、ライトを固定する。

front・side・両three-quarter・top・undersideの静止画を最小セットとし、必要な箇所は回転連続画像で追加確認する。768 px以上の拡大だけでなく、実際の表示サイズを想定した128/256 pxも添える。これらの数値は本件の暫定レビュー設定であり、業界規格ではない。

### Gaps

- MatCap・反射パスの目視評価には判断が残る。Cavityを強くすれば良くなるわけではなく、陰影が欠陥を誇張する場合もある。
- Blender画像とゲームの表示はレンダラーが異なる。ここでのオフライン比較は、後で担当者が行う固定版の最終実プレイを代替しない。

## 面数・誤差・ベイクを何に対して測るか

### Takeaway

元の生成メッシュへの近さだけではなく、先に整えた形状と画面上で比較する。面数の目標で無理に削らず、穴・足・縁の輪郭を守る。ベイクは小さな陰影の転写であり、外形の修理とは分ける。

### Cited Findings

- meshoptimizerの作者は、簡略化のtarget errorを元のメッシュに対する近似偏差として説明している。トポロジーや誤差制限によって、指定した面数まで削減されない場合がある。[meshoptimizer — Simplification](https://github.com/zeux/meshoptimizer#simplification)
- 同READMEはカメラ距離・FOV・画面高さから1 px相当の空間距離を求めてLODを選ぶ例を示す。法線やUVなどの属性を誤差評価に含めることで、位置だけの場合より陰影や属性を保ちやすくできる。[meshoptimizer — Simplification](https://github.com/zeux/meshoptimizer#simplification)
- BlenderのSelected to Activeベイクには、投射の範囲を制御するcage / ray distanceがある。法線マップはベイク時の座標空間と使用側の設定を対応させる必要がある。[Cycles Render Baking](https://docs.blender.org/manual/en/5.0/render/cycles/baking.html)

### Inferences

- 「生成rawとの最大距離が小さい」はrawの凹凸・不自然な特徴を残している可能性も含む。rawへの距離は由来と過剰な変更を監視する値に留め、参照に近づいたことの合格値にしない。
- 固定カメラで候補と整えたmasterをレンダーし、silhouetteの境界距離と、穴・脚間などの局所領域を比較する。全体IoUだけでは小さな重要部分の消失が平均に埋もれる。
- 暫定運用では、近距離レビュー画角で境界差のp95を1 px程度以内に抑え、最大値と局所画像を別に確認すると差を見つけやすい。ただしこれは今回検証すべき提案であり、普遍的な合格基準ではない。masterが悪ければ、この数値が良くても完成度は上がらない。
- normal bakeはclean masterから行い、low/highを同じ照明で比較する。rawのノイズをそのまま焼かない。シルエットの角張り、穴の潰れ、足先の形状はgeometryで直す。
- 材質が単純な成形プラスチックの場合、形状と法線だけで十分ならベイクは必須にしない。ベイクによるUVやnormalの継ぎ目が増えるコストも比較する。

### Gaps

- 現状に対して適切な画面上の誤差閾値は、ゲーム内で想定する最短視距離と表示解像度をもとに決める必要がある。
- 元画像との色差を、照明条件が一致しないまま材質誤差として数値化しても意味が薄い。

## Blender MCPを追加すれば改善するか

### Takeaway

今回の不足は観察と修正のループであり、操作経路の追加ではない。既存のbpy実行・画像レンダー・画像確認が利用できるため、その経路で比較を自動化できる。

### Cited Findings

- MCP for Blender作者のREADMEは、AIがBlender Pythonでモデリング等を行い、MCP側のexecute_blender_codeがlive BlenderでPythonを実行する構成を示す。lookは複数角度やsolid/material/rendered/wireframe等の観察を提供する。[MCP for Blender — Capabilities](https://github.com/ahujasid/mcp-for-blender#capabilities)

### Inferences

- 同じPython処理と同じ画像を取得できる現環境では、MCPを追加するだけで形状の正しさが上がる根拠はない。MCPの有用な部分は「作業後に見る」「複数角度で見る」というループであり、それを既存のheadless経路に導入する。
- live編集・viewportへの直接対話が必要になった時に接続手段を再検討する。今回は新しいプラグインの導入を品質改善の前提にしない。

### Gaps

- MCP導入あり・なしの美的品質を統制比較した研究は今回確認していない。MCP一般の価値がないと結論するものではない。

## 現画像で優先して直す箇所と実装チェックリスト

### Takeaway

椅子は足先・排水穴・座面から脚への曲面、湯桶は巻き縁・胴の見え方・黄色の再現が優先。まず比較条件を揃え、どれが実際の形状差かを分離する。

### Cited Findings

以下は外部資料の主張ではなく、リポジトリ内画像を目視した観測:

- `assets/bath_stool/ref/bath_stool__ref_threequarter_v01.png` と `assets/bath_stool/blend/bath_stool__final_left_v01.png`: 参照は正面寄りで低い視点、現renderは斜め方向が強く高い視点。現renderでは足端や開口部に角張りが見え、座面から脚の接続が参照より柔らかく膨らんで見える。カメラと照明が異なるため、寸法差はこの画像だけでは断定しない。
- `assets/wash_basin/ref/wash_basin__ref_threequarter_v01.png` と `assets/wash_basin/blend/wash_basin__threequarter_v01.png`: 現renderは参照より淡いbeige寄りに見え、縁の断面・外周に角張りが残る。胴が高く見えるが、投影差を除いてから比率を評価する。

### Inferences

実装チェックリスト:

- [ ] rawと現在のv01を保存し、候補を別ファイルにする。
- [ ] review manifestにcamera・resolution・light・world・material・color management・asset hashを保存する。
- [ ] 参照に合わせた一視点を用意し、参照・v01・候補を同じ表示幅で並べる。
- [ ] 同じ固定シーンで旧版と候補のclay / silhouette / reflection / finalを作る。
- [ ] 椅子の足端、穴、座面と脚の接続を拡大し、角張り・潰れ・膨らみを記録する。
- [ ] 湯桶のrim断面を重点配分し、直線部分より曲率の高い部分へ頂点を割り当てる。修正後に斜めハイライトの途切れを確認する。
- [ ] 各形状変更後、対象箇所と隣接箇所を確認する。全体の平滑化で問題を隠さない。
- [ ] topology・寸法・面数・GLB再読込は機械検査として別記し、見た目の判定を同じ合否欄に混ぜない。
- [ ] 書き出したGLBを再読み込みし、同じ視点でmasterと比較する。保存前だけのレンダーで完了しない。
- [ ] 最終比較には改善した箇所と残る差を具体的に書き、元画像への完全一致を主張しない。

### Gaps

- このノート作成ではモデル修正・コードレビュー・実プレイは行っていない。候補を作った後に同条件での視覚確認が必要。
- Blender公式サイトの本文取得はこの調査環境で失敗したため、該当項目は検索ツールが返した公式ページ抜粋で確認した。GitHubの作者READMEは本文を取得して確認した。サイトが有料・利用不能であるとは判断していない。
