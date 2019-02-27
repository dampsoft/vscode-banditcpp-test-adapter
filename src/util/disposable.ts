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