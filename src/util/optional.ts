
export type Optional<T> = T|undefined;

export function getOptional<T>(
    value: any, prop: string, fallback?: T): Optional<T> {
  let opt: Optional<T>;
  if (value && prop in value) opt = value[prop];
  return opt || fallback;
}