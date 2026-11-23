# Requirements Document: Shoulder View

> **Presentation update (2026-11-22).** Prototype-core-gameplay Requirement 12 supersedes this spec's floating-label requirements (7.2, 7.3, 7.5) and permanent key-help panels. Room/fixture/character/item descriptions are removed from the 3D view; manners use fixed world notices and controls use an optional contextual HUD. Camera, model and towel requirements remain in force.

## Introduction

2026-11-20, the user said the current prototype is not a 3D third-person game. It draws spheres and capsules and uses a low follow camera with a fixed direction ("W = up the screen"). The user asked for a 3D third-person over-the-shoulder game with real 3D character models.

This spec changes only the camera, the movement input mapping, and the display. The game logic in `src/core`, `src/sim`, and `src/level` stays as it is. The confirmed items in `KIRO_HANDOFF.md` remain: 3 characters, the 10-step clear route, F1–F7, Adult accompanying Child, and the 4 checkpoints.

Real character models come only through the confirmed pipeline: image → Image to 3D → Blender → GLB (`.kiro/specs/final-assets`). This spec prepares the loading entry point. It does not produce or call any placeholder shape a final model.

Items marked *(Provisional)* are working choices under `.kiro/steering/project-autonomy.md`. They are not user decisions.

> **Update 2026-11-21.** Character switching is replaced by growth (prototype-core-gameplay Requirement 11): one player grows Duck → Child → Adult. Every criterion below that mentions a switch applies to a growth change of the stage (the camera blends to the new stage's profile, keeps the facing, and never passes through walls). Requirement 7's route-preservation clause now means the growth route.

## Glossary

- **ShoulderCamera**: The follow camera behind and slightly to the right of the active character, looking ahead past its shoulder.
- **CameraYaw**: The horizontal angle of the ShoulderCamera around the active character. Yaw 0 looks toward −Z (the old "up the screen").
- **Facing**: The direction a character's body points. View-only state; it never affects logic.
- **Orbit input**: The player input that turns CameraYaw left or right.
- **CameraProfile**: Per-character distance, height, shoulder offset, and look height.
- **Overview**: The existing auxiliary map view toggled with C.
- **Obstacle**: A wall, a sauna crowd NPC body, the locked sauna door, or the NarrowHole lid.
- **CharacterModel**: A GLB loaded for a character through the final-assets pipeline. Until one exists, the placeholder primitive is drawn.

## Requirements

### Requirement 1: Over-the-shoulder framing

**User Story:** As a player, I want to see my character's back and shoulder in front of me, so that the game feels like a third-person 3D game.

#### Acceptance Criteria

1. WHILE the Overview is off, THE Game SHALL place the ShoulderCamera behind the active character along CameraYaw, offset to the right by the CameraProfile's shoulder offset, looking at a point ahead of the character.
2. THE Game SHALL use a separate CameraProfile per character so that the eye height is lowest for Duck, higher for Child, and highest for Adult.
3. WHEN the ActiveCharacter changes (growth), THE Game SHALL keep CameraYaw and the vertical look angle and blend only the CameraProfile (distance, height, shoulder) within 0.4 s. *(Revised 2026-11-22; the earlier turn-behind-the-new-character rule is retired.)*
4. THE Game SHALL draw each character turned toward its Facing, so that the back is toward the camera while it walks forward.
5. THE camera position SHALL follow the character, but CameraYaw SHALL change only by explicit input: mouse, touch drag, J / L, the recenter action (Space or the touch 「正面へ」 button, which also levels the vertical angle) or a checkpoint/new-game reset. The camera SHALL NOT turn by itself while the character moves or stands. *(Replaces the automatic yaw-follow of 2026-11-20 after the usability review of 2026-11-22.)*
6. THE Game SHALL map WASD, arrows and the touch stick against the current CameraYaw every tick. Releasing and pressing a key again SHALL NOT change the direction. Holding A or D SHALL walk in a straight line, and a manual turn changes the direction of a walk in progress. There is no input latch. *(Replaces the latch of review N-1/N-4, which existed only to stop the automatic follow from feeding back.)*
7. WHEN a checkpoint loads or a new game starts, THE Game SHALL set CameraYaw, the vertical angle and every Facing to a fixed view per checkpoint. The start view SHALL look toward the NarrowHole. *(N-1, D-1.)*
8. THE Game SHALL bound the vertical look angle (-0.45 rad down, +0.6 rad up). The angle SHALL move only the look-at point; the eye position, which is made safe against walls, the ceiling and the NarrowHole lid, SHALL NOT depend on it. Camera safety (Req 4) SHALL hold at every yaw, every pitch and through growth blends. Auto-centering toward narrow entrances and pathfinding are NOT added; whether they are needed is decided after the final usability evaluation.
### Requirement 2: Look around

**User Story:** As a player, I want to turn the view left and right, so that I can look ahead and around corners.

#### Acceptance Criteria

1. WHILE an Orbit input is held (J turns left, L turns right), THE Game SHALL change CameraYaw at a fixed rate. *(Provisional keys; Q and E are taken.)*
2. WHEN the player drags with the mouse horizontally on the game view, THE Game SHALL change CameraYaw by the drag distance.
3. Orbit input SHALL NOT change the game state or trigger any GameOverCondition.

### Requirement 3: Camera-relative movement

**User Story:** As a player, I want W to move toward where the camera looks, so that steering matches the view.

#### Acceptance Criteria

1. WHILE the Overview is off, THE Game SHALL rotate the WASD / arrow move input by CameraYaw before passing it to the game logic: W moves toward the camera's forward direction, D toward its right.
2. WHILE the Overview is on, THE Game SHALL keep the camera yaw frozen and map W to up the map (yaw 0), because the Overview looks from a fixed direction. *(Changed 2026-11-20 after review F-3; before, W stayed camera-relative in the Overview.)*
3. The rotated move input SHALL keep length ≤ 1 and SHALL NOT change walk, run, pond speed, or any rule.
4. WHEN a character moves, THE Game SHALL set its Facing to the move direction. A carried Duck faces like Adult.

### Requirement 4: Camera never passes through obstacles

**User Story:** As a player, I want the camera to stay inside the room, so that walls never cut my view.

#### Acceptance Criteria

1. THE Game SHALL shorten the camera's shoulder offset and distance so that the segment from the character to the eye does not cross an Obstacle, keeping a 0.12 m margin.
2. THE Game SHALL keep the eye below the ceiling of indoor zones and below the NarrowHole lid while the camera is inside the NarrowHole.
3. THE Game SHALL draw walls tall enough to enclose the rooms in the ShoulderCamera, and indoor ceilings. In the Overview it SHALL cut walls down and hide ceilings so the map stays readable.
4. THE Game SHALL keep these visible in the ShoulderCamera: Duck inside the NarrowHole with the coin, the sauna crowd gaps and the hat shelf, the hat on Duck, Duck carried in front of Adult, and Duck in the pond.
5. Criteria 1 and 2 SHALL hold for every pose the camera returns, including the blend after a character switch. WHEN C toggles the Overview on or off, THE Game SHALL cut to the new view at once (no blend), because an in-between pose would pass through the roof. *(Added 2026-11-20 after Codex's review: the blend ignored walls and the ceiling.)*

### Requirement 5: Overview stays auxiliary

#### Acceptance Criteria

1. WHEN C is pressed, THE Game SHALL toggle the existing Overview. Pressing C again SHALL return to the ShoulderCamera.
2. The Overview SHALL NOT be required to complete the route.

### Requirement 6: Model entry point

**User Story:** As a developer, I want a place to drop in a GLB for each character, so that final models replace the primitives without logic changes.

#### Acceptance Criteria

1. THE Game SHALL provide a per-character GLB URL list that is empty until a final model passes the final-assets pipeline and rights checks.
2. WHEN a character GLB loads, THE Game SHALL hide that character's primitive and place the model by the final-assets contract: meters, +Y up, front +Z, origin at bottom center, `rootY = centerY − radius` (Duck) or `centerY − height / 2` (humans), turned to Facing.
3. IF a GLB fails to load, THEN THE Game SHALL keep the primitive and log a warning.
4. Placeholder primitives and test fixtures SHALL NOT be described as final models.
5. WHEN the hat is attached to a Duck model that has `socket_hat`, THE Game SHALL place the hat at the socket's world position AND world rotation, so the hat turns and tilts with the head. Copying only the position is a defect. *(Added 2026-11-20: Codex reproduced the position-only bug in PR #3's `placeHat`.)*
6. WHEN a model under a Creative Commons Attribution license (for example the Duck GLB from Meshy, CC BY 4.0) enters the build, THE project SHALL record the creator, source, license and changes in `THIRD_PARTY_NOTICES.md` and the asset ledger, and SHALL show the credit where the license requires it, before the model is committed.

### Requirement 7: Nothing else changes

#### Acceptance Criteria

1. The 3 characters, the 10-step route, F1–F7, pair doors, item rules, and the 4 checkpoints SHALL behave as before. Existing automated tests (84) SHALL keep passing; tests for the old camera may be replaced by tests of the new camera.
2. Labels SHALL keep the 12–22 px sizing. Zone and fixture labels SHALL be hidden behind walls in the ShoulderCamera.
3. Shown labels SHALL NOT overlap on screen. When two would overlap, THE Game SHALL keep the higher one in place and move the other up or down; it SHALL be hidden only when no nearby spot is free. Priority: controlled character, key items (coin, key, hat), other characters, fixtures and rooms on the route, other rooms. In the Overview room and fixture names SHALL NOT be cut by walls. *(Review D-4, N-5.)*
4. A non-active character right next to the camera, or standing between the camera and the controlled character, SHALL fade so the controlled character stays visible. *(Review D-1, N-6.)*
5. Item labels SHALL NOT cover small item models. WHILE an item is held or worn by a character, THE Game SHALL hide its label in the ShoulderCamera (the status panel names the holder); the Overview keeps it. WHILE an item rests on a shelf, desk or node, its label SHALL sit wholly above the item model (bottom-anchored above the model top). *(Added 2026-11-20 after the normal-input run noted labels hiding hand-held meshes.)*
6. Each human's towel SHALL be drawn on the head or in the right hand (model `socket_hand_r`, or beside the placeholder body) from the towel state, following movement, turning, outfit changes and checkpoint restores. It SHALL be attached once to the character group, not to an outfit variant. The head anchor SHALL come from BODY_HEIGHT and the mesh bounds (the GLBs have no head socket; `socket_label` is the name-tag height and SHALL NOT be used). A held towel SHALL hang with its top at the hand socket and its bottom above the drawn water surface (0.032 m). If deeper water is ever drawn, the arm pose SHALL change too; the towel SHALL NOT float apart from the hand. The towel mesh is provisional and SHALL NOT be called a final asset. Duck has no towel. *(Added 2026-11-20 with the simpler controls.)*

## Update 2026-11-22: Persistent minimap (overrides Requirements 3.2, 4.5 and 5.1)

The user asked: 「マップを常時表示し、タップで全画面にする」. The text above is kept as history. Where it conflicts with this section, this section applies.

- **Req 5.1 (overridden).** C no longer toggles a moving 3D Overview. C toggles the large minimap (the same action as tapping the mini map). The 3D Overview camera is not used for this. The root integrator routes C once; the minimap module does not read C.
- **Req 3.2 (overridden).** With no 3D Overview there is no frozen-yaw map mode. WASD stays camera-relative (Req 3.1) while the large map is closed. While it is open the game is paused and gameplay inputs are cleared.
- **Req 4.5 (overridden).** Overview-specific rules (wall cutaway, hidden ceilings, label exemptions) no longer apply to a camera mode. The ShoulderCamera stays the only 3D view; its last frame and pose remain behind the paused map.
- **Minimap contract.** A small map button is always visible. Tapping it, or pressing C, opens a modal dialog with the map at viewport size. The close button, Escape and C close it. Opening pauses the game; closing resumes it. The map is a flat 2D SVG built from `LEVEL` (zones, water, walls, fixtures, doors), north up, with the player's position and facing, uncollected milk bottles and (large map only) Japanese room labels and a legend. It only reads `GameState`.
- **Verification status.** Automatic validation and independent review are recorded in `docs/minimap-verification.md`; browser acceptance remains separate from the fake-DOM tests.

### Requirement 9: Control usability and phone support (2026-11-22, implemented by Kiro)
Provisional decisions follow the brief; the user did not approve individual values.
1. E SHALL act only on milk, drying, clothing and a high door. The hint, the on-screen target and the action SHALL come from one candidate list. Only the immediate available target is outlined and shown near the object; a wrong-stage bottle or an out-of-reach handle is not a target. A high handle SHALL NOT be hidden by its own closed panel, but any other wall between the player and the handle SHALL reject the action.
2. Target text SHALL be drawn in the world with ordinary depth testing. When it is behind the camera, hidden by a wall, or any part of its rectangle leaves the usable viewport, a compact HUD prompt SHALL be shown instead. Door text SHALL be placed on the side of the door the player stands on. Turning operation help off SHALL remove the outline and the prompt immediately, even while settings pause rendering; touch action buttons, the map, outcome text and the restart buttons remain.
3. PC: a deliberate canvas click MAY request Pointer Lock once; a rejected, delayed or unsupported request SHALL NOT throw or loop and SHALL NOT be repeated after a modal or blur. Right-drag, J / L, sensitivity, invert-Y and a drag-only setting SHALL work. Releasing the pointer (Escape) SHALL open settings and pause.
4. Phone (iPhone Safari / Android Chrome, no install, no keyboard, no Pointer Lock, no fullscreen or orientation lock): a left analog stick (region ends at 48 % of the width), an independent look drag starting at 52 %, a contextual action button, 「正面へ」, a tap-toggled 「走る」 (default off, off again when the movement stops or on any menu, map, settings, blur, hide, outcome or restart; never started by stick magnitude), and a 「その他」 menu with the towel, Q, V and F actions in Japanese. Every pointer owns at most one control; up, cancel or lost capture releases only that pointer's control, and a control is never handed to another finger. Touches that start on UI never turn the camera. Sizes: targets at least 48 CSS px (primary 64), gap 8, safe area plus 12, pad 104–112, checked layouts 320×568, 390×844, 568×320, 844×390.
5. Opening or closing any menu, map or settings, hiding or blurring the page, rotating, an outcome and a restart SHALL clear all inputs and drop elapsed time. A chosen menu action SHALL be queued only after the menu is closed and cleared, and SHALL run once. Single presses SHALL wait for a fixed 60 Hz tick at any display rate.
6. Game over and clear SHALL show a tap/click button (checkpoint restart / new game); R remains a shortcut. Native Enter/Space on a focused button SHALL NOT reach gameplay.
7. Hidden or blurred pages SHALL show 「続ける」 and resume only through it. WebGL context loss SHALL stop play and drawing, explain that unrecovered rendering needs a reload and that progress then restarts (checkpoints are memory-only), and resume only after the context is restored and 「続ける」 is pressed.
8. Presentation: render pixel ratio cap 2 on desktop, 1.5 on coarse-pointer devices, 1.25 with the 「軽量描画」 setting (43.75 % / 60.94 % fewer pixels than cap 2 where the device ratio is at least 2; no FPS claim). Physics, speed, colliders and rules are unchanged. Model loading shows its progress and any failure; assets and LOD are unchanged.
9. Not in this batch: persistent save, key rebinding, gamepad, PWA/offline, auto-centering and pathfinding.

### Requirement 10: Mobile camera framing (2026-11-23, user-approved Codex implementation)
1. Coarse-pointer startup and the first later touch SHALL select the mobile camera profile using the actual canvas dimensions. Desktop SHALL retain its existing 55-degree vertical field of view and shoulder positions.
2. At standard pitch in unobstructed space the duck SHALL appear near the horizontal center with room around its body. Provisional acceptance: center at 42–58% of screen width; projected model bounds 12–25% of height and at most 40% of width, with at least 5% horizontal clearance at 320×568, 390×844, 568×320 and 844×390. Actual silhouette height targets about 15–20%; projected bounds are a conservative, different measurement.
3. Child and adult SHALL also use a centered mobile profile with head, feet and towel visible at standard pitch in unobstructed space. Their body proportions do not share the duck's height target.
4. Rotation and browser-bar resizing SHALL update aspect and framing without resetting manual yaw/pitch or restarting a growth transition. Profile transitions SHALL finish in bounded time. Character dimensions, collisions, movement, growth, assets and rules SHALL remain unchanged.
5. Walls, closed doors, low fixtures, hole lids and ceilings SHALL retain camera safety through growth and resizing. When obstruction forces the mobile camera too close, the active body's opacity SHALL decrease continuously without disappearing, then return fully after recovery. The position ring SHALL remain outside the body fade and follow its existing projection/depth behavior; strong compression or view angles may move it out of frame. Touch buttons SHALL remain on screen. Unobstructed framing percentages are not required during wall compression or deliberate extreme pitch.
