import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { uniqueOutputPath, renderProgressLine } from '../utils';

// ─── renderProgressLine ───────────────────────────────────────────────────────

describe('renderProgressLine', () => {
    const extractBar = (line: string) => line.split('  ')[1];

    it('bar is always exactly 20 characters', () => {
        const line = renderProgressLine('file.zip', 500, 1000, '10.0');
        const bar = extractBar(line);
        expect([...bar].length).toBe(20);
    });

    it('0% → all empty blocks', () => {
        const line = renderProgressLine('file.zip', 0, 1000, '0.0');
        const bar = extractBar(line);
        expect(bar).toBe('░'.repeat(20));
    });

    it('100% → all filled blocks', () => {
        const line = renderProgressLine('file.zip', 1000, 1000, '50.0');
        const bar = extractBar(line);
        expect(bar).toBe('█'.repeat(20));
    });

    it('50% → 10 filled + 10 empty', () => {
        const line = renderProgressLine('file.zip', 500, 1000, '10.0');
        const bar = extractBar(line);
        expect(bar).toBe('█'.repeat(10) + '░'.repeat(10));
    });

    it('clamps to 100% when written > total', () => {
        const line = renderProgressLine('file.zip', 9999, 1000, '10.0');
        const bar = extractBar(line);
        expect(bar).toBe('█'.repeat(20));
        expect(line).toContain('100%');
    });

    it('includes percentage, transferred/total MB, and speed when total > 0', () => {
        const line = renderProgressLine('file.zip', 512 * 1024 * 1024, 1024 * 1024 * 1024, '45.0');
        expect(line).toContain('50%');
        expect(line).toContain('512.0/1024.0 MB');
        expect(line).toContain('45.0 MB/s');
    });

    it('shows only MB and speed when total is 0', () => {
        const line = renderProgressLine('file.zip', 512 * 1024 * 1024, 0, '20.0');
        expect(line).not.toContain('%');
        expect(line).not.toMatch(/\d+\.\d+\/\d+\.\d+ MB/);
        expect(line).toContain('512.0 MB');
        expect(line).toContain('20.0 MB/s');
        const bar = extractBar(line);
        expect(bar).toBe('░'.repeat(20));
    });

    it('starts with [yoink] and embeds the label', () => {
        const line = renderProgressLine('myfile.rar', 0, 0, '0.0');
        expect(line.startsWith('[yoink] myfile.rar')).toBe(true);
    });

    it('truncates label longer than 28 chars to 25 + ...', () => {
        const longName = 'a'.repeat(29);
        const line = renderProgressLine(longName, 0, 0, '0.0');
        expect(line).toContain('a'.repeat(25) + '...');
        expect(line).not.toContain('a'.repeat(26));
    });

    it('does not truncate label of exactly 28 chars', () => {
        const name = 'a'.repeat(28);
        const line = renderProgressLine(name, 0, 0, '0.0');
        expect(line).toContain(name);
        expect(line).not.toContain('...');
    });
});

// ─── uniqueOutputPath ─────────────────────────────────────────────────────────

describe('uniqueOutputPath', () => {
    const spy = vi.spyOn(fs, 'existsSync');

    afterEach(() => spy.mockReset());

    it('returns original path when file does not exist', () => {
        spy.mockReturnValue(false);
        expect(uniqueOutputPath('/dl', 'file.zip')).toBe(path.join('/dl', 'file.zip'));
    });

    it('appends -1 on first collision', () => {
        spy.mockReturnValueOnce(true).mockReturnValue(false);
        expect(uniqueOutputPath('/dl', 'file.zip')).toBe(path.join('/dl', 'file-1.zip'));
    });

    it('appends -2 on second collision', () => {
        spy.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
        expect(uniqueOutputPath('/dl', 'file.zip')).toBe(path.join('/dl', 'file-2.zip'));
    });

    it('handles extension-less filenames', () => {
        spy.mockReturnValueOnce(true).mockReturnValue(false);
        expect(uniqueOutputPath('/dl', 'Makefile')).toBe(path.join('/dl', 'Makefile-1'));
    });

    it('only strips the last extension for multi-dot filenames', () => {
        spy.mockReturnValueOnce(true).mockReturnValue(false);
        expect(uniqueOutputPath('/dl', 'archive.tar.gz')).toBe(path.join('/dl', 'archive.tar-1.gz'));
    });
});
