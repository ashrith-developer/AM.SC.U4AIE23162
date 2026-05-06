# Notification Priority Service

## Run

PowerShell:

```powershell
$env:AFFORD_ACCESS_TOKEN="your_access_token_here"
npm start
```

Or send the token directly from Postman/Thunder Client:

```text
Authorization: Bearer your_access_token_here
```

## Endpoints

```http
GET /health
GET /priority-notifications
GET /priority-notifications?limit=10
```

Priority order is:

```text
Placement > Result > Event
```

For the same notification type, newer notifications are returned first.
