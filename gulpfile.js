/**
 * Gulp 4 documentation https://fettblog.eu/gulp-4-parallel-and-series/
 */

// ------ packages ------

const del = require('del');
const es = require('event-stream');
const gulp = require('gulp');
const maps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');
const typescript = require('typescript');
const vsce = require('vsce');
const nls = require('vscode-nls-dev');

// ------ configuration ------

const tsProject = ts.createProject('./tsconfig.json', { typescript });

const inlineMap = true;
const inlineSource = false;
const outDest = 'out';
const languages = [{ folderName: 'deu', id: 'de' }];

// ------ internal ------

function clean() {
  return del(['out', 'dist', 'package.nls.*.json', '*.vsix']);
}

function uninstall() {
  return del(['node_modules', 'package-lock.json']);
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
        sourceRoot: '../src'
      })
    );
  }

  return r.pipe(gulp.dest(outDest));
}

function compileNoNls() {
  return compile(false);
}

function compileWithNls() {
  return compile(true);
}

function addI18n() {
  return gulp
    .src(['package.nls.json'])
    .pipe(nls.createAdditionalLanguageFiles(languages, 'i18n'))
    .pipe(gulp.dest('.'));
}

function publish() {
  return vsce.publish();
}

function package() {
  return vsce.createVSIX();
}

// ------ tasks ------

gulp.task('clean', gulp.series(clean));

gulp.task('uninstall', gulp.series(uninstall));

gulp.task('build', gulp.series(clean, compileNoNls));

gulp.task('build-nls', gulp.series(clean, compileWithNls, addI18n));

gulp.task('publish', gulp.series('build-nls', publish));

gulp.task('package', gulp.series('build-nls', package));

gulp.task('default', gulp.series('build-nls'));
