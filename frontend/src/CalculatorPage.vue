<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { buildBrandIndex, matchBrand, matchMarketPriceRows, newBrandId, parseLine, validCatalogPrice } from './brands.js';
import { calculateRow, money, rowValues, snapshotFromDraft, summarize } from './calculation.js';
import { useListPagination } from './useListPagination.js';
import ExcelPriceUpload from './ExcelPriceUpload.vue';
import WorkSheet from './WorkSheet.vue';
import { calculationCsv, download } from './backup.js';

const props = defineProps({
    canEditCatalog: Boolean,
    active: Boolean, busy: Boolean, catalog: Object, draft: Object,
    saveCatalog: Function, saveSnapshot: Function, notify: Function,
});
const filter = ref('');
const tagMenu = ref(false);
const tagQuery = ref('');
const matchingTags = computed(() => props.catalog.tags.filter(tag => tag.includes(tagQuery.value.trim())));
watch(tagMenu, open => { if (open) tagQuery.value = ''; });
const query = ref('');
const sortColumns = [
    { key: 'name', label: '品牌' },
    { key: 'wholesale', label: '批发价' },
];
const sortKey = ref('');
const descending = ref(false);
const editingPrice = ref(null);
const editingRow = ref(null);
const pinsExpanded = ref(true);
const tableHead = ref(null);
const byName = new Intl.Collator('zh-CN-u-co-pinyin', { numeric: true });
const adding = ref(false);
const more = ref(false);
const importing = ref(false);
const importActions = ref(null);
const importText = ref('');
const excelApplied = ref(false);
const importResult = ref(null);
const printDate = ref('');
const newName = ref('');
const newWholesale = ref('');
const newMarket = ref('');

const catalogRows = computed(() => props.catalog.brands
    .filter(brand => !props.draft[brand.id]?.hidden)
    .map(brand => ({
        brand,
        values: rowValues(brand, props.draft[brand.id]),
        result: calculateRow(brand, props.draft[brand.id]),
    })));
const included = computed(() => catalogRows.value.filter(row => row.result));
const totalQuantity = computed(() => included.value.reduce((sum, row) => sum + Number.parseInt(row.values.quantity, 10), 0));
const hiddenCount = computed(() => props.catalog.brands.length - catalogRows.value.length);
const totals = computed(() => summarize(props.catalog.brands, props.draft));
const printTotals = computed(() => summarize(rows.value.map(row => row.brand), props.draft));
const counts = computed(() => {
    const result = new Map();
    props.catalog.brands.forEach(brand => brand.tags.forEach(tag => result.set(tag, (result.get(tag) || 0) + 1)));
    return result;
});
function priceForSort(row) {
    // Keep the edited row in place until the user leaves its wholesale input.
    const raw = editingPrice.value?.id === row.brand.id ? editingPrice.value.value : row.values.wholesale;
    return Number.parseFloat(raw);
}

const sortedRows = computed(() => {
    const list = [...catalogRows.value];
    const direction = descending.value ? -1 : 1;
    if (sortKey.value === 'name') {
        list.sort((a, b) => direction * byName.compare(a.brand.name, b.brand.name));
    } else if (sortKey.value === 'wholesale') {
        list.sort((a, b) => {
            const left = priceForSort(a), right = priceForSort(b);
            if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
            if (!Number.isFinite(right)) return -1;
            return direction * (left - right);
        });
    }
    return list;
});

const rows = computed(() => {
    const search = query.value.trim().toLowerCase();
    return sortedRows.value.filter(({ brand }) =>
        (!filter.value || brand.tags.includes(filter.value)) && brand.name.toLowerCase().includes(search));
});

function hasMarket(row) {
    return String(row.values.market).trim() !== '';
}

function isPinned(row) {
    return editingRow.value?.id === row.brand.id ? editingRow.value.pinned : hasMarket(row);
}

const pinnedRows = computed(() => sortedRows.value.filter(isPinned));
const otherRows = computed(() => rows.value.filter(row => !isPinned(row)));
const { page, pageCount, pageRows, listStart, readPage } =
    useListPagination(otherRows, [query, filter, sortKey, descending]);
const groups = computed(() => [
    { key: 'pinned', rows: pinsExpanded.value ? pinnedRows.value : [] },
    { key: 'other', rows: pageRows.value },
]);

