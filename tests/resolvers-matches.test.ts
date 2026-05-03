import { describe, it, expect } from 'vitest';
import { resolver as gofile } from '../resolvers/gofile';
import { resolver as rootz } from '../resolvers/rootz';
import { resolver as generic } from '../resolvers/generic';

// ─── gofile ───────────────────────────────────────────────────────────────────

describe('gofile.matches()', () => {
    it('matches gofile.io URLs', () => {
        expect(gofile.matches('https://gofile.io/d/abc123')).toBe(true);
    });

    it('matches gofile.io root', () => {
        expect(gofile.matches('https://gofile.io')).toBe(true);
    });

    it('does not match unrelated URLs', () => {
        expect(gofile.matches('https://example.com')).toBe(false);
    });

    it('does not match partial matches in subdomain position', () => {
        expect(gofile.matches('https://notgofile.io/d/abc')).toBe(false);
    });
});

// ─── rootz ────────────────────────────────────────────────────────────────────

describe('rootz.matches()', () => {
    it('matches rootz.so URLs', () => {
        expect(rootz.matches('https://rootz.so/file/abc')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(rootz.matches('https://ROOTZ.SO/file/abc')).toBe(true);
        expect(rootz.matches('https://Rootz.So/file')).toBe(true);
    });

    it('matches rootz.so root', () => {
        expect(rootz.matches('https://rootz.so')).toBe(true);
    });

    it('does not match unrelated URLs', () => {
        expect(rootz.matches('https://example.com')).toBe(false);
        expect(rootz.matches('https://google.com')).toBe(false);
    });
});

// ─── generic ─────────────────────────────────────────────────────────────────

describe('generic.matches()', () => {
    it('matches https:// URLs', async () => {
        expect(await generic.matches('https://example.com/file.zip')).toBe(true);
    });

    it('matches http:// URLs', async () => {
        expect(await generic.matches('http://example.com')).toBe(true);
    });

    it('does not match ftp:// URLs', async () => {
        expect(await generic.matches('ftp://example.com')).toBe(false);
    });

    it('does not match schemeless strings', async () => {
        expect(await generic.matches('rootz.so/file')).toBe(false);
    });

    it('does not match empty string', async () => {
        expect(await generic.matches('')).toBe(false);
    });
});
