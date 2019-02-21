import * as p from 'path';

export function escapeRegExp(text: string): string {
  return text.replace(
      /[.*+?^${}()|[\]\\]/g, '\\$&');  // $& means the whole matched string
}

export function cleanPath(path: string): string {
  return p.normalize(path);
}

export function flatten<T>(array: Array<Array<T>>): Array<T> {
  return new Array<T>().concat(...array);
}

export function removeDuplicates(values: any[], prop: string) {
  return values.filter((obj, pos, arr) => {
    return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
  });
}

export function formatTimeDuration(millis: number): string {
  let h = Math.floor((millis / (1000 * 60 * 60)) % 24);
  if (h) {
    return `${(millis / (1000 * 60 * 60 / 24)).toFixed(3)} h`;
  } else {
    let m = Math.floor((millis / (1000 * 60)) % 60);
    if (m) {
      return `${(millis / (1000 * 60 * 60)).toFixed(3)} min`;
    } else {
      return `${(millis / (1000 * 60)).toFixed(3)} s`;
    }
  }
}

export function isWindows() {
  return /^win/.test(process.platform);
}
