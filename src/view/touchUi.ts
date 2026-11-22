// Touch controls: stick, contextual action, recenter, run toggle and the
// "その他" menu. Each control is a real button or pad with its own pointer
// ownership; nothing here shows keyboard keys.
import type { CharacterId } from "../core/types";
import { STICK_RADIUS, type TouchInput } from "../input/touch";
import type { PressAction } from "../input/keyboard";
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}
/** Menu entries: Japanese action names only. Humans only (the duck has none of them). */
export const MENU_ACTIONS: { label: string; action: PressAction }[] = [
  { label: "タオルを手と頭で持ち替える", action: "toggleTowel" },
  { label: "タオルを湯につける", action: "dipTowel" },
  { label: "声を出す", action: "shout" },
  { label: "押す", action: "push" },
];
export interface TouchUiDeps {
  touch: TouchInput;
  press: (action: PressAction) => void;
  /** Any modal (action menu) opened or closed: pause and clear every input. */
  onModalChange: (open: boolean) => void;
}
export class TouchUi {
  private pad: HTMLElement;
  private knob: HTMLElement;
  private primary: HTMLButtonElement;
  private runButton: HTMLButtonElement;
  private menuButton: HTMLButtonElement;
  private menu: HTMLDialogElement;
  private menuList: HTMLElement;
  private menuOpenFlag = false;
  private root: HTMLElement;
  constructor(root: HTMLElement, private deps: TouchUiDeps) {
    this.root = root;
    root.innerHTML = "";
    this.pad = el("div", "touch-pad", root);
    this.pad.setAttribute("aria-label", "移動スティック");
    this.knob = el("div", "touch-knob", this.pad);
    const actions = el("div", "touch-actions", root);
    this.primary = el("button", "touch-btn touch-primary", actions);
    this.primary.type = "button";
    this.setLabel(null);
    const recenter = el("button", "touch-btn touch-recenter", actions);
    recenter.type = "button";
    recenter.textContent = "正面へ";
    this.runButton = el("button", "touch-btn touch-run", actions);
    this.runButton.type = "button";
    this.runButton.textContent = "走る";
    this.runButton.setAttribute("aria-pressed", "false");
    this.menuButton = el("button", "touch-btn touch-menu-button", actions);
    this.menuButton.type = "button";
    this.menuButton.textContent = "その他";
    this.menuButton.setAttribute("aria-haspopup", "dialog");
    this.menu = el("dialog", "touch-menu", root);
    this.menu.setAttribute("aria-label", "その他の操作");
    this.menuList = el("div", "touch-menu-list", this.menu);
    const close = el("button", "touch-btn touch-menu-close", this.menu);
    close.type = "button";
    close.textContent = "閉じる";
    this.bindPad();
    // Activation is a single click; the press is queued for the next fixed tick.
    this.primary.addEventListener("click", () => deps.press("interact"));
    recenter.addEventListener("click", () => deps.press("recenter"));
    this.runButton.addEventListener("click", () => this.setRunPressed(deps.touch.toggleRun()));
    this.menuButton.addEventListener("click", () => this.openMenu());
    close.addEventListener("click", () => this.closeMenu());
    this.menu.addEventListener("cancel", (e) => { e.preventDefault(); this.closeMenu(); });
    this.menu.addEventListener("close", () => this.afterClose());
    this.setStage("duck");
  }
  get menuOpen(): boolean { return this.menuOpenFlag; }
  private bindPad(): void {
    const { touch } = this.deps;
    const centre = () => {
      const r = this.pad.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const moveKnob = () => {
      const v = touch.stick;
      this.knob.style.transform = `translate(${v.x * STICK_RADIUS * 0.7}px, ${v.z * STICK_RADIUS * 0.7}px)`;
    };
    this.pad.addEventListener("pointerdown", (e) => {
      if (this.menuOpenFlag) return;
      const c = centre();
      if (!touch.stickDown(e.pointerId, c.x, c.y, e.clientX, e.clientY)) return;
      try { this.pad.setPointerCapture(e.pointerId); } catch { /* A stale id: ownership is still tracked. */ }
      e.preventDefault();
      moveKnob();
    });
    this.pad.addEventListener("pointermove", (e) => {
      touch.stickMove(e.pointerId, e.clientX, e.clientY);
      moveKnob();
    });
    const end = (e: PointerEvent) => {
      // Only the pointer that owns the stick releases it; the look finger is untouched.
      if (touch.release(e.pointerId) === "stick") moveKnob();
    };
    this.pad.addEventListener("pointerup", end);
    this.pad.addEventListener("pointercancel", end);
    this.pad.addEventListener("lostpointercapture", end);
  }
  /** After any clear: the stick and run indicators match the input state. */
  syncFromInput(): void {
    this.knob.style.transform = "translate(0px, 0px)";
    this.setRunPressed(this.deps.touch.run);
  }
  private setRunPressed(on: boolean): void {
    this.runButton.setAttribute("aria-pressed", String(on));
    this.runButton.textContent = on ? "走る（入）" : "走る";
  }
  /** Action name of the current E target (Japanese, no key); a neutral label when there is none. */
  setLabel(label: string | null): void {
    this.primary.textContent = label ?? "調べる";
    this.primary.setAttribute("data-has-target", String(label !== null));
  }
  /** Run and the human actions exist only for humans. */
  setStage(stage: CharacterId): void {
    const human = stage !== "duck";
    this.runButton.hidden = !human;
    this.menuButton.hidden = !human;
  }
  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
  private openMenu(): void {
    if (this.menuOpenFlag) return;
    this.menuList.innerHTML = "";
    for (const m of MENU_ACTIONS) {
      const b = el("button", "touch-btn touch-menu-item", this.menuList);
      b.type = "button";
      b.textContent = m.label;
      b.addEventListener("click", () => this.choose(m.action));
    }
    this.menuOpenFlag = true;
    this.deps.onModalChange(true);
    this.menu.showModal();
  }
  /** Close and reset first, then queue the chosen action once. */
  private choose(action: PressAction): void {
    this.closeMenu();
    this.deps.press(action);
  }
  private closeMenu(): void {
    if (this.menu.open) this.menu.close();
    this.afterClose();
  }
  private afterClose(): void {
    if (!this.menuOpenFlag) return;
    this.menuOpenFlag = false;
    this.deps.onModalChange(false);
  }
}
