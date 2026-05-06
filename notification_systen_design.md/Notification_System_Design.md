# Notification System Design

## Stage 2

### Persistent Storage Choice

I would use PostgreSQL as the persistent database for the notification system.

The main reason is that notifications have structured relationships: students, notification types, read/unread state, delivery attempts, timestamps, and audit history. PostgreSQL gives strong consistency, transactions, indexing, constraints, partitioning, and JSONB support if some notification metadata changes over time.

MongoDB can also store notifications, but for this problem PostgreSQL is a better default because the common access patterns are query-heavy and relational:

- Fetch unread notifications for a student.
- Mark one or many notifications as read.
- Store delivery status for email, in-app, and push channels.
- Query notification history by student, type, and time.
- Audit delivery attempts reliably.

### Schema

```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');
CREATE TYPE notification_channel AS ENUM ('email', 'in_app', 'push');
CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'failed', 'retrying');

CREATE TABLE students (
    id BIGSERIAL PRIMARY KEY,
    roll_no VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    notification_type notification_type NOT NULL,
    title VARCHAR(150),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE TABLE student_notifications (
    id BIGSERIAL PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(id),
    notification_id UUID NOT NULL REFERENCES notifications(id),
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, notification_id)
);

CREATE TABLE notification_deliveries (
    id BIGSERIAL PRIMARY KEY,
    student_notification_id BIGINT NOT NULL REFERENCES student_notifications(id),
    channel notification_channel NOT NULL,
    status delivery_status NOT NULL DEFAULT 'pending',
    attempt_count INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Important Indexes

```sql
CREATE INDEX idx_student_notifications_unread
ON student_notifications (student_id, is_read, created_at DESC);

CREATE INDEX idx_notifications_type_created
ON notifications (notification_type, created_at DESC);

CREATE INDEX idx_deliveries_status
ON notification_deliveries (status, created_at);
```

### REST APIs

```http
POST /notifications
```

Creates a notification template/message.

```json
{
  "type": "Placement",
  "title": "Placement drive",
  "message": "CSC Corporation hiring"
}
```

```http
POST /students/{studentId}/notifications
```

Assigns a notification to a student.

```http
GET /students/{studentId}/notifications?isRead=false
```

Fetches unread notifications for a student.

```http
PATCH /students/{studentId}/notifications/{notificationId}/read
```

Marks one notification as read.

```http
POST /notifications/bulk
```

Creates and queues a bulk notification for many students.

### Scale Problems And Fixes

As volume increases, the largest tables will be `student_notifications` and `notification_deliveries`. A single notification sent to 50,000 students becomes 50,000 rows, and each delivery channel adds more rows.

Solutions:

- Use composite indexes that match query patterns.
- Partition `student_notifications` and `notification_deliveries` by date or hash of `student_id`.
- Store notification message once in `notifications`, and store per-student state separately.
- Use asynchronous queues for email and push delivery.
- Archive old read notifications to cheaper storage.
- Use read replicas for analytics and history views.
- Cache hot unread counts in Redis, but keep PostgreSQL as the source of truth.

## Stage 3

### Given Query

```sql
SELECT *
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### Is The Query Accurate?

The query is logically trying to fetch unread notifications for one student, but it is not ideal for the schema I would use. A notification itself should not usually contain `studentID` and `isRead`, because the same notification can be sent to many students and each student has a different read state.

A better model separates notification content from student-specific state:

- `notifications`: message, type, created time.
- `student_notifications`: student, notification, read/unread state.

### Why It Is Slow

The table has 5,000,000 notifications. Without a matching composite index, the database may scan many rows for `studentID = 1042`, filter `isRead = false`, and then sort the result by `createdAt DESC`.

The expensive parts are:

- Filtering millions of rows.
- Sorting unread rows by `createdAt`.
- Returning `SELECT *`, which may read large message columns unnecessarily.

### Better Query

```sql
SELECT n.id, n.notification_type, n.title, n.message, sn.created_at
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE sn.student_id = 1042
  AND sn.is_read = false
ORDER BY sn.created_at DESC
LIMIT 50;
```

### Index

```sql
CREATE INDEX idx_student_unread_created
ON student_notifications (student_id, is_read, created_at DESC);
```

With this index, the database can directly find unread notifications for one student in the correct order. The cost becomes close to `O(log N + K)`, where `K` is the number of rows returned, instead of scanning a large part of the table.

### Should We Index Every Column?

No. Indexing every column is not safe or effective.

Too many indexes cause:

- Slower inserts and updates.
- More disk usage.
- More memory pressure.
- Extra work for the query planner.
- Poor benefit for low-selectivity columns.

Indexes should be based on real query patterns. For this stage, the useful index is composite: `(student_id, is_read, created_at DESC)`.

### Placement Notifications In Last 7 Days

```sql
SELECT DISTINCT s.id, s.roll_no, s.name, s.email
FROM students s
JOIN student_notifications sn ON sn.student_id = s.id
JOIN notifications n ON n.id = sn.notification_id
WHERE n.notification_type = 'Placement'
  AND sn.created_at >= now() - interval '7 days';
```

Useful indexes:

