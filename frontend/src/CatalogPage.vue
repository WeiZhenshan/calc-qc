<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { initializeCatalog } from './catalogInitialization.js';
import { readExcelRows } from './readExcelRows.js';
import { useListPagination } from './useListPagination.js';
import ExcelPriceUpload from './ExcelPriceUpload.vue';
import WorkSheet from './WorkSheet.vue';
import { brandsToText, matchMarketPriceRows, retainBrandIdentity, textToBrands } from './brands.js';

const props = defineProps({
    active: Boolean, busy: Boolean, catalog: Object, saveCatalog: Function,
    exportBackup: Function, importBackup: Function, legacyAvailable: Boolean, importLegacy: Function,
    notify: Function,
});

const text = ref('');
const newTag = ref('');
const openTag = ref('');
const tagSearch = ref('');
const filePicker = ref(null);
const initPicker = ref(null);
const initializing = ref(false);
const initResult = ref(null);
const editingTagsFor = ref(null);
const tagQuery = ref('');
const tagBrand = computed(() => props.catalog.brands.find(brand => brand.id === editingTagsFor.value));
const tagSheetOpen = computed({
    get: () => Boolean(tagBrand.value),
    set: open => { if (!open) editingTagsFor.value = null; },
});
const selectableTags = computed(() => props.catalog.tags.filter(tag => tag.includes(tagQuery.value.trim())));
let mounted = true;
onBeforeUnmount(() => { mounted = false; });
const tagItems = ref([]);

const section = ref('brands');
const search = ref('');
const editing = ref(false);
const editActions = ref(null);
const editBase = ref('');
let excelDraft = null;
const sections = [
    { id: 'brands', name: '品牌列表', icon: 'apps-o' },
    { id: 'tags', name: '标签管理', icon: 'label-o' },
    { id: 'backup', name: '数据备份', icon: 'exchange' },
];
const catalogRows = computed(() => props.catalog.brands.filter(brand =>
    brand.name.toLowerCase().includes(search.value.trim().toLowerCase())));
const { page, pageCount, pageRows, listStart, readPage } = useListPagination(catalogRows, search);

const textFromCatalog = computed(() => brandsToText(props.catalog.brands));
const counts = computed(() => {
    const result = new Map();
    props.catalog.brands.forEach(brand => brand.tags.forEach(tag => result.set(tag, (result.get(tag) || 0) + 1)));
    return result;
});
const assignmentBrands = computed(() => {
    const query = tagSearch.value.trim().toLowerCase();
    return props.catalog.brands.filter(brand => brand.name.toLowerCase().includes(query));
});

function resetEditor() {
    excelDraft = null;
    editBase.value = textFromCatalog.value;
    text.value = editBase.value;
}

watch(textFromCatalog, () => {
    if (text.value === editBase.value) resetEditor();
}, { immediate: true });
watch(() => props.catalog.tags, tags => { if (!tags.includes(openTag.value)) openTag.value = ''; });

function editorBrands() {
    if (excelDraft?.text === text.value) return { brands: excelDraft.brands, errors: [] };
    if (text.value === textFromCatalog.value) return { brands: props.catalog.brands, errors: [] };
    return textToBrands(text.value);
}

function applyExcelRows(rows) {
    const { brands, errors } = editorBrands();
    if (errors.length) throw new Error('请先修正编辑框中的品牌数据：' + errors.join('，'));
    const result = matchMarketPriceRows(rows, brands);
    if (result.prices.size) {
        const updated = brands.map((brand, index) => result.prices.has(index)
            ? { ...brand, market: result.prices.get(index) } : brand);
        text.value = brandsToText(updated);
        excelDraft = { text: text.value, brands: updated };
    }
    return result;
}

async function saveText() {
    if (editBase.value !== textFromCatalog.value) return;
    if (!text.value.trim()) return props.notify('品牌列表不能为空，请使用清空品牌库');
    const { brands, errors } = editorBrands();
    if (errors.length) return props.notify(errors.join('，'));
    if (await props.saveCatalog({ ...props.catalog, brands: retainBrandIdentity(brands, props.catalog.brands) },
        `品牌库已保存（${brands.length} 个品牌）`)) {
        resetEditor();
        editing.value = false;
    }
}

async function clearCatalog() {
    if (!window.confirm('确定清空品牌库吗？品牌对应的标签分配和计算数据也会删除。')) return;
    if (await props.saveCatalog({ ...props.catalog, brands: [] }, '品牌库已清空')) {
        resetEditor();
        editing.value = false;
    }
}

function toggleTag(tag) {
    openTag.value = openTag.value === tag ? '' : tag;
    tagSearch.value = '';
}

async function addTag() {
    const name = newTag.value.trim();
    if (!name || props.catalog.tags.includes(name)) {
        return props.notify(name ? '标签已存在' : '请输入标签名');
    }
    if (await props.saveCatalog({ ...props.catalog, tags: [...props.catalog.tags, name] }, '标签已创建，请勾选品牌')) {
        newTag.value = '';
        openTag.value = name;
        tagSearch.value = '';
        await nextTick();
        tagItems.value.find(item => item.dataset.tag === name)?.scrollIntoView({ block: 'nearest' });
    }
}

