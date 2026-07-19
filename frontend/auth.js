const API_URL = 'https://chat-app-pmsa.onrender.com/api/auth';

if (localStorage.getItem('token')) {
  window.location.href = 'chat.html';
}

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  authError.textContent = '';
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  authError.textContent = '';
});

function loginSuccess(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('userName', data.user.name);
  localStorage.setItem('userId', data.user.id);
  localStorage.setItem('userUsername', data.user.username);
  localStorage.setItem('userAvatar', data.user.avatar || '');
  window.location.href = 'chat.html';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      authError.textContent = data.error || 'Login failed';
      return;
    }
    loginSuccess(data);
  } catch (err) {
    authError.textContent = 'Could not reach the server. Is the backend running?';
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';

  const name = document.getElementById('register-name').value;
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

  try {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      authError.textContent = data.error || 'Registration failed';
      return;
    }
    loginSuccess(data);
  } catch (err) {
    authError.textContent = 'Could not reach the server. Is the backend running?';
  }
});