// Wait until focus leaves the row, so moving from price to quantity keeps the same inputs.
function beginRowEdit(id, pinned) {
    if (editingRow.value?.id !== id) editingRow.value = { id, pinned };
}

function endRowEdit(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) editingRow.value = null;
}

function toggleSort(key) {
    descending.value = sortKey.value === key && !descending.value;
    sortKey.value = key;
}

watch(() => props.catalog.tags, tags => {
    if (filter.value && !tags.includes(filter.value)) filter.value = '';
});
watch(() => props.active, active => {
    if (!active) tagMenu.value = false;
});

function update(id, field, value) {
    props.draft[id] = { ...props.draft[id], [field]: value };
}

function clearMarketPrices() {
    const filledRows = catalogRows.value.filter(hasMarket);
    if (!filledRows.length) return;

    tableHead.value?.focus({ preventScroll: true });
    for (const { brand } of filledRows) {
        update(brand.id, 'market', '');
    }
    pinsExpanded.value = true;
    props.notify(`已清除 ${filledRows.length} 款市场价，点击「保存计算」可保存`);
}

function restoreAll() {
    for (const id of Object.keys(props.draft)) {
        if (props.draft[id].hidden) update(id, 'hidden', false);
    }
}

function chooseTag(tag) {
    filter.value = tag;
    tagMenu.value = false;
}

function openImport() {
    excelApplied.value = false;
    importing.value = true;
    importText.value = '';
    importResult.value = null;
}

function applyExcelRows(rows) {
    const result = matchMarketPriceRows(rows, props.catalog.brands);
    for (const [index, market] of result.prices) {
        update(props.catalog.brands[index].id, 'market', String(market));
    }
    if (result.prices.size) excelApplied.value = true;
    return result;
}

function importPrices() {
    if (!props.canEditCatalog) return;
    const text = importText.value.trim();
    if (!text) {
        importResult.value = { message: '请先粘贴价格数据' };
        return;
    }
    const brands = props.catalog.brands;
    const index = buildBrandIndex(brands);
    const matched = [], unmatched = [];
    let skipped = 0;
    for (const line of text.split(/[\r\n]+/).filter(line => line.trim())) {
        const parsed = parseLine(line.trim());
        if (!parsed) {
            skipped++;
            continue;
        }
        const hit = matchBrand(parsed.brandText, brands, index);
        if (hit === null) {
            unmatched.push(parsed.brandText);
            continue;
        }
        const { id, name } = brands[hit];
        props.draft[id] = { ...props.draft[id], hidden: false, market: parsed.market.toFixed(1) };
        if (parsed.wholesale !== null) update(id, 'wholesale', parsed.wholesale.toFixed(1));
        matched.push({ name, ...parsed });
    }
    importResult.value = { matched, unmatched, skipped };
}

async function addBrand() {
    const name = newName.value.trim();
    const wholesale = Number(newWholesale.value);
    const market = Number(newMarket.value);
    if (!name) return props.notify('请输入品牌名称');
    if (!validCatalogPrice(wholesale)) return props.notify('请输入有效的批发价');
    if (!validCatalogPrice(market)) return props.notify('请输入有效的市场价');
    const brand = { id: newBrandId(), name, wholesale, market, tags: [] };
    if (await props.saveCatalog({ ...props.catalog, brands: [...props.catalog.brands, brand] }, '已添加到品牌库')) {
        newName.value = newWholesale.value = newMarket.value = '';
        adding.value = false;
    }
}

async function clear() {
    if (!window.confirm('确定清空当前计算吗？品牌库和标签会保留。')) return;
    if (await props.saveSnapshot(null)) {
        chooseTag('');
        query.value = '';
        newName.value = newWholesale.value = newMarket.value = '';
    }
}

function save() {
    return props.saveSnapshot(snapshotFromDraft(props.catalog.brands, props.draft));
}

