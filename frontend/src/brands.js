import brandAliases from '../../docs/data/brand-aliases.json' with { type: 'json' };

// ---- 品牌索引 ----
export function buildBrandIndex(brands) {
    return new Map(brands.map((brand, index) => [normalizeText(brand.name), index]));
}

const aliases = Object.entries(brandAliases).map(([alias, target]) => [
    normalizeText(alias), normalizeText(target),
]);

// ---- 文本标准化 ----
function normalizeText(text) {
    if (!text) return '';
    return text
        .replace(/（/g, '(').replace(/）/g, ')')
        .replace(/【/g, '[').replace(/】/g, ']')
        .replace(/《/g, '<').replace(/》/g, '>')
        .replace(/０/g, '0').replace(/１/g, '1').replace(/２/g, '2')
        .replace(/３/g, '3').replace(/４/g, '4').replace(/５/g, '5')
        .replace(/６/g, '6').replace(/７/g, '7').replace(/８/g, '8').replace(/９/g, '9')
        .replace(/：/g, ':').replace(/，/g, ',').replace(/；/g, ';')
        .replace(/！/g, '!').replace(/？/g, '?').replace(/。/g, '.')
        .replace(/　/g, ' ')
        .replace(/\s+/g, '')
        .toLowerCase();
}

function stripBrackets(text) {
    return text.replace(/[(\[{<].*?[)\]}>]/g, '').replace(/[（【《].*?[）】》]/g, '');
}

function extractKeywords(name) {
    const c = normalizeText(name).replace(/[()\[\]{}（）【】]/g, ' ');
    return c.split(/\s+/).filter(k => k.length >= 2);
}

// ---- 品牌匹配（多策略） ----
export function matchBrand(text, brands, index = buildBrandIndex(brands)) {
    if (!text || !brands.length) return null;
    const t = normalizeText(text);
    if (!t) return null;
    const tNoBr = stripBrackets(t);

    // 1. 查别名表
    for (const [alias, target] of aliases) {
        if (alias === t || alias === tNoBr) {
            const idx = index.get(target);
            if (idx !== undefined) return idx;
        }
    }

    // 2. 精确匹配
    if (index.has(t)) return index.get(t);

    // 3. 去括号匹配
    for (let i = 0; i < brands.length; i++) {
        const n = normalizeText(brands[i].name);
        if (tNoBr === stripBrackets(n) && tNoBr.length >= 2) return i;
    }

    // 4. 包含匹配
    let best = null, bestScore = 0;
    for (let i = 0; i < brands.length; i++) {
        const n = normalizeText(brands[i].name);
        const nNoBr = stripBrackets(n);
        for (const [a, b] of [[t, n], [tNoBr, nNoBr]]) {
            if (a.includes(b) || b.includes(a)) {
                const s = Math.min(a.length, b.length) / Math.max(a.length, b.length);
                if (s > bestScore) { bestScore = s; best = i; }
            }
        }
    }
    if (bestScore >= 0.5) return best;

    // 5. 关键词匹配
    const ikw = extractKeywords(text);
    if (ikw.length >= 2) {
        for (let i = 0; i < brands.length; i++) {
            const bkw = extractKeywords(brands[i].name);
            const m = ikw.filter(ik => bkw.some(bk => bk.includes(ik) || ik.includes(bk)));
            const s = m.length / Math.max(ikw.length, bkw.length);
            if (s >= 0.6 && s > bestScore) { bestScore = s; best = i; }
        }
    }
    if (bestScore >= 0.6) return best;

    // 6. 长关键词
    if (ikw.length === 1 && ikw[0].length >= 3) {
        for (let i = 0; i < brands.length; i++) {
            if (normalizeText(brands[i].name).includes(ikw[0])) return i;
        }
    }

    return bestScore >= 0.5 ? best : null;
}

