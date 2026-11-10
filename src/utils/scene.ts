/**
 * 场景化展示用的小工具。
 *
 * <p>页面收敛成工具界面后，分类图标、渐变底色与彩色头像都不再提供信息：
 * 它们只让同一个商品、同一个用户每次刷新看起来一样，却占用了大量视觉注意力。
 * 这里统一返回中性浅底，颜色只承担语义（成功/警告/失败），装饰交给留白与边框。
 */

/** 分类展示信息。保留分类键以兼容已有调用，图标停用、底色统一中性浅灰。 */
const CATEGORY_META: Record<string, { icon: string; gradient: string }> = {
    手机数码: { icon: '', gradient: '#fafbfc' },
    电脑办公: { icon: '', gradient: '#fafbfc' },
    家用电器: { icon: '', gradient: '#fafbfc' },
    服饰鞋包: { icon: '', gradient: '#fafbfc' },
    食品生鲜: { icon: '', gradient: '#fafbfc' },
    图书文娱: { icon: '', gradient: '#fafbfc' },
    运动户外: { icon: '', gradient: '#fafbfc' },
    美妆个护: { icon: '', gradient: '#fafbfc' },
    家居家装: { icon: '', gradient: '#fafbfc' },
    母婴玩具: { icon: '', gradient: '#fafbfc' },
    外设: { icon: '', gradient: '#fafbfc' },
};

/** 兜底配色，遇到没登记过的分类也不报错。 */
const FALLBACK = { icon: '', gradient: '#fafbfc' };

/**
 * 取分类的展示信息。
 *
 * @param category 分类名
 */
export function categoryMeta(category: string): { icon: string; gradient: string } {
    return CATEGORY_META[category] ?? FALLBACK;
}

/**
 * 头像占位底色。统一中性浅灰，不再按 id 生成彩色块。
 *
 * @param id 用户 id 或任意整数
 */
export function avatarColor(id: number): string {
    void id;
    return '#fafbfc';
}

/**
 * 取名字的首个字符，用于头像占位。
 *
 * @param name 名称
 */
export function initialOf(name: string): string {
    return name && name.length > 0 ? name.slice(0, 1) : '?';
}

/**
 * 把 ES 返回的高亮片段渲染成 HTML。
 *
 * <p>后端已经在片段里嵌好 <em> 标签，前端只负责给它上色，
 * 不自己做 replace——自己拼高亮很容易拼出 XSS。
 *
 * @param highlights 高亮片段数组
 * @param fallback 没有高亮时的原文
 */
export function highlightHtml(highlights: string[] | undefined, fallback: string): string {
    const list = (highlights ?? []).filter((item) => item && item.length > 0);
    return list.length > 0 ? list.join(' · ') : fallback;
}
