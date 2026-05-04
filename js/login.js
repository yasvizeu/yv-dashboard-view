const API = 'http://localhost:3000/api';

// Se já tem token válido, vai direto pro dashboard
if (localStorage.getItem('yv_token')) {
  window.location.href = 'index.html';
}

document.getElementById('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errEl.style.display = 'none';
  if (!username || !password) {
    errEl.textContent = 'Preencha usuário e senha.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Credenciais inválidas');
    }

    const data = await res.json();
    localStorage.setItem('yv_token', data.access_token);
    window.location.href = 'index.html';
  } catch (e) {
    errEl.textContent = e.message ?? 'Erro ao fazer login.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}
