# Requirements Document

## Introduction

This document covers the prototype phase (仮モデルフェーズ) of Sento Duck Explorer, a 3D cooperative puzzle game for Kiroween 2026. The prototype uses simple placeholder shapes (boxes, spheres, capsules) in place of final 3D models. Its purpose is to verify the full 10-step goal route is playable from start to finish, confirm that character sizes, camera behavior, and passable gaps work correctly, and establish the state management foundation before any final art is introduced.

Three characters — Duck (アヒル), Child (子ども), and Adult (大人) — are controlled by one player who switches between them. They cooperate by passing items and navigating areas only their character can access, culminating in Duck reaching the secret pond goal while wearing the sauna hat.

This document distinguishes confirmed decisions from provisional decisions. Confirmed decisions come from `KIRO_HANDOFF.md`. Provisional decisions are adopted from `.kiro/steering/project-autonomy.md` so work can proceed; they are marked *(Provisional)* and are not user-confirmed.

Scope note: this spec ends when the full route is playable with placeholder shapes. The mandatory final-model pipeline (image → Image to 3D → Blender adjustment → game integration) is a later, separate spec. Completing this prototype does not complete the final models.

### Provisional decisions used in this spec

| Topic | Adopted approach |
| --- | --- |
| Child during Adult's payment trip | Child accompanies Adult bath → changing room → reception and back. Both dry and dress. The pair crosses zone doors together. A companion who does not meet a door's entry condition waits before the door and the HUD names the needed action. |
| Child on the way to the pond | The same pair-door accompaniment applies bath → OpenAirBath → PondEntrance. |
| Carrier | Adult is the only character who can carry Duck. Child accompanies. Duck cannot carry itself. |
| Checkpoints | Four: `start`, `paidReturned` (pair back in the bath after paying), `hatEquipped`, `duckInPond` (saved after Duck is placed in the pond with Adult and Child both on the PondEntrance shore). |
| Pond movement | Continuous movement from water current plus directional input. Pond physics advances only while Duck is the ActiveCharacter. |
| Item transfers | Allowlist: Coin Duck → Adult, Key Adult → Child. The Hat moves only by Child's Equip action onto Duck. |

## Glossary

- **Duck**: The rubber duck character. Navigates narrow holes and the secret pond. Not subject to human clothing or drying rules.
- **Child**: The child character. Can pass through crowd gaps in the sauna that Adult cannot.
- **Adult**: The adult character. Can make payments at the reception desk. Accompanies Child into the sauna.
- **ActiveCharacter**: The character currently under direct player control.
- **NarrowHole**: A passageway in the bath area accessible only to Duck due to its small size.
- **CrowdGap**: A gap in the sauna crowd passable only by Child due to Child's small size.
- **SaunaRoom**: The sauna area requiring a key and a dry body to enter.
- **OpenAirBath**: The outdoor bathing area that leads to the SecretPond.
- **SecretPond**: The final area beyond the OpenAirBath. Duck must reach its far end to clear the game.
- **GoalPoint**: The target location at the far end of the SecretPond.
- **Coin**: The 500-yen coin found in the NarrowHole. Belongs to the family in the game's fiction.
- **SaunaKey**: The key obtained from reception after the sauna fee is paid. Unlocks the SaunaRoom.
- **SaunaHat**: The duck-sized sauna hat found in the SaunaRoom. Equips onto Duck.
- **GameState**: The complete record of character positions, carried-by relationships, item ownership, item use state, wet/dry state, and clothed/unclothed state.
- **GameOverCondition**: One of the seven defined player actions that immediately end the game.
- **WetState**: A per-character boolean flag: `wet` or `dry`. Applies to Duck, Child, and Adult.
- **ClothingState**: A per-character state for human characters only: `clothed` or `unclothed`. Duck has no ClothingState.
- **CarriedBy**: A Duck-specific state: `adult` or `none`. Only Adult can carry Duck *(Provisional)*. Duck can never carry itself.
- **ItemOwner**: For each item (Coin, SaunaKey, SaunaHat), the single character or named scene node that currently holds it. An item always has exactly one ItemOwner.
- **ItemStatus**: `available`, `paid` (Coin only), or `equipped` (SaunaHat only). A paid Coin has ItemOwner `reception_register` and status `paid`. An equipped SaunaHat has ItemOwner Duck and status `equipped`.
- **TransferAllowlist**: The only character-to-character transfers allowed through the give action: Coin from Duck to Adult, and SaunaKey from Adult to Child. *(Provisional)*
- **PairDoor**: A zone boundary that Adult and Child cross together: bath ↔ changing room, changing room ↔ reception, bath ↔ SaunaRoom entry, bath ↔ OpenAirBath, OpenAirBath ↔ PondEntrance. *(Provisional)*
- **PondEntrance**: The shore zone between the OpenAirBath and the SecretPond where Adult places Duck into the pond.
- **PassWidth**: The width dimension of a character's collision volume or a passageway opening, used to determine whether a character can enter a given passage.
- **CheckpointRestart**: A restart mechanic that returns the game to the most recent of four checkpoints: `start`, `paidReturned`, `hatEquipped`, `duckInPond`. *(Provisional)*
- **GameOverScreen**: An overlay shown after a GameOverCondition is triggered, with the violation ID, a short reason, the correct manner, and the restart key. *(Provisional)*

