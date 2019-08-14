
export interface ProgressStatusI {
  steps: number;
  stepsMax: number;
  readonly increment: number;
  readonly progress: number;
}


export class ProgressStatus implements ProgressStatusI {
  private stepsIntern: number;
  private stepsMaxIntern: number;
  private incrementIntern: number = 0;
  constructor(steps: number, stepsMax: number) {
    this.stepsIntern = steps;
    this.stepsMaxIntern = stepsMax;
    this.updateIncrement(steps, this.stepsMax);
  }
  public get steps(): number {
    return this.stepsIntern;
  }
  public get stepsMax(): number {
    return this.stepsMaxIntern;
  }
  public set steps(val: number) {
    this.updateIncrement(val, this.stepsMax);
    this.stepsIntern = val;
  }
  public set stepsMax(val: number) {
    this.updateIncrement(this.steps, val);
    this.stepsMaxIntern = val;
  }
  public get increment(): number {
    return this.incrementIntern;
  }
  public get progress(): number {
    return this.steps / this.stepsMax;
  }
  private updateIncrement(steps: number, max: number) {
    let progressNew = steps / max;
    let progressOld = this.steps / this.stepsMax;
    this.incrementIntern = progressNew - progressOld;
  }
}