// File imports update prices only when a name or known alias identifies one catalog entry.
export function matchMarketPriceRows(rows, brands) {
    const byName = new Map();
    brands.forEach((brand, index) => {
        const key = normalizeText(brand.name);
        byName.set(key, byName.has(key) ? null : index);
    });
    const byAlias = new Map(aliases);
    const prices = new Map();
    const issues = [];
    let first = true;
    for (const [offset, row] of rows.entries()) {
        if (!row || row.every(cell => cell == null || cell === '')) continue;
        const [rawName, rawPrice, ...extra] = row;
        const name = typeof rawName === 'string' || typeof rawName === 'number' ? String(rawName).trim() : '';
        if (first && ['品牌', '品牌名', '品牌名称', '市场价'].includes(name) && !Number.isFinite(Number(rawPrice))) {
            if (name === '市场价' || rawPrice !== '市场价' || extra.some(cell => cell != null && cell !== '')) {
                throw new Error('请按「品牌名、市场价」两列填写 Excel。');
            }
            first = false;
            continue;
        }
        first = false;
        const line = `第 ${offset + 1} 行`;
        const market = typeof rawPrice === 'string' && /^\d+(?:\.\d+)?$/.test(rawPrice.trim())
            ? Number(rawPrice) : rawPrice;
        if (!name || !validCatalogPrice(market) || extra.some(cell => cell != null && cell !== '')) {
            issues.push(`${line}：请填写品牌名和有效市场价两列`);
            continue;
        }
        const key = normalizeText(name);
        const index = byName.has(key) ? byName.get(key) : byName.get(byAlias.get(key));
        if (index == null) {
            issues.push(`${line}「${name}」：${index === null ? '品牌重名，无法确定' : '未匹配到品牌'}`);
            continue;
        }
        if (prices.has(index)) issues.push(`${line}「${name}」重复，采用本行价格`);
        prices.set(index, market);
    }
    if (!prices.size && !issues.length) throw new Error('第一张工作表中没有价格数据。');
    return { prices, issues };
}

// ---- 行解析 ----
export function parseLine(line) {
    let cleaned = line.replace(/[¥￥元]/g, '').replace(/条/g, '').trim();
    if (!cleaned) return null;

    let parts;
    if (cleaned.includes('\t')) {
        parts = cleaned.split('\t').map(p => p.trim()).filter(p => p);
    } else if (cleaned.includes(',')) {
        parts = cleaned.split(',').map(p => p.trim()).filter(p => p);
    } else if (cleaned.includes('，')) {
        parts = cleaned.split('，').map(p => p.trim()).filter(p => p);
    } else {
        parts = cleaned.split(/[\s]{2,}/).filter(p => p);
        if (parts.length < 2) parts = cleaned.split(/\s+/).filter(p => p);
    }
    if (parts.length < 2) return null;

    let numbers = [], textParts = [];
    parts.forEach(p => {
        const num = parseFloat(p);
        if (!isNaN(num) && num > 0 && num < 10000) numbers.push(num);
        else textParts.push(p);
    });
    if (numbers.length === 0) return null;

    const brandText = textParts.length > 0 ? textParts.join(' ') : (numbers.length >= 2 ? parts[0] : null);
    if (!brandText) return null;

    let wholesale = null, market;
    if (numbers.length >= 2) { wholesale = numbers[0]; market = numbers[1]; }
    else { market = numbers[0]; }

    return { brandText, wholesale, market };
}

// ---- 导出品牌库为文本 ----
export function brandsToText(brands) {
    return brands.map(b => {
        const mkt = b.market != null ? ` ${b.market}` : '';
        return `${b.name} ${b.wholesale}${mkt}`;
    }).join('\n');
}

// ---- 解析文本为品牌库 ----
export function textToBrands(text) {
    const lines = text.split(/[\n\r]+/).filter(l => l.trim());
    const brands = [];
    const errors = [];

    lines.forEach((line, i) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) {
            errors.push(`第${i + 1}行格式错误`);
            return;
        }
        let wholesale = parseFloat(parts[parts.length - 1]);
        let name, market;

        if (parts.length >= 3) {
            const mp = parseFloat(parts[parts.length - 1]);
            const wp = parseFloat(parts[parts.length - 2]);
            if (!isNaN(wp) && !isNaN(mp)) {
                name = parts.slice(0, -2).join(' ');
                wholesale = wp;
                market = mp;
            } else {
                name = parts.slice(0, -1).join(' ');
            }
        } else {
            name = parts.slice(0, -1).join(' ');
        }

        if (!name || name.length > 120 || !validCatalogPrice(wholesale)) {
            errors.push(`第${i + 1}行无法解析`);
            return;
        }

        const brand = { name, wholesale };
        if (market > 0 && !validCatalogPrice(market)) {
            errors.push(`第${i + 1}行市场价超出范围`);
            return;
        }
        if (market > 0) brand.market = market;
        brands.push(brand);
    });

    return { brands, errors };
}

export function validCatalogPrice(value) {
    return Number.isFinite(value) && value > 0 && value < 1e9
        && Number(value.toFixed(6)) === value;
}

export function newBrandId() {
    if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const id = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-');
}

// Match occurrences by name so reordering retains each brand's stable ID and tags.
export function retainBrandIdentity(parsed, current) {
    const byName = new Map();
    current.forEach(brand => {
        if (!byName.has(brand.name)) byName.set(brand.name, []);
        byName.get(brand.name).push(brand);
    });
    return parsed.map(brand => {
        const old = byName.get(brand.name)?.shift();
        return { ...brand, market: brand.market ?? null, id: old?.id ?? newBrandId(), tags: old?.tags ?? [] };
    });
}
