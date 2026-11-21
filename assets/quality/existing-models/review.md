# 既存モデルの素材評価

2026-11-21。対象は Duck、サウナハット、Child、Adult。素材の見た目を確認する記録であり、Crew B のコードレビュー、実プレイ、ユーザーの最終承認を代替しない。

## 現在の判定

| 対象 | 描画して確認した版のSHA-256先頭 | 素材QAの判定 |
| --- | --- | --- |
| Duck | `75ca48aec7a8` | 採用可。胸と尾根の凹み、翼の識別性、顔と色境界を確認 |
| Hat | `e6362a9bdffa` | 単体形状は採用可。装着は統合担当が別途確認済み（後述）。無地のマット材質は原画の繊維感を完全には再現していない |
| Child | `31d2ea528cd0` | 採用可。前髪先の塗り分けを再修正して確認 |
| Adult | `ce320d146619` | 採用可。短パン裾の塗り分けを再修正して確認 |

以下には、差し戻した候補と最終候補の根拠を順に残す。全ハッシュ、直接確認した画像、残る限界は各判定の本文を参照する。

### 統合担当の最終確認と配布版

統合担当は [帽子装着の斜め像](attachments/duck_hat_threequarter.png)、[大人の手との側面](attachments/adult_clothed_hand_side.png)、[入浴variantでの運搬](attachments/adult_bath_carry.png) を直接確認した。帽子は目・嘴を隠さず、ラベル下端との間隔は24.840 mm。大人の静的な片手ポーズとアヒルの位置を確認し、胴の大きな食い込みは見られない。これは通常入力での持ち上げ・歩行・着脱検証ではない。

最終監査でHuman GLB内のPNGにEXIF chunkが残っていたため、埋め込み画像の不要メタデータだけを除去した。頂点・法線・UV・indexを含む非画像buffer view、材質・変換、およびIHDR/IDATを含む残したPNG chunkはbyte単位で不変。描画元hashを比較JSONに保持し、配布版hashを別項目で記録した。[除去前後の証跡](embedded-png-sanitization.json) があり、配布版をBlenderへ読み直して装着画像も再生成した。

| 対象 | 描画元 | 最終配布版 |
| --- | --- | --- |
| Child | `31d2ea528cd0` | `e69c7427abf6` |
| Adult | `ce320d146619` | `61ce44be0c75` |

Duck `75ca48aec7a8` とHat `e6362a9bdffa` は確認時からバイト変更なし。Humanの元データからの再実行でも、配布版とgeometry/texture payloadが一致した（[Child](../../child/quality/existing-review/reproducibility.json)、[Adult](../../adult/quality/existing-review/reproducibility.json)）。この対応関係に基づき素材QAの採用判定を引き継ぐ。

## 初期評価

各モデルの原画と保存済みの書き出し後プレビューを直接視認した。原画・旧プレビュー間にはカメラと照明の差があるため、色の明度や画像上の寸法差を、そのまま材質・形状の誤差としては扱わない。

| 対象 | 優先度 | 目視した問題 | 判定・必要な確認 |
| --- | --- | --- | --- |
| Duck | 高 | 嘴の付け根と足首のオレンジ色の境界が階段状で、周辺へ不規則に広がる | 材質領域を整え、形状の折れと色の境界を分けて検査する |
| Duck | 高 | 頬・顎から首・胸に広い面のうねりがあり、嘴の内縁が角張る | 羽や嘴を潰す全体平滑化を避け、主曲面と重要な境界を保つ |
| Duck | 中 | 目の位置と形は前版より整っているが、黒い盛り上がりに見え、原画の暗茶色と小さなハイライトの印象との差が大きい | 同条件で色・粗さ・形状を確認する。ハイライト差をすべて形状の問題とは断定しない |
| Hat | 高 | 冠の肩、裾、吊り輪の輪郭が多角形で、柔らかい帽子の曲面に見えにくい | 吊り輪の穴と厚み、開いた内側、装着位置を守って曲面を調整する |
| Hat | 中 | 原画のフェルトに比べて滑らかな樹脂状に見える | 原画の微細な繊維を形状へ過剰に追加せず、材質とゲーム内の見える大きさを分けて評価する |
| Child / Adult | 高 | 目・眉・口・髪際の色の輪郭がギザギザで、顔の表情が弱い。Childの眉は読み取りにくく、Adultの口・眉は切れた直線に見える | 顔の色境界と、鼻・目周りの形状の陰影を別に確認する |
| Child / Adult | 高 | 襟・袖・服裾の色境界が不規則で肌へはみ出す。ズボン裾にも同様の歪みがある | 素材領域の境界を曲線として整え、再ベイク後のGLBで確認する |
| Child / Adult | 高 | 肩が板状に張り出し、脇や胸に折れ・三角形の陰影がある | 肩幅の契約を保ちつつ、肩と上腕のつながりを連続させる |
| Child / Adult | 中 | 手足に多角形感が残る | 顔・肩・服境界を優先し、その改善で手足を悪化させない |
| Bath outfits | 維持条件 | 既存の浴場表現は抽象的で不透明なtoy/doll | 顔・手足を保持し、解剖学的ディテールや身体に貼り付いたタオルを追加しない |

