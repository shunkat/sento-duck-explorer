// Compact contextual HUD. General controls live in the settings dialog;
// facility guidance belongs to the world posters.
import { nearbyHints } from "../core/guide";
import { CHECKPOINT_NAME, MSG, VIOLATION_TEXT } from "../core/text";
import type { GameEvent, GameState } from "../core/types";
import type { Level } from "../level/layout";
import { statusLines } from "./deriveView";
import { ControlSettings, SENSITIVITY_MAX, SENSITIVITY_MIN } from "../input/controlSettings";
import { PAUSE_TEXT, type PauseReason } from "../lifecycle";
import { HelpSettings } from "./helpSettings";
export const KEY_HELP = [
  "WASD / 矢印：今見ている向きを基準に移動",
  "マウス（クリックで捕捉）/ 右ドラッグ / J・L：視点を回す",
  "Space：視点を正面へ戻す",
  "E / Enter：光っている対象を使う",
  "T：タオルを手と頭で持ち替える",
  "Shift：走る（子ども・大人）",
  "C：全画面マップ　Esc：ポインターを解放して設定を開く",
];
/** Controls shown on a touch device (no keyboard keys). */
export const TOUCH_HELP = [
  "左のスティック：移動（視点の向き基準）",
  "右側をドラッグ：視点を回す",
  "右下のボタン：近くの対象を使う　正面へ：視点を戻す",
  "走る：タップで入／切（止まると切れます）",
  "その他：タオル・声・押す",
];
/** Options that connect the HUD to the app. */
export interface HudOptions {
  controls?: ControlSettings;
  /** Called after the help checkbox changed (even while settings pause the frame loop). */
  onHelpChange?: (enabled: boolean) => void;
  /** Called after any look or rendering preference changed. */
  onControlsChange?: () => void;
  /** Visible restart button (game-over: checkpoint, cleared: new game). */
  onRestart?: () => void;
  /** The 続ける action of the pause overlay. */
  onContinue?: () => void;
  /** True while the touch layout is in use (hides keyboard wording). */
  isTouch?: () => boolean;
}
const TOAST_SECONDS = 2.5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

/** Toast text for an event, or null. */
export function toastFor(e: GameEvent): string | null {
  if (e.kind === "rejected") return e.reason;
  if (e.kind === "prompt") return e.text;
  if (e.kind === "checkpointSaved") return `再開地点を保存：${CHECKPOINT_NAME[e.id]}`;
  if (e.kind === "grew") return MSG.grew(e.to);
  if (e.kind === "guardianJoined") return "大人がいっしょにサウナへ来てくれます";
  if (e.kind === "milkCollected") return `牛乳を飲んだ！ 成長まで ${e.collected}/${e.required}本`;
  if (e.kind === "doorOpened") return e.id === "frontExit" ? "玄関の戸が開きました" : "休憩所の戸が開きました";
  return null;
}

export class Hud {
  private status: HTMLElement;
  private hints: HTMLElement;
  private toast: HTMLElement;
  private overlay: HTMLElement;
  private devWarn: HTMLElement;
  private toastUntil = 0;
  private lastKey = "";
  private settings: HelpSettings;
  private settingsButton: HTMLButtonElement;
  private settingsDialog: HTMLDialogElement;
  private helpCheckbox: HTMLInputElement;
  private settingsOpen = false;
  private toastIsPrompt = false;

