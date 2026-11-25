<script setup>
import { ref, watch } from 'vue';

const props = defineProps({ title: String });
const open = defineModel({ type: Boolean });
const dialog = ref(null);

watch(open, value => {
    if (value) dialog.value.showModal();
    else dialog.value.close();
}, { flush: 'post' });
</script>

<template>
    <dialog ref="dialog" class="work-sheet" :aria-label="props.title" @close="open = false"
        @click="event => { if (event.target === dialog) open = false }">
        <div class="sheet-content">
            <header class="sheet-head">
                <h2>{{ title }}</h2>
                <van-button icon="cross" class="icon-button" aria-label="关闭" @click="open = false" />
            </header>
            <slot />
        </div>
    </dialog>
</template>