直接確認した画像：

- [Duck原画](../../duck/ref/duck__ref_threequarter_v01.png)、[正面](../../duck/blend/duck__front_v02.png)、[斜め](../../duck/blend/duck__left_v02.png)、[顔の拡大](../../duck/blend/duck__eyes_v02.png)。
- [Hat原画](../../hat_sauna_duck/ref/hat_sauna_duck__ref_threequarter_v01.png)、[Duck装着プレビュー](../../duck/blend/duck__hat_v02.png)。
- [Child原画](../../child/ref/child__ref_threequarter_v01.png)、[着衣](../../child/blend/child__clothed_preview_v01.png)、[浴場variant](../../child/blend/child__bath_preview_v01.png)。
- [Adult原画](../../adult/ref/adult__ref_threequarter_v01.png)、[着衣](../../adult/blend/adult__clothed_front_v01.png)、[浴場variant](../../adult/blend/adult__bath_front_v01.png)。

## 修正候補の評価

初期指摘は各制作担当へ送付済み。固定条件の旧版・候補比較で、欠点の改善と別箇所の品質後退を確認する。現時点で新候補の採用は確定していない。

### 中間候補の差し戻し

10:30時点の制作中プレビューを確認した。候補の通常パスは更新されるため、この評価は固定された最終版の評価ではない。

- **Child：不採用。** 目・眉・口の色の輪郭は滑らかになったが、髪先が板状に伸び、頬・額・耳が広い平面へ潰れた。生成原本の無彩色プレビューは丸みを保っていた。原因を原本の品質不足と決めつけず、減面の重みと顔領域に残った面の配分を先に確認するよう依頼した。色の改善と形状の後退を相殺して合格にはしない。
- **Duck：比較対象外の中間破綻。** 頭に大きな三角面と黒い面が広がり、斜め像では胴と脚が尖った塊へ潰れたように見えた。制作担当は減面の重みの逆作用を修正中であり、修正が終わった固定版を待つ。暗茶色の光沢のある目は原画へ近づく方向だが、この段階では採用を判断しない。
- **Hat：再調整。** 基本の帽子形状と中空は保たれている。吊り輪の輪郭が少数の角を持ち、冠の肩に平面の境目が残る。輪と裾の曲率へ面を配ることを推奨した。

制作担当には、まずmasterと軽量版の無彩色・輪郭比較で局所の形を確認し、頭・輪などの領域別に残った面数を確認してから、テクスチャと最終材質の評価へ進むよう伝えた。実装上の原因確定と修正は制作担当が行う。

### Duckの固定比較：胴の再調整が必要

対象候補 SHA-256: `c03e94dcb492cfa09f6b9a5542a36214cc0de8abf1ca71baacc2bbad68e4f733`。比較記録の候補ハッシュと一致。7,296 triangles。**この候補は最終採用不可。**

- 頭・頬の広い凹凸、嘴の付け根の色境界、眼の暗茶色と反射は旧版より明確に改善した。
- 正面の胸を縦に走る溝、肩から翼根の盛り上がり、側面の翼後ろから腹下の凹凸、後面の尾根両脇の深い窪みは、旧版とほぼ同じ位置に残る。無彩色像でも確認でき、色や照明差だけでは説明できない。凹んだ玩具に見えるため、胸だけでなく胴の全周を局所的に整える必要がある。原本から引き継いだ形状であっても、そのことを採用の理由にはしない。
- 頭の輪郭には軽い多角形感が残る。胴の修正を優先し、羽の段や尾の輪郭を過度な平滑化で潰さない。
- 黄色は原画より淡く見えるが、原画と比較画像の照明・色変換は一致していない。制作スクリプトの線形RGBは `(1, 0.55, 0.004)` であり、現時点ではテクスチャ自体の低彩度とは断定しない。色を変える場合も固定照明で確認する。

