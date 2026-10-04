/**
 * 展示层的格式化工具。
 *
 * <p>只做「怎么显示」，不做「怎么算」：
 * 金额精度、位数换算这些语义属于后端，前端负责让它读得懂。
 */

/**
 * 补齐两位小数，用于价格与金额。
 *
 * @param value 数值
 */
export function money(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '-';
    }
    return value.toFixed(2);
}

/**
 * 毫秒转成可读耗时。
 *
 * @param ms 毫秒
 */
export function duration(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) {
        return '-';
    }
    if (ms < 1) {
        return `${ms.toFixed(2)} ms`;
    }
    if (ms < 1000) {
        return `${Math.round(ms)} ms`;
    }
    return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * 大数字加千分位。
 *
 * @param value 数值
 */
export function thousand(value: number | null | undefined): string {
    if (value === null || value === undefined) {
        return '-';
    }
    return value.toLocaleString('zh-CN');
}

/**
 * 今天的 yyyy-MM-dd。
 */
export function today(): string {
    return toDateString(new Date());
}

/**
 * 把日期对象格式化成 yyyy-MM-dd。
 *
 * @param date 日期
 */
export function toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 当月的 yyyy-MM。
 */
export function currentMonth(): string {
    return today().slice(0, 7);
}

/**
 * 把 Date 格式化成后端能接受的 yyyy-MM-dd HH:mm:ss。
 *
 * @param date 日期时间
 */
export function toDateTimeString(date: Date): string {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${toDateString(date)} ${hour}:${minute}:${second}`;
}

/**
 * 生成一个足够短的唯一幂等键。
 *
 * @param prefix 业务前缀
 */
export function uuid(prefix = 'IDEM'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 解析用户填的 JSON 字符串，失败时返回 null 而不是抛异常。
 *
 * @param text 输入文本
 */
export function parseJson(text: string): unknown | null {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * 把任意值渲染成缩进 JSON。
 *
 * @param value 任意值
 */
export function pretty(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value === null || value === undefined) {
        return '（无数据）';
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}
