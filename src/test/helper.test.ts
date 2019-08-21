// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

import { escapeRegExp, flatten, formatTimeDuration, isLinux, isOsx, isWindows, removeDuplicates, sortString, switchOs } from '../util/helper';

suite('Helper Tests', function () {
  test('escapeRegExp', function () {
    assert.equal(escapeRegExp('.'), '\\.');
    assert.equal(escapeRegExp('*'), '\\*');
    assert.equal(escapeRegExp('+'), '\\+');
    assert.equal(escapeRegExp('?'), '\\?');
    assert.equal(escapeRegExp('^'), '\\^');
    assert.equal(escapeRegExp('$'), '\\$');
    assert.equal(escapeRegExp('{'), '\\{');
    assert.equal(escapeRegExp('}'), '\\}');
    assert.equal(escapeRegExp('('), '\\(');
    assert.equal(escapeRegExp(')'), '\\)');
    assert.equal(escapeRegExp('|'), '\\|');
    assert.equal(escapeRegExp('['), '\\[');
    assert.equal(escapeRegExp(']'), '\\]');
    assert.equal(escapeRegExp('\\'), '\\\\');
    assert.equal(
      escapeRegExp('{[(2*4.5)/3]*1+2}=5'),
      '\\{\\[\\(2\\*4\\.5\\)/3\\]\\*1\\+2\\}=5');
  });

  test('flatten', function () {
    assert.deepEqual(flatten([[1, 2], [3, 4]]), [1, 2, 3, 4]);
    assert.deepEqual(flatten([['a', 'b'], ['c', 'd']]), ['a', 'b', 'c', 'd']);
  });

  test('removeDuplicates', function () {
    interface Dup {
      id: string
    }
    let a: Dup[] = [{ id: 'a' }, { id: 'b' }, { id: 'b' }, { id: 'c' }];
    let b: Dup[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(removeDuplicates(a, 'id'), b);
  });

  test('sortString-normal-case-sensitive', function () {
    let items: string[] = ['aa', 'bb', 'AA', 'BB', 'Aa', 'AB', 'aB'];
    let expected: string[] = ['aa', 'Aa', 'AA', 'aB', 'AB', 'bb', 'BB'];
    sortString(items, false);
    assert.deepEqual(items, expected);
  });

  test('sortString-normal-case-insensitive', function () {
    let items: string[] = ['aa', 'bb', 'AA', 'BB', 'Aa', 'AB', 'aB'];
    let expected: string[] = ['AA', 'Aa', 'aa', 'AB', 'aB', 'BB', 'bb'];
    sortString(items, true);
    assert.deepEqual(items, expected);
  });

  test('sortString-property-case-sensitive', function () {
    interface Dup {
      id: string
    }
    let items: Dup[] = [
      { id: 'aa' }, { id: 'bb' }, { id: 'AA' }, { id: 'BB' }, { id: 'Aa' }, { id: 'AB' },
      { id: 'aB' }
    ];
    let expected: Dup[] = [
      { id: 'aa' }, { id: 'Aa' }, { id: 'AA' }, { id: 'aB' }, { id: 'AB' }, { id: 'bb' },
      { id: 'BB' }
    ];
    sortString(items, false, 'id')
    assert.deepEqual(items, expected);
  });

  test('sortString-property-case-insensitive', function () {
    interface Dup {
      id: string
    }
    let items: Dup[] = [
      { id: 'aa' }, { id: 'bb' }, { id: 'AA' }, { id: 'BB' }, { id: 'Aa' }, { id: 'AB' },
      { id: 'aB' }
    ];
    let expected: Dup[] = [
      { id: 'AA' }, { id: 'Aa' }, { id: 'aa' }, { id: 'AB' }, { id: 'aB' }, { id: 'BB' },
      { id: 'bb' }
    ];
    sortString(items, true, 'id')
    assert.deepEqual(items, expected);
  });

  test('formatTimeDuration', function () {
    assert.equal(formatTimeDuration(0), '0.000 s');
    assert.equal(formatTimeDuration(999), '0.999 s');
    assert.equal(formatTimeDuration(60 * 1000), '1.000 min');
    assert.equal(formatTimeDuration(60 * 60 * 1000), '1.000 h');
  });

  suite('Platform Tests', function () {
    let osSetting = {
      windows: { name: 'hello windows' },
      linux: { name: 'hello linux' },
      osx: { name: 'hello mac' }
    };

    this.beforeEach(function () {
      // save original process.platform
      this.originalPlatform =
        Object.getOwnPropertyDescriptor(process, 'platform');
    });

    this.afterEach(function () {
      // restore original process.platform
      Object.defineProperty(process, 'platform', this.originalPlatform);
    });

    test('os detection windows', function () {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      assert.equal(process.platform, 'win32');
      assert.equal(isWindows(), true);
      assert.equal(isOsx(), false);
      assert.equal(isLinux(), false);
    });

    test('os detection osx', function () {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      assert.equal(process.platform, 'darwin');
      assert.equal(isWindows(), false);
      assert.equal(isOsx(), true);
      assert.equal(isLinux(), false);
    });

    test('os detection linux', function () {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      assert.equal(process.platform, 'linux');
      assert.equal(isWindows(), false);
      assert.equal(isOsx(), false);
      assert.equal(isLinux(), true);
    });

    test('switchOs windows', function () {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      assert.equal(process.platform, 'win32');
      assert.equal(switchOs<Number>(osSetting, 'name'), 'hello windows');
    });

    test('switchOs osx', function () {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      assert.equal(process.platform, 'darwin');
      assert.equal(switchOs<Number>(osSetting, 'name'), 'hello mac');
    });

    test('switchOs linux', function () {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      assert.equal(process.platform, 'linux');
      assert.equal(switchOs<Number>(osSetting, 'name'), 'hello linux');
    });
  });
});