  private prompt: HTMLElement;
  private pause: HTMLElement;
  private loadStatus: HTMLElement;
  private opts: HudOptions;
  private promptLabel: string | null = null;
  private pauseKey = "";
  constructor(root: HTMLElement, onSettingsChange: () => void = () => {}, settings = new HelpSettings(), opts: HudOptions = {}) {
    this.opts = opts;
    this.settings = settings;
    root.innerHTML = "";
    this.status = el("div", "hud-status", root);
    this.hints = el("div", "hud-hints", root);
    this.toast = el("div", "hud-toast", root);
    this.toast.setAttribute("role", "status");
    this.prompt = el("div", "hud-prompt", root);
    this.prompt.hidden = true;
    this.loadStatus = el("div", "hud-load", root);
    this.loadStatus.setAttribute("role", "status");
    this.overlay = el("div", "hud-overlay", root);
    this.pause = el("div", "hud-pause", root);
    this.pause.style.display = "none";
    this.pause.setAttribute("role", "alertdialog");
    this.devWarn = el("div", "hud-dev", root);
    const act = (e: Event) => {
      const a = (e.target as HTMLElement | null)?.closest?.("[data-action]")?.getAttribute("data-action");
      if (a === "restart") this.opts.onRestart?.();
      else if (a === "continue") this.opts.onContinue?.();
    };
    this.overlay.addEventListener("click", act);
    this.pause.addEventListener("click", act);

    this.settingsButton = el("button", "hud-settings-button", root);
    this.settingsButton.type = "button";
    this.settingsButton.textContent = "設定";
    this.settingsButton.setAttribute("aria-haspopup", "dialog");
    this.settingsButton.setAttribute("aria-expanded", "false");
    this.settingsButton.setAttribute("aria-controls", "game-settings");
    this.settingsDialog = el("dialog", "hud-settings-dialog", root);
    this.settingsDialog.id = "game-settings";
    this.settingsDialog.setAttribute("aria-labelledby", "game-settings-title");
    const title = el("h2", "", this.settingsDialog);
    title.id = "game-settings-title";
    title.textContent = "設定";
    const label = el("label", "hud-help-toggle", this.settingsDialog);
    this.helpCheckbox = el("input", "", label);
    this.helpCheckbox.type = "checkbox";
    this.helpCheckbox.checked = this.settings.enabled;
    el("span", "", label).textContent = "操作ヘルプを表示";
    if (opts.controls) this.buildControlSettings(this.settingsDialog, opts.controls);
    const controls = el("details", "hud-controls", this.settingsDialog);
    el("summary", "", controls).textContent = "基本操作";
    el("p", "", controls).textContent = (opts.isTouch?.() ? TOUCH_HELP : KEY_HELP).join("\n");
    const close = el("button", "hud-settings-close", this.settingsDialog);
    close.type = "button";
    close.textContent = "探検に戻る";

    this.onSettingsChange = onSettingsChange;
    const changed = (open: boolean) => {
      if (this.settingsOpen === open) return;
      this.settingsOpen = open;
      this.settingsButton.setAttribute("aria-expanded", String(open));
      this.hints.hidden = open || !this.settings.enabled;
      onSettingsChange();
    };
    this.settingsButton.addEventListener("click", () => {
      this.settingsDialog.showModal();
      changed(true);
      this.helpCheckbox.focus();
    });
    close.addEventListener("click", () => this.settingsDialog.close());
    // Native dialog cancel handles Escape and its modal focus trap.
    this.settingsDialog.addEventListener("close", () => {
      // Native close is queued: an older close must not resume a reopened dialog.
      if (this.settingsDialog.open) return;
      changed(false);
      this.settingsButton.focus();
    });
    this.helpCheckbox.addEventListener("change", () => {
      this.settings.setEnabled(this.helpCheckbox.checked);
      this.hints.hidden = !this.settings.enabled || this.settingsOpen;
      // Optional target feedback goes away at once, even though settings pause rendering.
      if (!this.settings.enabled) this.setPrompt(null);
      opts.onHelpChange?.(this.settings.enabled);
      if (!this.settings.enabled && this.toastIsPrompt) {
        this.toastUntil = 0;
        this.toast.style.opacity = "0";
        this.toast.textContent = "";
      }
    });
  }

  get isSettingsOpen(): boolean { return this.settingsOpen; }
  /** The settings button is unreachable behind a result or pause screen. */
  setBackgroundInert(inert: boolean): void {
    this.settingsButton.disabled = inert;
  }
  /** Pause and open settings (Escape released the pointer). */
  openSettings(): void {
    if (this.settingsOpen) return;
    this.settingsDialog.showModal();
    this.settingsOpen = true;
    this.settingsButton.setAttribute("aria-expanded", "true");
    this.hints.hidden = true;
    this.onSettingsChange();
  }
  private onSettingsChange: () => void = () => {};
  private buildControlSettings(dialog: HTMLElement, controls: ControlSettings): void {
    const row = (cls: string) => el("label", `hud-help-toggle ${cls}`, dialog);
    const changed = () => this.opts.onControlsChange?.();
    const sens = row("hud-sensitivity");
    el("span", "", sens).textContent = "視点の感度";
    const range = el("input", "", sens);
    range.type = "range";
    range.min = String(SENSITIVITY_MIN);
    range.max = String(SENSITIVITY_MAX);
    range.step = "0.1";
    range.value = String(controls.values.sensitivity);
    range.addEventListener("input", () => { controls.update({ sensitivity: Number(range.value) }); changed(); });
    const box = (cls: string, text: string, key: "invertY" | "dragOnly" | "lightweight") => {
      const r = row(cls);
      const c = el("input", "", r);
      c.type = "checkbox";
      c.checked = controls.values[key];
      el("span", "", r).textContent = text;
      c.addEventListener("change", () => { controls.update({ [key]: c.checked }); changed(); });
    };
    box("hud-invert", "上下を反転する", "invertY");
    box("hud-drag-only", "ドラッグだけで視点を回す（ポインターを捕捉しない）", "dragOnly");
    box("hud-lightweight", "軽量描画（解像度を下げる）", "lightweight");
  }
  /** Compact prompt for the E target when its text is not shown in the world. */
  setPrompt(label: string | null): void {
    const shown = this.settings.enabled && !this.settingsOpen ? label : null;
    if (shown === this.promptLabel) return;
    this.promptLabel = shown;
    this.prompt.textContent = shown ?? "";
    this.prompt.hidden = shown === null;
  }
  /** Truthful loading / failure line for the 3D models (null clears it). */
  setLoadStatus(text: string | null): void {
    this.loadStatus.textContent = text ?? "";
    this.loadStatus.hidden = text === null;
  }
  /** Show or clear the explicit-continue overlay. */
  setPause(reason: PauseReason | null): void {
    const key = reason ?? "";
    if (key === this.pauseKey) return;
    this.pauseKey = key;
    if (!reason) {
      this.pause.style.display = "none";
      this.pause.innerHTML = "";
      return;
    }
    const x = PAUSE_TEXT[reason];
    this.pause.style.display = "flex";
    this.pause.innerHTML = `<h2>${x.title}</h2><p>${x.body}</p>` +
      (x.button ? `<button type="button" class="hud-big-button" data-action="continue">${x.button}</button>` : "");
    this.pause.querySelector?.("button")?.focus();
  }

