import { createApp } from 'vue';
import { Button, Icon, Pagination, Search, Tabbar, TabbarItem } from 'vant';
import 'vant/es/button/style';
import 'vant/es/pagination/style';
import 'vant/es/search/style';
import 'vant/es/tabbar/style';
import 'vant/es/tabbar-item/style';
import App from './App.vue';
import './style.css';

createApp(App).use(Button).use(Icon).use(Pagination).use(Search).use(Tabbar).use(TabbarItem).mount('#app');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => console.warn('离线缓存注册失败', error));
    });
}