直接見比べた画像は [beauty斜め・旧](iterations/duck-before-body-fairing/before_beauty_threequarter.png) / [候補](iterations/duck-before-body-fairing/after_beauty_threequarter.png)、[beauty顔正面・旧](iterations/duck-before-body-fairing/before_beauty_face_front.png) / [候補](iterations/duck-before-body-fairing/after_beauty_face_front.png)、[clay正面・旧](iterations/duck-before-body-fairing/before_clay_front.png) / [候補](iterations/duck-before-body-fairing/after_clay_front.png)、[clay側面・旧](iterations/duck-before-body-fairing/before_clay_side.png) / [候補](iterations/duck-before-body-fairing/after_clay_side.png)、[beauty後面・旧](iterations/duck-before-body-fairing/before_beauty_back.png) / [候補](iterations/duck-before-body-fairing/after_beauty_back.png)。撮影条件とハッシュは [比較記録](iterations/duck-before-body-fairing/comparison.json) に記載。差し戻した比較一式は反復記録へ保存した。本段落の判定は上記ハッシュを対象とする。ゲーム内の見え方や動作は評価範囲外。

### Hatの固定比較：形状は採用候補、装着確認は未完了

対象候補 SHA-256: `e6362a9bdffa39b987d30540dbc8bce061b6c867bdddee563ebd0a1bcba7bce6`。比較記録の候補ハッシュと一致。2,064 triangles。

- 冠の肩、裾、吊り輪は旧版より滑らかになり、輪の穴と帽子の中空は保たれた。旧版の内側に見えた不規則な折れも改善した。直接確認した範囲で新たな形状破綻は認めず、**形状は採用候補として可**。
- 裾の輪郭に軽い多角形感は残るが、18cmの装備品の現予算で採用を妨げる程度ではない。繊維を形状として追加する必要はない。
- 高さは旧版の約0.140mから約0.165mへ増えた。計測された詳細masterの約0.164mに近い一方、Duckとの装着位置・目の見切れ・浮きの確認は未完了。単体の形状評価だけでfitを承認しない。
- 原画のフェルトに対し、候補は高い粗さでも無地の樹脂に見える。低振幅の小さな布normal/roughnessをベイクして比較する余地はあるが、過剰な凹凸や繊維形状を追加せず、装着と全体形状を優先する。照明条件の違う原画に一致した色・繊維感までは確認していない。

直接確認した画像は [原画](../../hat_sauna_duck/ref/hat_sauna_duck__ref_threequarter_v01.png)、[beauty斜め・旧](hat/before_beauty_threequarter.png) / [候補](hat/after_beauty_threequarter.png)、[beauty裏側・旧](hat/before_beauty_underside.png) / [候補](hat/after_beauty_underside.png)、[clay上面・旧](hat/before_clay_top.png) / [候補](hat/after_clay_top.png)、[clay斜め・候補](hat/after_clay_threequarter.png)、[clay裏側・候補](hat/after_clay_underside.png)。条件とハッシュは [比較記録](hat/comparison.json) に記載。判定は上記ハッシュに限定し、ゲーム内表示・動作は範囲外。

### Duckの再調整後：素材QAとして採用可

対象候補 SHA-256: `75ca48aec7a8f19d2563dbd4a3f64940b3b299bf6f6d83d09e6283663d557ef2`。固定比較の候補ハッシュと一致。**確認した素材範囲では採用可。**

胴の局所調整で胸の縦溝と尾根両脇の深い窪みが改善した。途中候補では翼の前縁が腹へ溶けて羽先だけの突起に見えたため差し戻し、翼の前側から下側へ回る丸い境界を再調整した。最終候補ではその境界と三段の羽先を保ち、胸・背面の改善も維持している。眼、嘴と足首の色境界、頭・頬も旧版より整った。直接確認した固定画像で、新しい重大な形状破綻は見つからなかった。

接写では頭の輪郭と顎横に軽い面感が残り、嘴の内側も簡略化されている。原画そのままの品質を達成したという判定ではない。帽子の装着fitと実ゲームの見え方・動作は、この素材判定とは別に確認する。

直接確認した画像は [beauty斜め・旧](duck/before_beauty_threequarter.png) / [候補](duck/after_beauty_threequarter.png)、[clay側面・旧](duck/before_clay_side.png) / [候補](duck/after_clay_side.png)、[clay後面・旧](duck/before_clay_back.png) / [候補](duck/after_clay_back.png)、[beauty顔正面・旧](duck/before_beauty_face_front.png) / [候補](duck/after_beauty_face_front.png)、[clay斜め・候補](duck/after_clay_threequarter.png)、[beauty顔斜め・候補](duck/after_beauty_face_threequarter.png)、[beauty正面・候補](duck/after_beauty_front.png)。条件とハッシュは [比較記録](duck/comparison.json) に記載。

