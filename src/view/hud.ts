// Compact contextual HUD. General controls live in the settings dialog;
// facility guidance belongs to the world posters.
import { nearbyHints } from "../core/guide";
import { CHECKPOINT_NAME, MSG, VIOLATION_TEXT } from "../core/text";
import type { GameEvent, GameState } from "../core/types";
import type { Level } from "../level/layout";
import { statusLines } from "./deriveView";
import { HelpSettings } from "./helpSettings";

export const KEY_HELP = [
  "WASD / 矢印：移動（カメラの向き基準）",
  "J / L・マウスドラッグ：視点を左右に回す",
  "E / Enter：近くのものを使う",
  "Shift：走る（子ども・大人）",
  "C：全体マップ視点の切替",
];

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

  constructor(root: HTMLElement, onSettingsChange: () => void = () => {}, settings = new HelpSettings()) {
    this.settings = settings;
    root.innerHTML = "";
    this.status = el("div", "hud-status", root);
    this.hints = el("div", "hud-hints", root);
    this.toast = el("div", "hud-toast", root);
    this.toast.setAttribute("role", "status");
    this.overlay = el("div", "hud-overlay", root);
    this.devWarn = el("div", "hud-dev", root);

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
    const controls = el("details", "hud-controls", this.settingsDialog);
    el("summary", "", controls).textContent = "基本操作";
    el("p", "", controls).textContent = KEY_HELP.join("\n");
    const close = el("button", "hud-settings-close", this.settingsDialog);
    close.type = "button";
    close.textContent = "探検に戻る";

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
      changed(false);
      this.settingsButton.focus();
    });
    this.helpCheckbox.addEventListener("change", () => {
      this.settings.setEnabled(this.helpCheckbox.checked);
      this.hints.hidden = !this.settings.enabled || this.settingsOpen;
      if (!this.settings.enabled && this.toastIsPrompt) {
        this.toastUntil = 0;
        this.toast.style.opacity = "0";
        this.toast.textContent = "";
      }
    });
  }

  get isSettingsOpen(): boolean { return this.settingsOpen; }

  /** Show growth, rejected actions and prompts briefly. */
  onEvents(events: readonly GameEvent[], now: number): void {
    for (const e of events) {
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

  update(s: GameState, level: Level, now: number, overview = false): void {
    this.status.textContent = statusLines(s).join(" · ");
    const showHelp = this.settings.enabled && !this.settingsOpen && s.outcome.kind === "playing";
    this.hints.textContent = showHelp ? (overview ? ["C: 探検に戻る"] : nearbyHints(s, level)).join("\n") : "";
    this.hints.hidden = !this.hints.textContent;
    this.toast.style.opacity = now < this.toastUntil ? "1" : "0";
    this.renderOverlay(s);
  }

  private renderOverlay(s: GameState): void {
    let key = "none";
    let html = "";
    if (s.outcome.kind === "gameOver") {
      const v = VIOLATION_TEXT[s.outcome.reason];
      key = `over:${s.outcome.reason}:${s.lastCheckpoint}`;
      html =
        `<h2>ゲームオーバー（${s.outcome.reason}）</h2>` +
        (v.speech ? `<p class="speech">${v.speech.speaker}「${v.speech.line}」</p>` : "") +
        `<p class="reason">${v.reason}</p>` +
        `<p>${v.manner}</p>` +
        `<p class="small">※このゲームの施設のルールです。実際のルールは施設ごとに確認しましょう。</p>` +
        `<p class="key">Rキーで「${CHECKPOINT_NAME[s.lastCheckpoint]}」から再開</p>`;
    } else if (s.outcome.kind === "cleared") {
      key = "cleared";
      html =
        `<h2>クリア！</h2>` +
        `<p>アヒルから子ども、大人へと育って、銭湯の玄関から外へ出ました。</p>` +
        `<p>体を拭いて、服を着て、マナーを守りながら進めました。</p>` +
        `<p class="key">Rキーで最初から遊ぶ</p>`;
    }
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.overlay.innerHTML = html;
    this.overlay.style.display = html ? "flex" : "none";
    this.overlay.className = `hud-overlay ${key.split(":")[0]}`;
  }
}
