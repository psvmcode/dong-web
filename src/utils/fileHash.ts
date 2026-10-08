/**
 * 文件指纹计算。
 *
 * <p>特大文件（GB 级）不能直接读进内存算哈希——一个 10GB 的文件会让标签页直接崩掉。
 * 这里的做法是**分块 digest**：每次只取一块（默认 2MB）算 SHA-256，
 * 最后把所有块哈希拼起来再 digest 一次得到文件指纹。内存占用恒定等于一块大小。
 *
 * <p>两种模式的区别只是「参与计算的块有多少」：
 * <ul>
 *   <li>full：每一块都参与，指纹精度最高，但块数随文件大小线性增长，1GB 就是 512 次 digest</li>
 *   <li>sample：只取首块、中间块、尾块，块数恒为 3，快几个数量级，代价是有碰撞风险</li>
 * </ul>
 *
 * <p>碰撞风险由服务端兜底：秒传判定用「指纹 + 文件大小」联合条件，
 * 光靠抽样指纹撞上还不够，还得大小也一致。
 */

/** 指纹计算模式。 */
export type HashMode = 'full' | 'sample';

/** 计算结果。 */
export interface HashResult {
    hash: string;
    elapsedMs: number;
    blocks: number;
    mode: HashMode;
}

/** 单块大小，2MB。 */
const BLOCK_SIZE = 2 * 1024 * 1024;

/**
 * 计算文件指纹。
 *
 * @param file 目标文件
 * @param mode full 全量、sample 抽样
 * @param onProgress 进度回调，参数为已处理块数与总块数
 */
export async function computeFileHash(
    file: File,
    mode: HashMode,
    onProgress?: (done: number, total: number) => void,
): Promise<HashResult> {
    const started = performance.now();
    const totalBlocks = Math.max(1, Math.ceil(file.size / BLOCK_SIZE));
    const indexes = mode === 'full' ? allIndexes(totalBlocks) : sampleIndexes(totalBlocks);
    const parts: string[] = [];
    let done = 0;
    for (const index of indexes) {
        parts.push(await digestBlock(file, index));
        done += 1;
        if (onProgress) {
            onProgress(done, indexes.length);
        }
    }
    // 把文件大小混进最终摘要：抽样模式下这是对抗碰撞的第二道保险
    parts.push(String(file.size));
    const final = await digestText(parts.join(''));
    return {
        hash: final.slice(0, 32),
        elapsedMs: Math.round(performance.now() - started),
        blocks: indexes.length,
        mode,
    };
}

/**
 * 全量模式：所有块都参与。
 *
 * @param total 总块数
 */
function allIndexes(total: number): number[] {
    return Array.from({ length: total }, (_, index) => index);
}

/**
 * 抽样模式：首块、中间块、尾块。
 *
 * @param total 总块数
 */
function sampleIndexes(total: number): number[] {
    if (total <= 3) {
        return allIndexes(total);
    }
    return [0, Math.floor(total / 2), total - 1];
}

/**
 * 取文件的某一块并计算摘要。
 *
 * @param file 目标文件
 * @param index 块下标
 */
async function digestBlock(file: File, index: number): Promise<string> {
    const start = index * BLOCK_SIZE;
    const end = Math.min(start + BLOCK_SIZE, file.size);
    const buffer = await file.slice(start, end).arrayBuffer();
    return toHex(await crypto.subtle.digest('SHA-256', buffer));
}

/**
 * 对短文本计算摘要。
 *
 * @param text 文本
 */
async function digestText(text: string): Promise<string> {
    return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * 摘要转十六进制串。
 *
 * @param buffer 摘要缓冲区
 */
function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((item) => item.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 把字节数格式化成可读文本。
 *
 * @param bytes 字节数
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
