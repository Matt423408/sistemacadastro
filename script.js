// =====================================================================
//  FleetControl — Sistema de Gestão de Frota Veicular
//  Camada de dados e Autenticação: Supabase Auth (@supabase/supabase-js v2)
// =====================================================================

const SUPABASE_URL = 'https://yvehrnvjwrkiwloazybz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2ZWhybnZqd3JraXdsb2F6eWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTg0NDcsImV4cCI6MjEwODc3NDQ0N30.r8QmnePMgFPCbQPgAzSMAylwcDhcLcrvchHmHPTtA5U';

const TABLE = 'veiculos';
const STATUS_OPTIONS = ['Ativo', 'Manutenção', 'Inativo'];

const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------
// ESTADO DA APLICAÇÃO
// ---------------------------------------------------------------------
const state = {
    user: null,          // Usuário autenticado pelo Supabase Auth
    veiculos: [],        // dados brutos
    search: '',          // termo de busca
    filterStatus: '',    // filtro por status
    deleteTarget: null,  // veículo aguardando exclusão
    lastInsertedId: null
};

// ---------------------------------------------------------------------
// ELEMENTOS DO DOM
// ---------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

const el = {
    // auth
    loginSection: $('#login-section'),
    appMain: $('#app-main'),
    formLogin: $('#form-login'),
    loginEmail: $('#login-email'),
    loginPassword: $('#login-password'),
    loginError: $('#login-error'),
    btnLogin: $('#btn-login'),
    userInfo: $('#user-info'),
    userEmail: $('#user-email'),
    btnLogout: $('#btn-logout'),

    // stats
    statTotal: $('#stat-total'),
    statAtivos: $('#stat-ativos'),
    statManutencao: $('#stat-manutencao'),

    // header
    connStatus: $('#connection-status'),
    connLabel: $('#connection-label'),
    btnRefresh: $('#btn-refresh'),

    // formulário de veículos
    form: $('#form-veiculo'),
    formError: $('#form-error'),
    btnSubmit: $('#btn-submit'),

    // listagem
    tbody: $('#vehicles-body'),
    listCount: $('#list-count'),
    search: $('#search-input'),
    filterStatus: $('#filter-status'),
    stateLoading: $('#state-loading'),
    stateEmpty: $('#state-empty'),
    stateError: $('#state-error'),
    stateErrorMsg: $('#state-error-message'),
    btnRetry: $('#btn-retry'),

    // modal editar
    modalEdit: $('#modal-edit'),
    formEdit: $('#form-edit'),
    editError: $('#edit-error'),
    btnEditSubmit: $('#btn-edit-submit'),

    // modal excluir
    modalDelete: $('#modal-delete'),
    deleteTarget: $('#delete-target'),
    btnDeleteConfirm: $('#btn-delete-confirm'),

    // toasts
    toasts: $('#toast-container')
};

// =====================================================================
//  SISTEMA DE AUTENTICAÇÃO (SUPABASE AUTH)
// =====================================================================

async function handleLogin(e) {
    e.preventDefault();
    hideError(el.loginError);

    const email = el.loginEmail.value.trim();
    const password = el.loginPassword.value;

    if (!email || !password) {
        return showError(el.loginError, 'Por favor, preencha o e-mail e a senha.');
    }

    setLoading(el.btnLogin, true);

    try {
        const { data, error } = await dbClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        toast('success', `Bem-vindo, <b>${escapeHtml(data.user.email)}</b>!`);
        el.formLogin.reset();
    } catch (err) {
        console.error('Erro no login:', err);
        showError(el.loginError, friendlyAuthError(err));
    } finally {
        setLoading(el.btnLogin, false);
    }
}

async function handleLogout() {
    try {
        const { error } = await dbClient.auth.signOut();
        if (error) throw error;
        toast('info', 'Você saiu do sistema.');
    } catch (err) {
        toast('error', friendlyError(err));
    }
}

