import * as p from 'path';
import {getOptional, Optional} from './optional';

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

export function switchOs<T>(
    linux: any, osx: any, windows: any, property?: string): Optional<T> {
  switch (process.platform) {
    case 'linux': {
      return (property) ? getOptional<T>(linux, property) : linux;
    }
    case 'win32': {
      return (property) ? getOptional<T>(windows, property) : windows;
    }
    case 'darwin': {
      return (property) ? getOptional<T>(osx, property) : osx;
    }
  }
  return undefined;
}