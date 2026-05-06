"use strict";

const http = require("node:http");
const { URL } = require("node:url");
const { fetchNotifications, hasUsableToken } = require("./apiClient");
const { getPriorityNotifications } = require("./priority");

const FALLBACK_NOTIFICATIONS = [
  {
    ID: "b283218f-ea5a-4b7c-93a9-1f2f240d640b",
    Type: "Placement",
    Message: "CSC Corporation hiring",
    Timestamp: "2026-04-22 17:51:18"
  },
  {
    ID: "d146a95a-0d86-4a34-9e69-3900a14576bc",
    Type: "Result",
    Message: "mid-sem",
    Timestamp: "2026-04-22 17:51:30"
  },
  {
    ID: "81589ada-0ad3-4f77-9554-f52fb558e09d",
    Type: "Event",
    Message: "farewell",
    Timestamp: "2026-04-22 17:51:06"
  },
  {
    ID: "0005513a-142b-4bbc-8678-eefec65e1ede",
    Type: "Result",
    Message: "mid-sem",
    Timestamp: "2026-04-22 17:50:54"
  },
  {
    ID: "ea336726-c25e-4f21-a72f-544a6dfa837f",
    Type: "Result",
    Message: "project-review",
    Timestamp: "2026-04-22 17:50:42"
  },
  {
    ID: "003cb427-8fc6-47f7-bb00-be228f6bed2c",
    Type: "Result",
    Message: "external",
    Timestamp: "2026-04-22 17:50:30"
  },
  {
    ID: "e5c4ff20-31bf-4d40-8f02-72fda59e8918",
    Type: "Result",
    Message: "project-review",
    Timestamp: "2026-04-22 17:50:18"
  },
  {
    ID: "1cfce5ee-ad37-4894-8946-d707627176a5",
    Type: "Event",
    Message: "tech-fest",
    Timestamp: "2026-04-22 17:50:06"
  }
];

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}

function getRequestToken(request) {
  const authorization = request.headers.authorization || "";
  const prefix = "Bearer ";

  if (authorization.startsWith(prefix)) {
    return authorization.slice(prefix.length).trim();
  }

  return "";
}

async function handlePriorityNotifications(request, response, url) {
  const tokenOverride = getRequestToken(request);
  const limit = Number(url.searchParams.get("limit") || 10);

  if (!hasUsableToken(tokenOverride)) {
    return sendJson(response, 401, {
      error: "Access token is required",
      fix: "Set Authorization: Bearer <access_token> or set AFFORD_ACCESS_TOKEN before npm start"
    });
  }

  if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
    return sendJson(response, 400, {
      error: "limit must be an integer between 1 and 50"
    });
  }

  try {
    let source = "live-api";
    let notifications = [];

    try {
      notifications = await fetchNotifications(tokenOverride);
    } catch (error) {
      source = `fallback-sample: ${error.message}`;
      notifications = FALLBACK_NOTIFICATIONS;
    }

    const priorityNotifications = getPriorityNotifications(notifications, limit);

    return sendJson(response, 200, {
      source,
      count: priorityNotifications.length,
      priorityOrder: ["Placement", "Result", "Event"],
      notifications: priorityNotifications
    });
  } catch (error) {
    return sendJson(response, 500, {
      error: "Unable to fetch priority notifications",
      details: error.message
    });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { status: "ok" });
  }

  if (request.method === "GET" && url.pathname === "/priority-notifications") {
    return handlePriorityNotifications(request, response, url);
  }

  return sendJson(response, 404, {
    error: "Route not found"
  });
}

const port = Number(process.env.PORT || 4000);

if (require.main === module) {
  http.createServer(handleRequest).listen(port, () => {
    console.log(`Notification priority service listening on port ${port}`);
  });
}

module.exports = { handleRequest };
