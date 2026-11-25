import test from 'node:test';
import assert from 'node:assert/strict';
import seeds from '../../docs/data/default-brands.json' with { type: 'json' };
import aliases from '../../docs/data/brand-aliases.json' with { type: 'json' };
import examples from '../../docs/data/legacy-ui-examples.json' with { type: 'json' };
import { buildBrandIndex, matchBrand, parseLine, retainBrandIdentity, textToBrands } from '../src/brands.js';
import { draftFromSnapshot, rowValues, snapshotFromDraft, summarize } from '../src/calculation.js';
import { calculationCsv, parseBackup } from '../src/backup.js';

test('旧版品牌、别名和页面示例可以完整解析', () => {
    assert.equal(seeds.length, 44);
    assert.equal(Object.keys(aliases).length, 88);
    const index = buildBrandIndex(seeds);
    for (const [alias, target] of Object.entries(aliases)) {
        assert.equal(seeds[matchBrand(alias, seeds, index)].name, target, alias);
    }
    assert.deepEqual(textToBrands(examples.brandEditor.slice(1).join('\n')).errors, []);
    for (const line of examples.priceImport) {
        const parsed = parseLine(line);
        assert.notEqual(matchBrand(parsed.brandText, seeds, index), null);
    }
    assert.deepEqual(parseLine('软中华\t700'), { brandText: '软中华', wholesale: null, market: 700 });
    assert.deepEqual(parseLine('中华（硬），381.0，400.0'), {
        brandText: '中华（硬）', wholesale: 381, market: 400,
    });
});

test('重排不会改变品牌 ID、标签和快照覆盖值', () => {
    const brands = [
        { id: 'a', name: '品牌甲', wholesale: 100, market: 150, tags: ['标签甲'] },
        { id: 'b', name: '品牌乙', wholesale: 200, market: 180, tags: [] },
    ];
    const draft = { a: { quantity: '2', market: '130' }, b: { hidden: true } };
    const snapshot = snapshotFromDraft(brands, draft);
    const sorted = retainBrandIdentity([...brands].reverse(), brands);
    assert.equal(sorted[1].id, 'a');
    assert.deepEqual(sorted[1].tags, ['标签甲']);
    assert.deepEqual(summarize(sorted, draftFromSnapshot(snapshot)), { cost: 200, revenue: 260, profit: 60, count: 1 });
    assert.equal(rowValues(sorted[1], { market: '' }).market, '');
    assert.equal(summarize(sorted, { a: { quantity: '' }, b: { hidden: true } }).count, 0);
});

test('旧版数组下标标签、品牌名快照及 CSV 导出可迁移', () => {
    const state = parseBackup({
        brands: [{ name: '中华(软)', wholesale: 583.5 }],
        tags: ['常用'],
        brandTags: { 0: ['常用'] },
        snapshot: { items: [{ name: '中华(软)', wholesale: '', market: '700.0', qty: '2', hidden: false }] },
    }, 3);
    const [brand] = state.catalog.brands;
    assert.equal(state.catalog.revision, 3);
    assert.deepEqual(brand.tags, ['常用']);
    assert.equal(state.snapshot.items[0].brandId, brand.id);
    const draft = draftFromSnapshot(state.snapshot);
    const totals = summarize(state.catalog.brands, draft);
    assert.equal(totals.profit, 233);
    const csv = calculationCsv(state.catalog.brands, draft, totals);
    assert.ok(csv.startsWith('\ufeff'));
    assert.ok(csv.includes('"中华(软)","583.5","700.0","2","116.50","233.00"'));
});

test('拒绝引用其他品牌的备份快照，避免写入离线队列', () => {
    const brand = {
        id: '00000000-0000-4000-8000-000000000001', name: '品牌', wholesale: 1, market: null, tags: [],
    };
    const data = {
        format: 'calc-qc-backup',
        version: 1,
        catalog: { brands: [brand], tags: [] },
        snapshot: { items: [{ brandId: '00000000-0000-4000-8000-000000000002', hidden: false }] },
    };
    assert.throws(() => parseBackup(data, 0), /快照品牌/);
});
