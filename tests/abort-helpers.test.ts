import { describe, it, expect } from 'vitest';
import { throwIfAborted, withAbort } from '../resolvers/abort-helpers';

// ─── throwIfAborted ───────────────────────────────────────────────────────────

describe('throwIfAborted', () => {
    it('does not throw when called with no argument', () => {
        expect(() => throwIfAborted()).not.toThrow();
    });

    it('does not throw when signal is undefined', () => {
        expect(() => throwIfAborted({ signal: undefined })).not.toThrow();
    });

    it('does not throw when signal is live', () => {
        const ctrl = new AbortController();
        expect(() => throwIfAborted({ signal: ctrl.signal })).not.toThrow();
    });

    it('throws when signal is already aborted', () => {
        const ctrl = new AbortController();
        ctrl.abort();
        expect(() => throwIfAborted({ signal: ctrl.signal })).toThrow('Operation aborted');
    });
});

// ─── withAbort ────────────────────────────────────────────────────────────────

describe('withAbort', () => {
    it('resolves normally when signal is undefined', async () => {
        await expect(withAbort(undefined, Promise.resolve(42))).resolves.toBe(42);
    });

    it('resolves normally when signal is live and promise resolves', async () => {
        const ctrl = new AbortController();
        await expect(withAbort(ctrl.signal, Promise.resolve('ok'))).resolves.toBe('ok');
    });

    it('propagates rejection from the inner promise', async () => {
        const ctrl = new AbortController();
        const err = new Error('inner fail');
        await expect(withAbort(ctrl.signal, Promise.reject(err))).rejects.toThrow('inner fail');
    });

    it('rejects immediately when signal is already aborted', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        const never = new Promise<never>(() => {});
        await expect(withAbort(ctrl.signal, never)).rejects.toThrow('Operation aborted');
    });

    it('rejects when signal fires while promise is pending', async () => {
        const ctrl = new AbortController();
        const never = new Promise<never>(() => {});
        const result = withAbort(ctrl.signal, never);
        ctrl.abort();
        await expect(result).rejects.toThrow('Operation aborted');
    });

    it('does not double-reject after resolve if signal is later aborted', async () => {
        const ctrl = new AbortController();
        const result = await withAbort(ctrl.signal, Promise.resolve('done'));
        ctrl.abort();
        expect(result).toBe('done');
    });

    it('does not double-reject after inner rejection if signal is later aborted', async () => {
        const ctrl = new AbortController();
        const err = new Error('boom');
        await expect(withAbort(ctrl.signal, Promise.reject(err))).rejects.toThrow('boom');
        ctrl.abort();
    });
});
