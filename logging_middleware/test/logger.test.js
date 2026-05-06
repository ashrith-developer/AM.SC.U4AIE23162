"use strict";

const assert = require("node:assert/strict");
const { Log } = require("../src");

async function run() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => "" };
  };

  process.env.LOG_API_URL = "http://localhost/logs";
  process.env.LOG_AUTH_TOKEN = "test-token";
  delete process.env.AFFORD_ACCESS_TOKEN;

  await Log("backend", "info", "service", "scheduler started");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost/logs");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    stack: "backend",
    level: "info",
    package: "service",
    message: "scheduler started"
  });

  await Log("backend", "info", "service", "this message is intentionally longer than forty eight characters");
  assert.equal(JSON.parse(calls[1].options.body).message.length, 48);

  await assert.rejects(() => Log("mobile", "info", "service", "bad stack"));

  process.env.AFFORD_ACCESS_TOKEN = "your_token_here";
  process.env.LOG_AUTH_TOKEN = "";
  await Log("backend", "info", "service", "skip placeholder token");
  assert.equal(calls.length, 2);

  global.fetch = originalFetch;
  console.log("logger tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
