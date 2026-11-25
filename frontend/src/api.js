export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const pagesBuild = import.meta.env.MODE === 'pages';
const apiBase = (import.meta.env.VITE_API_BASE_URL || (pagesBuild ? '' : '/api')).replace(/\/+$/, '');

async function request(path, { method = 'GET', data, user } = {}) {
    if (pagesBuild && !/^https:\/\//i.test(apiBase)) {
        throw new ApiError(503, '本站尚未接入 HTTPS 后端，暂时无法登录或注册。');
    }
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
        response = await fetch(apiBase + path, { method, headers, body, cache: 'no-store', credentials: 'include' });
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