---

## Requirements

### Requirement 1: Character Switching

**User Story:** As a player, I want to switch control between Duck, Child, and Adult, so that I can direct each character to perform actions only they can do.

#### Acceptance Criteria

1. THE Game SHALL support exactly three playable characters: Duck, Child, and Adult.
2. WHEN the player triggers the character-switch action, THE Game SHALL change the ActiveCharacter to the next character in the fixed rotation (Duck → Child → Adult → Duck).
3. WHILE a character is not the ActiveCharacter, THE Game SHALL keep that character stationary at their last position and ignore all movement and action inputs directed at that character, with two exceptions: Duck moves with Adult while CarriedBy is `adult`, and the companion human moves with the active human during a successful PairDoor crossing.
4. WHEN the player triggers the character-switch action, THE Game SHALL begin moving the camera to focus on the newly active character, completing the transition within 0.5 seconds.
5. IF an item-transfer interaction is in progress or a GameOverCondition event is active, THEN THE Game SHALL ignore character-switch input and keep the current ActiveCharacter unchanged.
6. WHEN the player triggers the character-switch action and no blocking condition is active, THE Game SHALL accept and process the input within one rendered frame.
7. WHEN the player's manual character-switch input changes the ActiveCharacter, THE Game SHALL change only the ActiveCharacter and camera target in that tick. Movement and pond physics for the newly active character begin on the next tick.
8. WHILE Duck is in the SecretPond and Duck is not the ActiveCharacter, THE Game SHALL keep Duck's position and velocity unchanged and SHALL NOT advance pond physics for Duck. *(Provisional)*
9. WHEN the ActiveCharacter changes automatically as part of placing Duck in the SecretPond (Requirement 3.11) or restoring a checkpoint (Requirement 10.8), THE Game SHALL update the ActiveCharacter together with the other state changes of that operation in one consistent step. Criteria 1.7, 5.5, and 10.1 do not apply to these automatic switches.

---

### Requirement 2: Character Size and Area Access

**User Story:** As a player, I want each character's size to determine where they can go, so that cooperation is necessary to complete the route.

#### Acceptance Criteria

1. THE Game SHALL assign Duck a PassWidth less than the NarrowHole's defined PassWidth, allowing Duck's collision volume to clear the entrance without contact.
2. THE Game SHALL assign Child and Adult each a PassWidth greater than the NarrowHole's defined PassWidth, causing their collision volumes to block at the entrance.
3. THE Game SHALL assign Child a PassWidth less than the defined PassWidth of every CrowdGap in the SaunaRoom, allowing Child's collision volume to clear each gap without contact.
4. THE Game SHALL assign Adult a PassWidth greater than the defined PassWidth of every CrowdGap in the SaunaRoom, causing Adult's collision volume to block at each gap.
5. WHILE Duck's CarriedBy is `adult`, THE Game SHALL place Duck exactly at Adult's carry anchor each tick and ignore Duck's own movement input.
6. WHEN Duck's CarriedBy is cleared outside the PondEntrance, THE Game SHALL place Duck at Adult's drop point and restore Duck's independent movement input.
7. WHEN Child reaches the SaunaRoom exit trigger, THE Game SHALL record the traversal as successful regardless of which CrowdGap path Child used.

