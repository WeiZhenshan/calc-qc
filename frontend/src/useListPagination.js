import { computed, nextTick, ref, watch } from 'vue';

export function useListPagination(rows, resetOn) {
    const pageSize = 10;
    const page = ref(1);
    const listStart = ref(null);
    const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize)));
    const pageRows = computed(() => rows.value.slice((page.value - 1) * pageSize, page.value * pageSize));

    watch(resetOn, () => { page.value = 1; });
    watch(pageCount, count => { page.value = Math.min(page.value, count); });

    async function readPage() {
        await nextTick();
        listStart.value?.focus({ preventScroll: true });
        listStart.value?.scrollIntoView({ block: 'nearest' });
    }

    return { page, pageCount, pageRows, listStart, readPage };
}
