import { describe, expect, it } from "vitest";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

describe("full 10-step route, driven only by inputs (Req 3, 4, 8.3, 9.7)", () => {
  it("goes from the initial state to cleared", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim); // steps 1–2
    R.duckGivesCoin(sim); // step 3
    R.adultPaysWithChild(sim); // step 4 (Child accompanies)
    R.adultGivesKey(sim); // step 5
    R.childUnlocksSauna(sim);
    R.childEntersSauna(sim); // step 6
    R.childGetsHat(sim); // step 6, 7a
    R.childLeavesSauna(sim);
    R.childEquipsHat(sim); // step 7b
    R.adultCarriesDuckToPond(sim); // steps 8–9
    R.duckSwimsToGoal(sim); // step 10

    expect(sim.log.filter((e) => e.kind === "gameOver")).toEqual([]);
    expect(sim.log.filter((e) => e.kind === "checkpointSaved").map((e) => (e as { id: string }).id)).toEqual([
      "paidReturned",
      "hatEquipped",
      "duckInPond",
    ]);
    // The Duck itself, wearing the hat, is in the goal.
    expect(sim.state.duck.zone).toBe("pond_goal");
    expect(sim.state.items.hat.status).toBe("equipped");
  });
});