---

### Requirement 3: Full Goal Route Playability

**User Story:** As a player, I want to complete all 10 steps of the confirmed goal route, so that the full cooperative loop is verified in the prototype.

#### Acceptance Criteria

1. THE Game SHALL start with Duck as the ActiveCharacter.
2. WHEN Duck enters the NarrowHole area and the Coin is present, THE Game SHALL allow Duck to pick up the Coin, setting Coin's ItemOwner to Duck.
3. WHEN Duck is adjacent to Adult and Duck holds the Coin, THE Game SHALL allow an item-transfer interaction that sets Coin's ItemOwner from Duck to Adult.
4. WHEN Adult holds the Coin and Adult is at the reception desk, THE Game SHALL allow Adult to pay the sauna fee, setting Coin's ItemOwner to `reception_register` with ItemStatus `paid`, and setting SaunaKey's ItemOwner to Adult.
5. WHEN Adult holds the SaunaKey and Adult is adjacent to Child, THE Game SHALL allow an item-transfer interaction that sets SaunaKey's ItemOwner from Adult to Child.
6. WHEN Child holds the SaunaKey and the SaunaRoom door state is `locked`, THE Game SHALL allow Child to unlock the SaunaRoom door, setting SaunaRoom door state to `unlocked`.
7. WHEN the SaunaRoom door state is `unlocked` and Child's WetState is `dry`, THE Game SHALL allow Child to enter the SaunaRoom.
8. WHEN Child navigates through all 3 CrowdGaps in the SaunaRoom and reaches the SaunaHat's location, THE Game SHALL allow Child to pick up the SaunaHat, setting SaunaHat's ItemOwner to Child.
9. WHEN Child holds the SaunaHat and Child is adjacent to Duck, THE Game SHALL allow Child's Equip action, setting SaunaHat's ItemOwner to Duck and ItemStatus to `equipped` in the same tick. The Equip action is the only way the SaunaHat leaves Child.
10. WHEN SaunaHat is equipped on Duck and Adult is adjacent to Duck, THE Game SHALL allow Adult to pick up Duck, setting Duck's CarriedBy to `adult`. Child and Duck SHALL NOT be able to pick up Duck. *(Provisional: Adult is the carrier.)*
11. WHEN Adult carries Duck and Adult and Child are both inside the PondEntrance zone, THE Game SHALL allow Adult to place Duck in the SecretPond, setting Duck's CarriedBy to `none`, Duck's position to the pond spawn point, and the ActiveCharacter to Duck. Adult and Child remain on the PondEntrance shore.
12. WHEN Duck is the ActiveCharacter in the SecretPond and SaunaHat is equipped on Duck, THE Game SHALL move Duck continuously under the water current and the player's directional input (see Requirement 8).
13. WHEN Duck reaches the GoalPoint while SaunaHat is equipped on Duck, THE Game SHALL trigger the game-clear state.
14. IF Duck reaches the GoalPoint without SaunaHat equipped on Duck, THEN THE Game SHALL NOT trigger the game-clear state.
15. IF Adult or Child reaches the GoalPoint without Duck, THEN THE Game SHALL NOT trigger the game-clear state.

---

### Requirement 4: Adult's Sauna Payment Route

**User Story:** As a player, I want to guide Adult through the payment sequence, so that the sauna fee mechanic is playable end-to-end.

#### Acceptance Criteria

1. WHEN Adult attempts to enter the changing room from the bath area and Adult's WetState is `dry`, THE Game SHALL allow Adult to enter the changing room.
2. IF Adult attempts to enter the changing room from the bath area and Adult's WetState is not `dry`, THEN THE Game SHALL trigger GameOverCondition F2.
3. WHEN Adult is in the changing room and Adult's ClothingState is `unclothed`, THE Game SHALL allow Adult to perform a dress action that sets ClothingState to `clothed`.
4. IF Adult's ClothingState is `clothed` and Adult exits the changing room toward the reception area, THEN THE Game SHALL NOT trigger GameOverCondition F4.
5. WHEN Adult pays the sauna fee at the reception desk and Adult holds the Coin, THE Game SHALL set Coin's ItemOwner to `reception_register` with ItemStatus `paid` and set SaunaKey's ItemOwner to Adult.
6. IF Adult attempts to pay the sauna fee at the reception desk and Adult does not hold the Coin, THEN THE Game SHALL block the pay action and display an indication that the Coin is required.
7. WHEN Adult returns to the changing room, THE Game SHALL allow Adult to perform an undress action that sets ClothingState to `unclothed`.
8. IF Adult's ClothingState is `unclothed` and Adult re-enters the bath area, THEN THE Game SHALL update Adult's position to the bath area.

