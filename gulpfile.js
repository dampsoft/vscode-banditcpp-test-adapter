const del = require('del');
const es = require('event-stream');
const gulp = require('gulp');
const maps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');
const typescript = require('typescript');
const vsce = require('vsce');
const nls = require('vscode-nls-dev');

const tsProject = ts.createProject('./tsconfig.json', { typescript });

const inlineMap = true;
const inlineSource = false;
const outDest = 'out';

// If all VS Code langaues are support you can use nls.coreLanguages
const languages = [{ folderName: 'deu', id: 'de' }];

// ------ internal ------

function clean() {
  return del(['out/**', 'package.nls.*.json', '*.vsix']);
}

function compile(buildNls) {
  var r = tsProject
    .src()
    .pipe(maps.init())
    .pipe(tsProject())
    .js.pipe(buildNls ? nls.rewriteLocalizeCalls() : es.through())
    .pipe(buildNls ? nls.createAdditionalLanguageFiles(languages, 'i18n', outDest) : es.through());

  if (inlineMap && inlineSource) {
    r = r.pipe(maps.write());
  } else {
    r = r.pipe(
      maps.write('../out', {
        // no inlined source
        includeContent: inlineSource,
        // Return relative source map root directories per file.
        sourceRoot: '../src',
      }),
    );
  }

  return r.pipe(gulp.dest(outDest));
}

gulp.task('internal-compile', () => {
  return compile(false);
});

gulp.task('internal-nls-compile', () => {
  return compile(true);
});

gulp.task('add-i18n', () => {
  return gulp
    .src(['package.nls.json'])
    .pipe(nls.createAdditionalLanguageFiles(languages, 'i18n'))
    .pipe(gulp.dest('.'));
});

gulp.task('vsce:publish', () => {
  return vsce.publish();
});

gulp.task('vsce:package', () => {
  return vsce.createVSIX();
});

// ------ external ------

gulp.task('clean', gulp.series(clean));

gulp.task('compile', gulp.series(clean, 'internal-compile'));

gulp.task('build', gulp.series(clean, 'internal-nls-compile', 'add-i18n'));

gulp.task('publish', gulp.series('build', 'vsce:publish'));

gulp.task('package', gulp.series('build', 'vsce:package'));

gulp.task('default', gulp.series('build'));
