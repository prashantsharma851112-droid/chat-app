// IMPORTANT: change these once you deploy the backend
const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const token = localStorage.getItem('token');
const myUserId = localStorage.getItem('userId');
const myUserName = localStorage.getItem('userName');
const myUsername = localStorage.getItem('userUsername');

if (!token) {
  window.location.href = 'login.html';
}

document.getElementById('welcome-user').textContent = `${myUserName} · @${myUsername}`;

// ---------- Avatar helper (used everywhere we need to show a user's picture) ----------
// Falls back to a colored circle with initials if no avatar has been uploaded.
function avatarHtml(user, sizeClass = '') {
  const initials = (user.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (user.avatar) {
    return `<img class="avatar-img ${sizeClass}" src="${user.avatar}" alt="${user.name}">`;
  }
  return `<span class="avatar-initials ${sizeClass}">${initials}</span>`;
}

// ---------- My own avatar (top of sidebar) ----------
const myAvatarImg = document.getElementById('my-avatar');
const myAvatarWrap = document.querySelector('.my-avatar-wrap');
let myAvatar = localStorage.getItem('userAvatar') || '';

function renderMyAvatar() {
  if (myAvatar) {
    myAvatarImg.src = myAvatar;
    myAvatarImg.style.display = 'block';
    myAvatarWrap.querySelector('.avatar-fallback')?.remove();
  } else {
    myAvatarImg.style.display = 'none';
  }
}
renderMyAvatar();

document.getElementById('avatar-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result;
    const res = await fetch(`${API_BASE}/users/me/avatar`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ avatar: base64 })
    });
    if (res.ok) {
      const user = await res.json();
      myAvatar = user.avatar;
      localStorage.setItem('userAvatar', myAvatar);
      renderMyAvatar();
    }
  };
  reader.readAsDataURL(file); // converts the image file to a base64 string
});

// ---------- Socket connection ----------
const socket = io(SOCKET_URL, { auth: { token } });

// ---------- State ----------
let currentChat = null; // { type: 'private', userId, name, avatar } OR { type: 'group', roomId, name }
let onlineUserIds = [];
let recentChats = [];
let allRooms = [];

// ---------- DOM references ----------
const searchInput = document.getElementById('user-search');
const searchResults = document.getElementById('search-results');
const recentChatsEl = document.getElementById('recent-chats');
const groupsList = document.getElementById('groups-list');
const directList = document.getElementById('direct-list');
const groupsItems = document.getElementById('groups-items');
const tabDirect = document.getElementById('tab-direct');
const tabGroups = document.getElementById('tab-groups');
const messagesArea = document.getElementById('messages');
const chatTitle = document.getElementById('chat-title');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const logoutBtn = document.getElementById('logout-btn');

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

logoutBtn.addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'login.html';
});

tabDirect.addEventListener('click', () => {
  tabDirect.classList.add('active');
  tabGroups.classList.remove('active');
  directList.classList.remove('hidden');
  groupsList.classList.add('hidden');
});

tabGroups.addEventListener('click', () => {
  tabGroups.classList.add('active');
  tabDirect.classList.remove('active');
  groupsList.classList.remove('hidden');
  directList.classList.add('hidden');
});

// ---------- Search users (only fetches when there's a query - never lists everyone) ----------
let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();

  if (!q) {
    searchResults.innerHTML = '';
    recentChatsEl.classList.remove('hidden');
    return;
  }

  recentChatsEl.classList.add('hidden');
  searchDebounce = setTimeout(async () => {
    const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
    const users = await res.json();
    renderSearchResults(users);
  }, 300); // debounce so we don't hit the API on every keystroke
});

function renderSearchResults(users) {
  if (!users.length) {
    searchResults.innerHTML = '<p class="empty-state">No users found.</p>';
    return;
  }
  searchResults.innerHTML = users.map(u => `
    <div class="conversation-item" onclick='openPrivateChat(${JSON.stringify(u._id)}, ${JSON.stringify(u.name)}, ${JSON.stringify(u.avatar || '')})'>
      ${avatarHtml(u, 'sm')}
      <div class="conv-text">
        <div class="conv-name">${u.name}</div>
        <div class="conv-sub">@${u.username}</div>
      </div>
    </div>
  `).join('');
}

