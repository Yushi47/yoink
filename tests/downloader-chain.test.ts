import { describe, it, expect } from 'vitest';
import { _resolversForTesting } from '../downloader';

describe('resolver chain', () => {
    it('loads exactly the four expected resolvers', () => {
        const names = _resolversForTesting.map(r => r.name);
        expect(names).toContain('gofile');
        expect(names).toContain('rootz');
        expect(names).toContain('direct');
        expect(names).toContain('generic');
        expect(names).toHaveLength(4);
    });

    it('follows the correct priority order: gofile → rootz → direct → generic', () => {
        const names = _resolversForTesting.map(r => r.name);
        expect(names).toEqual(['gofile', 'rootz', 'direct', 'generic']);
    });

    it('direct resolver has needsBrowser: false', () => {
        const direct = _resolversForTesting.find(r => r.name === 'direct');
        expect(direct?.resolver.needsBrowser).toBe(false);
    });

    it('all other resolvers do not set needsBrowser to false', () => {
        for (const r of _resolversForTesting.filter(r => r.name !== 'direct')) {
            expect(r.resolver.needsBrowser).not.toBe(false);
        }
    });

    it('excludes internal files (types, abort-helpers, utils)', () => {
        const names = _resolversForTesting.map(r => r.name);
        expect(names).not.toContain('types');
        expect(names).not.toContain('abort-helpers');
        expect(names).not.toContain('utils');
    });

    it('all resolvers expose a matches() function', () => {
        for (const r of _resolversForTesting) {
            expect(typeof r.resolver.matches).toBe('function');
        }
    });

    it('all resolvers expose a click() function', () => {
        for (const r of _resolversForTesting) {
            expect(typeof r.resolver.click).toBe('function');
        }
    });
});
