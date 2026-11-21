# Blender生成メッシュの成形品らしさを改善する実装メモ

調査日: 2026-11-21。対象: bath stool / basin。無料のBlender標準機能のみ。参照画像 → 実際のMeshy raw → Blenderで形を調整 → GLBの由来を維持する。利用者数を調べたものではなく、Blenderが公式に説明する制作手法の適用判断である。

## 優先してどの仕組みを取り入れるか

### Takeaway

1. **全面Smooth＋voxel＋一律Decimateの連続処理を止める。** 座面外周、取手穴、脚のアーチ、足先を別の特徴として制御する。
2. 実rawを保持し、rawの断面・輪郭に合わせてquadの制御メッシュを作る。支持ループまたはcreaseを配置し、Mirror＋Subdivisionで曲率を整える。rawの誤形状を参照画像に基づき直した場所は記録する。
3. 素材の詳細マスターとゲーム用メッシュを分離する。最初から3,000三角形に圧縮せず、輪郭と穴の縁の形が決まってから配分する。
4. 参照と一致するカメラの比較を追加する。無彩色、一定照明、正面・側面・斜め・穴の接写で形を確認し、その後に色と粗さを決める。

### Cited Findings

公式Retopologyは、元メッシュに重なる新しいメッシュを作り、形状を合わせていく方法を説明している。Snapping / Poly Buildが利用できる。QuadriFlowはSubdivision向きの自動quad化候補だが、完全な自動トポロジー設計ではない。[Blender 5.2: Remeshing](https://docs.blender.org/manual/id/5.2/modeling/meshes/retopology.html)

Subdivisionは少数の制御頂点から滑らかな面を作れる。Catmull-Clarkは縁を丸めるため、支持ループやweighted edge creaseで形を保つ。分割数の増加だけでは元の形の誤りを直せない。[Subdivision Surface](https://docs.blender.org/manual/fi/5.2/modeling/modifiers/generate/subdivision_surface.html)

### Inferences

現stoolでは形の重要度に応じた辺の配置がなく、成形品に必要な一定の縁幅、座面の平坦さ、穴の丸い縁を安定して作れない。sourceに合わせたquad制御メッシュなら、単なる三角形増加より修正箇所と結果の関係が明確になる。これはrawを捨てて別の汎用プリミティブに置き換える提案ではない。

### Gaps

参照が単一画像なので裏面の正解は確定できない。不可視部はrawと実物としての厚みを根拠に保守的に維持する。QuadriFlowだけで取手穴・脚穴が十分な品質になる保証はない。

## 現行処理はなぜ輪郭と穴を弱めるか

### Takeaway

1.2mm voxelだけを原因と断定しない。特徴の保護なしで強いSmoothを重ね、最後に3,000三角形へ崩す連続処理が問題の候補。どの段階で崩れたかは中間メッシュ比較で切り分ける。

### Cited Findings

Voxelは3D格子に表面を近似し直す。格子は形状の流れに沿わず、細部を残すには小さいvoxelが必要。公式はSubdivision用にはQuad方式、健全な形状の減面にはDecimateを勧めている。[Remeshing](https://docs.blender.org/manual/id/5.2/modeling/meshes/retopology.html)

Collapse Decimateは頂点を順次まとめる方式で、指定比率は三角形換算。Vertex Groupで処理箇所を制御できる。一律比率は個々の開口輪郭や設計上の意味を指定するものではない。[Decimate Modifier](https://docs.blender.org/manual/en/5.0/modeling/modifiers/generate/decimate.html)

### Inferences

`scripts/finish-bath-stool.py`の直接確認: 全体Smooth factor .75 × 40回 → 上面圧縮 → voxel .0012m → 全体Smooth .6 × 12回 → 足元Smooth .75 × 50回 → collapseで3,000tri → 寸法再正規化。これは穴の縁と面の境界を固定しない。再正規化は全体寸法を戻すが、局所曲率や縁幅を戻さない。

直接視認: `assets/bath_stool/ref/bath_stool__ref_threequarter_v01.png`は均一な丸縁と平坦な座面を持つ。`assets/bath_stool/blend/bath_stool__final_left_v01.png`は輪郭の小さな折れと柔らか過ぎる座面、弱い穴縁が見える。ただし両者のカメラ・照明は一致していないため、画像上の差をすべて幾何誤差と数値化してはいけない。

### Gaps

各処理段階の対照実験は未実施。Smoothの何回分が許容値か、voxelサイズの変更だけでどこまで改善するかはまだ分からない。

## 各モディファイアは何を直し、何を直せないか

### Takeaway

| 手法 | 今回の用途 | 限界・注意 |
|---|---|---|
| Quad制御メッシュ＋支持ループ | 座面、脚の断面、穴の境界に沿う曲率の設計 | 作業が必要。単にquadに変えただけでは形は良くならない |
| Subdivision＋crease | 滑らかな輪郭と必要な縁の維持 | 不適切なpoleや極端な細長いquadはpinchingを生む。誤形状は自動修正しない |
| 局所Shrinkwrap | 新メッシュをrawの有用な面に合わせる | 誤ったraw、凹凸、反対側の薄い壁にも吸着し得る。全面適用しない |
| 指定した縁のBevel | 均一な製品の丸縁を実ジオメトリで作る | dense三角形全体へANGLEでかけると意図しない辺まで選ぶ |
| Weighted Normal | 平坦な面とbevelの陰影を整理 | 頂点位置、シルエット、穴の形状は変わらない |
| Data TransferのCustom Normals | 仕上げ済み高密度マスターの陰影を低密度版へ転写 | 元が波打っていればその陰影を転写する。輪郭は直さない |

### Cited Findings

Shrinkwrapは表面最近点または投影で頂点を移動する。Vertex Group、投影方向、距離制限、面のカリングを持つ。Inside/Outside判定は鋭い角付近で安定しない場合がある。[Shrinkwrap](https://docs.blender.org/manual/de/5.2/modeling/modifiers/deform/shrinkwrap.html)

BevelはAngle / Weight / Vertex Groupで対象を制限できる。Harden Normalsは周辺面の陰影を保つ。Face Strengthを設定し、後段のWeighted Normalで利用できる。[Bevel](https://docs.blender.org/manual/id/5.2/modeling/modifiers/generate/bevel.html)

Weighted Normalは面積・角度などでface-corner normalsを調整し、Keep SharpやFace Influenceを使える。[Weighted Normal](https://docs.blender.org/manual/en/5.2/modeling/modifiers/normals/weighted_normal.html)

Data TransferはCustom Normalsなどを対応面から補間する。転写先のデータ層、距離制限、マッピング方式の指定が必要。[Data Transfer](https://docs.blender.org/manual/en/5.2/modeling/modifiers/modify/data_transfer.html)

### Inferences

推奨スタックは一つに固定しない。

- **stoolの成形曲面:** Mirror → 必要部分だけsourceへ合わせるShrinkwrap → 支持ループ/crease付きSubdivision（初期1～2）→ 必要なら局所の形状補正。厚み・裏面を持つrawから全体を再構成するなら、別途Solidifyを一律に追加しない。
- **平板主体の部位:** Mirror / 形状編集 → Weight指定Bevel → Weighted Normal。Subdivisionとの二重の丸めを無条件に重ねない。
- **GLB用複製:** マスター評価形状から必要な密度を残す → 最終三角形化 → 必要なら仕上げマスターからnormal transfer → export。Normal Transferは輪郭の合格後に限る。

これは今回の実験案であり、Blenderが唯一の正解として指定する順序ではない。ShrinkwrapをSubdivision後に全面配置すると、せっかく整えた面をrawのノイズへ戻しかねない。

### Gaps

GLB再読込後にnormal transferの結果が保たれるかは、実際のexport設定で確認が必要。今回のプラスチック曲面にWeighted Normalが有効とは限らないため、on/off比較で採否を決める。

## Blender 5.xのAPIをどう安全に使うか

### Takeaway

旧チュートリアルの`MeshEdge.crease`、`MeshEdge.bevel_weight`、`mesh.use_auto_smooth`をコピーしない。現在の属性APIと実行環境のRNAを確認する。

### Cited Findings

Blender 4.0でcrease / bevel weightはgeneric attributesに移行。名前は`crease_edge` / `crease_vert` / `bevel_weight_edge` / `bevel_weight_vert`。`edge_creases_ensure()`も利用できる。[4.0 Python API変更](https://developer.blender.org/docs/release_notes/4.0/python_api/)

4.1で旧Auto Smooth設定はmodifier node group assetへ置き換えられ、sharp/smoothとcustom normalsの状態に応じて必要な法線が計算される。[4.1 Modeling変更](https://developer.blender.org/docs/release_notes/4.1/modeling/)

### Inferences

実行環境のheadless RNA確認結果（ファイル保存なし）: **Blender 5.2.4 LTS**。`Mesh.edge_creases_ensure()`あり、`use_auto_smooth` / `auto_smooth_angle`なし。Bevelは`affect='EDGES'`、`limit_method='WEIGHT'`、`edge_weight`、`harden_normals`、`face_strength_mode`あり。Subsurfは`use_creases`、`levels`、`render_levels`、`use_custom_normals`あり。Shrinkwrapは`vertex_group`、`project_limit`、`wrap_method`、`wrap_mode`、`cull_face`あり。

### Gaps

公式サイトの直接openはこの調査ツールでは402、通常HTTP取得は403になった。別の権限や契約が必要だという意味には解釈していない。検索ツールから取得できた公式ページ本文を根拠とし、APIは実機5.2.4で確認した。本文中の一部英語ページは同じ公式サイトの言語別URLを引用している。
