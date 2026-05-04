const API =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://yv-dashboard-production.up.railway.app/api';

// ── AUTH GUARD ──
const token = localStorage.getItem('yv_token');
if (!token) window.location.href = 'login.html';

let editingAlunoId = null;
let editingAulaId  = null;
let editingMensId  = null;
let alunosCache    = [];

// ── API HELPER ──
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('yv_token')}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (res.status === 401) { logout(); return; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function logout() {
  localStorage.removeItem('yv_token');
  window.location.href = 'login.html';
}

// ── NAVIGATION ──
function showPage(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (el) el.classList.add('active');

  const titles = { overview: 'Visão Geral', alunos: 'Alunos', aulas: 'Diário de Aulas', mensalidades: 'Mensalidades' };
  document.getElementById('page-title').textContent = titles[page];

  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = '';
  if (page === 'alunos')       actions.innerHTML = `<button class="btn btn-primary" onclick="openModalAluno()">+ Novo Aluno</button>`;
  if (page === 'aulas')        actions.innerHTML = `<button class="btn btn-primary" onclick="openModalAula()">+ Registrar Aula</button>`;
  if (page === 'mensalidades') actions.innerHTML = `<button class="btn btn-primary" onclick="openModalMensalidade()">+ Nova Mensalidade</button>`;

  if (page === 'overview')     loadOverview();
  if (page === 'alunos')       loadAlunos();
  if (page === 'aulas')        { loadAlunosSelect('filter-aula-aluno'); loadAulas(); }
  if (page === 'mensalidades') { loadAlunosSelect('filter-mens-aluno'); loadMensalidades(); }
}

// ── TOAST ──
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── OVERVIEW ──
async function loadOverview() {
  try {
    const [alunos, aulas, mens] = await Promise.all([api('/alunos'), api('/aulas'), api('/mensalidades')]);

    document.getElementById('stat-ativos').textContent = alunos.filter(a => a.status === 'ativo').length;

    const agora = new Date();
    const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('stat-aulas-mes').textContent = aulas.filter(a => a.data_aula?.startsWith(mesAtual)).length;

    const pagas   = mens.filter(m => m.pago);
    const abertas = mens.filter(m => !m.pago);
    document.getElementById('stat-pagas').textContent   = pagas.length;
    document.getElementById('stat-abertas').textContent = abertas.length;
    document.getElementById('stat-pagas-sub').textContent   = `R$ ${pagas.reduce((s, m) => s + Number(m.valor), 0).toFixed(2)}`;
    document.getElementById('stat-abertas-sub').textContent = `R$ ${abertas.reduce((s, m) => s + Number(m.valor), 0).toFixed(2)}`;

    const tbody = document.getElementById('overview-aulas-tbody');
    const recentes = aulas.slice(0, 8);
    if (!recentes.length) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="empty-icon">📖</div><p>Nenhuma aula registrada ainda.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = recentes.map(a => `
      <tr>
        <td><strong>${a.aluno?.nome ?? '–'}</strong></td>
        <td>${formatDate(a.data_aula)}</td>
        <td>${a.materias ?? '–'}</td>
        <td>${statusAulaBadge(a.status)}</td>
      </tr>
    `).join('');
  } catch (e) { toast('Erro ao carregar visão geral', 'error'); }
}

// ── ALUNOS ──
async function loadAlunos() {
  try {
    alunosCache = await api('/alunos');
    renderAlunos(alunosCache);
  } catch (e) { toast('Erro ao carregar alunos', 'error'); }
}

function renderAlunos(list) {
  const tbody = document.getElementById('alunos-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">👥</div><p>Nenhum aluno cadastrado ainda.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(a => `
    <tr>
      <td>
        <strong style="cursor:pointer;color:var(--plum)" onclick="viewAluno(${a.id})">${a.nome}</strong>
        ${a.idade ? `<span style="color:var(--text-muted);font-size:0.78rem"> · ${a.idade} anos</span>` : ''}
      </td>
      <td>${nivelBadge(a.nivel)}</td>
      <td>${a.plano ?? '–'}</td>
      <td style="font-size:0.82rem">${a.dias_aula ?? '–'}</td>
      <td>${statusAlunoBadge(a.status)}</td>
      <td>
        ${a.contato ? `<a href="https://wa.me/55${a.contato.replace(/\D/g, '')}" target="_blank" style="color:var(--success);font-size:0.85rem">📱 ${a.contato}</a>` : '–'}
      </td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openModalAluno(${a.id})">✏️</button>
        <button class="btn btn-sm btn-danger" style="margin-left:4px" onclick="deleteAluno(${a.id})">🗑</button>
      </td>
    </tr>
  `).join('');
}

function filterAlunos() {
  const q      = document.getElementById('search-aluno').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const nivel  = document.getElementById('filter-nivel').value;
  renderAlunos(alunosCache.filter(a =>
    (!q      || a.nome.toLowerCase().includes(q)) &&
    (!status || a.status === status) &&
    (!nivel  || a.nivel  === nivel)
  ));
}

function openModalAluno(id = null) {
  editingAlunoId = id;
  document.getElementById('modal-aluno-title').textContent = id ? 'Editar Aluno' : 'Novo Aluno';
  ['nome','idade','contato','nivel','plano','data-inicio','dias','status','como','objetivo','obs','mens-valor','mens-dia'].forEach(f => {
    const el = document.getElementById('aluno-' + f);
    if (el) el.value = '';
  });
  document.getElementById('aluno-status').value = 'ativo';

  if (id) {
    api('/alunos/' + id).then(a => {
      document.getElementById('aluno-nome').value        = a.nome ?? '';
      document.getElementById('aluno-idade').value       = a.idade ?? '';
      document.getElementById('aluno-contato').value     = a.contato ?? '';
      document.getElementById('aluno-nivel').value       = a.nivel ?? '';
      document.getElementById('aluno-plano').value       = a.plano ?? '';
      document.getElementById('aluno-data-inicio').value = a.data_inicio ?? '';
      document.getElementById('aluno-dias').value        = a.dias_aula ?? '';
      document.getElementById('aluno-status').value      = a.status ?? 'ativo';
      document.getElementById('aluno-como').value        = a.como_chegou ?? '';
      document.getElementById('aluno-objetivo').value    = a.objetivo ?? '';
      document.getElementById('aluno-obs').value         = a.observacoes ?? '';
      document.getElementById('aluno-mens-valor').value  = a.mensalidade_valor ?? '';
      document.getElementById('aluno-mens-dia').value    = a.mensalidade_dia_vencimento ?? '';
    });
  }
  openModal('modal-aluno');
}

async function saveAluno() {
  const body = {
    nome:                        document.getElementById('aluno-nome').value.trim(),
    idade:                       Number(document.getElementById('aluno-idade').value) || undefined,
    contato:                     document.getElementById('aluno-contato').value.trim() || undefined,
    nivel:                       document.getElementById('aluno-nivel').value,
    plano:                       document.getElementById('aluno-plano').value.trim() || undefined,
    data_inicio:                 document.getElementById('aluno-data-inicio').value || undefined,
    dias_aula:                   document.getElementById('aluno-dias').value.trim() || undefined,
    status:                      document.getElementById('aluno-status').value,
    como_chegou:                 document.getElementById('aluno-como').value.trim() || undefined,
    objetivo:                    document.getElementById('aluno-objetivo').value.trim() || undefined,
    observacoes:                 document.getElementById('aluno-obs').value.trim() || undefined,
    mensalidade_valor:           Number(document.getElementById('aluno-mens-valor').value) || undefined,
    mensalidade_dia_vencimento:  Number(document.getElementById('aluno-mens-dia').value) || undefined,
  };
  if (!body.nome || !body.nivel) { toast('Nome e nível são obrigatórios', 'error'); return; }
  try {
    if (editingAlunoId) {
      await api('/alunos/' + editingAlunoId, 'PUT', body);
      toast('Aluno atualizado!');
    } else {
      await api('/alunos', 'POST', body);
      toast('Aluno cadastrado!');
    }
    closeModal('modal-aluno');
    loadAlunos();
  } catch (e) { toast('Erro ao salvar aluno', 'error'); }
}

async function deleteAluno(id) {
  if (!confirm('Remover este aluno? Todas as aulas e mensalidades serão removidas.')) return;
  try {
    await api('/alunos/' + id, 'DELETE');
    toast('Aluno removido');
    loadAlunos();
  } catch (e) { toast('Erro ao remover', 'error'); }
}

function viewAluno(id) {
  showPage('aulas', document.querySelector('[data-page="aulas"]'));
  document.getElementById('filter-aula-aluno').value = id;
  loadAulas();
}

// ── AULAS ──
async function loadAlunosSelect(selectId) {
  const alunos = await api('/alunos');
  const sel = document.getElementById(selectId);
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' + alunos.map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
  sel.value = cur;
}

async function loadAulas() {
  const alunoId    = document.getElementById('filter-aula-aluno')?.value;
  const dataInicio = document.getElementById('filter-data-inicio')?.value;
  const dataFim    = document.getElementById('filter-data-fim')?.value;
  let qs = '';
  if (alunoId)    qs += `aluno_id=${alunoId}&`;
  if (dataInicio) qs += `data_inicio=${dataInicio}&`;
  if (dataFim)    qs += `data_fim=${dataFim}&`;
  try {
    const aulas = await api('/aulas?' + qs);
    const tbody = document.getElementById('aulas-tbody');
    if (!aulas.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">📖</div><p>Nenhuma aula encontrada.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = aulas.map(a => `
      <tr>
        <td><strong>${a.aluno?.nome ?? '–'}</strong></td>
        <td>${formatDate(a.data_aula)}</td>
        <td style="font-size:0.82rem">${a.materias ?? '–'}</td>
        <td style="font-size:0.82rem;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${a.diario ?? ''}">${a.diario ?? '–'}</td>
        <td>${statusAulaBadge(a.status)}</td>
        <td style="font-size:0.82rem">${a.data_reposicao ? formatDate(a.data_reposicao) : '–'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openModalAula(${a.id})">✏️</button>
          <button class="btn btn-sm btn-danger" style="margin-left:4px" onclick="deleteAula(${a.id})">🗑</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { toast('Erro ao carregar aulas', 'error'); }
}

function clearAulaFilters() {
  document.getElementById('filter-aula-aluno').value = '';
  document.getElementById('filter-data-inicio').value = '';
  document.getElementById('filter-data-fim').value = '';
  loadAulas();
}

async function openModalAula(id = null) {
  editingAulaId = id;
  document.getElementById('modal-aula-title').textContent = id ? 'Editar Aula' : 'Nova Aula';
  const alunos = await api('/alunos');
  document.getElementById('aula-aluno-id').innerHTML = alunos.map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
  ['data', 'materias', 'diario', 'reposicao'].forEach(f => { const el = document.getElementById('aula-' + f); if (el) el.value = ''; });
  document.getElementById('aula-status').value = 'realizada';
  if (id) {
    const a = await api('/aulas/' + id);
    document.getElementById('aula-aluno-id').value   = a.aluno_id;
    document.getElementById('aula-data').value       = a.data_aula ?? '';
    document.getElementById('aula-materias').value   = a.materias ?? '';
    document.getElementById('aula-diario').value     = a.diario ?? '';
    document.getElementById('aula-status').value     = a.status ?? 'realizada';
    document.getElementById('aula-reposicao').value  = a.data_reposicao ?? '';
  } else {
    document.getElementById('aula-data').value = new Date().toISOString().split('T')[0];
  }
  openModal('modal-aula');
}

async function saveAula() {
  const body = {
    aluno_id:       Number(document.getElementById('aula-aluno-id').value),
    data_aula:      document.getElementById('aula-data').value,
    materias:       document.getElementById('aula-materias').value.trim() || undefined,
    diario:         document.getElementById('aula-diario').value.trim() || undefined,
    status:         document.getElementById('aula-status').value,
    data_reposicao: document.getElementById('aula-reposicao').value || undefined,
  };
  if (!body.aluno_id || !body.data_aula) { toast('Aluno e data são obrigatórios', 'error'); return; }
  try {
    if (editingAulaId) { await api('/aulas/' + editingAulaId, 'PUT', body); toast('Aula atualizada!'); }
    else               { await api('/aulas', 'POST', body); toast('Aula registrada!'); }
    closeModal('modal-aula');
    loadAulas();
  } catch (e) { toast('Erro ao salvar aula', 'error'); }
}

async function deleteAula(id) {
  if (!confirm('Remover esta aula?')) return;
  try { await api('/aulas/' + id, 'DELETE'); toast('Aula removida'); loadAulas(); }
  catch (e) { toast('Erro ao remover', 'error'); }
}

// ── MENSALIDADES ──
async function loadMensalidades() {
  const alunoId = document.getElementById('filter-mens-aluno')?.value;
  const qs = alunoId ? `aluno_id=${alunoId}` : '';
  try {
    const mens = await api('/mensalidades?' + qs);
    const tbody = document.getElementById('mensalidades-tbody');
    if (!mens.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">💰</div><p>Nenhuma mensalidade cadastrada.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = mens.map(m => `
      <tr>
        <td><strong>${m.aluno?.nome ?? '–'}</strong></td>
        <td>${formatMonth(m.mes_referencia)}</td>
        <td>R$ ${Number(m.valor).toFixed(2)}</td>
        <td>${formatDate(m.vencimento)}</td>
        <td>${m.pago
          ? `<span class="badge badge-green">✓ Pago</span>${m.data_pagamento ? `<br><span style="font-size:0.72rem;color:var(--text-muted)">${formatDate(m.data_pagamento)}</span>` : ''}`
          : `<span class="badge badge-red">Em aberto</span>`}
        </td>
        <td style="font-size:0.82rem">${m.forma_pagamento ?? '–'}</td>
        <td>
          ${!m.pago ? `<button class="btn btn-sm btn-amber" onclick="marcarPago(${m.id})">✓ Pagar</button>` : ''}
          <button class="btn btn-sm btn-outline" style="margin-left:4px" onclick="openModalMensalidade(${m.id})">✏️</button>
          <button class="btn btn-sm btn-danger" style="margin-left:4px" onclick="deleteMensalidade(${m.id})">🗑</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { toast('Erro ao carregar mensalidades', 'error'); }
}

async function openModalMensalidade(id = null) {
  editingMensId = id;
  document.getElementById('modal-mens-title').textContent = id ? 'Editar Mensalidade' : 'Nova Mensalidade';
  const alunos = await api('/alunos');
  document.getElementById('mens-aluno-id').innerHTML = alunos.map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
  ['mes', 'valor', 'vencimento', 'forma', 'obs', 'data-pagamento'].forEach(f => { const el = document.getElementById('mens-' + f); if (el) el.value = ''; });
  document.getElementById('mens-pago').value = 'false';
  togglePagoFields();
  if (id) {
    const m = await api('/mensalidades/' + id);
    document.getElementById('mens-aluno-id').value        = m.aluno_id;
    document.getElementById('mens-mes').value             = m.mes_referencia?.slice(0, 7) ?? '';
    document.getElementById('mens-valor').value           = m.valor;
    document.getElementById('mens-vencimento').value      = m.vencimento ?? '';
    document.getElementById('mens-pago').value            = m.pago ? 'true' : 'false';
    document.getElementById('mens-forma').value           = m.forma_pagamento ?? '';
    document.getElementById('mens-data-pagamento').value  = m.data_pagamento ?? '';
    document.getElementById('mens-obs').value             = m.observacoes ?? '';
    togglePagoFields();
  }
  openModal('modal-mensalidade');
}

function togglePagoFields() {
  const pago = document.getElementById('mens-pago').value === 'true';
  document.getElementById('mens-forma-group').style.display   = pago ? 'flex' : 'none';
  document.getElementById('mens-datapag-group').style.display = pago ? 'flex' : 'none';
}

async function saveMensalidade() {
  const mesVal = document.getElementById('mens-mes').value;
  const body = {
    aluno_id:        Number(document.getElementById('mens-aluno-id').value),
    mes_referencia:  mesVal ? mesVal + '-01' : undefined,
    valor:           Number(document.getElementById('mens-valor').value),
    vencimento:      document.getElementById('mens-vencimento').value || undefined,
    pago:            document.getElementById('mens-pago').value === 'true',
    forma_pagamento: document.getElementById('mens-forma').value || undefined,
    data_pagamento:  document.getElementById('mens-data-pagamento').value || undefined,
    observacoes:     document.getElementById('mens-obs').value.trim() || undefined,
  };
  if (!body.aluno_id || !body.mes_referencia || !body.valor || !body.vencimento) {
    toast('Aluno, mês, valor e vencimento são obrigatórios', 'error'); return;
  }
  try {
    if (editingMensId) { await api('/mensalidades/' + editingMensId, 'PUT', body); toast('Mensalidade atualizada!'); }
    else               { await api('/mensalidades', 'POST', body); toast('Mensalidade criada!'); }
    closeModal('modal-mensalidade');
    loadMensalidades();
  } catch (e) { toast('Erro ao salvar mensalidade', 'error'); }
}

async function marcarPago(id) {
  const forma = prompt('Forma de pagamento? (pix, transferencia, dinheiro, cartao, outro)');
  if (!forma) return;
  try {
    await api('/mensalidades/' + id + '/pagar', 'PATCH', { forma_pagamento: forma });
    toast('Marcado como pago!');
    loadMensalidades();
  } catch (e) { toast('Erro ao marcar pagamento', 'error'); }
}

async function deleteMensalidade(id) {
  if (!confirm('Remover esta mensalidade?')) return;
  try { await api('/mensalidades/' + id, 'DELETE'); toast('Mensalidade removida'); loadMensalidades(); }
  catch (e) { toast('Erro ao remover', 'error'); }
}

// ── MODAL HELPERS ──
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// ── FORMATTERS ──
function formatDate(d) {
  if (!d) return '–';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function formatMonth(d) {
  if (!d) return '–';
  const [y, m] = d.split('-');
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${meses[Number(m) - 1]}/${y}`;
}

function nivelBadge(n) {
  const map   = { iniciante: 'badge-green', intermediario: 'badge-amber', avancado: 'badge-plum' };
  const label = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
  return `<span class="badge ${map[n] ?? 'badge-gray'}">${label[n] ?? n}</span>`;
}

function statusAlunoBadge(s) {
  const map = { ativo: 'badge-green', pausado: 'badge-amber', cancelado: 'badge-red' };
  return `<span class="badge ${map[s] ?? 'badge-gray'}">${s ?? '–'}</span>`;
}

function statusAulaBadge(s) {
  const map   = { realizada: 'badge-green', nao_realizada: 'badge-red', reposta: 'badge-amber' };
  const label = { realizada: 'Realizada', nao_realizada: 'Não realizada', reposta: 'Reposta' };
  return `<span class="badge ${map[s] ?? 'badge-gray'}">${label[s] ?? s}</span>`;
}

// ── INIT ──
loadOverview();
