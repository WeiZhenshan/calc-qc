<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { readExcelRows } from './readExcelRows.js';

const props = defineProps({ disabled: Boolean, buttonTarget: Object, applyRows: { type: Function, required: true }, saveHint: String });
const picker = ref(null);
const reading = ref(false);
const message = ref('');
const issues = ref([]);
let active = true;
onBeforeUnmount(() => { active = false; });

async function chooseFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || reading.value || props.disabled) return;
    reading.value = true;
    message.value = '';
    issues.value = [];
    try {
        const rows = await readExcelRows(file);
        if (!active || props.disabled) return;
        const result = props.applyRows(rows);
        issues.value = result.issues;
        message.value = result.prices.size
            ? `已填入 ${result.prices.size} 个品牌的市场价。${props.saveHint}`
            : '没有可更新的市场价。';
    } catch (error) {
        message.value = error.message;
    } finally {
        reading.value = false;
    }
}
</script>

<template>
    <Teleport :to="buttonTarget || 'body'" :disabled="!buttonTarget">
        <van-button native-type="button" icon="upgrade" :loading="reading" :disabled="disabled"
            @click="picker.click()">上传 Excel</van-button>
    </Teleport>
    <input ref="picker" type="file" hidden accept=".xlsx" @change="chooseFile">
    <div v-if="message" class="import-result" role="status">
        {{ message }}
        <details v-if="issues.length"><summary>查看 {{ issues.length }} 条提示</summary>
            <div v-for="issue in issues" :key="issue">{{ issue }}</div>
        </details>
    </div>
</template>
