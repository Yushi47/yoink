import fs from 'fs';
import path from 'path';

function ts(): string {
    return new Date().toTimeString().slice(0, 8);
}

export function log(msg: string): void {
    console.log(`${ts()} ${msg}`);
}

export function logWarn(msg: string): void {
    console.warn(`${ts()} ${msg}`);
}

export function logErr(msg: string, ...extra: unknown[]): void {
    console.error(`${ts()} ${msg}`, ...extra);
}

export function uniqueOutputPath(outputDir: string, filename: string): string {
    let outPath = path.join(outputDir, filename);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;
    while (fs.existsSync(outPath)) {
        outPath = path.join(outputDir, `${base}-${counter}${ext}`);
        counter++;
    }
    return outPath;
}

const BAR_WIDTH = 20;

export function renderProgressLine(label: string, written: number, total: number, speedMBs: string): string {
    const writtenMB = (written / 1024 / 1024).toFixed(1);
    const display = label.length > 28 ? label.slice(0, 25) + '...' : label;

    let bar: string;
    let stats: string;

    if (total > 0) {
        const pct = Math.min(1, written / total);
        const filled = Math.round(pct * BAR_WIDTH);
        bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
        const totalMB = (total / 1024 / 1024).toFixed(1);
        const pctStr = Math.floor(pct * 100).toString().padStart(3);
        stats = `${pctStr}%  ${writtenMB}/${totalMB} MB  ${speedMBs} MB/s`;
    } else {
        bar = '░'.repeat(BAR_WIDTH);
        stats = `${writtenMB} MB  ${speedMBs} MB/s`;
    }

    return `[yoink] ${display}  ${bar}  ${stats}`;
}