function updateUIForAuth(session) {
    if (session && session.user) {
        state.user = session.user;
        el.loginSection.classList.add('hidden');
        el.appMain.classList.remove('hidden');
        el.userInfo.classList.remove('hidden');
        el.userEmail.textContent = session.user.email;
        fetchVeiculos();
    } else {
        state.user = null;
        state.veiculos = [];
        el.appMain.classList.add('hidden');
        el.userInfo.classList.add('hidden');
        el.loginSection.classList.remove('hidden');
        setConnection('offline', 'Não autenticado');
    }
}

function friendlyAuthError(err) {
    if (!err) return 'Erro ao realizar login.';
    if (err.message.includes('Invalid login credentials')) {
        return 'E-mail ou senha incorretos.';
    }
    if (err.message.includes('Email not confirmed')) {
        return 'E-mail não confirmado no Supabase.';
    }
    return err.message || String(err);
}

// =====================================================================
//  FUNÇÕES CORE (CRUD)
// =====================================================================

async function fetchVeiculos({ silent = false } = {}) {
    if (!state.user) return;

    if (!silent) showListState('loading');
    setConnection('pending', 'Sincronizando…');
    el.btnRefresh.classList.add('spinning');

    try {
        const { data, error } = await dbClient
            .from(TABLE)
            .select('*')
            .order('data_cadastro', { ascending: false });

        if (error) throw error;

        state.veiculos = data || [];
        renderStats();
        renderTable();
        setConnection('online', 'Conectado ao Supabase');
    } catch (err) {
        console.error('Erro ao carregar veículos:', err);
        setConnection('offline', 'Sem conexão');
        el.stateErrorMsg.textContent = friendlyError(err);
        showListState('error');
        resetStats();
    } finally {
        el.btnRefresh.classList.remove('spinning');
    }
}

async function addVeiculo(event) {
    event.preventDefault();
    hideError(el.formError);

    const payload = readForm(el.form, {
        marca: '#marca', modelo: '#modelo', placa: '#placa', ano: '#ano', status: '#status'
    });

    const validation = validateVeiculo(payload, el.form);
    if (validation) return showError(el.formError, validation);

    setLoading(el.btnSubmit, true);
    try {
        const { data, error } = await dbClient
            .from(TABLE)
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        state.lastInsertedId = data.id;
        state.veiculos.unshift(data);
        renderStats();
        renderTable();

        el.form.reset();
        el.form.querySelector('#marca').focus();
        flashSuccess(el.btnSubmit, 'Cadastrado!');
        toast('success', `Veículo <b>${escapeHtml(data.modelo)}</b> (${escapeHtml(data.placa)}) cadastrado.`);
        fetchVeiculos({ silent: true });
    } catch (err) {
        console.error('Erro ao cadastrar veículo:', err);
        showError(el.formError, friendlyError(err));
        toast('error', friendlyError(err));
    } finally {
        setLoading(el.btnSubmit, false);
    }
}

async function updateStatus(id, novoStatus, selectEl) {
    if (!STATUS_OPTIONS.includes(novoStatus)) return;

    const veiculo = state.veiculos.find(v => v.id === id);
    const statusAnterior = veiculo?.status;
    if (selectEl) selectEl.classList.add('is-updating');

    try {
        const { error } = await dbClient
            .from(TABLE)
            .update({ status: novoStatus })
            .eq('id', id);

        if (error) throw error;

        if (veiculo) veiculo.status = novoStatus;
        renderStats();
        renderTable();
        toast('success', `Status de <b>${escapeHtml(veiculo?.placa ?? '')}</b> alterado para <b>${novoStatus}</b>.`);
    } catch (err) {
        console.error('Erro ao atualizar status:', err);
        if (selectEl && statusAnterior) selectEl.value = statusAnterior;
        toast('error', friendlyError(err));
    } finally {
        if (selectEl) selectEl.classList.remove('is-updating');
    }
}

