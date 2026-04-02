import pino from "pino";

/**
 * Central logger for chat-api.
 * Log level is controlled via the CHAT_LOG_LEVEL env var (default: "info").
 * Valid values: trace | debug | info | warn | error | fatal | silent
 *
 * Example: CHAT_LOG_LEVEL=debug  →  DEBUG and above are emitted
 *          CHAT_LOG_LEVEL=trace  →  everything including base64 image payloads
 */
const logger = pino({
  level: (process.env.CHAT_LOG_LEVEL || "info").toLowerCase(),
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined
});

export default logger;