9. WHEN the active human crosses a PairDoor and the companion human is within 3.0 m, THE Game SHALL move the companion across the same PairDoor in the same tick. *(Provisional)*
10. IF the active human attempts to cross a PairDoor and the companion human is farther than 3.0 m, THEN THE Game SHALL keep the active human before the door and show a prompt to move together.
11. IF the companion human does not meet the entry condition of the zone behind a PairDoor (for example, still `wet` before the changing room), THEN THE Game SHALL keep both humans before the door without triggering a GameOverCondition and show the action the companion needs.
12. THE PairDoor rule SHALL apply on the payment route (bath ↔ changing room ↔ reception), at the SaunaRoom entry, and on the way to the pond (bath ↔ OpenAirBath ↔ PondEntrance), so Child is never left alone in the bath area on those routes.

> **Status:** Criteria 9–12 implement the confirmed constraint that Child is not left alone in the bath. The pair-door mechanic itself is provisional per `project-autonomy.md`.

---

### Requirement 5: Item State Integrity

**User Story:** As a player, I want items to always be tracked to exactly one location or holder, so that the game never enters an unwinnable state due to lost or duplicated items.

#### Acceptance Criteria

1. THE Game SHALL ensure each item (Coin, SaunaKey, SaunaHat) has exactly one ItemOwner at all times, where an ItemOwner is either a character's inventory or a named scene node designated as an item spawn or placement point.
2. IF a player exits or dismisses an item-transfer interaction before the transfer confirmation step is reached, THEN THE Game SHALL restore the item to the ItemOwner it held at the moment the interaction began.
3. THE Game SHALL NOT allow an item's ItemOwner to be set to a scene node that is not reachable from any character's current position via the game's defined navigation paths.
4. WHEN a GameOverCondition is triggered and CheckpointRestart is used, THE Game SHALL restore each item's ItemOwner and activation state (whether the item has been used or consumed in its current context) to the values recorded at the checkpoint.
5. WHEN the player's manual character-switch input changes the ActiveCharacter, THE Game SHALL preserve the item states of all characters without modification.
6. THE Game SHALL present the Coin in all in-game text and dialogue as a family possession rather than a found object.
7. THE Game SHALL present the SaunaHat in all in-game text and dialogue as an item Duck is permitted to use.
8. THE Game SHALL allow the give action only for transfers in the TransferAllowlist (Coin Duck → Adult, SaunaKey Adult → Child). Any other give attempt SHALL leave all ItemOwners unchanged. *(Provisional)*
9. THE Game SHALL NOT include the SaunaHat in any item-transfer dialog. The SaunaHat SHALL move from its shelf to Child by pickup and from Child to Duck only by Child's Equip action.
10. THE Game SHALL keep these invariants after every tick: Coin status is `paid` exactly when its ItemOwner is `reception_register`; SaunaHat status is `equipped` exactly when its ItemOwner is Duck; Duck never holds the SaunaKey.

---

### Requirement 6: Wet and Clothing State

**User Story:** As a player, I want wet and clothing states to be tracked per character, so that the game-over conditions tied to those states can be enforced.

#### Acceptance Criteria

1. THE Game SHALL maintain a WetState (`wet` or `dry`) for Duck, Child, and Adult independently.
2. THE Game SHALL maintain a ClothingState (`clothed` or `unclothed`) for Child and Adult. Duck has no ClothingState.
3. WHEN a human character enters bathwater or a splash zone, THE Game SHALL set that character's WetState to `wet`, and the character SHALL stay `wet` after leaving until dried. WHEN a human character leaves the SaunaRoom, THE Game SHALL set that character's WetState to `wet` (sweat). *(Provisional)*
4. WHEN a human character performs a drying action with a towel while that character's position is outside all bath areas, THE Game SHALL set that character's WetState to `dry`.
   - *Update 2026-11-20 (user request: fewer keys).* The drying action is E, not T. It applies only to the controlled human, only when wet, on the bath floor (not in the bathwater or splash, not in the sauna) within 2.0 m of the changing-room door or the sauna door, so it can be pressed before crossing. Elsewhere E does something else. *(Distance and spots: provisional design.)*
