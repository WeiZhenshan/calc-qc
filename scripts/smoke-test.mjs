import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:8080';
const pass = 'calc-qc-smoke-password';
const nonce = randomUUID().slice(0, 12);

function client() {
    const cookies = new Map();

    async function send(path, { method = 'GET', body, user, token = true } = {}) {
        const headers = {};
        if (user !== undefined) headers['X-Workspace-User'] = String(user);
        if (method !== 'GET' && token) {
            const csrf = await send('/api/auth/csrf');
            assert.equal(csrf.status, 200);
            const { headerName, token: value } = await csrf.json();
            headers[headerName] = value;
        }
        if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => key + '=' + value).join('; ');
        if (body !== undefined && !(body instanceof URLSearchParams)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }
        const res = await fetch(base + path, { method, headers, body });
        for (const value of res.headers.getSetCookie()) {
            const cookie = value.slice(0, value.indexOf(';'));
            const split = cookie.indexOf('=');
            cookies.set(cookie.slice(0, split), cookie.slice(split + 1));
        }
        return res;
    }
    return send;
}

async function expect(response, status) {
    assert.equal(response.status, status, await response.clone().text());
    return response;
}

async function registerAndLogIn(send, username) {
    const body = { username, password: pass };
    await expect(await send('/api/auth/register', { method: 'POST', body }), 201);
    await expect(await send('/api/auth/login', {
        method: 'POST', body: new URLSearchParams({ ...body, password: 'wrong-password' }),
    }), 401);
    await expect(await send('/api/auth/login', {
        method: 'POST', body: new URLSearchParams({ ...body, username: username.toUpperCase() }),
    }), 204);
    return (await expect(await send('/api/auth/me'), 200)).json();
}

const a = client(), b = client();
const app = await expect(await a('/'), 200);
assert.match(await app.text(), /差价计算器/);
const worker = await expect(await a('/sw.js'), 200);
const files = JSON.parse((await worker.text()).match(/const precache = (\[.*?\]);/)[1]);
assert.ok(files.includes('/index.html') && files.includes('/manifest.json') && files.some(file => file.endsWith('.js')));
for (const file of files) {
    assert.ok(file.startsWith('/') && !file.startsWith('//'));
    await expect(await a(file), 200);
}
await expect(await a('/api/workspace'), 401);
await expect(await a('/api/auth/register', { method: 'POST', token: false, body: { username: 'invalid', password: pass } }), 403);

const alice = await registerAndLogIn(a, 'a-' + nonce);
const bob = await registerAndLogIn(b, 'b-' + nonce);
const initial = (await (await expect(await a('/api/workspace', { user: alice.id }), 200)).json()).catalog;
const other = (await (await expect(await b('/api/workspace', { user: bob.id }), 200)).json()).catalog;
assert.equal(initial.brands.length, 44);
assert.equal(other.brands.length, 44);
assert.notEqual(initial.brands[0].id, other.brands[0].id);
await expect(await b('/api/workspace', { user: alice.id }), 403);

// Provision only this run's freshly registered fixture, using the isolated test database.
function assignFixtureRole(role) {
    const database = new URL((process.env.DB_URL || 'jdbc:mysql://127.0.0.1:3306/calc_qc').replace(/^jdbc:/, ''));
    execFileSync('mysql', ['--protocol=TCP', '-h', database.hostname, '-P', database.port || '3306',
        '-u', process.env.DB_USER || 'calc_qc', database.pathname.slice(1)], {
        env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
        input: `UPDATE app_user SET account_role = '${role}' WHERE id = ${alice.id} AND username = 'a-${nonce}';`,
    });
}
assert.deepEqual(alice, { id: alice.id, username: 'a-' + nonce, role: 'MERCHANT' });
const firstRow = { brandId: initial.brands[0].id, market: '151', quantity: '2', hidden: false };
const merchantWrite = { user: alice.id, method: 'PUT' };
await expect(await a('/api/workspace/catalog', { ...merchantWrite, body: initial }), 403);
await expect(await a('/api/workspace/backup', { ...merchantWrite, body: { catalog: initial, snapshot: null } }), 403);
await expect(await a('/api/workspace/snapshot', { ...merchantWrite, body: { items: [firstRow] } }), 200);
const hiddenSnapshot = { items: [{ ...firstRow, hidden: true }] };
await expect(await a('/api/workspace/snapshot', { ...merchantWrite, body: hiddenSnapshot }), 403);
assignFixtureRole('ACCOUNT_MANAGER');
assert.equal((await (await a('/api/auth/me')).json()).role, 'ACCOUNT_MANAGER');
await expect(await a('/api/workspace/snapshot', { ...merchantWrite, body: hiddenSnapshot }), 403);
await expect(await a('/api/workspace/backup', { ...merchantWrite, body: { catalog: initial, snapshot: hiddenSnapshot } }), 403);

const tag = '测试';
const brand = { id: randomUUID(), name: '验收品牌', wholesale: 100.56, market: 145.12, tags: [tag] };
const catalog = { ...initial, tags: [tag], brands: [brand, ...initial.brands.slice().reverse()] };
const updated = await (await expect(await a('/api/workspace/catalog', { user: alice.id, method: 'PUT', body: catalog }), 200)).json();
assert.equal(updated.revision, initial.revision + 1);
await expect(await a('/api/workspace/catalog', { user: alice.id, method: 'PUT', body: catalog }), 409);

const item = { brandId: brand.id, wholesale: '100', market: '151', quantity: '3', hidden: false };
const snapshot = { items: [item] };
await expect(await b('/api/workspace/snapshot', { user: bob.id, method: 'PUT', body: snapshot }), 409);
await expect(await a('/api/workspace/snapshot', { user: alice.id, method: 'PUT', body: snapshot }), 200);
assignFixtureRole('ADMIN');
assert.equal((await (await a('/api/auth/me')).json()).role, 'ADMIN');
await expect(await a('/api/workspace/snapshot', { ...merchantWrite, body: { items: [{ ...item, hidden: true }] } }), 200);
await expect(await a('/api/workspace/snapshot', { ...merchantWrite, body: snapshot }), 200);

const state = await (await expect(await a('/api/workspace', { user: alice.id }), 200)).json();
assert.equal(state.catalog.brands[0].id, brand.id);
assert.deepEqual(state.catalog.brands[0].tags, [tag]);
assert.deepEqual(state.snapshot.items, [item]);

const invalidBackup = { catalog: { ...updated, brands: [] }, snapshot };
await expect(await a('/api/workspace/backup', { user: alice.id, method: 'PUT', body: invalidBackup }), 409);
const afterFailure = await (await expect(await a('/api/workspace', { user: alice.id }), 200)).json();
assert.deepEqual(afterFailure, state);
const imported = { catalog: { ...updated, brands: updated.brands.slice().reverse() }, snapshot };
await expect(await a('/api/workspace/backup', { user: alice.id, method: 'PUT', body: imported }), 200);
await expect(await a('/api/workspace/snapshot', { user: alice.id, method: 'DELETE' }), 204);
assert.equal((await (await a('/api/workspace', { user: alice.id })).json()).snapshot, null);
await expect(await a('/api/auth/logout', { method: 'POST' }), 204);
await expect(await a('/api/workspace', { user: alice.id }), 401);
assert.deepEqual((await (await b('/api/workspace', { user: bob.id })).json()).catalog, other);

console.log('静态资源和离线清单、注册登录退出、CSRF、用户隔离、品牌版本冲突、快照和备份回滚验证通过。');
