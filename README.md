# EchoLoc API

NestJS backend for the EchoLoc mobile app — privacy-first, time-limited location sharing.

## Stack

- **NestJS 11** — modular API framework
- **PostgreSQL** — primary datastore
- **Prisma 7** — ORM and migrations
- **JWT** — access + refresh token auth
- **Socket.IO** — real-time location updates
- **Google / Apple OAuth** — native ID token verification

## Project structure

```
src/
├── common/           # Cross-cutting concerns
├── config/           # Env config + Joi validation
├── database/         # Prisma service (global)
└── modules/
    ├── auth/         # Email auth + OAuth
    ├── groups/       # Groups, members, invites
    ├── sharing/      # Sharing sessions + location REST
    ├── realtime/     # WebSocket gateway
    ├── health/
    └── users/
```

## Getting started

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

- API base: `http://localhost:3030/api/v1`
- Swagger: `http://localhost:3030/api/v1/docs`
- WebSocket: `ws://localhost:3030/realtime`

## Auth endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Create account |
| POST | `/auth/verify-email` | Public | Verify 6-digit code |
| POST | `/auth/login` | Public | Sign in |
| POST | `/auth/google` | Public | Sign in with Google ID token |
| POST | `/auth/apple` | Public | Sign in with Apple identity token |
| POST | `/auth/refresh` | Public | Rotate tokens |
| POST | `/auth/logout` | Bearer | Revoke refresh token(s) |
| GET | `/auth/me` | Bearer | Current user profile |

## Groups (Phase 3)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/groups` | List user's groups |
| POST | `/groups` | Create group |
| POST | `/groups/join` | Join via invite code |
| GET | `/groups/:id` | Group details |
| PATCH | `/groups/:id` | Update name/emoji |
| DELETE | `/groups/:id` | Delete group (owner) |
| POST | `/groups/:id/leave` | Leave group |
| GET | `/groups/:id/members` | List members |
| POST | `/groups/:id/members` | Add member |
| DELETE | `/groups/:id/members/:memberId` | Remove member |
| GET | `/groups/:id/activity` | Activity feed |
| POST | `/groups/:id/invites` | Regenerate invite code |
| GET | `/groups/:id/locations` | Active member locations |

## Invites

| Method | Path | Description |
|--------|------|-------------|
| GET | `/invites/pending` | Pending direct invites |
| GET | `/invites/:id` | Invite details |
| POST | `/invites/:id/accept` | Accept invite |
| POST | `/invites/:id/decline` | Decline invite |

## Sharing sessions (Phase 4)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sharing/sessions/active` | Current user's active session |
| POST | `/sharing/sessions` | Start sharing `{ groupId, durationId }` |
| PATCH | `/sharing/sessions/:id` | Extend/change duration |
| POST | `/sharing/sessions/:id/stop` | Stop session |
| POST | `/sharing/sessions/stop-all` | Stop all user sessions |
| POST | `/sharing/sessions/:id/location` | Push location update |
| PUT | `/sharing/sessions/:id/visibility` | Toggle member visibility |

**Duration IDs:** `15m`, `30m`, `1h`, `2h`, `4h`, `8h`

## Real-time (Phase 5)

Connect to namespace `/realtime` with JWT in handshake:

```javascript
io('http://localhost:3030/realtime', {
  auth: { token: accessToken },
});
```

| Event (client → server) | Payload | Description |
|-------------------------|---------|-------------|
| `joinGroup` | `{ groupId }` | Subscribe to group room |
| `leaveGroup` | `{ groupId }` | Unsubscribe |

| Event (server → client) | Description |
|-------------------------|-------------|
| `memberLocation` | Live location from a group member |
| `sharingStarted` | Member started sharing |
| `sharingStopped` | Member stopped sharing |

## OAuth (Phase 6)

Set in `.env`:

```
GOOGLE_CLIENT_ID=your-google-client-id
APPLE_CLIENT_ID=your.apple.bundle.id
```

Mobile apps send native ID tokens:

```json
POST /auth/google  { "idToken": "..." }
POST /auth/apple   { "identityToken": "...", "name": "Optional on first sign-in" }
```

## Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/search?q=` | Search users by handle/name |

## Error format

```json
{
  "statusCode": 401,
  "message": "Invalid email or password",
  "code": "AUTH_INVALID_CREDENTIALS",
  "path": "/api/v1/auth/login",
  "requestId": "uuid"
}
```
