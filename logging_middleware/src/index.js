"use strict";

const DEFAULT_LOG_API_URL = "http://20.207.122.201/evaluation-service/logs";

const VALID_STACKS = new Set(["backend", "frontend"]);
const VALID_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);
const VALID_PACKAGES = new Set([
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
  "auth",
  "config",
  "middleware",
  "utils"
]);

const MAX_LOG_MESSAGE_LENGTH = 48;
let warnedAboutMissingToken = false;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function getToken() {
  return process.env.AFFORD_ACCESS_TOKEN || process.env.LOG_AUTH_TOKEN || process.env.API_BEARER_TOKEN || "";
}

function hasUsableToken(token) {
  return token && token !== "your_token_here";
}

function trimMessage(message) {
  const normalizedMessage = String(message || "");

  if (normalizedMessage.length <= MAX_LOG_MESSAGE_LENGTH) {
    return normalizedMessage;
  }

  return normalizedMessage.slice(0, MAX_LOG_MESSAGE_LENGTH);
}

async function Log(stack, level, packageName, message) {
  const payload = {
    stack: normalize(stack),
    level: normalize(level),
    package: normalize(packageName),
    message: trimMessage(message)
  };

  if (!VALID_STACKS.has(payload.stack)) {
    throw new Error(`Invalid log stack: ${stack}`);
  }
  if (!VALID_LEVELS.has(payload.level)) {
    throw new Error(`Invalid log level: ${level}`);
  }
  if (!VALID_PACKAGES.has(payload.package)) {
    throw new Error(`Invalid log package: ${packageName}`);
  }
  if (!payload.message) {
    throw new Error("Log message is required");
  }

  const token = getToken();
  if (!hasUsableToken(token)) {
    if (!warnedAboutMissingToken) {
      warnedAboutMissingToken = true;
      console.warn("Remote logging skipped because AFFORD_ACCESS_TOKEN is not set to a real token.");
    }
    return;
  }

  const url = process.env.LOG_API_URL || DEFAULT_LOG_API_URL;
  const headers = { "Content-Type": "application/json" };

  headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`Log API failed with ${response.status}: ${body}`);
    }
  } catch (error) {
    console.error(`Log API request failed: ${error.message}`);
  }
}

module.exports = { Log };
