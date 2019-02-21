import {ProgressBox, ProgressStatus} from './progress';

export class RunningProgress extends ProgressStatus {
  constructor(
      steps: number, stepsMax: number, public passed: number = 0,
      public failed: number = 0, public skipped: number = 0) {
    super(steps, stepsMax);
  }
}

export function showRunningProgress(cancellationHandler?: () => void) {
  ProgressBox.show<RunningProgress>(
      'running', 'Ausführen der Tests', (status: RunningProgress) => {
        return `${status.stepsMax} gestartet, ${status.passed} ok, ${
            status.failed} fehlgeschlagen, ${status.skipped} übersprungen`;
      }, cancellationHandler);
}

export function updateRunningProgress(status: RunningProgress) {
  ProgressBox.progress('running', status);
}

export function closeRunningProgress() {
  ProgressBox.close('running');
}