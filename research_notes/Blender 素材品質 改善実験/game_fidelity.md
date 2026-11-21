# Blender 素材品質改善: 形状・法線・ゲーム表示

調査日: 2026-11-21。対象は今回の銭湯椅子・湯桶。参照画像 → 生成された原本 → Blender 調整 → GLB の流れを保ち、無料の既存ツールで改善する。以下は実装前後を比較するための調査記録であり、形状改善の実測結果ではない。

## 1. 何を先に直すべきか

### Takeaway

最優先は参照画像に対する形状の忠実度と、その形状をゲームまで保つこと。normal map、Weighted Normal、テクスチャ解像度を先に増やしても、縦長に伸びた湯桶や楕円の口は直らない。

### Cited Findings

- 今回調査した v01 の [湯桶調整スクリプト](../../scripts/finish-wash-basin.py) は `normalize()` で XYZ をそれぞれ別の倍率にし、幅 0.20 m、奥行 0.18 m、高さ 0.14 m に合わせていた。断面平均化の前後にも楕円補正があり、生成原本の縦横比は保持されない。
- 調査開始時の [配置処理](../../src/view/environmentModels.ts) も、配置枠の幅・奥行・高さへそれぞれ別倍率で合わせていた。これはモデル形状を枠へ変形する処理だった。調査中に一様倍率の containment へ変更されたことを確認した。
- [参照画像](../../assets/wash_basin/ref/wash_basin__ref_threequarter_v01.png) と [v01 の完成レンダー](../../assets/wash_basin/blend/wash_basin__threequarter_v01.png) を見比べると、参照の浅く広い印象に対して v01 は背が高い。これは今回の画像比較による観察であり、実物寸法を測った結論ではない。
- Three.js の normal map は照明に使う法線を変え、表面の実形状は変えない。[Three.js: MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)

### Inferences

一様倍率 `s = min(配置幅/モデル幅, 配置高さ/モデル高さ, 配置奥行/モデル奥行)` で枠内に収め、底と中心だけを配置位置へ合わせる。衝突枠を維持しながら、見た目の縦横比を保持できる。作者側の非一様正規化も併せて修正する必要がある。

湯桶では幅に対する高さ、口の丸さ、縁の厚さ、内側の深さを先に評価する。椅子では座面、脚の開き、脚の穴の輪郭、床との接地を先に評価する。変形後の raw への距離が小さくても、参照への忠実度の証明にはならない。

### Gaps

参照画像は単一の透視画像で、正確な寸法や真上形状は与えられていない。幅高さ比の判断にはカメラ仰角も影響する。raw と参照の双方を同条件で比較し、比率は根拠付きの調整値として記録する。

## 2. 固定の三角形数より、見える輪郭の誤差を制御する

### Takeaway

高品質の編集用 master を保持し、それからゲーム用候補を作る。ポリゴン数を先に満たすだけで合格にせず、近接時の輪郭・縁断面・ハイライトを基準に採否を決める。

### Cited Findings