反対側の斜めも、[beauty旧](duck-left/before_beauty_threequarter_left.png) / [候補](duck-left/after_beauty_threequarter_left.png)、[clay旧](duck-left/before_clay_threequarter_left.png) / [候補](duck-left/after_clay_threequarter_left.png) を追加確認した。[追加比較記録](duck-left/comparison.json) のハッシュも一致。胸の改善と翼の境界の維持を両側で確認し、判定は変わらない。

### Childの固定比較：前髪先の塗り分けを差し戻し

対象候補 SHA-256: `93d549ec7a63156f39b665944925964a2c96664adcc0652a65d93992a60c86e4`。着衣・浴場の両比較記録で一致。**前髪先の材質境界を修正するまで最終採用は保留。**

- 眼・眉・笑顔の連続した輪郭、顔と肩の丸み、袖・服裾・短パン裾の境界は旧版から明瞭に改善した。手足に新たな大きい形崩れは見つからなかった。
- 顔正面の接写では、中央前髪の先端と左右こめかみに肌色の尖った面が残る。前髪の立体の途中で茶色から肌色へ変わって見えるため、髪領域と顔の色を重ねる範囲の確認を依頼した。色境界の原因という推定は、制作担当の切り分けで確定する。顔中央の目立つ箇所なので、全体が改善したことを理由に見逃さない。
- 浴場variantは不透明で非解剖学的なtoy/doll表現を保持している。首下の赤い色は着衣像だけに見え、浴場像にはないため、現時点では照り返しの可能性が高いと扱い、肌への塗り漏れとは断定しない。

直接確認した固定画像は、着衣の [beauty斜め・旧](iterations/child-clothed-before-hairline/before_beauty_threequarter.png) / [候補](iterations/child-clothed-before-hairline/after_beauty_threequarter.png)、[beauty顔正面・旧](iterations/child-clothed-before-hairline/before_beauty_face_front.png) / [候補](iterations/child-clothed-before-hairline/after_beauty_face_front.png)、[beauty側面・旧](iterations/child-clothed-before-hairline/before_beauty_side.png) / [候補](iterations/child-clothed-before-hairline/after_beauty_side.png)、[beauty後面・旧](iterations/child-clothed-before-hairline/before_beauty_back.png) / [候補](iterations/child-clothed-before-hairline/after_beauty_back.png)、[clay正面・旧](iterations/child-clothed-before-hairline/before_clay_front.png) / [候補](iterations/child-clothed-before-hairline/after_clay_front.png)、[反対斜め・候補](iterations/child-clothed-before-hairline/after_beauty_threequarter_left.png)。浴場の [beauty斜め・旧](iterations/child-bath-before-hairline/before_beauty_threequarter.png) / [候補](iterations/child-bath-before-hairline/after_beauty_threequarter.png)、[beauty後面・旧](iterations/child-bath-before-hairline/before_beauty_back.png) / [候補](iterations/child-bath-before-hairline/after_beauty_back.png)、[beauty側面・候補](iterations/child-bath-before-hairline/after_beauty_side.png)。条件とハッシュは [着衣比較記録](iterations/child-clothed-before-hairline/comparison.json) と [浴場比較記録](iterations/child-bath-before-hairline/comparison.json) に記載。

### Adultの固定比較：短パン裾の塗り分けを差し戻し

対象候補 SHA-256: `5d196bd94f32e5f1cfda7b73c34e273d06d02d251b1b9876271be29155e5ea62`。着衣・浴場の両比較記録で一致。**短パン裾の材質境界を修正するまで最終採用は保留。**

顔の眼・眉・笑顔、肩と上腕のつながり、袖・服裾は旧版より明瞭に改善した。手足や浴場の非解剖学的なtoy表現に重大な回帰は見つからなかった。一方、短パン裾の厚い丸みの終端が肌色の輪になり、全身像でも膝の輪のように見える。旧版では濃灰色が終端まで届いていた。制作担当の計測で、色の境界が原本の裾終端より14〜22mm上に置かれていたことを確認し、形状を維持した塗り分け修正を依頼した。Adultの髪際には薄い肌色の小筋が残るが、Childの大きな三角とは程度が異なり、この段階では追加の必須修正としない。

