import { beforeEach, describe, expect, it } from "vitest";
import {
  clearInvitationContinuation,
  getInvitationContinuation,
  saveInvitationContinuation,
} from "./invitations";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe("invitation continuation", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it("uses session storage and clears the raw token after completion", () => {
    saveInvitationContinuation("one-time-token");
    expect(getInvitationContinuation()).toBe("one-time-token");

    clearInvitationContinuation();
    expect(getInvitationContinuation()).toBeNull();
  });
});
