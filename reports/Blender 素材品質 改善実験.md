# 形状を守り、比較して素材品質を上げる

**重要な輪郭を保つ曲面設計と、同条件の画像比較を導入し、椅子・湯桶のv02を制作した。** 面数やファイル検査の合格だけでは、見た目の完成度は判断できない。v01で残った椅子の穴・足先・アーチと、湯桶の比率・縁・色を修正し、途中の品質後退も比較で検出して直した。無料の既存Blender環境を使い、実際のMeshy原本を保存している。「みんな」の採用率は未調査で、以下は公式資料と作者資料に記載された手法の適用判断である。

## 輪郭と比率を先に直す

椅子は全体の平滑化を重ねず、座面・穴・脚の境界に沿う制御メッシュと支持ループを使う。Subdivisionで曲面を作り、支持ループと保護する辺の属性で重要な縁を維持した。湯桶は縁の曲率へ頂点を配分し、制作・配置の双方で縦横比を保つ。法線補正やベイクは輪郭が整った後に検討する。([Subdivision](https://docs.blender.org/manual/fi/5.2/modeling/modifiers/generate/subdivision_surface.html)、[Three.js材質仕様](https://threejs.org/docs/pages/MeshStandardMaterial.html))

## 固定条件の画像で修正を判定する

参照に投影を合わせた比較に加え、旧版と候補を同じカメラ・照明・露出で描く。**単色で曲面、黒い輪郭で形、斜めの反射でうねり、最終材質で色**を確認し、正面・側面・斜め・上・下から穴と縁を点検する。Blender自身の検査も基準・結果・差分を並べる方式を採る。書き出したGLBも読み戻して比較する。([Blender Render Tests](https://developer.blender.org/docs/handbook/testing/render/))

## 数値と追加ツールの役割を限定する

rawへの距離は原本からの変化を測る値で、参照への忠実度ではない。面数は輪郭の画面上の誤差と併せて判断する。作者が示すLOD評価も距離・FOV・画面高さを用いる。([meshoptimizer](https://github.com/zeux/meshoptimizer#simplification)) MCPのPython実行・複数視点確認は既存の自動レンダーでも構成できるため、新規導入は前提にしない。([MCP for Blender](https://github.com/ahujasid/mcp-for-blender#capabilities))

## 実行結果と残る確認

椅子は**4,610面・84,676 bytes**のv02を採用した。座面の三角形の陰影、足先の尖り、アーチ上の鋭い折れが改善し、穴の貫通と4脚を保持した。足元が悪化した中間候補は戻し、側面の肩だけを局所修正した。最終計測は非多様体辺・退化面とも0、穴の5点は上下方向とも貫通。([椅子の計測](../assets/bath_stool/quality/v02/measurements.json))

湯桶は**2,816面・52,320 bytes、直径200 mm・高さ90.517 mm**のv02を採用した。深すぎた比率を直し、円形の開口と縁・側壁の連続性を保持した。([湯桶の計測](../assets/wash_basin/quality/v02/measurements.json))

湯桶の色だけのA/Bでは、外壁の暗いmustard感が軽減した新色を採用した。**形状・法線を含むBINは同一、JSONはbaseColorFactorだけの変更**である。([色比較](../assets/wash_basin/quality/v02/color-ab/index.html)、[不変性の照合](../assets/wash_basin/quality/v02/color-ab/geometry_audit.json))

最終版は512 px・AgX・露出0の共通シーンで5視点×4パスの旧新比較を保存した。全5視点の材質画像と代表的な診断画像を目視し、重大な新欠点は見つからなかった。比較対象と実GLBのSHA-256も一致する（椅子`1df13475…7515e55`、湯桶`29196b8b…be80111`）。([椅子の最終比較](../assets/wash_station/quality/v02/bath_stool/index.html)、[湯桶の最終比較](../assets/wash_station/quality/v02/wash_basin/index.html))

残る限界は、反射検査で見える椅子の軽い面の境目、穴端・足先・湯桶の縁の軽微な角張り、参照画像との厳密な色・形状の不一致である。単一参照から裏面の正解は確定できない。統合担当からは259テスト／20ファイルとbuildの成功報告を受けたが、**独立コードレビュー・実プレイ・実GPUのFPS測定は未実施**。素材の採用とゲーム全体の最終確認を区別し、外部公開は行っていない。

証拠の範囲: Blender公式資料は直接取得が失敗し、公式検索抜粋で確認した。meshoptimizerとMCPの作者READMEは本文確認済み。今後は完成画像だけでなく比較条件も保存し、次の修正で同じ欠点が再発したか判定できる状態を残す。