// ---------- Load recent conversations (default view of the Direct tab) ----------
async function loadRecentChats() {
  const res = await fetch(`${API_BASE}/users/recent`, { headers: authHeaders() });
  recentChats = await res.json();
  renderRecentChats();
}

function renderRecentChats() {
  if (!recentChats.length) {
    recentChatsEl.innerHTML = '<p class="empty-state">No conversations yet.<br>Search a name or username above to start one.</p>';
    return;
  }
  recentChatsEl.innerHTML = recentChats.map(u => {
    const isOnline = onlineUserIds.includes(u._id);
    const isActive = currentChat?.type === 'private' && currentChat.userId === u._id;
    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" onclick='openPrivateChat(${JSON.stringify(u._id)}, ${JSON.stringify(u.name)}, ${JSON.stringify(u.avatar || '')})'>
        <span class="avatar-dot-wrap">${avatarHtml(u, 'sm')}<span class="status-dot ${isOnline ? 'online' : ''}"></span></span>
        <div class="conv-text">
          <div class="conv-name">${u.name}</div>
          <div class="conv-sub">@${u.username}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ---------- Load groups ----------
async function loadRooms() {
  const res = await fetch(`${API_BASE}/rooms`, { headers: authHeaders() });
  allRooms = await res.json();
  renderRoomList();
}

function renderRoomList() {
  groupsItems.innerHTML = allRooms.map(r => {
    const isActive = currentChat?.type === 'group' && currentChat.roomId === r._id;
    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" onclick="openGroupChat('${r._id}', '${r.name}')">
        <span class="group-icon">👥</span>
        <div class="conv-text"><div class="conv-name">${r.name}</div></div>
      </div>
    `;
  }).join('') || '<p class="empty-state">No groups yet. Create one!</p>';
}

// ---------- Open a private (1-on-1) chat ----------
async function openPrivateChat(userId, name, avatar) {
  currentChat = { type: 'private', userId, name, avatar };
  chatTitle.innerHTML = `${avatarHtml({ name, avatar }, 'xs')} ${name}`;
  messageForm.classList.remove('hidden');

  searchInput.value = '';
  searchResults.innerHTML = '';
  recentChatsEl.classList.remove('hidden');

  const res = await fetch(`${API_BASE}/messages/private/${userId}`, { headers: authHeaders() });
  const messages = await res.json();
  renderMessages(messages);

  // Tell the backend I've now seen everything this person sent me
  socket.emit('mark-seen', { otherUserId: userId });

  await loadRecentChats(); // refresh so this person appears in the recent list
}

// ---------- Open a group chat ----------
async function openGroupChat(roomId, name) {
  currentChat = { type: 'group', roomId, name };
  chatTitle.textContent = `👥 ${name}`;
  messageForm.classList.remove('hidden');
  renderRoomList();

  socket.emit('join-room', roomId);
  socket.emit('mark-seen-room', { roomId });

  const res = await fetch(`${API_BASE}/messages/room/${roomId}`, { headers: authHeaders() });
  const messages = await res.json();
  renderMessages(messages);
}

// ---------- Render messages in the chat window ----------
function renderMessages(messages) {
  if (!messages.length) {
    messagesArea.innerHTML = '<p class="empty-state">No messages yet. Say hi!</p>';
    return;
  }
  messagesArea.innerHTML = messages.map(renderSingleMessage).join('');
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function renderSingleMessage(msg) {
  const isMe = (msg.sender._id || msg.sender) === myUserId;
  const senderName = msg.sender.name || 'Someone';
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Seen indicator only shown on MY OWN messages, WhatsApp-style
  let seenLabel = '';
  if (isMe && currentChat?.type === 'private') {
    seenLabel = `<span class="seen-tick ${msg.seen ? 'seen' : ''}">${msg.seen ? '✓✓ Seen' : '✓ Sent'}</span>`;
  } else if (isMe && currentChat?.type === 'group') {
    const count = (msg.seenBy || []).length;
    seenLabel = count > 0 ? `<span class="seen-tick seen">✓✓ Seen by ${count}</span>` : `<span class="seen-tick">✓ Sent</span>`;
  }

  return `
    <div class="message-bubble ${isMe ? 'me' : 'them'}" data-msg-id="${msg._id}">
      ${!isMe ? `<div class="message-sender">${senderName}</div>` : ''}
      <div class="message-content">${msg.content}</div>
      <div class="message-time">${time} ${seenLabel}</div>
    </div>
  `;
}

function appendMessage(msg) {
  const emptyState = messagesArea.querySelector('.empty-state');
  if (emptyState) emptyState.remove();
  messagesArea.insertAdjacentHTML('beforeend', renderSingleMessage(msg));
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

// ---------- Sending a message ----------
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content || !currentChat) return;

  if (currentChat.type === 'private') {
    socket.emit('private-message', { to: currentChat.userId, content });
  } else {
    socket.emit('room-message', { roomId: currentChat.roomId, content });
  }

  messageInput.value = '';
});

// ---------- Receiving messages in real time ----------
socket.on('private-message', (msg) => {
  const otherId = (msg.sender._id || msg.sender) === myUserId ? msg.recipient : (msg.sender._id || msg.sender);
  if (currentChat?.type === 'private' && currentChat.userId === otherId) {
    appendMessage(msg);
    // If the message just arrived from the person I'm currently looking at, mark it seen immediately
    if ((msg.sender._id || msg.sender) !== myUserId) {
      socket.emit('mark-seen', { otherUserId: otherId });
    }
  }
  loadRecentChats();
});

socket.on('room-message', (msg) => {
  if (currentChat?.type === 'group' && currentChat.roomId === msg.room) {
    appendMessage(msg);
    socket.emit('mark-seen-room', { roomId: msg.room });
  }
});

// ---------- Real-time "seen" tick updates ----------
socket.on('messages-seen', () => {
  // The person I'm chatting with just saw my messages - update all my "Sent" labels to "Seen"
  if (currentChat?.type === 'private') {
    document.querySelectorAll('.message-bubble.me .seen-tick').forEach(el => {
      el.textContent = '✓✓ Seen';
      el.classList.add('seen');
    });
  }
});

socket.on('room-messages-seen', ({ roomId }) => {
  if (currentChat?.type === 'group' && currentChat.roomId === roomId) {
    openGroupChat(roomId, currentChat.name); // simplest way to refresh accurate seen-by counts
  }
});

// ---------- Online/offline presence ----------
socket.on('online-users', (userIds) => {
  onlineUserIds = userIds;
  renderRecentChats();
});

// ---------- Typing indicator ----------
let typingTimeout;
messageInput.addEventListener('input', () => {
  if (!currentChat) return;
  if (currentChat.type === 'private') {
    socket.emit('typing', { to: currentChat.userId });
  } else {
    socket.emit('typing', { roomId: currentChat.roomId });
  }
});

socket.on('typing', () => {
  typingIndicator.textContent = 'typing...';
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { typingIndicator.textContent = ''; }, 2000);
});

// ---------- Create Group modal ----------
const groupModal = document.getElementById('group-modal');
const createGroupBtn = document.getElementById('create-group-btn');
const groupCancelBtn = document.getElementById('group-cancel-btn');
const groupCreateBtn = document.getElementById('group-create-btn');
const groupMembersList = document.getElementById('group-members-list');
const groupNameInput = document.getElementById('group-name-input');

createGroupBtn.addEventListener('click', async () => {
  // Group members are picked from your recent chats + a quick search fallback
  groupMembersList.innerHTML = recentChats.length
    ? recentChats.map(u => `
        <label class="member-checkbox">
          <input type="checkbox" value="${u._id}"> ${u.name} (@${u.username})
        </label>
      `).join('')
    : '<p class="empty-state">Start a direct chat with someone first, then you can add them to a group.</p>';
  groupModal.classList.remove('hidden');
});

groupCancelBtn.addEventListener('click', () => {
  groupModal.classList.add('hidden');
  groupNameInput.value = '';
});

groupCreateBtn.addEventListener('click', async () => {
  const name = groupNameInput.value.trim();
  const checked = [...groupMembersList.querySelectorAll('input:checked')].map(el => el.value);

  if (!name || checked.length === 0) {
    alert('Enter a group name and select at least one member.');
    return;
  }

  const res = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, memberIds: checked })
  });

  if (res.ok) {
    groupModal.classList.add('hidden');
    groupNameInput.value = '';
    await loadRooms();
  } else {
    alert('Could not create group');
  }
});

// Expose functions used by inline onclick handlers in the rendered HTML
window.openPrivateChat = openPrivateChat;
window.openGroupChat = openGroupChat;

// ---------- Initial load ----------
loadRecentChats();
loadRooms();
