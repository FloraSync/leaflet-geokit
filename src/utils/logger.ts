export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

/* eslint-disable no-unused-vars */
export interface Logger {
  level: LogLevel;
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (childName: string) => Logger;
  setLevel: (level: LogLevel) => void;
}
/* eslint-enable no-unused-vars */

const levelWeight: Record<Exclude<LogLevel, "silent">, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

function shouldLog(
  current: LogLevel,
  msgLevel: Exclude<LogLevel, "silent">,
): boolean {
  if (current === "silent") return false;
  return (
    levelWeight[msgLevel] >= levelWeight[current as Exclude<LogLevel, "silent">]
  );
}

function nowISO(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

export function createLogger(
  name: string,
  level: LogLevel = "debug",
  sink: Console = console,
): Logger {
  let currentLevel: LogLevel = level;

  const base =
    (lvl: Exclude<LogLevel, "silent">) =>
    (...args: unknown[]) => {
      try {
        if (!shouldLog(currentLevel, lvl)) return;
        const prefix = `[${nowISO()}][${name}][${lvl.toUpperCase()}]`;
        // Route to appropriate console method if exists, otherwise fallback to console.log
        const method = (sink as any)[lvl] as  // eslint-disable-next-line no-unused-vars
          | ((...args: unknown[]) => void)
          | undefined;
        if (typeof method === "function") {
          method(prefix, ...args);
        } else {
          sink.log(prefix, ...args);
        }
      } catch {
        // Never throw from logger
      }
    };

  const api: Logger = {
    get level() {
      return currentLevel;
    },
    setLevel(lvl: LogLevel) {
      currentLevel = lvl;
    },
    trace: base("trace"),
    debug: base("debug"),
    info: base("info"),
    warn: base("warn"),
    error: base("error"),
    child(childName: string) {
      return createLogger(`${name}:${childName}`, currentLevel, sink);
    },
  };

  return api;
}
