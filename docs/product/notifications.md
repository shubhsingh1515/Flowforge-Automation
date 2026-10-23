# In-App Notification Center & Real-Time Alerting

Comprehensive documentation for FlowForge's In-App Notification Center, notification lifecycle, and multi-tenant event delivery.

---

## 1. Overview

The FlowForge In-App Notification Center provides workspace users with a persistent, non-intrusive stream of mission-critical alerts directly in the application header:
- **Usage Threshold Crossings** (50%, 80%, 90%, 100% capacity warnings)
- **Workflow Execution Failure Spikes** (e.g. repeated consecutive failures)
- **Security & Identity Events** (New session logins, SSO/SCIM changes, credential rotation)
- **Human Approval Requests** (Executions paused awaiting authorization)

---

## 2. Notification Data Model

Notifications are stored in PostgreSQL using Prisma with strict foreign keys to `Workspace` and `User`:

```prisma
model Notification {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String?  // If null, visible to all workspace members
  title       String
  message     String
  type        String   @default("INFO") // INFO, SUCCESS, WARNING, ERROR, USAGE_ALERT
  actionUrl   String?  // Deep link to relevant screen (/analytics, /settings, etc.)
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User?     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([workspaceId, userId, read])
  @@index([workspaceId, createdAt])
}
```

---

## 3. UI Component Architecture (`AppShell.tsx`)

The notification center is integrated directly into the persistent top navbar:
- **Notification Bell Icon**: Renders an unread count badge (with `9+` overflow cap).
- **Interactive Dropdown Panel**: Displays a scrollable feed of the latest 20 notifications.
- **Visual Status Cues**: Unread notifications are highlighted with light indigo background accents.
- **Inline Mark as Read**: Clicking a notification marks it as read and navigates to its `actionUrl`.
- **Bulk Action ("Mark all as read")**: Immediately clears unread badges workspace-wide.
- **Empty State**: Displays "No active alerts or notifications" with clear iconography when the inbox is clean.

---

## 4. API Specification

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/v1/notifications` | `GET` | Bearer Token / Session | Returns paginated list of notifications and unread count |
| `/api/v1/notifications/:id/read` | `PATCH` | Bearer Token / Session | Marks a single notification as read |
| `/api/v1/notifications/mark-all-read` | `POST` | Bearer Token / Session | Marks all workspace notifications as read for current user |