  /** Show growth, rejected actions and prompts briefly. */
  onEvents(events: readonly GameEvent[], now: number): void {
    // Milestone feedback wins over the checkpoint saved in the same tick.
    const milestone = events.find(e => e.kind === "grew") ?? events.find(e => e.kind === "milkCollected") ??
      events.find(e => e.kind === "guardianJoined");
    for (const e of milestone ? [milestone] : events) {
      if (e.kind === "prompt" && !this.settings.enabled) continue;
      const text = toastFor(e);
      if (text) {
        this.toastIsPrompt = e.kind === "prompt";
        this.toast.textContent = text;
        this.toastUntil = now + TOAST_SECONDS;
      }
    }
  }

  setDevWarnings(lines: string[]): void {
    this.devWarn.textContent = lines.length ? `開発用チェック：${lines.join(" / ")}` : "";
  }

  update(s: GameState, level: Level, now: number): void {
    this.status.textContent = statusLines(s).join(" · ");
    const showHelp = this.settings.enabled && !this.settingsOpen && s.outcome.kind === "playing" && !this.opts.isTouch?.();
    this.hints.textContent = showHelp ? nearbyHints(s, level).join("\n") : "";
    this.hints.hidden = !this.hints.textContent;
    this.toast.style.opacity = now < this.toastUntil ? "1" : "0";
    this.renderOverlay(s);
  }

  private renderOverlay(s: GameState): void {
    let key = "none";
    let html = "";
    const touch = this.opts.isTouch?.() ?? false;
    if (s.outcome.kind === "gameOver") {
      const v = VIOLATION_TEXT[s.outcome.reason];
      key = `over:${s.outcome.reason}:${s.lastCheckpoint}`;
      html =
        `<h2>ゲームオーバー（${s.outcome.reason}）</h2>` +
        (v.speech ? `<p class="speech">${v.speech.speaker}「${v.speech.line}」</p>` : "") +
        `<p class="reason">${v.reason}</p>` +
        `<p>${v.manner}</p>` +
        `<p class="small">※このゲームの施設のルールです。実際のルールは施設ごとに確認しましょう。</p>` +
        `<button type="button" class="hud-big-button" data-action="restart">「${CHECKPOINT_NAME[s.lastCheckpoint]}」から再開</button>` +
        (touch ? "" : `<p class="key">Rキーでも再開できます</p>`);
    } else if (s.outcome.kind === "cleared") {
      key = "cleared";
      html =
        `<h2>クリア！</h2>` +
        `<p>アヒルから子ども、大人へと育って、銭湯の玄関から外へ出ました。</p>` +
        `<p>大人とサウナに入り、露天風呂も探検して、4本の牛乳を集めました。</p>` +
        `<button type="button" class="hud-big-button" data-action="restart">最初から遊ぶ</button>` +
        (touch ? "" : `<p class="key">Rキーでも始められます</p>`);
    }
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.overlay.innerHTML = html;
    this.overlay.style.display = html ? "flex" : "none";
    this.overlay.className = `hud-overlay ${key.split(":")[0]}`;
    this.overlay.setAttribute("aria-live", html ? "assertive" : "off");
    this.overlay.querySelector?.("button")?.focus();
  }
}
