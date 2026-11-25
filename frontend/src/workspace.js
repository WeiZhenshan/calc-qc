import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { canEditCatalog, canRemoveRows } from './roles.js';
import { api } from './api.js';
import { draftFromSnapshot, restrictSnapshot } from './calculation.js';

const cacheKey = 'calc-qc:offline:v1';
const logoutKey = 'calc-qc:logout-pending';
const noPending = () => ({ catalog: false, snapshot: false, backup: false });
const hasPending = pending => Object.values(pending).some(Boolean);

function readCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        return cached?.user?.id && Array.isArray(cached.state?.catalog?.brands) && cached.pending ? cached : null;
    } catch {
        return null;
    }
}

// Older caches used per-account brand UUIDs. Leave unmatched IDs in the pending
// snapshot so a sync conflict is visible instead of silently discarding input.
function rebasePendingSnapshot(previous, catalog) {
    const snapshot = previous.snapshot;
    if (!snapshot) return null;
    const ids = new Set(catalog.brands.map(brand => brand.id));
    const byName = new Map();
    for (const { id, name } of catalog.brands) {
        byName.set(name, byName.has(name) ? null : id);
    }
    const oldNames = new Map(previous.catalog.brands.map(brand => [brand.id, brand.name]));
    const targets = snapshot.items.map(({ brandId }) =>
        ids.has(brandId) ? brandId : byName.get(oldNames.get(brandId)));
    const used = new Set();
    const ambiguous = new Set();
    for (const id of targets) {
        if (used.has(id)) ambiguous.add(id);
        used.add(id);
    }
    const items = snapshot.items.map((item, index) => {
        const id = targets[index];
        return id && !ambiguous.has(id) ? { ...item, brandId: id } : item;
    });
    return { ...snapshot, items };
}

function writeCache(value, required = false) {
    try {
        if (value) localStorage.setItem(cacheKey, JSON.stringify(value));
        else localStorage.removeItem(cacheKey);
    } catch {
        if (required) throw new Error('本地存储不可用，离线改动未保存');
    }
}

