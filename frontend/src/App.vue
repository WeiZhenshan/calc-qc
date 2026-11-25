<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import AuthPanel from './AuthPanel.vue';
import CalculatorPage from './CalculatorPage.vue';
import CatalogPage from './CatalogPage.vue';
import { canEditCatalog, roleNames } from './roles.js';
import { useWorkspace } from './workspace.js';
import { download, encodeBackup, parseBackup, readLegacyStorage } from './backup.js';
import { snapshotFromDraft } from './calculation.js';

const app = useWorkspace();
const { user, state, draft, ready, busy, offline, notice, hasChanges } = app;
const page = ref('calc');
const toast = ref('');
const legacy = ref(readLegacyStorage());
const toastHost = ref(null);
const scrollPositions = { calc: 0, brands: 0, profile: 0 };
const catalogAccess = computed(() => canEditCatalog(user.value?.role));
const destinations = computed(() => [
    { name: 'calc', label: '计算器', icon: 'balance-list-o' },
    ...(catalogAccess.value ? [{ name: 'brands', label: '品牌库', icon: 'apps-o' }] : []),
    { name: 'profile', label: '用户中心', icon: 'contact-o' },
]);
watch(catalogAccess, allowed => { if (!allowed && page.value === 'brands') navigate('calc'); });
let toastTimer;

async function navigate(name) {
    if (page.value === name) return;
    scrollPositions[page.value] = window.scrollY;
    page.value = name;
    await nextTick();
    window.scrollTo(0, scrollPositions[name]);
}

async function switchByArrow(step) {
    const tabs = destinations.value;
    const index = tabs.findIndex(item => item.name === page.value);
    const target = tabs[(index + step + tabs.length) % tabs.length].name;
    await navigate(target);
    document.getElementById('tab-' + target)?.focus({ preventScroll: true });
}

function notify(message) {
    toastHost.value = document.querySelector('dialog[open]') || document.body;
    toast.value = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.value = ''; }, 3000);
}

function restoreToastHost(event) {
    if (event.target === toastHost.value) toastHost.value = document.body;
}

onMounted(() => document.addEventListener('close', restoreToastHost, true));
onUnmounted(() => {
    clearTimeout(toastTimer);
    document.removeEventListener('close', restoreToastHost, true);
});

async function commit(kind, value, message) {
    try {
        if (!await app.commit(kind, value)) return false;
        if (hasChanges.value) notify(message ? `${message}，待同步` : '已保存到此设备，待同步');
        else if (message) notify(message);
        return true;
    } catch (error) {
        notify(error.message);
        return false;
    }
}

function saveCatalog(catalog, message) {
    return commit('catalog', catalog, message);
}

function saveSnapshot(snapshot) {
    return commit('snapshot', snapshot, snapshot ? '当前计算已保存' : '已清空当前计算');
}

async function importBackup(data) {
    const workspace = parseBackup(data, state.value.catalog.revision);
    if (!window.confirm('导入将替换所有账号共用的品牌库和标签，以及你自己的计算快照。确定继续吗？')) return;
    return commit('backup', workspace, '备份已导入');
}

async function importLegacy() {
    try {
        if (await importBackup(legacy.value)) legacy.value = null;
    } catch (error) {
        notify(error.message);
    }
}

function exportBackup() {
    const { catalog } = state.value;
    const snapshot = snapshotFromDraft(catalog.brands, draft.value);
    download('差价计算备份.json', encodeBackup(catalog, snapshot), 'application/json;charset=utf-8');
}

async function reconnect(discard = false) {
    if (discard && !window.confirm('确定放弃未同步改动并重新加载服务器数据？')) return;
    try {
        await app.reconnect(discard);
        notify('已连接服务器');
    } catch (error) {
        notify(error.message);
    }
}

async function signOut() {
    if (hasChanges.value && !window.confirm('退出将清除本机未同步的改动，确定退出吗？')) return;
    try {
        await app.signOut();
        page.value = 'calc';
        scrollPositions.calc = scrollPositions.brands = scrollPositions.profile = 0;
        window.scrollTo(0, 0);
    } catch (error) {
        notify(error.message);
    }
}
</script>

<template>
    <main v-if="!ready" class="connection" role="status" aria-busy="true">正在连接工作区…</main>
    <AuthPanel v-else-if="!user" :busy="busy" :notice="notice" :authenticate="app.authenticate" />
    <template v-else>
        <header class="masthead">
            <div class="masthead-inner">
                <div class="wordmark"><span class="brand-symbol" aria-hidden="true"></span>差价计算器</div>
                <div class="account">
                    <van-icon name="contact-o" aria-hidden="true" /><span>{{ user.username }}</span>
                    <button type="button" class="text-button" :disabled="busy" @click="signOut">退出</button>
                </div>
            </div>
        </header>
        <main class="container">
            <aside v-if="offline || hasChanges" class="offline-bar" role="status">
                <p>{{ offline ? '离线模式 · 改动将保存在此设备' : '有改动待同步' }}</p>
                <van-button size="small" :disabled="busy" @click="reconnect()">连接并同步</van-button>
                <van-button v-if="hasChanges && !offline" size="small" :disabled="busy" @click="reconnect(true)">放弃改动</van-button>
            </aside>
            <CalculatorPage :can-edit-catalog="catalogAccess" :active="page === 'calc'" :catalog="state.catalog" :draft="draft" :busy="busy"
                :save-catalog="saveCatalog" :save-snapshot="saveSnapshot" :notify="notify" />
            <CatalogPage v-if="catalogAccess" :active="page === 'brands'" :catalog="state.catalog" :busy="busy"
                :save-catalog="saveCatalog" :notify="notify" :export-backup="exportBackup"
                :import-backup="importBackup" :legacy-available="Boolean(legacy)" :import-legacy="importLegacy" />
            <section v-if="page === 'profile'" id="page-profile" role="tabpanel" aria-labelledby="tab-profile">
                <header class="page-head"><h1>用户中心</h1></header>
                <dl class="ledger account-details">
                    <div><dt>用户名</dt><dd>{{ user.username }}</dd></div>
                    <div><dt>密码</dt><dd><span aria-label="密码已设置">••••••••</span></dd></div>
                    <div><dt>角色</dt><dd>{{ roleNames[user.role] || '商户' }}</dd></div>
                </dl>
                <van-button class="profile-logout" :disabled="busy" @click="signOut">退出登录</van-button>
            </section>
        </main>
        <nav class="bottom-nav" aria-label="主导航">
            <van-tabbar :model-value="page" :fixed="false" :border="false" aria-label="工作区页面"
                @update:model-value="navigate" @keydown.left.prevent="switchByArrow(-1)" @keydown.right.prevent="switchByArrow(1)">
                <van-tabbar-item v-for="item in destinations" :id="'tab-' + item.name" :key="item.name"
                    :name="item.name" :aria-label="item.label" :icon="item.icon" :aria-controls="'page-' + item.name"
                    :aria-current="page === item.name ? 'page' : undefined" :tabindex="page === item.name ? 0 : -1"
                    @keydown.enter.prevent="navigate(item.name)" @keydown.space.prevent="navigate(item.name)">
                    {{ item.label }}
                </van-tabbar-item>
            </van-tabbar>
        </nav>
    </template>
    <Teleport v-if="toast" :to="toastHost">
        <div class="toast" role="status">{{ toast }}</div>
    </Teleport>
</template>
