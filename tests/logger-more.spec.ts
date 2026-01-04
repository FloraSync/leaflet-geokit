import { describe, it, expect } from "vitest";
import { createLogger } from "@src/utils/logger";

describe("utils/logger — more cases", () => {
  it("silent level logs nothing", () => {
    const calls: string[] = [];
    const sink: any = { log: (...args: any[]) => calls.push(String(args[0])) };
    const log = createLogger("x", "silent", sink);
    log.error("nope");
    log.warn("nope");
    log.info("nope");
    expect(calls.length).toBe(0);
  });

  it("child level is captured at creation (independent after)", () => {
    const calls: string[] = [];
    // eslint-disable-next-line no-unused-vars
    const sink: any = { debug: (..._args: any[]) => calls.push("debug") };
    const parent = createLogger("p", "warn", sink);
    const child = parent.child("c"); // child starts at 'warn'
    // Raise parent verbosity; child should remain at 'warn'
    parent.setLevel("debug");
    child.debug("should be filtered");
    expect(calls.length).toBe(0);
  });
});
