import assert from 'node:assert/strict';
import test from 'node:test';
import { matchMarketPriceRows } from '../src/brands.js';

const brands = [{ name: '中华(硬)' }, { name: '中华(软)' }, { name: 'A 10' }];

test('Excel 按名称或别名匹配，保留小数，重复行以最后一个有效价格为准', () => {
    const { prices, issues } = matchMarketPriceRows([
        [], ['品牌名', '市场价'], ['软中华', 700.125], ['中华（硬）', '460.52'],
        ['中华(软)', '710.11'], ['A 10', 101],
    ], brands);
    assert.deepEqual([...prices], [[1, 710.11], [0, 460.52], [2, 101]]);
    assert.equal(issues.length, 1);
});

test('无表头、未知品牌、同名项及非价格单元格', () => {
    const { prices, issues } = matchMarketPriceRows([
        ['A 10', 123], ['中华', 900], ['软中华', 800], ['硬中华', '12元'],
        ['硬中华', true], ['硬中华', -5], ['硬中华', 3, 50], ['硬中华', 0.0000001],
    ], [...brands, { name: '中华（软）' }]);
    assert.deepEqual([...prices], [[2, 123]]);
    assert.equal(issues.length, 7);
});

test('错误表头和空工作簿给出提示', () => {
    for (const rows of [[['品牌名', '批发价']], [['市场价', '品牌名']], [['品牌名', '市场价', '数量']]]) {
        assert.throws(() => matchMarketPriceRows(rows, brands), /两列/);
    }
    assert.throws(() => matchMarketPriceRows([['品牌名', '市场价']], brands), /没有价格数据/);
});