async function share() {
    const { cost, revenue, profit, count } = totals.value;
    const text = [
        '💰 卷烟差价计算',
        `总成本：${money(cost)}`,
        `市场价合计：${money(revenue)}`,
        `利润差价：${money(profit)}`,
        `已填写价格：${count} 个品牌`,
        window.location.href.split('#')[0],
    ].join('\n');
    if (navigator.share) {
        try {
            await navigator.share({ title: '卷烟差价计算器', text });
            return;
        } catch (error) {
            if (error.name === 'AbortError') return;
        }
    }
    try {
        if (!navigator.clipboard?.writeText) throw new Error();
        await navigator.clipboard.writeText(text);
        props.notify('分享内容已复制');
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.className = 'clipboard-helper';
        textarea.setAttribute('aria-hidden', 'true');
        document.body.append(textarea);
        textarea.select();
        try {
            props.notify(document.execCommand('copy') ? '分享内容已复制' : '当前浏览器无法复制分享内容');
        } finally {
            textarea.remove();
        }
    }
}

async function print() {
    printDate.value = new Date().toLocaleString('zh-CN');
    await nextTick();
    document.body.classList.add('printing-home');
    const cleanup = () => document.body.classList.remove('printing-home');
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
        window.print();
    } catch (error) {
        window.removeEventListener('afterprint', cleanup);
        cleanup();
        props.notify(error.message);
    }
}

function exportCsv() {
    download('差价计算.csv', calculationCsv(props.catalog.brands, props.draft, totals.value), 'text/csv;charset=utf-8');
}

function runAction(action) {
    more.value = false;
    action();
}
</script>

