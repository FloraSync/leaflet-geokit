import { describe, it, expect } from "vitest";
import { createLogger } from "@src/utils/logger";

describe("utils/logger", () => {
  it("respects log levels and setLevel()", () => {
    const calls: string[] = [];
    const sink: any = {
      warn: (...args: any[]) => calls.push("warn:" + args[0]),
      error: (...args: any[]) => calls.push("error:" + args[0]),
      info: (...args: any[]) => calls.push("info:" + args[0]),
      debug: (...args: any[]) => calls.push("debug:" + args[0]),
      trace: (...args: any[]) => calls.push("trace:" + args[0]),
      log: (...args: any[]) => calls.push("log:" + args[0]),
    };
    const log = createLogger("test", "warn", sink as any);
    log.debug("ignored");
    log.info("ignored");
    log.warn("show");
    log.error("show");
    expect(calls.some((c) => c.startsWith("warn:"))).toBe(true);
    expect(calls.some((c) => c.startsWith("error:"))).toBe(true);
    expect(calls.some((c) => c.startsWith("info:"))).toBe(false);

    // After raising verbosity, trace should log
    calls.length = 0;
    log.setLevel("trace");
    log.trace("ok");
    expect(calls.some((c) => c.startsWith("trace:"))).toBe(true);
  });

  it("falls back to sink.log when method missing", () => {
    const calls: string[] = [];
    const sink: any = { log: (...args: any[]) => calls.push("log:" + args[0]) };
    const log = createLogger("test2", "debug", sink as any);
    log.warn("x");
    expect(calls[0]?.startsWith("log:")).toBe(true);
  });

  it("child inherits level and name is nested", () => {
    const calls: string[] = [];
    const sink: any = { info: (...args: any[]) => calls.push(String(args[0])) };
    const base = createLogger("root", "info", sink as any);
    const child = base.child("sub");
    child.info("msg");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("[root:sub]");
  });

  it("handles Date.toISOString() failures gracefully", () => {
    // Mock Date.prototype.toISOString to throw
    const originalToISOString = Date.prototype.toISOString;
    Date.prototype.toISOString = () => {
      throw new Error("ISO failed");
    };

    try {
      const calls: string[] = [];
      const sink: any = {
        info: (...args: any[]) => calls.push(String(args[0])),
      };
      const log = createLogger("test", "info", sink as any);
      log.info("test message");

      // Should still log but with empty timestamp
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain("[][test][INFO]");
    } finally {
      // Restore original method
      Date.prototype.toISOString = originalToISOString;
    }
  });

  it("handles logging failures gracefully", () => {
    const problematicSink: any = {
      info: () => {
        throw new Error("Sink failed");
      },
    };

    const log = createLogger("test", "info", problematicSink);

    // This should not throw even if the sink throws
    expect(() => log.info("test message")).not.toThrow();
  });

  it("exposes level getter correctly", () => {
    const log = createLogger("test", "warn");
    expect(log.level).toBe("warn");

    log.setLevel("debug");
    expect(log.level).toBe("debug");
  });
});
