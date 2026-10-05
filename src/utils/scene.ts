/**
 * 场景化展示用的小工具。
 *
 * <p>实验室没有素材图，也没有用户头像，但产品界面不能因此变成一堆灰块。
 * 这里用「分类配色 + emoji」和「按 id 稳定生成头像色」两招，
 * 让同一个商品、同一个用户在每次刷新后长得一样——随机色会让人以为是新数据。
 */

/** 分类图标与渐变底色。 */
const CATEGORY_META: Record<string, { icon: string; gradient: string }> = {
    手机数码: { icon: '📱', gradient: 'linear-gradient(135deg,#e8f1ff,#cfe0ff)' },
    电脑办公: { icon: '💻', gradient: 'linear-gradient(135deg,#eef0ff,#dcd9ff)' },
    家用电器: { icon: '🧊', gradient: 'linear-gradient(135deg,#e6f7ff,#cdeeff)' },
    服饰鞋包: { icon: '👗', gradient: 'linear-gradient(135deg,#ffeff6,#ffd9e8)' },
    食品生鲜: { icon: '🍚', gradient: 'linear-gradient(135deg,#f1ffec,#dcf7d0)' },
    图书文娱: { icon: '📚', gradient: 'linear-gradient(135deg,#fff7e6,#ffe9bd)' },
    运动户外: { icon: '⛺', gradient: 'linear-gradient(135deg,#ecfff5,#c9f5de)' },
    美妆个护: { icon: '💄', gradient: 'linear-gradient(135deg,#ffeff1,#ffd4da)' },
    家居家装: { icon: '🛋', gradient: 'linear-gradient(135deg,#f6f1ec,#e6ddd2)' },
    母婴玩具: { icon: '🧸', gradient: 'linear-gradient(135deg,#fff3f3,#ffe0e0)' },
    外设: { icon: '🖱', gradient: 'linear-gradient(135deg,#eef2f7,#dde4ee)' },
};

/** 兜底配色，遇到没登记过的分类也能看。 */
const FALLBACK = { icon: '📦', gradient: 'linear-gradient(135deg,#f2f4f8,#e2e7ef)' };

/**
 * 取分类的图标与底色。
 *
 * @param category 分类名
 */
export function categoryMeta(category: string): { icon: string; gradient: string } {
    return CATEGORY_META[category] ?? FALLBACK;
}

/** 头像色板。 */
const AVATAR_COLORS = [
    '#3d6ff5',
    '#16a34a',
    '#d98900',
    '#dc4a4a',
    '#7c5cf5',
    '#0ea5a5',
    '#e0638a',
    '#5a7d9a',
];

/**
 * 按 id 稳定生成头像底色。
 *
 * @param id 用户 id 或任意整数
 */
export function avatarColor(id: number): string {
    return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
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
