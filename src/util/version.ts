export class Version {
  constructor(
    public readonly major: number, public readonly minor: number,
    public readonly build: number) { }

  static fromString(str: string): Version | undefined {
    let matches = str.match(/(\d+)\.(\d+)\.(\d+)/i);
    if (matches && matches.length == 4) {
      return new Version(
        parseInt(matches[1]), parseInt(matches[2]), parseInt(matches[3]));
    }
    return undefined;
  }

  public toString(): string {
    return `${this.major}.${this.minor}.${this.build}`;
  }

  public greaterThan(other: Version): boolean {
    if (this.major > other.major) {
      return true;
    } else if (this.major == other.major) {
      if (this.minor > other.minor) {
        return true;
      } else if (this.minor == other.minor) {
        return this.build > other.build;
      }
    }
    return false;
  }

  public equal(other: Version): boolean {
    return (
      this.major == other.major && this.minor == other.minor &&
      this.build == other.build);
  }

  public lessThan(other: Version): boolean {
    return !this.equal(other) && !this.greaterThan(other);
  }

  public greaterOrEqual(other: Version): boolean {
    return this.equal(other) || this.greaterThan(other);
  }

  public lessOrEqual(other: Version): boolean {
    return this.equal(other) || this.lessThan(other);
  }
}
