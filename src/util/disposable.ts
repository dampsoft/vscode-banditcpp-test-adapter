export interface DisposableI {
  dispose(): void;
}

export function isDisposable(object: any): object is DisposableI {
  return 'dispose' in object;
}

export function using<T extends DisposableI>(
    resource: T, func: (resource: T) => void) {
  try {
    func(resource);
  } finally {
    resource.dispose();
  }
}

export class DisposableArray implements DisposableI {
  private disposables = new Array<DisposableI>();

  public dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  public push(disposable: DisposableI) {
    this.disposables.push(disposable);
  }
}