async function updateVeiculo(event) {
    event.preventDefault();
    hideError(el.editError);

    const id = $('#edit-id').value;
    const payload = readForm(el.formEdit, {
        marca: '#edit-marca', modelo: '#edit-modelo', placa: '#edit-placa', ano: '#edit-ano', status: '#edit-status'
    });

    const validation = validateVeiculo(payload, el.formEdit);
    if (validation) return showError(el.editError, validation);

    setLoading(el.btnEditSubmit, true);
    try {
        const { data, error } = await dbClient
            .from(TABLE)
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        const idx = state.veiculos.findIndex(v => v.id === id);
        if (idx > -1) state.veiculos[idx] = data;
        renderStats();
        renderTable();
        closeModal(el.modalEdit);
        toast('success', `Veículo <b>${escapeHtml(data.placa)}</b> atualizado.`);
    } catch (err) {
        console.error('Erro ao editar veículo:', err);
        showError(el.editError, friendlyError(err));
    } finally {
        setLoading(el.btnEditSubmit, false);
    }
}

async function deleteVeiculo(id) {
    setLoading(el.btnDeleteConfirm, true);
    try {
        const { error } = await dbClient
            .from(TABLE)
            .delete()
            .eq('id', id);

        if (error) throw error;

        const removido = state.veiculos.find(v => v.id === id);
        state.veiculos = state.veiculos.filter(v => v.id !== id);
        renderStats();
        renderTable();
        closeModal(el.modalDelete);
        toast('success', `Veículo <b>${escapeHtml(removido?.placa ?? '')}</b> excluído.`);
    } catch (err) {
        console.error('Erro ao excluir veículo:', err);
        toast('error', friendlyError(err));
    } finally {
        setLoading(el.btnDeleteConfirm, false);
        state.deleteTarget = null;
    }
}

// =====================================================================
//  RENDERIZAÇÃO
// =====================================================================

function renderStats() {
    const total = state.veiculos.length;
    const ativos = state.veiculos.filter(v => v.status === 'Ativo').length;
    const manutencao = state.veiculos.filter(v => v.status === 'Manutenção').length;

    [el.statTotal, el.statAtivos, el.statManutencao].forEach(e => e.classList.remove('skeleton-text'));
    animateNumber(el.statTotal, total);
    animateNumber(el.statAtivos, ativos);
    animateNumber(el.statManutencao, manutencao);
}

function resetStats() {
    [el.statTotal, el.statAtivos, el.statManutencao].forEach(e => {
        e.classList.remove('skeleton-text');
        e.textContent = '—';
    });
}

function getFilteredVeiculos() {
    const term = state.search.trim().toLowerCase();
    return state.veiculos.filter(v => {
        const matchStatus = !state.filterStatus || v.status === state.filterStatus;
        const matchTerm = !term || [v.modelo, v.marca, v.placa, String(v.ano)]
            .some(campo => String(campo ?? '').toLowerCase().includes(term));
        return matchStatus && matchTerm;
    });
}

