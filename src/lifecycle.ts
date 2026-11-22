// Pause states for leaving the page and losing the GPU context (DOM-free).
// While blocked, the game does not advance and no wall-clock time is replayed.
export type PauseReason = "away" | "contextLost" | "contextRestored";
export const PAUSE_TEXT: Record<PauseReason, { title: string; body: string; button: string | null }> = {
  away: { title: "一時停止中", body: "ゲームを止めました。入力は解除されています。", button: "続ける" },
  contextLost: {
    title: "描画を一時的に失いました",
    body: "復旧を待っています。ゲームは止めています。復旧しない場合はページを再読み込みしてください。再読み込みすると、再開地点は保存されていないため最初からになります。",
    button: null,
  },
  contextRestored: { title: "描画が復旧しました", body: "「続ける」で再開します。", button: "続ける" },
};
export class Lifecycle {
  private current: PauseReason | null = null;
  get reason(): PauseReason | null { return this.current; }
  /** True while gameplay must not advance. */
  get blocked(): boolean { return this.current !== null; }
  /** False after a context loss until it is restored: nothing may be drawn. */
  get canDraw(): boolean { return this.current !== "contextLost"; }
  /** Hidden page or blur: ask for an explicit continue (never overrides a context loss). */
  away(): boolean {
    if (this.current === "contextLost") return false;
    const changed = this.current !== "away";
    this.current = "away";
    return changed;
  }
  contextLost(): void { this.current = "contextLost"; }
  /** Drawing is back; play resumes only after the explicit continue. */
  contextRestored(): void {
    if (this.current === "contextLost") this.current = "contextRestored";
  }
  /** The 「続ける」 action. Returns true when play resumes. */
  resume(): boolean {
    if (this.current !== "away" && this.current !== "contextRestored") return false;
    this.current = null;
    return true;
  }
}