5. WHEN Duck enters bathwater, a splash zone, or the SecretPond, THE Game SHALL set Duck's WetState to `wet`.
6. WHEN Duck is the target of a drying action, THE Game SHALL set Duck's WetState to `dry`.
7. THE Game SHALL track WetState and ClothingState separately and NOT infer one from the other.
8. WHEN a human character performs a designated undress action, THE Game SHALL set that character's ClothingState to `unclothed`. WHEN a human character performs a designated dress action, THE Game SHALL set that character's ClothingState to `clothed`.
   - *Update 2026-11-20 (user request).* Dress / undress is E within 1.0 m of the locker in the changing room, not G. It never changes WetState.
10. *(Added 2026-11-20, user request: "タオルは一度獲得したら頭の上に乗せられるように…アヒルだけは頭に乗せられない".)* Each human has its towel from the start, either `held` (in the hand) or `head`. WHEN no higher-priority E action applies, E SHALL move the towel between hand and head. Duck SHALL NOT have or wear a towel. A towel on the head SHALL NOT dry the body. Drying with E SHALL leave the towel on the head (from the hand it is stowed on the head). The towel place SHALL be saved and restored with checkpoints. It is separate from the Duck's sauna hat. *(Initial state `held` and the stow rule: provisional design.)*
9. WHEN a GameOverCondition is triggered and CheckpointRestart is used, THE Game SHALL restore WetState and ClothingState for all characters to their values at the checkpoint.

---

### Requirement 7: Game Over Conditions

**User Story:** As a player, I want to be stopped immediately when my character commits a bathhouse rule violation, so that I learn the correct behavior and understand why the action was wrong.

#### Acceptance Criteria

1. WHEN a towel item contacts the bathwater surface of a bath area, THE Game SHALL trigger GameOverCondition F1.
   - *Update 2026-11-20.* Only a towel in the hand can be dipped (Q in the bathwater). With the towel on the head, Q SHALL NOT trigger F1 and the HUD SHALL say the towel is on the head. Walking through water while holding the towel SHALL NOT trigger F1.
2. WHEN a human character whose WetState is `wet` enters a changing room, THE Game SHALL trigger GameOverCondition F2.
3. WHEN the ActiveCharacter performs a run action and the run trajectory passes through a soap item's position, THE Game SHALL trigger GameOverCondition F3.
4. WHEN a human character whose ClothingState is `unclothed` crosses the threshold from the changing room into the reception area, common area, or exterior, THE Game SHALL trigger GameOverCondition F4.
5. WHEN a human character whose WetState is `wet` enters the SaunaRoom, THE Game SHALL trigger GameOverCondition F5.
6. WHEN the ActiveCharacter performs the designated loud-shout in-game action while inside the SaunaRoom, THE Game SHALL trigger GameOverCondition F6.
7. IF a character performs a designated push action against another character while inside the SaunaRoom, THEN THE Game SHALL trigger GameOverCondition F7.
8. WHEN a character moves through a CrowdGap using normal walking movement without a push action, THE Game SHALL NOT trigger GameOverCondition F7, even if incidental physics contact occurs.
9. WHEN a GameOverCondition is triggered and a goal-clear condition would also be satisfied at the same moment, THE Game SHALL apply the GameOverCondition and NOT apply the game-clear state.
10. WHEN a GameOverCondition is triggered, THE Game SHALL show the GameOverScreen with the violation ID, a short reason, the correct manner, and the restart key. *(Provisional format)*

---

### Requirement 8: Pond Navigation

**User Story:** As a player, I want to control Duck through the SecretPond to the GoalPoint, so that the final section of the route is an active, skill-based experience.

#### Acceptance Criteria