function renderTable() {
    const lista = getFilteredVeiculos();
    el.listCount.textContent = `${lista.length}${lista.length !== state.veiculos.length ? ` / ${state.veiculos.length}` : ''}`;

    if (state.veiculos.length === 0 || lista.length === 0) {
        el.tbody.innerHTML = '';
        showListState('empty');
        el.stateEmpty.querySelector('p.text-xs').textContent = state.veiculos.length === 0
            ? 'Cadastre o primeiro veículo usando o formulário.'
            : 'Nenhum resultado para a busca/filtro aplicados.';
        return;
    }

    showListState('table');

    el.tbody.innerHTML = lista.map(v => {
        const isNew = v.id === state.lastInsertedId;
        return `
        <tr data-id="${v.id}" class="${isNew ? 'row-new' : ''}">
            <td>
                <div class="vehicle-name">${escapeHtml(v.modelo)}</div>
                <div class="vehicle-brand"><i class="fas fa-industry mr-1 opacity-60"></i>${escapeHtml(v.marca)}</div>
            </td>
            <td><span class="plate">${escapeHtml(v.placa)}</span></td>
            <td class="hidden md:table-cell text-slate-300">${escapeHtml(v.ano)}</td>
            <td>
                <span class="badge ${badgeClass(v.status)}">
                    <select class="status-select" data-action="status" data-id="${v.id}" aria-label="Alterar status">
                        ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === v.status ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </span>
            </td>
            <td class="hidden lg:table-cell text-slate-400 text-xs whitespace-nowrap">${formatDate(v.data_cadastro)}</td>
            <td class="text-right whitespace-nowrap">
                <button type="button" class="icon-btn inline-grid" data-action="edit" data-id="${v.id}" title="Editar"><i class="fas fa-pen"></i></button>
                <button type="button" class="icon-btn danger inline-grid" data-action="delete" data-id="${v.id}" title="Excluir"><i class="fas fa-trash-can"></i></button>
            </td>
        </tr>`;
    }).join('');

    state.lastInsertedId = null;
}

function showListState(which) {
    const table = $('#vehicles-table');
    table.classList.toggle('hidden', which !== 'table');
    el.stateLoading.classList.toggle('hidden', which !== 'loading');
    el.stateEmpty.classList.toggle('hidden', which !== 'empty');
    el.stateError.classList.toggle('hidden', which !== 'error');
}

// =====================================================================
//  MODAIS & UTILITÁRIOS
// =====================================================================

function openEditModal(id) {
    const v = state.veiculos.find(x => x.id === id);
    if (!v) return;
    hideError(el.editError);
    $('#edit-id').value = v.id;
    $('#edit-marca').value = v.marca;
    $('#edit-modelo').value = v.modelo;
    $('#edit-placa').value = v.placa;
    $('#edit-ano').value = v.ano;
    $('#edit-status').value = v.status;
    openModal(el.modalEdit);
    setTimeout(() => $('#edit-marca').focus(), 50);
}

function openDeleteModal(id) {
    const v = state.veiculos.find(x => x.id === id);
    if (!v) return;
    state.deleteTarget = v.id;
    el.deleteTarget.innerHTML = `<i class="fas fa-truck text-indigo-400 mr-2"></i>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)} · <span class="plate">${escapeHtml(v.placa)}</span>`;
    openModal(el.modalDelete);
}

function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}
function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

function readForm(form, map) {
    const get = (sel) => form.querySelector(sel).value.trim();
    return {
        marca: get(map.marca),
        modelo: get(map.modelo),
        placa: normalizePlaca(get(map.placa)),
        ano: parseInt(get(map.ano), 10),
        status: get(map.status)
    };
}

function normalizePlaca(placa) {
    const limpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (limpa.length === 7) return `${limpa.slice(0, 3)}-${limpa.slice(3)}`;
    return placa.toUpperCase();
}

function validateVeiculo(v, form) {
    form.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
    const anoAtual = new Date().getFullYear();
    const mark = (name) => form.querySelector(`[id$="${name}"]`)?.classList.add('invalid');

    if (!v.marca) { mark('marca'); return 'Informe a marca do veículo.'; }
    if (!v.modelo) { mark('modelo'); return 'Informe o modelo do veículo.'; }
    if (!/^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/.test(v.placa)) { mark('placa'); return 'Placa inválida. Use o formato ABC-1234 ou ABC1D23.'; }
    if (!Number.isInteger(v.ano) || v.ano < 1950 || v.ano > anoAtual + 1) { mark('ano'); return `Informe um ano entre 1950 e ${anoAtual + 1}.`; }
    if (!STATUS_OPTIONS.includes(v.status)) return 'Status inválido.';
    return null;
}

