import { Progress, visualizerType } from './core/progress';
import { ProgressStatus, ProgressStatusI } from './core/state';
import { Messages } from './messages';
import { Icon, IconBeaker } from '../util/icons';

export class LoadingProgress extends ProgressStatus {
  constructor(
    steps: number, stepsMax: number, public tests: number = 0,
    public warnings: number = 0, public errors: number = 0) {
    super(steps, stepsMax);
  }
}

export function showLoadingProgress(
  cancellationHandler?: () => void,
  visualization: visualizerType = 'dialogBox') {
  let progressFormatter = (status: ProgressStatusI) => {
    let loadingStatus = status as LoadingProgress;
    return Messages.getLoadingStatusProgress(
      loadingStatus.tests, loadingStatus.errors, loadingStatus.warnings);
  };
  let statusTitle = Icon.placeholder(IconBeaker) + " " + Messages.getLoadingStatusTitle();
  Progress.show(
    'loading', statusTitle, progressFormatter,
    cancellationHandler, visualization);
}

export function updateLoadingProgress(status: LoadingProgress) {
  Progress.progress('loading', status);
}

export function closeLoadingProgress() {
  Progress.close('loading');
}