1. WHILE Duck is in the SecretPond and Duck is the ActiveCharacter, THE Game SHALL apply a water-current force toward the GoalPoint side of the SecretPond to Duck each logic tick.
2. WHILE Duck is in the SecretPond and Duck is the ActiveCharacter, THE Game SHALL apply the player's directional input as an additional force, allowing the player to adjust Duck's path.
3. THE Game SHALL define a navigable path from the SecretPond entrance to the GoalPoint such that Duck can reach the GoalPoint by combining current force with sustained correct player directional input, without Duck's position leaving the SecretPond boundaries.
4. WHEN Duck's position reaches the GoalPoint boundary and SaunaHat is equipped, THE Game SHALL trigger the game-clear state.
5. WHILE Duck is in the SecretPond and Duck is not the ActiveCharacter, THE Game SHALL NOT apply current or input forces and SHALL keep Duck's position and velocity unchanged. *(Provisional)*

---

### Requirement 9: Prototype Placeholder Representation

**User Story:** As a developer, I want all characters and environments represented by simple geometric shapes, so that I can verify the full route and all state mechanics before any final 3D models are created.

#### Acceptance Criteria

1. THE Game SHALL represent Duck, Child, and Adult as distinct primitive shapes (such as a sphere, small capsule, and tall capsule respectively) with colors that are visually distinguishable from one another at runtime.
2. THE Game SHALL represent all bathhouse areas (bath area, changing room, reception area, SaunaRoom, OpenAirBath, SecretPond) as clearly bounded box volumes with distinct colors or labels.
3. THE Game SHALL represent the NarrowHole as a passageway whose dimensions permit Duck's collision volume and block Child's and Adult's collision volumes.
4. THE Game SHALL represent each CrowdGap as a passageway whose dimensions permit Child's collision volume and block Adult's collision volume.
5. THE Game SHALL represent Coin, SaunaKey, and SaunaHat as small distinct primitive shapes with visible labels.
6. THE Game SHALL display the current GameState (ActiveCharacter, item owners, WetState per character, ClothingState per human character, Duck's CarriedBy) in a heads-up overlay that is visible at all times during prototype play.
7. THE Prototype SHALL allow the full 10-step goal route to be completed from start to finish using only placeholder shapes, with no dependency on final 3D models.

---

### Requirement 10: State Consistency Across Transitions

**User Story:** As a player, I want the game state to remain consistent when I switch characters, trigger a game over, or restart from a checkpoint, so that I never encounter an unwinnable or contradictory state.

#### Acceptance Criteria

1. WHEN the player's manual character-switch input changes the ActiveCharacter, THE Game SHALL preserve each character's position, WetState, ClothingState, and CarriedBy value, and the ItemOwner and equipped state of every item (Coin, SaunaKey, SaunaHat) without modification.
2. WHEN a GameOverCondition is triggered, THE Game SHALL freeze all character movement and item interactions until the player confirms a restart action.
3. WHEN the player restarts after a GameOverCondition, THE Game SHALL restore the full GameState to a consistent snapshot where no item is duplicated, missing, or in an unreachable location.
4. IF the Coin has status `paid` and the game restarts to a checkpoint saved before the payment, THEN THE Game SHALL restore the Coin's ItemOwner and status to their pre-payment values and restore SaunaKey's ItemOwner to `reception_desk` (not held by Adult).
5. THE Game SHALL NOT produce a state after a restart where the SaunaRoom door is `unlocked` but the Coin is not `paid`.
6. THE Game SHALL NOT produce a state where SaunaHat is equipped on Duck but Duck's view does not show the hat after a character switch or restart.
7. THE Game SHALL save checkpoints at these moments *(Provisional)*: `start` at game start; `paidReturned` when the Coin is `paid` and Adult and Child have both crossed from the changing room back into the bath; `hatEquipped` when Child equips the SaunaHat on Duck; `duckInPond` at the end of the tick in which Adult places Duck in the SecretPond, only if Duck is in the pond, not carried, and Adult and Child are both inside the PondEntrance shore zone.
8. WHEN the player restarts, THE Game SHALL restore the most recent checkpoint, including progress, item owners and statuses, positions, payment, door state, clothing, wetness, hat state, and CarriedBy, and SHALL place characters so that one idle tick after restore does not trigger a GameOverCondition.
