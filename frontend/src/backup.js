import { newBrandId, validCatalogPrice } from './brands.js';
import { calculateRow, rowValues } from './calculation.js';

export function readLegacyStorage() {
    try {
        const catalog = localStorage.getItem('cigarette_calc_data_v3');
        const snapshot = localStorage.getItem('cigarette_calc_snapshot_v1');
        if (catalog === null) return null;
        return { ...JSON.parse(catalog), snapshot: JSON.parse(snapshot) };
    } catch {
        return null;
    }
}

function draftNumber(value) {
    return value == null ? null : String(value);
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const numberInput = /^(?:[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)?$/;
const validTag = tag => typeof tag === 'string' && tag.trim() && tag.length <= 12;
const validDraftNumber = (input, length) =>
    input == null || (typeof input === 'string' && input.length <= length && numberInput.test(input));

function checkedBackup(catalog, snapshot) {
    const tags = catalog.tags;
    if (!Array.isArray(tags) || tags.length > 500 || !tags.every(validTag) || new Set(tags).size !== tags.length) {
        throw new Error('备份中的标签列表无效');
    }
    const ids = new Set();
    if (catalog.brands.length > 5000) throw new Error('备份最多支持 5000 个品牌');
    const brands = catalog.brands.map(brand => {
        const { id, name, wholesale, market, tags: assigned } = brand ?? {};
        if (typeof id !== 'string' || !uuid.test(id) || ids.has(id.toLowerCase())
                || typeof name !== 'string' || !name.trim() || name.length > 120
                || !validCatalogPrice(wholesale) || (market != null && !validCatalogPrice(market))
                || !Array.isArray(assigned) || assigned.some(tag => !tags.includes(tag))
                || new Set(assigned).size !== assigned.length) {
            throw new Error('备份中的品牌或标签分配无效');
        }
        ids.add(id.toLowerCase());
        return { id: id.toLowerCase(), name, wholesale, market: market ?? null, tags: assigned };
    });
    if (snapshot == null) return { catalog: { ...catalog, brands }, snapshot: null };
    if (!Array.isArray(snapshot.items) || snapshot.items.length > ids.size) {
        throw new Error('备份中的计算快照无效');
    }
    const seen = new Set();
    const items = snapshot.items.map(item => {
        const { brandId, wholesale, market, quantity, hidden } = item ?? {};
        const id = typeof brandId === 'string' ? brandId.toLowerCase() : null;
        if (!ids.has(id) || seen.has(id) || typeof hidden !== 'boolean'
                || !validDraftNumber(wholesale, 32) || !validDraftNumber(market, 32)
                || !validDraftNumber(quantity, 16)) {
            throw new Error('备份中的快照品牌或价格无效');
        }
        seen.add(id);
        return { brandId: id, wholesale, market, quantity, hidden };
    });
    return { catalog: { ...catalog, brands }, snapshot: { items } };
}

export function parseBackup(data, revision) {
    if (data?.format === 'calc-qc-backup' && data.version === 1 && Array.isArray(data.catalog?.brands)) {
        return checkedBackup({ revision, tags: data.catalog.tags, brands: data.catalog.brands }, data.snapshot);
    }
    if (!Array.isArray(data?.brands)) throw new Error('无法识别该备份文件');
    const tags = [...new Set(Array.isArray(data.tags) ? data.tags : [])];
    const brands = data.brands.map((brand, index) => {
        const wholesale = Number(brand.wholesale);
        const market = brand.market != null && brand.market !== '' ? Number(brand.market) : null;
        if (typeof brand.name !== 'string' || !brand.name.trim() || !validCatalogPrice(wholesale)
                || (market !== null && !validCatalogPrice(market))) {
            throw new Error(`备份中第 ${index + 1} 个品牌的名称或价格无效`);
        }
        const assigned = data.brandTags?.[index];
        return {
            id: newBrandId(), name: brand.name, wholesale, market,
            tags: Array.isArray(assigned) ? [...new Set(assigned)].filter(tag => tags.includes(tag)) : [],
        };
    });

    const byName = new Map(brands.map(brand => [brand.name, brand.id]));
    const byId = new Map();
    if (data.snapshot != null && !Array.isArray(data.snapshot.items)) throw new Error('备份中的旧版快照无效');
    for (const item of data.snapshot?.items ?? []) {
        const brandId = byName.get(item.name);
        if (!brandId) continue;
        // The old format treated empty price values as “use the preset” on restoration.
        byId.set(brandId, {
            brandId,
            wholesale: item.wholesale === '' ? null : draftNumber(item.wholesale),
            market: item.market === '' ? null : draftNumber(item.market),
            quantity: Number.parseInt(item.qty, 10) > 0 ? String(Number.parseInt(item.qty, 10)) : null,
            hidden: Boolean(item.hidden),
        });
    }
    const snapshot = data.snapshot ? { items: [...byId.values()] } : null;
    return checkedBackup({ revision, tags, brands }, snapshot);
}

export function encodeBackup(catalog, snapshot) {
    return JSON.stringify({ format: 'calc-qc-backup', version: 1, catalog, snapshot }, null, 2);
}

function csvCell(value) {
    const text = String(value);
    return '"' + text.replaceAll('"', '""') + '"';
}

export function calculationCsv(brands, draft, summary) {
    const rows = [['品牌', '批发价(条)', '市场价(条)', '数量(条)', '单条差价', '小计差价']];
    for (const brand of brands) {
        if (draft[brand.id]?.hidden) continue;
        const result = calculateRow(brand, draft[brand.id]);
        if (!result) continue;
        const { wholesale, market, quantity } = rowValues(brand, draft[brand.id]);
        const name = /^[\s]*[=+@-]|^[\t\r\n]/.test(brand.name) ? "'" + brand.name : brand.name;
        rows.push([name, wholesale, market, quantity, (Number(market) - Number(wholesale)).toFixed(2),
            result.profit.toFixed(2)]);
    }
    rows.push([], ['总成本', summary.cost.toFixed(2)], ['市场价合计', summary.revenue.toFixed(2)],
        ['利润差价总和', summary.profit.toFixed(2)]);
    return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
