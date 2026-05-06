"use strict";

const assert = require("node:assert/strict");
const { getPriorityNotifications } = require("../src/priority");

const notifications = [
  { ID: "event-new", Type: "Event", Message: "farewell", Timestamp: "2026-04-22 17:51:06" },
  { ID: "placement-old", Type: "Placement", Message: "hiring", Timestamp: "2026-04-22 17:51:18" },
  { ID: "result-new", Type: "Result", Message: "mid-sem", Timestamp: "2026-04-22 17:51:30" },
  { ID: "placement-new", Type: "Placement", Message: "dream offer", Timestamp: "2026-04-22 17:52:00" },
  { ID: "read-placement", Type: "Placement", Message: "hidden", Timestamp: "2026-04-22 18:00:00", IsRead: true }
];

const top = getPriorityNotifications(notifications, 3);

assert.deepEqual(
  top.map((notification) => notification.ID),
  ["placement-new", "placement-old", "result-new"]
);

console.log("priority tests passed");
