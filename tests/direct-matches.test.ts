import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolver as direct } from '../resolvers/direct';

function mockFetch(contentType: string, contentDisposition = '') {
    return vi.fn().mockResolvedValue({
        headers: {
            get: (name: string) => {
                if (name === 'content-type') return contentType || null;
                if (name === 'content-disposition') return contentDisposition || null;
                return null;
            },
        },
    });
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

// ─── Content-Disposition ──────────────────────────────────────────────────────

describe('direct.matches() — Content-Disposition', () => {
    it('returns true when Content-Disposition is "attachment"', async () => {
        vi.stubGlobal('fetch', mockFetch('text/html', 'attachment; filename="file.zip"'));
        expect(await direct.matches('https://example.com/file')).toBe(true);
    });

    it('returns false when Content-Disposition is inline (no attachment)', async () => {
        vi.stubGlobal('fetch', mockFetch('text/html', 'inline; filename="page.html"'));
        expect(await direct.matches('https://example.com/file')).toBe(false);
    });
});

// ─── Content-Type — should match ─────────────────────────────────────────────

describe('direct.matches() — types that should match', () => {
    it.each([
        'application/zip',
        'application/octet-stream',
        'application/x-rar-compressed',
        'application/javascript',
        'video/mp4',
        'video/x-matroska',
        'audio/mpeg',
        'audio/flac',
        'image/png',
        'image/jpeg',
    ])('returns true for %s', async (ct) => {
        vi.stubGlobal('fetch', mockFetch(ct));
        expect(await direct.matches('https://example.com/file')).toBe(true);
    });
});

// ─── Content-Type — should NOT match ─────────────────────────────────────────

describe('direct.matches() — types that should not match', () => {
    it.each([
        'text/html',
        'text/plain',
        'application/json',
        'application/xml',
        'application/xhtml+xml',
    ])('returns false for %s', async (ct) => {
        vi.stubGlobal('fetch', mockFetch(ct));
        expect(await direct.matches('https://example.com/file')).toBe(false);
    });
});

// ─── Network errors ───────────────────────────────────────────────────────────

describe('direct.matches() — error handling', () => {
    it('returns false when fetch throws a network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
        expect(await direct.matches('https://example.com/file')).toBe(false);
    });

    it('returns false when fetch times out (AbortError)', async () => {
        const abort = new DOMException('The operation was aborted', 'AbortError');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
        expect(await direct.matches('https://example.com/file')).toBe(false);
    });
});

// ─── Request correctness ─────────────────────────────────────────────────────

describe('direct.matches() — request shape', () => {
    it('uses HEAD method', async () => {
        const fn = mockFetch('text/html');
        vi.stubGlobal('fetch', fn);
        await direct.matches('https://example.com/file');
        expect(fn.mock.calls[0][1].method).toBe('HEAD');
    });

    it('follows redirects', async () => {
        const fn = mockFetch('text/html');
        vi.stubGlobal('fetch', fn);
        await direct.matches('https://example.com/file');
        expect(fn.mock.calls[0][1].redirect).toBe('follow');
    });

    it('passes an AbortSignal for the timeout', async () => {
        const fn = mockFetch('text/html');
        vi.stubGlobal('fetch', fn);
        await direct.matches('https://example.com/file');
        expect(fn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });
});
