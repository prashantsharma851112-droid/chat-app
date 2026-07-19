# ChatSpace — Real-Time Chat App

A full-stack real-time chat application supporting both 1-on-1 direct messages and group chat rooms, built with Node.js, Express, Socket.io, and MongoDB.

## Features
- JWT-based authentication (register/login with email + password)
- **Unique usernames** — every user has a unique handle (like `@prashant_07`), separate from their display name, so duplicate names never collide
- **Real-time messaging** via Socket.io — no page refresh needed
- 1-on-1 direct messages between any two registered users
- Group chat rooms — create a group, add members, chat together
- **Search-based user discovery** — no user list is shown by default; you search by name or username to start a new conversation (privacy-friendly, and scales better than listing everyone)
- **Recent conversations list** — the Direct tab defaults to showing people you've already chatted with
- **Profile pictures** — upload an avatar (stored as base64 in MongoDB); falls back to colored initials if none is set
- **Read receipts ("seen" tracking)** — 1-on-1 messages show "Sent" vs "Seen"; group messages show how many members have seen them, updated in real time
- Message history persisted in MongoDB (loads past messages when you open a chat)
- Online/offline status indicator
- "Typing..." indicator

## Tech Stack
**Frontend:** HTML5, CSS3, Vanilla JavaScript, Socket.io client
**Backend:** Node.js, Express.js, Socket.io, JWT, bcryptjs
**Database:** MongoDB (Mongoose ODM)

## Project Structure
```
chat-app/
├── backend/
│   ├── models/
│   │   ├── User.js        # user accounts
│   │   ├── Message.js     # both private and group messages (type field distinguishes)
│   │   └── Room.js        # group chat rooms only
│   ├── routes/
│   │   ├── authRoutes.js       # register/login
│   │   ├── userRoutes.js       # list users (to start a DM)
│   │   ├── roomRoutes.js       # create/list group rooms
│   │   └── messageRoutes.js    # fetch message history
│   ├── middleware/
│   │   └── authMiddleware.js   # protects REST routes
│   ├── sockets/
│   │   └── chatSocket.js       # ALL real-time logic lives here
│   ├── server.js
│   └── package.json
└── frontend/
    ├── login.html / auth.js
    ├── chat.html / chat.js     # main chat UI + Socket.io client logic
    └── style.css
```

## How real-time messaging works (the key concept)
1. When the frontend loads `chat.html`, it opens a Socket.io connection and passes the JWT token during the handshake.
2. The backend's `io.use()` middleware verifies that token — same idea as the Express `protect` middleware, just for sockets instead of HTTP requests.
3. Every connected user automatically joins a "room" named after their own user ID. This means sending a private message is just: `io.to(recipientUserId).emit(...)`.
4. Group messages work the same way, except the "room" is the actual group's ID, and everyone who has opened that group has joined it with `socket.join(roomId)`.
5. Every message is also saved to MongoDB via the `Message` model, so chat history persists and loads correctly when you reopen a conversation.

## Setup & Run Locally

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Fill in MONGO_URI and JWT_SECRET in .env
npm start
```

### Frontend
Open `frontend/login.html` with Live Server (or any local server). Make sure the backend is running on `http://localhost:5000` first.

## API Endpoints
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | /api/auth/register | Create account | No |
| POST | /api/auth/login | Login, get JWT | No |
| GET | /api/users | List all other users | Yes |
| GET | /api/rooms | List my group rooms | Yes |
| POST | /api/rooms | Create a group room | Yes |
| GET | /api/messages/private/:userId | Message history with a user | Yes |
| GET | /api/messages/room/:roomId | Message history in a group | Yes |

## Socket.io Events
| Event | Direction | Payload | Purpose |
|---|---|---|---|
| `join-room` | client → server | `roomId` | Join a group's real-time channel |
| `private-message` | client → server | `{ to, content }` | Send a 1-on-1 message |
| `room-message` | client → server | `{ roomId, content }` | Send a group message |
| `private-message` | server → client | message object | Receive a 1-on-1 message |
| `room-message` | server → client | message object | Receive a group message |
| `online-users` | server → client | array of user IDs | Presence updates |
| `typing` | both directions | `{ to }` or `{ roomId }` | Typing indicator |

## Future Improvements
- Read receipts
- File/image sharing in chat
- Push notifications for offline users
- Message editing/deletion
