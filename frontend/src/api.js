export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function request(path, { method = 'GET', data, user } = {}) {
    const headers = { Accept: 'application/json' };
    if (user !== undefined) headers['X-Workspace-User'] = String(user);
    if (method !== 'GET') {
        const csrf = await request('/auth/csrf');
        headers[csrf.headerName] = csrf.token;
    }

    let body;
    if (data instanceof URLSearchParams) {
        body = data;
    } else if (data !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(data);
    }

    let response;
    try {
        response = await fetch('/api' + path, { method, headers, body, cache: 'no-store', credentials: 'same-origin' });
    } catch {
        throw new ApiError(0, '服务器不可达');
    }
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const messages = { 401: '请重新登录', 403: '请求校验失败，请重试', 409: '数据已改变，请重新加载' };
        throw new ApiError(response.status, error.message || messages[response.status] || '请求失败，请重试');
    }
    return response.status === 204
        ? null
        : response.headers.get('Content-Type')?.includes('application/json') ? response.json() : null;
}

export const api = {
    me: () => request('/auth/me'),
    register: data => request('/auth/register', { method: 'POST', data }),
    login: data => request('/auth/login', { method: 'POST', data: new URLSearchParams(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    load: user => request('/workspace', { user }),
    catalog: (user, data) => request('/workspace/catalog', { method: 'PUT', data, user }),
    snapshot: (user, data) => data
        ? request('/workspace/snapshot', { method: 'PUT', data, user })
        : request('/workspace/snapshot', { method: 'DELETE', user }),
    backup: (user, data) => request('/workspace/backup', { method: 'PUT', data, user }),
};