直接確認した固定画像は、着衣の [beauty正面・旧](iterations/adult-clothed-before-hem/before_beauty_front.png) / [候補](iterations/adult-clothed-before-hem/after_beauty_front.png)、[beauty斜め・旧](iterations/adult-clothed-before-hem/before_beauty_threequarter.png) / [候補](iterations/adult-clothed-before-hem/after_beauty_threequarter.png)、[beauty顔正面・旧](iterations/adult-clothed-before-hem/before_beauty_face_front.png) / [候補](iterations/adult-clothed-before-hem/after_beauty_face_front.png)、[beauty側面・旧](iterations/adult-clothed-before-hem/before_beauty_side.png) / [候補](iterations/adult-clothed-before-hem/after_beauty_side.png)、[beauty後面・旧](iterations/adult-clothed-before-hem/before_beauty_back.png) / [候補](iterations/adult-clothed-before-hem/after_beauty_back.png)、[clay正面・旧](iterations/adult-clothed-before-hem/before_clay_front.png) / [候補](iterations/adult-clothed-before-hem/after_clay_front.png)。浴場の [beauty斜め・旧](iterations/adult-bath-before-hem/before_beauty_threequarter.png) / [候補](iterations/adult-bath-before-hem/after_beauty_threequarter.png)、[beauty後面・旧](iterations/adult-bath-before-hem/before_beauty_back.png) / [候補](iterations/adult-bath-before-hem/after_beauty_back.png)。条件とハッシュは [着衣比較記録](iterations/adult-clothed-before-hem/comparison.json) と [浴場比較記録](iterations/adult-bath-before-hem/comparison.json) に記載。

### Childの前髪修正後：素材QAとして採用可

対象候補 SHA-256: `31d2ea528cd03e9314e184a75ee1e2c85956254a8f82290eaa09687fd539d172`。着衣・浴場の両比較記録で一致。**確認した素材範囲では採用可。**

差し戻し候補の前髪先の肌色三角が消え、茶色が立体の終端まで連続した。眼・眉・口のきれいな輪郭も保たれている。[形状不変の検証記録](../../child/quality/existing-review/texture-only-proof.json) は、旧候補から両outfitのPOSITION・NORMAL・TEXCOORD_0・indicesがバイト単位で同一と示しており、先に直接確認した肩・衣服・手足・浴場の形状評価を継承する。

最終版で直接確認した画像は、着衣の [顔正面](child-clothed/after_beauty_face_front.png)、[顔斜め](child-clothed/after_beauty_face_threequarter.png)、[全身斜め](child-clothed/after_beauty_threequarter.png)、浴場の [顔正面](child-bath/after_beauty_face_front.png)。条件とハッシュは [着衣比較記録](child-clothed/comparison.json) と [浴場比較記録](child-bath/comparison.json) に記載。耳・髪束・顎の軽い面感と接写時のテクスチャの柔らかさは残る。原画への完全一致やゲーム内動作までを保証する判定ではない。

### Adultの裾修正後：素材QAとして採用可

対象候補 SHA-256: `ce320d1466191b1c95cf9ce36f2725740b73af02ca6ca2cc6ca59b0dd50c0f8f`。着衣・浴場の両比較記録で一致。**確認した素材範囲では採用可。**

短パン裾の肌色の輪が前・横・後ろから見ても解消し、濃灰色が丸い裾の終端まで連続している。脚への広い塗り漏れは見られず、顔と肩の改善も維持した。[形状不変の検証記録](../../adult/quality/existing-review/texture-only-proof.json) は、旧候補から両outfitのPOSITION・NORMAL・TEXCOORD_0・indicesがバイト単位で同一と示しており、先に確認した形状評価を継承する。浴場variantの非解剖学的なtoy表現も維持している。

最終版で直接確認した画像は、着衣の [正面](adult-clothed/after_beauty_front.png)、[斜め](adult-clothed/after_beauty_threequarter.png)、[後面](adult-clothed/after_beauty_back.png)、[側面](adult-clothed/after_beauty_side.png)、[反対斜め](adult-clothed/after_beauty_threequarter_left.png)、[顔正面](adult-clothed/after_beauty_face_front.png)、浴場の [斜め](adult-bath/after_beauty_threequarter.png)。条件とハッシュは [着衣比較記録](adult-clothed/comparison.json) と [浴場比較記録](adult-bath/comparison.json) に記載。顔の接写には髪際の浅い筋、耳など局所の面感が残り、原画との照明も一致していない。保持ソケットでの物の見え方やゲーム動作は別途確認する。
