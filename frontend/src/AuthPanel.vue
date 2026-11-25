<script setup>
import { ref } from 'vue';

const props = defineProps({ busy: Boolean, notice: String, authenticate: Function });
const mode = ref('login');
const usernamePattern = String.raw`[A-Za-z0-9_.\-]{3,32}`;
const username = ref('');
const password = ref('');
const reveal = ref(false);
const error = ref('');

function switchMode() {
    reveal.value = false;
    mode.value = mode.value === 'login' ? 'register' : 'login';
    error.value = '';
    password.value = '';
}

async function submit() {
    error.value = '';
    try {
        await props.authenticate(mode.value, { username: username.value, password: password.value });
    } catch (reason) {
        error.value = reason.message;
        password.value = '';
    }
}
</script>

<template>
    <main class="auth-layout">
        <div class="auth-shell">
            <section class="auth-preview" aria-label="差价计算示例">
                <div class="wordmark"><span class="brand-symbol" aria-hidden="true"></span>差价计算器</div>
                <div class="sample-receipt">
                    <div class="receipt-title"><van-icon name="orders-o" /> 单条试算示例</div>
                    <dl><div><dt>批发价</dt><dd>¥381.00</dd></div><div><dt>市场价</dt><dd>¥400.00</dd></div></dl>
                    <div class="receipt-total"><span>单条差价</span><strong>+¥19.00</strong></div>
                </div>
            </section>
            <section class="auth-form-panel">
                <h1>{{ mode === 'login' ? '登录工作区' : '创建账号' }}</h1>
                <p class="auth-intro">管理品牌价格，保存你的差价计算。</p>
                <form class="form-stack" @submit.prevent="submit">
                    <label>用户名
                        <input v-model.trim="username" type="text" autocomplete="username" required placeholder="输入用户名"
                            maxlength="32" :minlength="mode === 'register' ? 3 : undefined" :pattern="mode === 'register' ? usernamePattern : undefined"
                            autocapitalize="none" spellcheck="false">
                    </label>
                    <label>密码
                        <span class="password-wrap"><input v-model="password" :type="reveal ? 'text' : 'password'"
                            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required
                            :minlength="mode === 'register' ? 8 : undefined" maxlength="72" placeholder="输入密码">
                        <button type="button" :aria-label="reveal ? '隐藏密码' : '显示密码'" :aria-pressed="reveal" @click="reveal = !reveal">
                            <van-icon :name="reveal ? 'eye-o' : 'closed-eye'" /></button></span>
                    </label>
                    <p v-if="mode === 'register'" class="hint">用户名为 3 至 32 位英文字母、数字或 ._-，密码至少 8 位。</p>
                    <p v-if="error || notice" class="auth-error" role="alert">{{ error || notice }}</p>
                    <van-button block type="primary" native-type="submit" :loading="busy">{{ mode === 'login' ? '登录' : '注册并登录' }}</van-button>
                </form>
                <button class="text-button auth-switch" type="button" :disabled="busy" @click="switchMode">
                    {{ mode === 'login' ? '注册账号' : '返回登录' }} <van-icon name="arrow" />
                </button>
            </section>
        </div>
    </main>
</template>