<template>
    <section v-show="active" id="page-calc" role="tabpanel" aria-labelledby="tab-calc">
        <header class="page-head">
            <h1>差价计算</h1>
            <div class="actions">
                <van-button type="primary" icon="passed" aria-label="保存计算" :disabled="busy" @click="save">保存计算</van-button>
                <van-button icon="ellipsis" class="icon-button" aria-label="更多计算操作" @click="more = true" />
            </div>
        </header>

        <section class="balance" aria-label="全部品牌计算汇总">
            <div class="balance-main">
                <div class="balance-label"><van-icon name="balance-o" aria-hidden="true" />利润差价</div>
                <strong class="balance-amount">{{ money(totals.profit) }}</strong>
                <span class="balance-count">本次计算 · {{ totals.count }} 款 · {{ totalQuantity }} 条</span>
            </div>
            <dl class="balance-detail">
                <div><dt>总成本</dt><dd>{{ money(totals.cost) }}</dd></div>
                <div><dt>市场价合计</dt><dd>{{ money(totals.revenue) }}</dd></div>
            </dl>
        </section>

        <section class="ledger" :class="{ 'read-only-catalog': !canEditCatalog }" aria-label="价格明细">
            <header class="section-head ledger-head">
                <div class="section-title"><h2>查找品规</h2><span>{{ rows.length }} 项</span></div>
                <van-button v-if="canEditCatalog" icon="plus" aria-label="添加品牌" class="quiet-action" :disabled="busy" @click="adding = true">添加品牌</van-button>
            </header>
            <div class="tools">
                <label class="sr-only" for="calc-search">搜索计算品牌</label>
                <van-search id="calc-search" v-model="query" placeholder="搜索品牌名称" />
                <van-button icon="filter-o" :aria-label="filter ? '筛选：' + filter : '按标签筛选'" :class="{ selected: filter }" @click="tagMenu = true">{{ filter || '按标签筛选' }}</van-button>
                <van-button v-if="canEditCatalog" icon="down" aria-label="批量导入" :disabled="busy" @click="openImport">批量导入</van-button>
            </div>
            <button v-if="hiddenCount" type="button" class="text-button restore" :disabled="busy" @click="restoreAll">
                恢复已移除的品牌（{{ hiddenCount }}）
            </button>
            <div ref="tableHead" class="table-head row-grid" role="group" aria-label="价格明细排序" tabindex="-1">
                <button v-for="column in sortColumns" :key="column.key" type="button" class="sort-column"
                    :aria-pressed="sortKey === column.key"
                    :aria-label="column.label + (sortKey === column.key ? (descending ? '，当前降序' : '，当前升序') : '排序')"
                    @click="toggleSort(column.key)">
                    {{ column.label }}<span aria-hidden="true">{{ sortKey === column.key ? (descending ? '↓' : '↑') : '↕' }}</span>
                </button>
                <span>市场价</span><span>数量</span><span>小计差价</span>
            </div>
            <template v-for="group in groups" :key="group.key">
                <div v-if="group.key === 'pinned' && pinnedRows.length" class="pin-heading">
                    <button type="button" class="pin-toggle" :aria-expanded="pinsExpanded" @click="pinsExpanded = !pinsExpanded">
                        <strong>已填市场价 · {{ pinnedRows.length }} 款</strong>
                        <span>{{ pinsExpanded ? '收起' : '展开' }} <van-icon :name="pinsExpanded ? 'arrow-up' : 'arrow-down'" aria-hidden="true" /></span>
                    </button>
                    <button type="button" class="text-button danger pin-clear" :disabled="busy"
                        aria-label="一键清除已填市场价" @click="clearMarketPrices">一键清除</button>
                </div>
                <div v-if="group.key === 'other'" :ref="el => { listStart = el }" tabindex="-1" class="other-heading">
                    <strong v-if="pinnedRows.length && otherRows.length">待填市场价 · {{ otherRows.length }} 款</strong>
                </div>
                <div v-for="{ brand, result, values } in group.rows" :key="brand.id" class="brand-row row-grid"
                    @focusin="beginRowEdit(brand.id, group.key === 'pinned')" @focusout="endRowEdit">
                    <div class="row-identity">
                        <div class="brand-info">
                            <strong>{{ brand.name }}</strong>
                            <div v-if="brand.tags.length" class="row-tags">
                                <button v-for="tag in brand.tags" :key="tag" type="button" class="tag-link"
                                    :aria-pressed="filter === tag" @click="chooseTag(filter === tag ? '' : tag)">{{ tag }}</button>
                            </div>
                        </div>
                        <output class="difference" :class="{ loss: result?.profit < 0, pending: !result }"
                            :aria-label="brand.name + ' 小计差价'">{{ result ? (result.profit > 0 ? '+' : '') + money(result.profit) : '待计算' }}</output>
                    </div>
                    <label class="entry wholesale"><span>批发价</span>
                        <input :aria-label="brand.name + ' 批发价'" type="number" inputmode="decimal" step="any" min="0"
                            :disabled="busy" :value="values.wholesale" @focus="editingPrice = { id: brand.id, value: values.wholesale }"
                            @blur="editingPrice = null" @input="update(brand.id, 'wholesale', $event.target.value)">
                    </label>
                    <label class="entry market"><span>市场价</span>
                        <input :aria-label="brand.name + ' 市场价'" type="number" inputmode="decimal" placeholder="待填写" step="any" min="0"
                            :disabled="busy" :value="values.market" @input="update(brand.id, 'market', $event.target.value)">
                    </label>
                    <label class="entry quantity"><span>数量（条）</span>
                        <input :aria-label="brand.name + ' 数量'" type="number" inputmode="numeric" min="1" max="9999" step="1"
                            :disabled="busy" :value="values.quantity" @input="update(brand.id, 'quantity', $event.target.value)">
                    </label>
                </div>
            </template>
            <div v-if="!rows.length" class="empty-state">
                <van-icon name="search" /><p>{{ query || filter ? '没有匹配的品牌' : hiddenCount ? '当前品牌均已移除' : '品牌库为空' }}</p>
                <button v-if="query || filter" type="button" class="text-button" @click="query = ''; chooseTag('')">清除筛选条件</button>
            </div>
            <van-pagination v-if="pageCount > 1" v-model="page" :page-count="pageCount" mode="simple"
                class="catalog-pagination" aria-label="计算器品牌分页" prev-text="上一页" next-text="下一页" @change="readPage">
                <template #pageDesc><span aria-live="polite">第 {{ page }} / {{ pageCount }} 页</span></template>
            </van-pagination>
        </section>

        <WorkSheet v-model="tagMenu" title="按标签筛选">
            <van-search v-if="catalog.tags.length" v-model="tagQuery" placeholder="搜索标签" aria-label="查找筛选标签" />
            <button class="option" type="button" :aria-pressed="!filter" @click="chooseTag('')">
                全部品牌<span>{{ catalog.brands.length }} 个 <van-icon v-if="!filter" name="success" /></span>
            </button>
            <button v-for="tag in matchingTags" :key="tag" type="button" class="option" :aria-pressed="filter === tag" @click="chooseTag(tag)">
                {{ tag }}<span>{{ counts.get(tag) || 0 }} 个 <van-icon v-if="filter === tag" name="success" /></span>
            </button>
            <p v-if="!matchingTags.length" class="hint">{{ catalog.tags.length ? '没有匹配的标签' : '暂无可用标签' }}</p>
        </WorkSheet>
        <WorkSheet v-model="more" title="更多计算操作">
            <button class="option" type="button" @click="runAction(share)">分享全部汇总<van-icon name="share-o" /></button>
            <button class="option" type="button" @click="runAction(exportCsv)">导出全部明细 CSV<van-icon name="down" /></button>
            <button class="option" type="button" @click="runAction(print)">打印当前明细<van-icon name="orders-o" /></button>
            <button class="option danger" type="button" :disabled="busy" @click="runAction(clear)">清空当前计算<van-icon name="delete-o" /></button>
        </WorkSheet>
        <WorkSheet v-if="canEditCatalog" v-model="adding" title="添加品牌">
            <form class="form-stack" @submit.prevent="addBrand">
                <label>品牌名称<input v-model.trim="newName" maxlength="20" required placeholder="输入品牌名称"></label>
                <div class="form-pair">
                    <label>批发价（元）<input v-model="newWholesale" type="number" inputmode="decimal" min="0" step="any" required></label>
                    <label>市场价（元）<input v-model="newMarket" type="number" inputmode="decimal" min="0" step="any" required></label>
                </div>
                <van-button type="primary" native-type="submit" :disabled="busy" block>添加到品牌库</van-button>
            </form>
        </WorkSheet>
        <WorkSheet v-if="canEditCatalog" v-model="importing" title="批量导入价格">
            <ExcelPriceUpload v-if="importing" :button-target="importActions" :disabled="busy" :apply-rows="applyExcelRows" save-hint="点击「保存计算」可保存。" />
            <p class="hint">也可每行粘贴「品牌名 市场价」或「品牌名 批发价 市场价」。支持常见品牌别名。</p>
            <textarea v-model="importText" aria-label="导入价格文本" rows="5" placeholder="中华（硬） 381.0 400.0&#10;利群(新版) 122.0 155.0"></textarea>
            <div v-if="importResult" class="import-result" role="status">
                <div v-if="importResult.message">{{ importResult.message }}</div>
                <template v-else>
                    <strong>已导入 {{ importResult.matched.length }} 条</strong>
                    <div v-for="(item, index) in importResult.matched" :key="index">{{ item.name }} · 批发 {{ item.wholesale ?? '沿用当前价' }} · 市场 {{ item.market }}</div>
                    <div v-if="importResult.unmatched.length">未识别 {{ importResult.unmatched.length }} 条 · {{ importResult.unmatched.join('、') }}</div>
                    <div v-if="importResult.skipped">{{ importResult.skipped }} 条格式无法解析</div>
                </template>
            </div>
            <div ref="importActions" class="sheet-actions import-actions">
                <van-button @click="importing = false">{{ excelApplied || importResult?.matched?.length ? '完成' : '取消' }}</van-button>
                <van-button type="primary" :disabled="busy" @click="importPrices">识别并导入</van-button>
            </div>
        </WorkSheet>

        <article class="print-only">
            <h1>卷烟差价计算表</h1><p>{{ printDate }} · 单位为元、条</p>
            <table><thead><tr><th>品牌</th><th>标签</th><th>批发价</th><th>市场价</th><th>数量</th><th>差价</th></tr></thead>
                <tbody><template v-for="row in rows" :key="row.brand.id"><tr v-if="row.result">
                    <td>{{ row.brand.name }}</td><td>{{ row.brand.tags.join('、') }}</td><td>{{ row.values.wholesale }}</td>
                    <td>{{ row.values.market }}</td><td>{{ row.values.quantity }}</td><td>{{ money(row.result.profit) }}</td>
                </tr></template></tbody>
            </table>
            <p>总成本 {{ money(printTotals.cost) }}　市场价合计 {{ money(printTotals.revenue) }}　利润差价 {{ money(printTotals.profit) }}</p>
        </article>
    </section>
</template>