async function deleteTag(tag) {
    if (!window.confirm(`确定删除标签「${tag}」吗？该标签将从所有品牌移除。`)) return;
    const brands = props.catalog.brands.map(brand => ({ ...brand, tags: brand.tags.filter(value => value !== tag) }));
    const tags = props.catalog.tags.filter(value => value !== tag);
    await props.saveCatalog({ ...props.catalog, brands, tags }, '标签已删除');
}

async function assign(brand, tag) {
    const tags = brand.tags.includes(tag) ? brand.tags.filter(value => value !== tag) : [...brand.tags, tag];
    const brands = props.catalog.brands.map(value => value.id === brand.id ? { ...brand, tags } : value);
    await props.saveCatalog({ ...props.catalog, brands });
}

async function importInitialization(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || initializing.value || props.busy) return;
    initializing.value = true;
    initResult.value = null;
    try {
        const rows = await readExcelRows(file);
        if (!mounted) return;
        const { catalog, added, updated, newTags, issues } = initializeCatalog(rows, props.catalog);
        let message = issues.length ? '没有需要写入的有效变更。' : '没有需要写入的变更。';
        if (added || updated || newTags) {
            message = `新增 ${added} 个品牌，更新 ${updated} 个品牌，新增 ${newTags} 个标签。`;
            if (!await props.saveCatalog(catalog, '初始化数据已保存')) return;
        }
        initResult.value = { message, issues };
    } catch (error) {
        initResult.value = { message: error.message, issues: [] };
    } finally {
        initializing.value = false;
    }
}

function openBrandTags(brand) {
    tagQuery.value = '';
    editingTagsFor.value = brand.id;
}

async function chooseFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
        await props.importBackup(JSON.parse(await file.text()));
    } catch (error) {
        props.notify(error instanceof SyntaxError ? '无法读取 JSON 备份文件' : error.message);
    }
}
</script>

