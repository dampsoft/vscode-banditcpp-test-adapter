# Bandit-Test-Adapter for Visual Studio Code - Change Log

## Version 1.5.0: August 14, 2019

### New Features

- Added the `banditTestExplorer.progressVisualization` property to the configuration. <br/>
  With this you can determine if the loading and running progress is visualized either as <br/>
  an additional entry in the status bar (`statusBar`) or as a popup dialog box (`dialogBox`).<br/>

### Other Changes

- Improved the loading progress: <br/>
  Failing test projects will be skipped instead of breaking the whole loading process.

## Version 1.4.0: July 23, 2019

### New Features

- Added the `disable` property to the testsuite configuration.

### Other Changes

- Internationalized some messages that had not been translated yet.
- Added this change log.

### Bug Fixes

- Improved the parsing of the bandit executable output.
- Added missing translations (de).

## Version 1.3.0: May 8, 2019

### New Features

- Internationalized messages. Currently English and German.

### Bug Fixes

- Fixed threaded access to the internal test execution queue.

## Version 1.2.0: April 12, 2019

### New Features

- Added platform dependent settings to the testsuite configuration.

### Other Changes

- Updated Readme.md.
- Modified the logging messages while parsing test results.
- Added tests to the project.

### Bug Fixes

- Fixed a bug when starting all tests.
- Fixed a regex bug when starting tests.
- Fixed a regex bug when calling the command with special characters in the tests name.
- Fixed bandit framework version detection on linux (ignores color-coding of the output).