```sql
CREATE INDEX idx_notifications_type_id
ON notifications (notification_type, id);

CREATE INDEX idx_student_notifications_created
ON student_notifications (created_at DESC, notification_id, student_id);
```

## Stage 4

Fetching notifications from the database on every page load for every student overloads the database. The solution should reduce repeated reads and avoid doing expensive work during page rendering.

### Strategy 1: Cache Unread Counts And Recent Notifications

Use Redis to cache:

- Unread notification count per student.
- Most recent unread notifications per student.

Cache key examples:

```text
student:1042:unread_count
student:1042:recent_notifications
```

When a notification is created or marked as read, update or invalidate the cache.

Tradeoff: cache invalidation adds complexity, but it greatly reduces repeated database reads.

### Strategy 2: Pagination And Cursor-Based Fetching

Do not fetch all notifications on every page load. Fetch only the first page:

```sql
SELECT n.id, n.notification_type, n.title, n.message, sn.created_at
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE sn.student_id = $1
  AND sn.is_read = false
  AND sn.created_at < $2
ORDER BY sn.created_at DESC
LIMIT 20;
```

Tradeoff: the frontend needs cursor handling, but the database work is bounded.

### Strategy 3: Push Updates Instead Of Polling

Use WebSockets, Server-Sent Events, or push notifications to notify the client when new notifications arrive. The page can load a cached initial state and receive updates afterward.

Tradeoff: persistent connections require more infrastructure, but they prevent every page load from turning into a database hit.

### Strategy 4: Read Replicas

Send read-heavy notification queries to read replicas and keep writes on the primary PostgreSQL database.

Tradeoff: replicas may have slight lag, but they protect the primary database from read spikes.

## Stage 5

### Problems In The Given Pseudocode

```python
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

Issues:

- It runs sequentially, so 50,000 students take a long time.
- Email API failure blocks the rest of the students.
- Sending email before saving to DB can create inconsistency.
- There is no retry mechanism.
- There is no rate limiting for the email API.
- There is no idempotency key, so retries may duplicate notifications.
- In-app, email, and DB work are tightly coupled.

### Should DB Save And Email Sending Happen Together?

No. The database write and external delivery should not happen in the same synchronous loop.

The reliable flow is:

1. Save notification intent and student notification rows in the database.
2. Enqueue delivery jobs for email and in-app channels.
3. Workers process jobs asynchronously with retry and rate limiting.
4. Delivery status is stored separately.

This makes the system reliable because the database records the source of truth before external APIs are called.

### Revised Pseudocode

```python
function notify_all(student_ids, message, notification_type):
    notification_id = create_notification(notification_type, message)

    for batch in chunks(student_ids, 1000):
        begin_transaction()
        for student_id in batch:
            student_notification_id = insert_student_notification(
                student_id,
                notification_id,
                idempotency_key = notification_id + ":" + student_id
            )
            enqueue_job("send_email", student_notification_id)
            enqueue_job("push_in_app", student_notification_id)
        commit_transaction()

function delivery_worker():
    while true:
        job = queue.reserve()
        try:
            mark_delivery_retrying(job.student_notification_id)
            send_to_channel(job)
            mark_delivery_sent(job.student_notification_id)
            queue.ack(job)
        except TemporaryFailure:
            queue.retry_with_backoff(job)
        except PermanentFailure as error:
            mark_delivery_failed(job.student_notification_id, error)
            queue.ack(job)
```

### Faster And Reliable Design

Use a queue such as Kafka, RabbitMQ, SQS, or Redis Streams. The API returns quickly after saving and enqueueing work. Multiple workers send emails in parallel while respecting provider rate limits.

## Stage 6

### Requirement

The product manager wants a Priority Inbox that returns the top `n` most important unread notifications. Priority is based on:

1. Notification type weight.
2. Recency.

The type priority is:

```text
Placement > Result > Event
```

### Implementation

The implementation is in:

```text
notification_app_be/src/priority.js
notification_app_be/src/server.js
```

The service fetches notifications from the protected AffordMed Notification API:

```http
GET http://20.207.122.201/evaluation-service/notifications
```

Then it sorts the notifications by:

1. Higher notification type weight first.
2. Newer timestamp first.

### API

```http
GET /priority-notifications?limit=10
```

Header:

```text
Authorization: Bearer <access_token>
```

Example response:

```json
{
  "count": 10,
  "priorityOrder": ["Placement", "Result", "Event"],
  "notifications": []
}
```

### How Top 10 Is Maintained When New Notifications Keep Coming

For the coding task, the service fetches the current notification list and computes the top 10 on demand.

In production, I would maintain the top 10 per student incrementally:

- Store unread notifications in PostgreSQL.
- Publish new notification events to a queue.
- Maintain a Redis sorted set per student.
- Score each notification using priority weight and timestamp.

Example Redis key:

```text
student:1042:priority_inbox
```

Score formula:

```text
score = notification_type_weight * 1_000_000_000_000 + unix_timestamp
```

When a new notification arrives, insert it into the sorted set and trim it to the top 10. When a notification is read, remove it from the sorted set.

This keeps reads fast because fetching the inbox is `O(10)`, while updates are handled asynchronously when notifications arrive.
