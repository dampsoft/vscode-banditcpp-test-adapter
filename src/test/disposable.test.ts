// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

import { DisposableI, using, isDisposable } from '../util/disposable'

class TestDisposable implements DisposableI {
  public disposed = false;
  public dispose() {
    this.disposed = true;
  }
  public message = '';
}

suite('Disposable Tests', function () {
  test('using works', function () {
    let disposable = new TestDisposable();
    assert.equal(disposable.disposed, false);
    assert.equal(disposable.message, '');
    let testMessage = 'Called';
    using(disposable, (disposable) => {
      disposable.message = testMessage;
    });
    assert.equal(disposable.disposed, true);
    assert.equal(disposable.message, testMessage);
  });

  test('isDisposable works', function () {
    let disposable = new TestDisposable();
    let notDisposable = {};
    assert.equal(isDisposable(disposable), true);
    assert.equal(isDisposable(notDisposable), false);
  });
});