// Display preference only: independent of game state and checkpoints.
export const HELP_STORAGE_KEY = "sento-duck-explorer.operation-help";

export interface HelpStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage may be unavailable (private mode, disabled storage or an opaque origin). */
function browserStorage(): HelpStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export class HelpSettings {
  enabled = true;
  private storage: HelpStorage | undefined;

  constructor(storage: HelpStorage | undefined = browserStorage()) {
    this.storage = storage;
    try { this.enabled = storage?.getItem(HELP_STORAGE_KEY) !== "off"; } catch { /* Keep the default. */ }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try { this.storage?.setItem(HELP_STORAGE_KEY, enabled ? "on" : "off"); } catch { /* The session preference still works. */ }
  }
}
