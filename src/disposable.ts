export interface DisposableI {
  dispose(): void;
}

export function isDisposable(object: any): object is DisposableI {
  return "dispose" in object;
}
