# Bandit-C++ Test Explorer for Visual Studio Code

Run your Bandit-C++ tests using the
[Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Features

- Shows a Test Explorer in the Test view in VS Code's sidebar with all detected tests and suites and their state
- Shows a failed test's log when the test is selected in the explorer
- Tests or groups of tests can be marked with auto run. They will be triggered automatically after test files have changed.

## Requirements

You only need to configure your test executables in VS Code's settings (see below)

## Configuration

Next to global settings the configuration contains test projects. A test project is a single executable containing tests.

| Property                                  | Description                                                                                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `banditTestExplorer.testsuites`           | The configuration of your bandit test projects. <br>Either a single configuration object or a path to the JSON configuration file (relative to the workspace folder or absolute path). <br>_A detailed structure follows in the table below._ |
| `banditTestExplorer.parallelProcessLimit` | The limit of parallel processes started during a test run.                                                                                                                                                                                    |
| `banditTestExplorer.watchTimeoutSec`      | A timeout in seconds that helps to prevent the auto run when watched files are compiled often.                                                                                                                                                |
| `banditTestExplorer.allowKillProcess`     | Allows to hard kill running processes when a test run is cancelled or aborted.                                                                                                                                                                |
| `banditTestExplorer.logpanel`             | Enables the output of diagnostic logs to the integrated output panel.                                                                                                                                                                         |
| `banditTestExplorer.logfile`              | Enables the output of diagnostic logs to the specified file if provided.                                                                                                                                                                      |
| `banditTestExplorer.loglevel`             | The logging level used to filter notifications. All notifications of the same or higher level will be logged. <br>Supported values are: `debug`, `info`, `warning`, `error`                                                                   |

The JSON configuration to define tests. It contains multiple definitions that are structured as followed:

| Property               | Description                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `name`                 | The Name of the test project (Will be displayed as the top level node in the Test Explorer tree). |
| `cmd`                  | The location of your bandit test executable (relative to the workspace folder).                   |
| `options`              | Optional: Arguments passed to the test executable when running the tests.                         |
| `cwd`                  | Optional: A working directory where bandit-cpp is run (relative to the workspace folder).         |
| `watches`              | Optional: Files that will be watched. Changes to those will cause an auto run.                    |
| `env`                  | Optional: Environment variables to be set when running the tests.                                 |
| `parallelProcessLimit` | Optional: The limit of parallel processes started during a test run.                              |
| `allowKillProcess`     | Optional: Allows to hard kill running processes when a test run is cancelled or aborted.          |

All configuration elements can be modified with configuration symbols:

| Symbol               | Description                                                                                                                                                                                       | Example                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `${workspaceFolder}` | The current working directory                                                                                                                                                                     | `"cwd": "\${workspaceFolder}"`                      |
| `${env:NAME}`        | Uses an environment variable present to visual studio code                                                                                                                                        | `"env": { "PATH": "${env:PATH}:My/Path" }`          |
| `${processNumber}`   | The zero-based index of the spawned process, in the range of: <br>`0 <= ${processNumber} < parallelProcessLimit`. <br>Useful for connection strings when using parallelized tests with databases. | `"options": [ "-database", "db_${processNumber}" ]` |

### Example:

```json
"banditTestExplorer.testsuites": {
  "name": "my-app",
  "cmd": "test-my-app.exe",
  "cwd": "${workspaceFolder}/build/bin/Debug",
  "env": {
    "Path": "${env:Path}:/additional/path"
  },
  "options": [
    "-connection",
    "Server=myServerAddress;Database=myDataBase${processNumber}"
  ],
  "watches": ["apps/my-app/my-app.dll"],
  "parallelProcessLimit": 10
},
"banditTestExplorer.parallelProcessLimit": 1
```

## Commands

The following commands are available in VS Code's command palette, use the ID to add them to your keyboard shortcuts:

| ID                                 | Command                                           |
| ---------------------------------- | ------------------------------------------------- |
| `test-explorer.reload`             | Reload tests                                      |
| `test-explorer.run-all`            | Run all tests                                     |
| `test-explorer.run-file`           | Run tests in current file                         |
| `test-explorer.run-test-at-cursor` | Run the test at the current cursor position       |
| `test-explorer.cancel`             | Cancel running tests                              |
| `test-explorer.cancel`             | Cancel running tests                              |
| `bandit-test-explorer.run`         | Runs a specific tests that match a filter string. |

## Known issues

### Node.js on MacOS and DYLD-Paths:

As mentioned in [this Issue](https://github.com/npm/npm/issues/13243) Node.js is not allowed to define certain environment variables on MacOS. Those are protected by the System Integrity Protection [SIP](https://en.wikipedia.org/wiki/System_Integrity_Protection).
If you're working with MacOS an you have to specify a DYLD-Path (like `DYLD_FALLBACK_LIBRARY_PATH`) to run your test-executable,

- you either have to disable the SIP (see [How to disable SIP](https://www.google.com/search?q=how+to+disable+sip+macos)),
- run with an intermediate test runner script (see below) or
- have to bypass these environment variables on a different way.

A possible workaround without disabling SIP is running a test runner script that defines the needed environment variables:

```bash
#!/bin/bash
# test-runner.sh that sets the DYLD path and calls something:
export DYLD_FALLBACK_LIBRARY_PATH=~/some/path:~/some/other/path:...
test-my-app "$@"
```

and use it like:

```json
{
  "name": "my-app",
  "cmd": "test-runner.sh",
  "cwd": "~/path/to/my-project/build/bin/Debug",
  "env": {
    "PATH": "~/path/to/my-app/build/bin/Debug/apps/my-app"
  },
  "watches": ["apps/my-app/libapp-my-app.dylib"]
}
```

## What's next?

- Enable/disable configured projects
- Add platform specific project settings
- Filtering the tree
- Enable Debugging (Set Breakpoint inside it or describe and start debugging session)

## Acknowledgements

This extension based on the [Example Test Adapter](https://github.com/hbenl/vscode-example-test-adapter).

Bandit icon made by [Freepik]("https://www.freepik.com/") from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/)

## Contributors

[Matthias Füg](https://github.com/MFueg)

Feel free to contribute...

## License

[MIT](https://github.com/dampsoft/vscode-banditcpp-test-adapter/blob/master/LICENSE)