- meshoptimizer 原作者の資料は、簡略化に三角形数と形状誤差の両方を与え、誤差制約があれば目標三角形数に届かない場合があると説明する。誤差制約を外すと原形から大きく変わり得る。また、形状誤差を画面上の 1 pixel の大きさへ換算し、LOD の可否を決める例を示す。[meshoptimizer: Simplification](https://github.com/zeux/meshoptimizer#simplification)
- Three.js の LOD は距離ごとに別モデルを割り当てられ、hysteresis で境界付近の切替を安定させられる。[Three.js: LOD](https://threejs.org/docs/pages/LOD.html)

### Inferences

今回 meshoptimizer を新規導入する必要はない。Blender で master と候補を同じカメラ・背景・ライトで描き、誤差を見て残すという考え方を採用する。

湯桶の真円を等分した場合、画面半径を R pixel、周方向の分割数を n とすると、円弧から弦までの最大距離は `R × (1 − cos(π/n))`。これは幾何計算であり品質の普遍的基準ではない。R=120 pixel なら 24 分割で約 1.03 pixel、48 分割で約 0.26 pixel、64 分割で約 0.14 pixel。この単純例では現行の 48 分割自体より、高さ比や縁の断面形状を先に直す意義が大きい。斜め視点、楕円、内側の断面は別途評価する。

最初の比較基準として、近接時のシルエット差 0.5 pixel 程度を目安にできる。ただしこれは今回の提案値。最終判断は画像比較と対象端末の性能による。近接で必要な形状を一律削るより、必要な場合に高品質の近距離版と軽量の遠距離版を分ける。少数の小物だけなら、LOD の追加自体が必須とは限らない。

### Gaps

今回、実ゲームでの最接近距離・描画サイズ・フレーム時間は測定していない。通常入力の通しプレイは担当セッションへ残し、素材単体の固定カメラ比較で進める。

## 3. Bevel、Weighted Normal、法線転写は何を改善するか

### Takeaway

輪郭や厚みを変える部分は実ジオメトリにする。法線操作は、既に適切な形状の面をきれいに見せる補助として使う。

### Cited Findings

- Blender の Bevel shader node は角の丸みをシェーディングで表現し、ジオメトリは変更しない。Cycles 用で、ゲーム用へ持ち出すならベイクなどが必要になる。[Blender 4.5: Bevel Node](https://docs.blender.org/manual/sr/4.5/render/shader_nodes/input/bevel.html)
- Weighted Normal modifier は面積や角度を重みに custom normals を変更する。Keep Sharp と face influence を使って面やエッジの扱いを制御できる。[Blender 4.5: Weighted Normal](https://docs.blender.org/manual/th/4.5/modeling/modifiers/normals/weighted_normal.html)
- Blender は Data Transfer による他メッシュからの法線転写も案内する。[Blender 4.5: Normal Edit](https://docs.blender.org/manual/en/4.5/modeling/modifiers/normals/normal_edit.html)

### Inferences

湯桶の巻いた縁、椅子の脚や穴の大きな丸みは実ジオメトリで保持する。平面と小さな面取りが接する部分には Weighted Normal が候補になる。一様に曲がる湯桶全体に強い重みを掛けることが必ず改善になるとはいえないため、ハイライトの途切れを比較して決める。

高品質 master から low へ法線を転写する方法も、双方の形状が近い場合に検討する。位置のずれ、穴、厚み不足、溶けた脚の形を直す処理ではない。生成 raw のノイズをそのまま転写せず、参照に合わせて整えた master を使う。

Subdivision は面の密度を増やすだけではなく形を変える。穴、縁、接地部など守る形に支持ループや適切な crease を設け、滑らかさと比率を別々に確認する。これは今回の実装上の提案であり、全対象へ一律に適用する手順ではない。

### Gaps

Blender 公式本文の一部は直接取得がツール側で失敗したため、公式ドメインの検索索引本文で確認した。上記には実際に読めた公式ページをリンクしている。Weighted Normal の現行 Blender バージョン別 UI や export 後の custom normals の扱いは、実ファイルで確認する必要がある。

## 4. high → low の normal bake は今回必要か

### Takeaway

採用価値はあるが、最初の修正で必須にはしない。滑らかな単色プラスチックでは、正しい輪郭・丸み・法線だけの GLB を先に比較する。近接で不足する細部が残った場合に bake を加える。

### Cited Findings

- Blender の Selected to Active は選択した高詳細オブジェクトから active な低詳細オブジェクトへベイクする。投影には ray distance、extrusion、cage の調整が必要。tangent-space normal は変形や変換から独立して使う形式で、UV 島の余白はフィルタリングや mipmap による継ぎ目を防ぐために使われる。[Blender 4.5: Render Baking](https://docs.blender.org/manual/de/4.5/render/cycles/baking.html)
- ベイク対象メッシュには UV と画像の出力先が必要になる。[Blender 4.5: Render Baking](https://docs.blender.org/UATEST/manual/en/4.5/render/cycles/baking.html)

### Inferences

実施する場合は、原本を保持 → 参照に合わせた master → シルエットを保った low → UV → tangent normal bake → GLB → 再読み込み比較、の順にする。内側・外側が近い湯桶の縁では投影が逆側を拾う可能性を確認し、cage や ray distance を調整する。縁そのものの薄さやシルエットを normal map で代替しない。

現在の湯桶調整は UV を除去し、テクスチャなしの材質にしている。したがって normal bake の導入には UV 作成、texture の保存・export、ゲームでの再確認が増える。今回の主原因が縦横比なら、これを先に導入しても主原因は残る。

### Gaps

normal bake の A/B 実験はこの調査では行っていない。素材の見た目とコストを比較し、採用する場合だけ画像解像度や圧縮を決める。

## 5. Blender で綺麗でもゲームで同じに見えるか

### Takeaway

完成 GLB の再読み込みに加え、ゲーム側に近い材質・照明条件でも素材単体を評価する。Blender の見栄えだけを完成判定にしない。

### Cited Findings

- 今回の [Blender 調整スクリプト](../../scripts/finish-wash-basin.py) は Cycles、AgX、複数の area light で描画している。一方 [ゲームの scene](../../src/view/scene.ts) は HemisphereLight と DirectionalLight を設定し、調査時点で環境マップは設定されていない。
- MeshStandardMaterial は PBR 用の metallic/roughness モデルで、公式資料は良い結果のために environment map を推奨する。[Three.js: MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)
- Three.js は glTF 2.0 用 loader を提供する。対応する材質・圧縮機能があることと、元の形状が正しいことは別の問題である。[Three.js: GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)

### Inferences

検査を三つに分ける。黒いシルエットで形を確認し、単色の中間グレーと斜光で面のうねりを確認し、最終材質で色・roughness・反射を確認する。ゲーム照明相当の素材プレビューは原因切り分けに有用。ゲーム全体の照明変更を、形状修正の成功と混同しない。

参照画像と完成画像は、同じ大きさ・視点・余白で並べる。完成 GLB を読み戻し、非一様スケール、法線、穴、裏面、底の位置、材質を確認する。この検査は自動化して繰り返せるが、数値が通るだけで見た目の承認済みとはしない。

### Gaps

色管理マニュアルの旧 URL は 404 となり、今回詳細な色変換経路までは調査していない。実際のゲーム側出力の色差は未測定。

## 今回の実行順案

1. raw と v01 の保存、参照と raw の比率確認。
2. 作者側の強制 XYZ fit を外し、参照の形を保つ master を作成。
3. 配置側も一様 containment と底合わせに統一。
4. 縁・穴・脚の輪郭を優先して low を作成し、固定カメラで比較。
5. GLB 再読み込みと数値検査、シルエット・斜光・最終材質の画像検査。
6. まだ不足する細部にだけ Weighted Normal、法線転写、normal bake、LOD を追加。

この順序は今回のコードと画像の観察に基づく技術選定である。「みんなが使っている」ことを人気や採用率の統計として検証したものではない。採用する仕組みの根拠は、一次資料で説明された機能と、今回の問題への適合性にある。