export function useWorkspace() {
    const user = shallowRef(null);
    const state = shallowRef(null);
    const draft = ref({});
    const pending = shallowRef(noPending());
    const offline = ref(false);
    const ready = ref(false);
    const busy = ref(false);
    const notice = ref('');
    const hasChanges = computed(() => hasPending(pending.value));

    function remember(account, workspace, queue, required = false) {
        writeCache({ user: account, state: workspace, pending: queue, offlineAllowed: true }, required);
    }

    function install(account, workspace, queue = noPending()) {
        user.value = account;
        state.value = workspace;
        pending.value = queue;
        draft.value = draftFromSnapshot(workspace.snapshot);
    }

    function invalidate() {
        const cached = readCache();
        if (cached && hasPending(cached.pending)) {
            writeCache({ ...cached, offlineAllowed: false });
        } else {
            writeCache(null);
        }
        user.value = null;
        state.value = null;
        draft.value = {};
        pending.value = noPending();
        offline.value = false;
    }

    async function finishPendingLogout() {
        try {
            if (localStorage.getItem(logoutKey) === null) return;
        } catch {
            return;
        }
        await api.logout();
        localStorage.removeItem(logoutKey);
    }

    async function loadAccount(account) {
        const cached = readCache();
        const queue = cached?.user.id === account.id ? cached.pending : noPending();
        let workspace;
        if (queue.catalog || queue.backup) {
            workspace = cached.state;
        } else {
            workspace = await api.load(account.id);
            if (queue.snapshot) {
                workspace.snapshot = rebasePendingSnapshot(cached.state, workspace.catalog);
            }
        }
        remember(account, workspace, queue);
        install(account, workspace, queue);
        offline.value = false;
    }

    async function start() {
        try {
            await finishPendingLogout();
            await loadAccount(await api.me());
        } catch (error) {
            const cached = readCache();
            if (error.status === 0 && cached?.offlineAllowed) {
                install(cached.user, cached.state, cached.pending);
                offline.value = true;
            } else if (error.status === 401 || error.status === 403) {
                invalidate();
            } else {
                notice.value = error.message;
            }
        } finally {
            ready.value = true;
        }
    }

    async function authenticate(mode, credentials) {
        busy.value = true;
        try {
            await finishPendingLogout();
            if (mode === 'register') await api.register(credentials);
            try {
                await api.login(credentials);
            } catch (error) {
                if (error.status === 401) throw new Error('用户名或密码不正确');
                throw error;
            }
            await loadAccount(await api.me());
            notice.value = '';
        } finally {
            busy.value = false;
        }
    }

    async function signOut() {
        busy.value = true;
        try {
            try {
                await api.logout();
            } catch (error) {
                if (error.status !== 0) throw error;
                localStorage.setItem(logoutKey, '1');
            }
            writeCache(null);
            invalidate();
            notice.value = '';
        } finally {
            busy.value = false;
        }
    }

    async function send(kind, id, value) {
        if (kind === 'catalog') return api.catalog(id, value);
        if (kind === 'snapshot') return api.snapshot(id, value);
        return api.backup(id, value);
    }

    function pruneDraft(brands) {
        const ids = new Set(brands.map(brand => brand.id));
        for (const key of Object.keys(draft.value)) {
            if (!ids.has(key)) delete draft.value[key];
        }
    }

    function installChange(kind, value, queue, local = false, updateDraft = true) {
        const account = user.value;
        let workspace;
        if (kind === 'catalog') {
            workspace = { catalog: value, snapshot: restrictSnapshot(state.value.snapshot, value.brands) };
        } else if (kind === 'snapshot') {
            workspace = { ...state.value, snapshot: value };
        } else {
            workspace = value;
        }
        remember(account, workspace, queue, local);
        state.value = workspace;
        pending.value = queue;
        if (kind === 'catalog' || (kind === 'backup' && !updateDraft)) {
            pruneDraft(workspace.catalog.brands);
        } else if (updateDraft && (kind === 'backup' || !value)) {
            draft.value = draftFromSnapshot(workspace.snapshot);
        }
    }

    function checkWrite(kind, value) {
        const role = user.value.role;
        if (kind !== 'snapshot' && !canEditCatalog(role)) throw new Error('当前角色无权修改品牌库');
        const snapshot = kind === 'snapshot' ? value : value?.snapshot;
        if (!canRemoveRows(role) && snapshot?.items.some(item => item.hidden)) {
            const hidden = new Set(state.value.snapshot?.items.filter(item => item.hidden).map(item => item.brandId));
            if (snapshot.items.some(item => item.hidden && !hidden.has(item.brandId))) {
                throw new Error('只有管理员可以移除计算器行');
            }
        }
    }

    async function refreshRole() {
        const currentId = user.value?.id;
        if (!currentId) return;
        try {
            const account = await api.me();
            if (user.value?.id !== currentId) return;
            if (account.id !== currentId) { invalidate(); return; }
            if (account.role !== user.value.role) {
                user.value = account;
                remember(account, state.value, pending.value);
            }
        } catch (error) {
            if (error.status === 401 && user.value?.id === currentId) invalidate();
        }
    }

    async function commit(kind, value) {
        if (!user.value || busy.value) return false;
        busy.value = true;
        const activeId = user.value.id;
        try {
            checkWrite(kind, value);
            if (!offline.value && !hasChanges.value) {
                try {
                    const result = await send(kind, activeId, value);
                    if (user.value?.id !== activeId) return false;
                    installChange(kind, result, noPending());
                    return true;
                } catch (error) {
                    if (error.status !== 0) throw error;
                    offline.value = true;
                }
            }
            if (user.value?.id !== activeId) return false;
            const queue = kind === 'backup'
                ? { ...noPending(), backup: true }
                : { ...pending.value, [kind]: true };
            installChange(kind, value, queue, true);
            return true;
        } catch (error) {
            if (error.status === 401) invalidate();
            if (error.status === 403) await refreshRole();
            throw error;
        } finally {
            busy.value = false;
        }
    }

    async function reconnect(discard = false) {
        if (!user.value || busy.value) return;
        busy.value = true;
        const activeId = user.value.id;
        try {
            const account = await api.me();
            if (account.id !== activeId) {
                invalidate();
                throw new Error('会话账号已改变，请重新登录');
            }
            user.value = account;
            remember(account, state.value, pending.value);
            offline.value = false;
            if (discard || !hasChanges.value) {
                const workspace = await api.load(activeId);
                if (user.value?.id !== activeId) return;
                if (discard) {
                    remember(account, workspace, noPending());
                    install(account, workspace);
                } else {
                    installChange('backup', workspace, noPending(), false, false);
                }
                return;
            }
            if (pending.value.backup) {
                const imported = await api.backup(activeId, state.value);
                if (user.value?.id !== activeId) return;
                installChange('backup', imported, noPending(), false, false);
                return;
            }
            if (pending.value.catalog) {
                const catalog = await api.catalog(activeId, state.value.catalog);
                if (user.value?.id !== activeId) return;
                installChange('catalog', catalog, { ...pending.value, catalog: false });
            }
            if (pending.value.snapshot) {
                const snapshot = await api.snapshot(activeId, state.value.snapshot);
                if (user.value?.id !== activeId) return;
                installChange('snapshot', snapshot, noPending(), false, false);
            }
            // Refresh the saved snapshot if only the catalog was queued, without discarding the live draft.
            const workspace = await api.load(activeId);
            if (user.value?.id === activeId) installChange('backup', workspace, noPending(), false, false);
        } catch (error) {
            if (error.status === 401) invalidate();
            if (error.status === 0) offline.value = true;
            throw error;
        } finally {
            busy.value = false;
        }
    }

    function networkLost() {
        if (user.value) offline.value = true;
    }

    function accountChanged(event) {
        if (event.key !== cacheKey || !user.value) return;
        const next = readCache();
        if (next?.user.id === user.value.id && next.offlineAllowed) return;
        user.value = null;
        state.value = null;
        pending.value = noPending();
        draft.value = {};
        offline.value = false;
        notice.value = '该浏览器的登录账号已改变，请重新登录。';
    }

    onMounted(() => {
        window.addEventListener('focus', refreshRole);
        window.addEventListener('offline', networkLost);
        window.addEventListener('storage', accountChanged);
        start();
    });

    onUnmounted(() => {
        window.removeEventListener('focus', refreshRole);
        window.removeEventListener('offline', networkLost);
        window.removeEventListener('storage', accountChanged);
    });

    return { user, state, draft, ready, busy, offline, notice, hasChanges, authenticate, signOut, commit, reconnect };
}
