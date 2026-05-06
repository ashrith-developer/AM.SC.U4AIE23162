"use strict";

const DEFAULT_BASE_URL = "http://20.207.122.201/evaluation-service";
const FALLBACK_BASE_URL = "http://20.244.56.144/evaluation-service";

function getBaseUrls() {
  if (process.env.EVALUATION_SERVICE_URL) {
    return [process.env.EVALUATION_SERVICE_URL.replace(/\/$/, "")];
  }

  return [DEFAULT_BASE_URL, FALLBACK_BASE_URL];
}

function getToken(tokenOverride) {
  return tokenOverride || process.env.AFFORD_ACCESS_TOKEN || process.env.API_BEARER_TOKEN || "";
}

function hasUsableToken(tokenOverride) {
  const token = getToken(tokenOverride);
  return token && token !== "your_token_here";
}

async function fetchNotifications(tokenOverride) {
  const token = getToken(tokenOverride);
  const headers = { Accept: "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let lastError = null;

  for (const baseUrl of getBaseUrls()) {
    const url = `${baseUrl}/notifications`;

    try {
      const response = await fetch(url, { headers });
      const body = await response.text();

      if (!response.ok) {
        lastError = new Error(`Notification API failed with ${response.status}: ${body}`);
        continue;
      }

      const data = JSON.parse(body);
      return Array.isArray(data.notifications) ? data.notifications : [];
    } catch (error) {
      lastError = new Error(`Notification API request failed: ${error.message}`);
    }
  }

  throw lastError || new Error("Notification API request failed");
}

module.exports = { fetchNotifications, hasUsableToken };
