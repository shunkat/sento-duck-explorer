// Japanese HUD: status panel, objective, nearby keys, key help, toasts,
// transfer dialog, game-over and clear screens (Req 7.10, 9.6).
import { nearbyHints, objective } from "../core/guide";
import { CHARACTER_NAME, CHECKPOINT_NAME, ITEM_NAME, ITEM_TEXT, VIOLATION_TEXT } from "../core/text";
import type { GameEvent, GameState } from "../core/types";
import type { Level } from "../level/layout";
import { statusLines } from "./deriveView";

export const KEY_HELP = [
  "WASD / 矢印：移動（カメラの向き基準）　Shift：走る",
  "J / L・マウスドラッグ：視点を左右に回す",
  "Tab：キャラクター切替（アヒル→子ども→大人）",
  "E：調べる・拾う・渡す・使う（確認はE / Enter、取消はEsc）",
  "T：タオルで体を拭く　G：ロッカーで服を着る/脱ぐ",
  "C：全体マップ視点の切替",
  "マナー違反の行動（試すとゲームオーバー）：Q タオルを湯船へ／V 大声／F 押す",
];

const TOAST_SECONDS = 2.5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
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

  /** Show rejected actions and blocked-door prompts briefly. */
  onEvents(events: readonly GameEvent[], now: number): void {
    for (const e of events) {
      let text: string | null = null;
      if (e.kind === "rejected") text = e.reason;
      else if (e.kind === "prompt") text = e.text;
      else if (e.kind === "checkpointSaved") text = `再開地点を保存：${CHECKPOINT_NAME[e.id]}`;
      else if (e.kind === "itemMoved") {
        const item = ITEM_NAME[e.item];
        text = e.to.kind === "character" ? `${item} → ${CHARACTER_NAME[e.to.id]}` : null;
        if (e.item === "coin" && e.to.kind === "node" && e.to.id === "reception_register") text = "サウナ代を払いました（このゲームの施設では500円）";
      } else if (e.kind === "doorUnlocked") text = "サウナ室の扉が開きました";
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
        `<p class="reason">${v.reason}</p>` +
        `<p>${v.manner}</p>` +
        `<p class="small">※このゲームの施設のルールです。実際のルールは施設ごとに確認しましょう。</p>` +
        `<p class="key">Rキーで「${CHECKPOINT_NAME[s.lastCheckpoint]}」から再開</p>`;
    } else if (s.outcome.kind === "cleared") {
      key = "cleared";
      html =
        `<h2>クリア！</h2>` +
        `<p>サウナハットを被ったアヒルが、秘密の池の奥に着きました。</p>` +
        `<p>アヒル・子ども・大人の協力で、銭湯のマナーを守りながら進めました。</p>` +
        `<p class="key">Rキーで最初から遊ぶ</p>`;
    } else if (s.dialog) {
      const d = s.dialog;
      key = `dialog:${d.item}`;
      html =
        `<h2>${CHARACTER_NAME[d.from]}から${CHARACTER_NAME[d.to]}へ渡しますか？</h2>` +
        `<p>${ITEM_NAME[d.item]}：${ITEM_TEXT[d.item]}</p>` +
        `<p class="key">E / Enter：渡す　　Esc：やめる</p>`;
    }
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.overlay.innerHTML = html;
    this.overlay.style.display = html ? "flex" : "none";
    this.overlay.className = `hud-overlay ${key.split(":")[0]}`;
  }
}
