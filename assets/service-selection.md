# Image to 3D service selection

Checked: **2026-11-20**. Selected: **Meshy Free, Meshy 6 Lite, without textures**, followed by Blender. This implements the required reference image → Image to 3D → Blender → game pipeline.

The authorized scope includes free registration, acceptance of the service terms, uploading the project's original reference images, and generation within the free allowance. Paid subscriptions, credit purchases, and paid downloads are not authorized.

At the start of this pilot, the Meshy UI showed Free with 100 credits, Meshy 6 Lite, CC BY 4.0, and 10 credits for the generation. The original duck reference PNG was uploaded and generated successfully. At 14:32 JST, the untextured GLB download completed (90,266 triangles, 45,135 vertices); the download counter changed from 10 to 9. The UI also showed 125 credits after onboarding rewards, so do not infer the remaining balance by subtracting the generation cost from the initial balance. Blender 5.2.4 LTS was installed and verified. See the ledger for the subsequent adjustment/export stages; a downloaded source mesh alone does not complete game integration.

## Repeatable workflow

1. Use a project-created image without personal information, private metadata, or third-party characters. Keep the input in `assets/<asset_id>/ref/` and record its provenance and checksum in `ledger.csv`. The pilot input is `duck/ref/duck__ref_threequarter_v01.png` relative to this directory.
2. In the Meshy web app, open **Model → Image to 3D**, select **Meshy 6 Lite**, and leave **Texture off**. Check the displayed plan, credit cost, download eligibility, and license before generating. Do not use 3D Agent, API access, or a paid upgrade for this workflow.
3. Inspect the completed mesh in the viewer, then download **GLB**. Keep the unmodified download in `assets/<asset_id>/gen/`; record the actual settings, generation date, applicable terms, and checksum. A progress indicator or preview alone does not complete this stage.
4. Import into Blender. Repair geometry, reduce polygons as needed, add materials, and set scale, orientation, and origin to match `README.md` and `manifest.json`. Save the editable `.blend`, then export `public/models/<asset_id>.glb`. Record actual modifications and measured limits.
5. Complete the ledger's reference/generated/blend/final stages, confirm redistribution rights, add attribution, and verify the model in the running game. Record the actual operator and tools; do not attribute Codex-operated image or browser work to Kiro.

The free plan currently provides **100 credits and 10 downloads per month**, with downloads limited to **untextured Meshy 6 Lite** models. Textured models, Meshy 6/7 models, and 3D Agent outputs require a paid plan to download. The reference generation cost for 6 Lite is **10 credits**; the current UI takes precedence. Start with the duck before consuming credits on other assets. See [Free plan](https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan), [credit costs](https://help.meshy.ai/en/articles/10000507-how-many-credits-does-each-generation-task-cost), and [download restrictions and GLB](https://help.meshy.ai/en/articles/10421033-why-can-t-i-download-my-model).

## Rights and publication

Meshy's terms, dated 2026-09-19, §3.2 license free-plan outputs under **CC BY 4.0**. Commercial use, modification, and redistribution are permitted with the license conditions. The repository's **MIT license covers its code; it does not replace the asset license**. Preserve the Meshy attribution, license link, supplied notices, and an accurate description of modifications in the ledger and distributed asset notices. See [Meshy terms](https://www.meshy.ai/terms-of-use) and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Attribution template, to fill only after the corresponding work is done:

> [Asset name]: generated with Meshy 6 Lite, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified in Blender: [actual changes]. Source and generation date: [public-safe ledger reference].

**Do not publish to Meshy Community as part of this workflow.** Community publication has different terms: §3.3 places generated outputs under CC0 and other community content, including uploaded images, under CC BY-NC 4.0. Downloading for this repository is a separate action.

The duck reference is **AI-generated using OpenAI image generation**, not a photograph or a claim of exclusively human authorship. OpenAI's [Terms of Use, Content section](https://openai.com/policies/terms-of-use/) assign its rights in output to the user, as between the parties and to the extent permitted by law. This does not guarantee copyright protection, uniqueness, or clearance of third-party rights. Record the reference image's distribution license separately from Meshy's output license.

## Upload privacy

Meshy terms §2.9 allow non-Enterprise inputs and outputs to be used for training and service improvement; opting out requires contacting support. **Do not assume this free workflow is excluded from training.** Upload only the intended project image, never account information, private photographs, credentials, repository contents, or local logs. Keep account identifiers, private task URLs, and absolute paths out of committed records. See [Meshy data-use explanation](https://help.meshy.ai/en/articles/15724182-is-meshy-safe-and-private-data-and-training-faq).

Recheck these terms and the displayed plan before later generations. If the free workflow becomes unavailable, record the blocker and continue other authorized work; do not purchase an upgrade or declare an unfinished asset complete.
