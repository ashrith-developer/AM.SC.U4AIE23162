"use strict";

const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1
};

function getTypeWeight(notification) {
  return TYPE_WEIGHT[notification.Type] || 0;
}

function getTimestamp(notification) {
  const value = Date.parse(notification.Timestamp);
  return Number.isNaN(value) ? 0 : value;
}

function isUnread(notification) {
  if (typeof notification.IsRead === "boolean") {
    return !notification.IsRead;
  }

  if (typeof notification.isRead === "boolean") {
    return !notification.isRead;
  }

  return true;
}

function getPriorityNotifications(notifications, limit = 10) {
  return [...notifications]
    .filter(isUnread)
    .sort((first, second) => {
      const weightDifference = getTypeWeight(second) - getTypeWeight(first);

      if (weightDifference !== 0) {
        return weightDifference;
      }

      return getTimestamp(second) - getTimestamp(first);
    })
    .slice(0, limit);
}

module.exports = { getPriorityNotifications, TYPE_WEIGHT };
