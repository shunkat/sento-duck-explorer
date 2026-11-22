// Japanese HUD: status panel, objective, nearby keys, key help, toasts,
// game-over and clear screens. Growth and exit (2026-11-21).
import { nearbyHints, objective } from "../core/guide";
import { CHECKPOINT_NAME, MSG, VIOLATION_TEXT } from "../core/text";
import type { GameEvent, GameState } from "../core/types";
import type { Level } from "../level/layout";
import { statusLines } from "./deriveView";

export const KEY_HELP = [
  "WASD / 矢印：移動（カメラの向き基準）　Shift：走る",
  "J / L・マウスドラッグ：視点を左右に回す",
  "E / Enter：その場でできること（牛乳びんを飲む・体を拭く・服・高い取っ手の戸・タオルを頭へ）",
  "体を拭く：浴室の出口かサウナの扉の前でE　服：ロッカーの前でE",
  "C：全体マップ視点の切替",
  "マナー違反の行動（試すとゲームオーバー）：Q 手のタオルを湯船へ／V 大声／F 押す",
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
  private goal: HTMLElement;
  private hints: HTMLElement;
  private toast: HTMLElement;
  private overlay: HTMLElement;
  private devWarn: HTMLElement;
  private toastUntil = 0;
  private lastKey = "";

  constructor(root: HTMLElement) {
    root.innerHTML = "";
    this.status = el("div", "hud-status", root);
    const guide = el("div", "hud-guide", root);
    this.goal = el("div", "hud-goal", guide);
    this.hints = el("div", "hud-hints", guide);
    const keys = el("div", "hud-keys", root);
    keys.textContent = KEY_HELP.join("\n");
    this.toast = el("div", "hud-toast", root);
    this.overlay = el("div", "hud-overlay", root);
    this.devWarn = el("div", "hud-dev", root);
  }

  /** Show growth, rejected actions and prompts briefly. */
  onEvents(events: readonly GameEvent[], now: number): void {
    for (const e of events) {
      const text = toastFor(e);
      if (text) {
        this.toast.textContent = text;
        this.toastUntil = now + TOAST_SECONDS;
      }
    }
  }

  setDevWarnings(lines: string[]): void {
    this.devWarn.textContent = lines.length ? `開発用チェック：${lines.join(" / ")}` : "";
  }

  update(s: GameState, level: Level, now: number, overview: boolean): void {
    this.status.textContent = statusLines(s).join("\n");
    this.goal.textContent = `目的：${objective(s)}`;
    const hints = nearbyHints(s, level);
    this.hints.textContent = (overview ? ["（全体マップ視点：Cで戻る）", ...hints] : hints).join("\n");
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