<template>
    <section v-show="active" id="page-brands" role="tabpanel" aria-labelledby="tab-brands">
        <header class="page-head">
            <h1>品牌库</h1>
            <div v-if="section === 'brands'" class="actions catalog-actions">
                <van-button type="primary" icon="edit" :disabled="busy" @click="editing = true">
                    {{ text === editBase ? '批量编辑' : '继续编辑' }}
                </van-button>
                <van-button icon="upgrade" :loading="initializing" :disabled="busy" @click="initPicker.click()">初始化数据</van-button>
                <input ref="initPicker" type="file" hidden accept=".xlsx" aria-label="上传初始化商品信息列表" @change="importInitialization">
            </div>
        </header>
        <div class="section-switch" role="group" aria-label="品牌库功能">
            <button v-for="item in sections" :key="item.id" type="button" :aria-pressed="section === item.id"
                @click="section = item.id"><van-icon :name="item.icon" aria-hidden="true" />{{ item.name }}</button>
        </div>
        <section v-if="section === 'brands'" class="ledger">
            <header class="section-head"><div class="section-title"><h2 ref="listStart" tabindex="-1">品牌列表</h2><span>{{ catalogRows.length }} 项</span></div></header>
            <div v-if="initResult" class="import-result init-result" role="status">
                {{ initResult.message }}
                <details v-if="initResult.issues.length"><summary>查看 {{ initResult.issues.length }} 条提示</summary>
                    <div v-for="(issue, index) in initResult.issues" :key="index">{{ issue }}</div>
                </details>
            </div>
            <div class="tools">
                <label class="sr-only" for="catalog-search">搜索品牌库</label>
                <van-search id="catalog-search" v-model="search" placeholder="搜索品牌名称" />
            </div>
            <div class="catalog-row catalog-labels"><span>品牌</span><span>标签</span><span>批发价</span><span>市场价</span></div>
            <div v-for="brand in pageRows" :key="brand.id" class="catalog-row">
                <div class="brand-info"><strong>{{ brand.name }}</strong></div>
                <button type="button" class="brand-tag-button" :aria-label="'编辑 ' + brand.name + ' 的标签'" @click="openBrandTags(brand)">
                    <van-icon name="label-o" aria-hidden="true" />{{ brand.tags.join('、') || '标签' }}
                </button>
                <span>{{ '¥' + brand.wholesale }}</span><span>{{ brand.market == null ? '—' : '¥' + brand.market }}</span>
            </div>
            <div v-if="!catalogRows.length" class="empty-state"><van-icon name="apps-o" /><p>{{ search ? '没有匹配的品牌' : '尚未添加品牌，可通过批量编辑录入' }}</p></div>
            <van-pagination v-if="pageCount > 1" v-model="page" :page-count="pageCount" mode="simple"
                class="catalog-pagination" aria-label="品牌列表分页" prev-text="上一页" next-text="下一页" @change="readPage">
                <template #pageDesc><span aria-live="polite">第 {{ page }} / {{ pageCount }} 页</span></template>
            </van-pagination>
        </section>
        <section v-else-if="section === 'tags'" class="ledger padded">
            <div class="section-title"><h2>标签管理</h2><span>{{ catalog.tags.length }} 项</span></div>
            <form class="inline-form" @submit.prevent="addTag">
                <input v-model.trim="newTag" aria-label="新标签名" placeholder="输入标签名称" maxlength="12" required>
                <van-button type="primary" native-type="submit" icon="plus" :disabled="busy">新建标签</van-button>
            </form>
            <p v-if="!catalog.tags.length" class="empty-state">创建标签后，可勾选品牌进行分组。</p>
            <div v-for="tag in catalog.tags" :key="tag" ref="tagItems" class="tag-group" :data-tag="tag">
                <div class="tag-head">
                    <button type="button" class="tag-toggle" :aria-expanded="openTag === tag" @click="toggleTag(tag)">
                        <van-icon name="label-o" /><strong>{{ tag }}</strong><span>{{ counts.get(tag) || 0 }} 个品牌</span>
                        <van-icon :name="openTag === tag ? 'arrow-up' : 'arrow-down'" />
                    </button>
                    <button type="button" class="remove" :aria-label="'删除标签 ' + tag" :disabled="busy" @click="deleteTag(tag)"><van-icon name="delete-o" /></button>
                </div>
                <div v-if="openTag === tag" class="assignments">
                    <label class="sr-only" for="assign-search">搜索标签内待分配品牌</label>
                    <van-search id="assign-search" v-model="tagSearch" placeholder="搜索要分配的品牌" />
                    <div class="assignment-list">
                        <button v-for="brand in assignmentBrands" :key="brand.id" type="button" class="option"
                            :disabled="busy" :aria-pressed="brand.tags.includes(tag)" @click="assign(brand, tag)">
                            {{ brand.name }}<van-icon aria-hidden="true" :name="brand.tags.includes(tag) ? 'checked' : 'circle'" />
                        </button>
                        <p v-if="!assignmentBrands.length" class="hint">没有匹配的品牌</p>
                    </div>
                </div>
            </div>
        </section>
        <section v-else class="ledger padded">
            <h2>数据备份</h2>
            <p class="hint">备份包含品牌、标签和当前计算，可用于换设备或恢复数据。</p>
            <button type="button" class="option" @click="exportBackup">导出 JSON 备份<van-icon name="down" /></button>
            <button type="button" class="option" :disabled="busy" @click="filePicker.click()">从 JSON 备份恢复<van-icon name="upgrade" /></button>
            <button v-if="legacyAvailable" type="button" class="option" :disabled="busy" @click="importLegacy">导入旧版本地数据<van-icon name="exchange" /></button>
            <input ref="filePicker" hidden type="file" accept=".json,application/json" @change="chooseFile">
        </section>
        <WorkSheet v-model="tagSheetOpen" :title="(tagBrand?.name || '') + '的标签'">
            <template v-if="tagBrand">
                <van-search v-model="tagQuery" placeholder="搜索标签" aria-label="搜索可分配标签" />
                <button v-for="tag in selectableTags" :key="tag" type="button" class="option" :aria-pressed="tagBrand.tags.includes(tag)"
                    :disabled="busy" @click="assign(tagBrand, tag)">
                    {{ tag }}<van-icon :name="tagBrand.tags.includes(tag) ? 'checked' : 'circle'" aria-hidden="true" />
                </button>
                <p v-if="!selectableTags.length" class="hint">{{ catalog.tags.length ? '没有匹配的标签' : '可在标签管理中新建标签。' }}</p>
            </template>
        </WorkSheet>
        <WorkSheet v-model="editing" title="批量编辑品牌">
            <form class="form-stack" @submit.prevent="saveText">
                <ExcelPriceUpload v-if="editing" :button-target="editActions" :disabled="busy || editBase !== textFromCatalog" :apply-rows="applyExcelRows"
                    save-hint="点击「保存品牌库」可保存。" />
                <p class="hint">每行输入「品牌名 批发价 市场价」，市场价可留空。</p>
                <textarea v-model="text" :disabled="busy" aria-label="品牌库文本" rows="9" placeholder="中华(硬) 381.0 450.0"></textarea>
                <p v-if="editBase !== textFromCatalog" role="alert" class="hint">品牌列表已更新。请先保留需要的草稿，再
                    <button class="text-button" type="button" @click="resetEditor">载入最新列表</button>。</p>
                <div ref="editActions" class="sheet-actions import-actions">
                    <button type="button" class="text-button danger" :disabled="busy" @click="clearCatalog">清空品牌库</button>
                    <van-button type="primary" native-type="submit" :disabled="busy || editBase !== textFromCatalog">保存品牌库</van-button>
                </div>
            </form>
        </WorkSheet>
    </section>
</template>
