export const roleNames = {
    MERCHANT: '商户',
    ACCOUNT_MANAGER: '客户经理',
    ADMIN: '管理员',
};

export function canEditCatalog(role) {
    return role === 'ACCOUNT_MANAGER' || role === 'ADMIN';
}

export function canRemoveRows(role) {
    return role === 'ADMIN';
}
