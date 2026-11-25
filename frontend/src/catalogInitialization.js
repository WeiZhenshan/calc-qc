import { newBrandId, validCatalogPrice } from './brands.js';

const brandKey = name => name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

export function initializeCatalog(rows, catalog) {
    const required = ['卷烟名称', '厂家简称', '批发指导价'];
    const headerIndex = rows.findIndex(row => row?.some(cell => cell != null && cell !== ''));
    const header = (rows[headerIndex] || []).map(cell => String(cell ?? '').trim());
    if (!required.every(title => header.filter(cell => cell === title).length === 1)) {
        throw new Error('请上传包含「卷烟名称」「厂家简称」「批发指导价」列的商品信息列表。');
    }
    const [nameColumn, tagColumn, priceColumn] = required.map(title => header.indexOf(title));
    const imports = new Map();
    const issues = [];
    rows.slice(headerIndex + 1).forEach((row, index) => {
        if (!row || row.every(cell => cell == null || cell === '')) return;
        const name = typeof row[nameColumn] === 'string' ? row[nameColumn].trim() : '';
        const maker = typeof row[tagColumn] === 'string' ? row[tagColumn].trim() : '';
        const raw = row[priceColumn];
        const wholesale = typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : raw;
        const line = headerIndex + index + 2;
        if (!name || name.length > 120 || !validCatalogPrice(wholesale) ||
                maker.length > 12 || (row[tagColumn] != null && typeof row[tagColumn] !== 'string')) {
            issues.push(`第 ${line} 行：名称、批发指导价或厂家简称无效`);
            return;
        }
        const key = brandKey(name);
        const entry = imports.get(key) || { name, tags: new Set(), wholesale };
        if (entry.wholesale !== wholesale) issues.push(`第 ${line} 行「${name}」重复，采用本行批发价`);
        entry.wholesale = wholesale;
        if (maker) entry.tags.add(maker);
        imports.set(key, entry);
    });

    const brands = [...catalog.brands];
    const tags = new Set(catalog.tags);
    const indices = new Map();
    brands.forEach((brand, index) => {
        const key = brandKey(brand.name);
        indices.set(key, indices.has(key) ? null : index);
    });
    let added = 0, updated = 0;
    for (const [key, item] of imports) {
        const index = indices.get(key);
        if (index === null) {
            issues.push(`「${item.name}」在品牌库中重名，已跳过`);
            continue;
        }
        for (const tag of item.tags) tags.add(tag);
        if (index === undefined) {
            brands.push({ id: newBrandId(), name: item.name, wholesale: item.wholesale, market: null, tags: [...item.tags] });
            added++;
        } else {
            const old = brands[index];
            const mergedTags = [...new Set([...old.tags, ...item.tags])];
            if (Number(old.wholesale) !== item.wholesale || mergedTags.length !== old.tags.length) {
                brands[index] = { ...old, wholesale: item.wholesale, tags: mergedTags };
                updated++;
            }
        }
    }
    if (brands.length > 5000 || tags.size > 500) throw new Error('合并结果超过品牌库上限（5000 个品牌、500 个标签）。');
    return { catalog: { ...catalog, brands, tags: [...tags] }, added, updated, newTags: tags.size - catalog.tags.length, issues };
}
