export function rowValues(brand, draft = {}) {
    return {
        wholesale: draft.wholesale ?? brand.wholesale,
        market: draft.market ?? brand.market ?? '',
        quantity: draft.quantity ?? 1,
    };
}

export function calculateRow(brand, draft) {
    const values = rowValues(brand, draft);
    const wholesale = Number.parseFloat(values.wholesale);
    const market = Number.parseFloat(values.market);
    const quantity = Number.parseInt(values.quantity, 10);
    if (![wholesale, market, quantity].every(n => Number.isFinite(n) && n > 0)) return null;
    const cost = wholesale * quantity;
    const revenue = market * quantity;
    const profit = (market - wholesale) * quantity;
    return [cost, revenue, profit].every(Number.isFinite) ? { cost, revenue, profit } : null;
}

export function summarize(brands, draft) {
    const summary = { cost: 0, revenue: 0, profit: 0, count: 0 };
    for (const brand of brands) {
        if (draft[brand.id]?.hidden) continue;
        const result = calculateRow(brand, draft[brand.id]);
        if (!result) continue;
        summary.cost += result.cost;
        summary.revenue += result.revenue;
        summary.profit += result.profit;
        summary.count++;
    }
    return summary;
}

export function draftFromSnapshot(snapshot) {
    return Object.fromEntries((snapshot?.items ?? []).map(({ brandId, ...fields }) => [brandId, fields]));
}

export function snapshotFromDraft(brands, draft) {
    const items = brands.flatMap(brand => {
        const item = draft[brand.id];
        if (!item) return [];
        const { wholesale = null, market = null, quantity = null, hidden = false } = item;
        if (wholesale === null && market === null && quantity === null && !hidden) return [];
        return [{ brandId: brand.id, wholesale, market, quantity, hidden }];
    });
    return { savedAt: new Date().toISOString(), items };
}

export function restrictSnapshot(snapshot, brands) {
    if (!snapshot) return null;
    const ids = new Set(brands.map(brand => brand.id));
    return { ...snapshot, items: snapshot.items.filter(item => ids.has(item.brandId)) };
}

export const money = value => `¥${value.toFixed(2)}`;
