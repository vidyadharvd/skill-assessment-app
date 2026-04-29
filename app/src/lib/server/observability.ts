type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

export function logServerEvent(
  level: LogLevel,
  event: string,
  context: LogContext = {},
): void {
  const payload = {
    event,
    ...context,
    at: new Date().toISOString(),
  };

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(payload);
    return;
  }

  if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(payload);
    return;
  }

  // eslint-disable-next-line no-console
  console.info(payload);
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error instanceof Error && "cause" in error
          ? (error as Error & { cause?: unknown }).cause
          : undefined,
    };
  }

  return {
    value: String(error),
  };
}