function friendlyError(err) {
    if (!err) return 'Erro desconhecido.';
    if (err.code === '23505') return 'Já existe um veículo cadastrado com esta placa.';
    if (err.code === '23514') return 'Valor de status inválido.';
    if (/Failed to fetch|NetworkError/i.test(err.message || '')) return 'Falha de rede ao contatar o Supabase.';
    return err.message || String(err);
}

function badgeClass(status) {
    return { 'Ativo': 'badge-ativo', 'Manutenção': 'badge-manutencao', 'Inativo': 'badge-inativo' }[status] || 'badge-inativo';
}

function formatDate(iso) {
    if (!iso) return '—';
    try {
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            .format(new Date(iso));
    } catch { return iso; }
}

function escapeHtml(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function animateNumber(elm, target) {
    const start = parseInt(elm.textContent, 10) || 0;
    if (start === target) { elm.textContent = target; return; }
    const duration = 400, t0 = performance.now();
    const step = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        elm.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-label').classList.toggle('hidden', loading);
    btn.querySelector('.btn-loading').classList.toggle('hidden', !loading);
}

function flashSuccess(btn, text) {
    const label = btn.querySelector('.btn-label');
    const original = label.innerHTML;
    label.innerHTML = `<i class="fas fa-check"></i> ${text}`;
    btn.classList.add('is-success');
    setTimeout(() => { label.innerHTML = original; btn.classList.remove('is-success'); }, 1800);
}

function showError(box, msg) { box.textContent = msg; box.classList.remove('hidden'); }
function hideError(box) { box.textContent = ''; box.classList.add('hidden'); }

function setConnection(status, label) {
    el.connStatus.classList.remove('online', 'offline', 'pending');
    el.connStatus.classList.add(status);
    el.connLabel.textContent = label;
}

function toast(type, html, timeout = 3500) {
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><div class="flex-1">${html}</div>`;
    el.toasts.appendChild(node);
    setTimeout(() => { node.classList.add('leaving'); setTimeout(() => node.remove(), 250); }, timeout);
}

const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// =====================================================================
//  EVENTOS E INICIALIZAÇÃO
// =====================================================================

el.formLogin.addEventListener('submit', handleLogin);
el.btnLogout.addEventListener('click', handleLogout);

el.form.addEventListener('submit', addVeiculo);
el.formEdit.addEventListener('submit', updateVeiculo);
el.btnRefresh.addEventListener('click', () => fetchVeiculos());
el.btnRetry.addEventListener('click', () => fetchVeiculos());
el.btnDeleteConfirm.addEventListener('click', () => state.deleteTarget && deleteVeiculo(state.deleteTarget));

// Busca e filtro
el.search.addEventListener('input', debounce((e) => { state.search = e.target.value; renderTable(); }));
el.filterStatus.addEventListener('change', (e) => { state.filterStatus = e.target.value; renderTable(); });

// Delegação na tabela
el.tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'SELECT') return;
    const { action, id } = btn.dataset;
    if (action === 'edit') openEditModal(id);
    if (action === 'delete') openDeleteModal(id);
});
el.tbody.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-action="status"]');
    if (sel) updateStatus(sel.dataset.id, sel.value, sel);
});

// Fechar modais
document.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => { closeModal(el.modalEdit); closeModal(el.modalDelete); }));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(el.modalEdit); closeModal(el.modalDelete); }
});

// Placa em caixa alta
['#placa', '#edit-placa'].forEach(sel => $(sel).addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
}));

// Realtime
dbClient
    .channel('veiculos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => fetchVeiculos({ silent: true }))
    .subscribe();

// Monitora o estado de autenticação (muda UI dinamicamente se logar/deslogar)
dbClient.auth.onAuthStateChange((_event, session) => {
    updateUIForAuth(session);
});

// Verificação da sessão inicial ao carregar a página
dbClient.auth.getSession().then(({ data: { session } }) => {
    updateUIForAuth(session);
});
