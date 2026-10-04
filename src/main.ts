import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { router } from './router';
import './styles/global.css';

/**
 * 应用入口。
 *
 * <p>Element Plus 走全量引入：实验台页面多、组件杂，
 * 按需引入省下的几十 KB 换来的是每次加一个新组件都要改一次构建配置。
 */
const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });
app.mount('#app');
