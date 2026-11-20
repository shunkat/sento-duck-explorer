# Requirements Document: Shoulder View

## Introduction

2026-11-20, the user said the current prototype is not a 3D third-person game. It draws spheres and capsules and uses a low follow camera with a fixed direction ("W = up the screen"). The user asked for a 3D third-person over-the-shoulder game with real 3D character models.

This spec changes only the camera, the movement input mapping, and the display. The game logic in `src/core`, `src/sim`, and `src/level` stays as it is. The confirmed items in `KIRO_HANDOFF.md` remain: 3 characters, the 10-step clear route, F1–F7, Adult accompanying Child, and the 4 checkpoints.

Real character models come only through the confirmed pipeline: image → Image to 3D → Blender → GLB (`.kiro/specs/final-assets`). This spec prepares the loading entry point. It does not produce or call any placeholder shape a final model.

Items marked *(Provisional)* are working choices under `.kiro/steering/project-autonomy.md`. They are not user decisions.

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
3. WHEN the ActiveCharacter changes, THE Game SHALL set CameraYaw to the new character's Facing and blend the camera within 0.5 s (existing Req 1.4).
4. THE Game SHALL draw each character turned toward its Facing, so that the back is toward the camera while it walks forward.

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
2. WHILE the Overview is on, THE Game SHALL keep the camera yaw frozen and use the same mapping, so the move direction does not jump when C is pressed.
3. The rotated move input SHALL keep length ≤ 1 and SHALL NOT change walk, run, pond speed, or any rule.
4. WHEN a character moves, THE Game SHALL set its Facing to the move direction. A carried Duck faces like Adult.

### Requirement 4: Camera never passes through obstacles

**User Story:** As a player, I want the camera to stay inside the room, so that walls never cut my view.

#### Acceptance Criteria

1. THE Game SHALL shorten the camera's shoulder offset and distance so that the segment from the character to the eye does not cross an Obstacle, keeping a 0.12 m margin.
2. THE Game SHALL keep the eye below the ceiling of indoor zones and below the NarrowHole lid while the camera is inside the NarrowHole.
3. THE Game SHALL draw walls tall enough to enclose the rooms in the ShoulderCamera, and indoor ceilings. In the Overview it SHALL cut walls down and hide ceilings so the map stays readable.
4. THE Game SHALL keep these visible in the ShoulderCamera: Duck inside the NarrowHole with the coin, the sauna crowd gaps and the hat shelf, the hat on Duck, Duck carried in front of Adult, and Duck in the pond.

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

### Requirement 7: Nothing else changes

#### Acceptance Criteria

1. The 3 characters, the 10-step route, F1–F7, pair doors, item rules, and the 4 checkpoints SHALL behave as before. Existing automated tests (84) SHALL keep passing; tests for the old camera may be replaced by tests of the new camera.
2. Labels SHALL keep the 12–22 px sizing. Zone and fixture labels SHALL be hidden behind walls in the ShoulderCamera.
