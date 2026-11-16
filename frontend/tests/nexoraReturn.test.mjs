import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { backDelta, isNexoraPath, returnFromLocation, returnHref, sanitizeReturn } from '../src/components/nexora/nexoraReturn.js';

const location = { pathname: '/academics/courses', search: '?term=fall', hash: '#math251', state: { tab: 'grades' }, key: 'k5' };

describe('Nexora return target', () => {
  it('recognises the Nexora routes only', () => {
    assert.equal(isNexoraPath('/nexora'), true);
    assert.equal(isNexoraPath('/nexora/abc'), true);
    assert.equal(isNexoraPath('/nexorafoo'), false);
    assert.equal(isNexoraPath('/dashboard'), false);
  });

  it('keeps path, query, hash, router state, history entry and scroll', () => {
    const target = returnFromLocation(location, 5, 812.4);
    assert.deepEqual(target, { pathname: '/academics/courses', search: '?term=fall', hash: '#math251', state: { tab: 'grades' }, key: 'k5', idx: 5, scrollY: 812 });
    assert.equal(returnHref(target), '/academics/courses?term=fall#math251');
  });

  it('rejects Nexora itself, other origins and malformed values', () => {
    assert.equal(sanitizeReturn({ pathname: '/nexora/abc' }), null);
    assert.equal(sanitizeReturn({ pathname: '//evil.example/x' }), null);
    assert.equal(sanitizeReturn({ pathname: 'https://evil.example' }), null);
    assert.equal(sanitizeReturn({ pathname: '/\\evil' }), null);
    assert.equal(sanitizeReturn('nope'), null);
    assert.equal(sanitizeReturn(null), null);
    const cleaned = sanitizeReturn({ pathname: '/finance', search: 'x=1', hash: 'y', idx: -2, scrollY: -40 });
    assert.deepEqual(cleaned, { pathname: '/finance', search: '', hash: '', state: null, key: null, idx: null, scrollY: 0 });
  });

  it('falls back to the dashboard when nothing is known', () => {
    assert.equal(returnHref(null), '/dashboard');
  });

  it('steps back through history only to an entry behind the current one', () => {
    const target = returnFromLocation(location, 5, 0);
    assert.equal(backDelta(target, 6), -1); // /nexora
    assert.equal(backDelta(target, 8), -3); // /nexora → /nexora/a → /nexora/b
    assert.equal(backDelta(target, 5), null);
    assert.equal(backDelta(target, 3), null);
    assert.equal(backDelta(target, null), null);
    assert.equal(backDelta({ ...target, key: null }, 6), null);
    assert.equal(backDelta(null, 6), null);
  });
});
