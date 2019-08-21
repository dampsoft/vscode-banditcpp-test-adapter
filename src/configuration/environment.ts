
export type EnvProperty = {
  [prop: string]: string | undefined;
};

export function mergeEnv(...environments: EnvProperty[]): EnvProperty {
  return Object.assign({}, ...environments);
}