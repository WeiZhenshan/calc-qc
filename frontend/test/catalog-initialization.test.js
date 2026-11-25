import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeCatalog } from '../src/catalogInitialization.js';

const header = ['操作', '卷烟名称', '厂家简称', '品牌名称', '批发指导价'];
const catalog = { revision: 4, tags: ['手动'], brands: [
    { id: 'stable', name: '中华(硬)', wholesale: 381, market: 425, tags: ['手动'] },
    { id: 'other', name: '库外品牌', wholesale: 31, market: 50, tags: [] },
] };

test('初始化按品规增量更新，仅厂家简称生成标签，重复导入无变化', () => {
    const rows = [header,
        ['', '中华（硬）', '上海烟草', '中华', '381.60'],
        ['', '新品(软)', '进口烟', '新品', 40.5],
        ['', '新品（软）', '进口品牌(进口)', '新品', '40.50'],
    ];
    const result = initializeCatalog(rows, catalog);
    assert.deepEqual([result.added, result.updated, result.newTags], [1, 1, 3]);
    assert.deepEqual(result.catalog.brands[0], { ...catalog.brands[0], wholesale: 381.6, tags: ['手动','上海烟草'] });
    assert.deepEqual(result.catalog.brands[1], catalog.brands[1]);
    assert.equal(result.catalog.brands[2].market, null);
    assert.deepEqual(result.catalog.brands[2].tags, ['进口烟','进口品牌(进口)']);
    const again = initializeCatalog(rows, result.catalog);
    assert.deepEqual(again.catalog, result.catalog);
    assert.deepEqual([again.added, again.updated, again.newTags], [0,0,0]);
});

test('按表头定位，处理重名与坏价；市场价导入文件不适用于初始化', () => {
    assert.throws(() => initializeCatalog([['品牌名', '市场价']], catalog), /批发指导价/);
    const result = initializeCatalog([['批发指导价','厂家简称','卷烟名称'],
        [12, '厂家一', '中华(硬)'], [-5, '厂家二','坏价格'], [10.5, '', '新品牌']],
        { ...catalog, brands: [...catalog.brands,{ ...catalog.brands[0], id: 'duplicate' }] });
    assert.equal(result.issues.length, 2);
    assert.equal(result.added, 1);
    assert.equal(result.updated, 0);
    assert.equal(result.newTags, 0);
});
