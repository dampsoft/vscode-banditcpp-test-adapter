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
  let h = millis / (1000 * 60 * 60);
  if (Math.floor(h)) {
    return `${(h).toFixed(3)} h`;
  } else {
    let m = millis / (1000 * 60);
    if (Math.floor(m)) {
      return `${(m).toFixed(3)} min`;
    } else {
      return `${(millis / 1000).toFixed(3)} s`;
    }
  }
}

/**
 * Prüft, ob die Plattform Windows ist.
 */
export function isWindows() {
  return /^win/.test(process.platform);
}

/**
 * Prüft, ob die Plattform Linux ist.
 */
export function isLinux() {
  return /^linux/.test(process.platform);
}

/**
 * Prüft, ob die Plattform OSX ist.
 */
export function isOsx() {
  return /^darwin/.test(process.platform);
}

export type OsSetting = {
  linux?: any,
  osx?: any,
  windows?: any
};

/**
 * Funktion zum Ermitteln plattformabhängiger Einstellungen.
 * @param setting  Objekt mit optionalen Plattform-Einstellwerten
 * @param property Optionaler Name der Eigenschaft, die gelesen werden soll:
 *                 Wenn kein Wert übergeben wird, wird das ganze
 *                 Einstellungs-Objekt der Plattform zurückgegeben
 * @returns        Gefundener Einstellwert oder undefined
 */
export function switchOs<T>(
    setting: OsSetting, property?: string): Optional<T> {
  let osSetting =                             //
      isLinux() ? setting.linux :             //
      isWindows() ? setting.windows :         //
          isOsx() ? setting.osx : undefined;  //

  return property ? getOptional<T>(osSetting, property) : osSetting;
}