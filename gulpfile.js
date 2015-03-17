
/* jshint node:true */
'use strict';

var webpack = require('webpack');
var karma = require('karma').server;
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var webpackConfig = require('./webpack.config');

var AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'opera >= 23',
  'ios >= 7',
  'android >= 4.4',
  'bb >= 10'
];


// Create a Webpack compiler for development
var DevWebpackCompiler = (function() {
  var devCompiler;

  function createCompiler() {
    var conf = Object.create(webpackConfig);
    conf.devtool = 'source-map';
    conf.debug = true;
    conf.watch = true;
    conf.output.path = '.tmp/scripts';
    return webpack(conf);
  }

  return {
    getWebpack: function() {
      if (!devCompiler) {
        devCompiler = createCompiler();
      }
      return devCompiler;
    }
  }
})();

// Lint Javascript
gulp.task('jshint', function () {
  return gulp.src([
      'app/scripts/**/*.js',
      'server/**/*.js',
      'test/**/*.js',
      '!app/scripts/vendor/**/*.js',
  ])
    .pipe($.jshint({ lookup: true }))
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe($.jshint.reporter('fail'));
});

// Optimize images
gulp.task('images', function () {
  return gulp.src('app/images/**/*')
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe(gulp.dest('dist/app/images'))
    .pipe($.size({title: 'images'}));
});

// Compile express server to ECMAScript 5
gulp.task('server:build', function() {
  return gulp.src('server/**/*.js')
    .pipe($.babel({blacklist: ['useStrict'], modules: 'common'}))
    .pipe(gulp.dest('.tmp/server'));
});

// Copy web fonts to dist
gulp.task('fonts', function () {
  return gulp.src(require('main-bower-files')().concat(['app/{,styles/}fonts/**/*']))
    .pipe($.filter('**/*.{eot,svg,ttf,woff}'))
    .pipe($.flatten())
    .pipe(gulp.dest('dist/app/fonts'));
});

// Compile and automatically prefix stylesheets
gulp.task('styles', function () {
  return gulp.src('app/styles/main.less')
    .pipe($.changed('styles', {extension: '.less'}))
    .pipe($.less())
    .pipe($.autoprefixer({browsers: AUTOPREFIXER_BROWSERS}))
    .pipe(gulp.dest('.tmp/styles'));
});

// Scan your HTML for assets & optimize them
gulp.task('html', ['styles'], function () {
  var lazypipe = require('lazypipe');
  var minifyCSS = require('gulp-minify-css');
  var cssChannel = lazypipe()
    .pipe(minifyCSS)
    .pipe($.replace, /'fonts\/glyphicons[.a-z]*/g, '\'../fonts')
  var assets = $.useref.assets({searchPath: '{.tmp,app,.}'});

  return gulp.src('app/*.html')
    .pipe(assets)
    // Concatenate and minify JavaScript
    .pipe($.if('*.js', $.uglify()))
    // Concatenate and minify Styles
    .pipe($.if('*.css', cssChannel()))
    .pipe(assets.restore())
    .pipe($.useref())
    // Minify any HTML
    .pipe($.if('*.html', $.minifyHtml({conditionals: true, loose: true})))
    .pipe(gulp.dest('dist/app'))
    .pipe($.size({title: 'html'}));
});

// Clean output directory and cached images
gulp.task('clean', function (callback) {
  var del = require('del')
  del(['.tmp', 'dist'], function () {
    $.cache.clearAll(callback);
  });
});

// Run connect server
gulp.task('connect', ['styles'], function () {
  var serveStatic = require('serve-static');
  var serveIndex = require('serve-index');
  var httpProxy = require('http-proxy');
  var app = require('connect')()
    .use(DevWebpackCompiler.getWebpack())
    .use(require('connect-livereload')({port: 35729}))
    .use(serveStatic('.tmp'))
    .use(serveStatic('app'))
    // paths to bower_components should be relative to the current file
    // e.g. in app/index.html you should use ../bower_components
    .use('/bower_components', serveStatic('bower_components'))
    .use(serveIndex('app'));

  var serverProxy = httpProxy.createProxyServer();
  app.use(function(req, res){ 
    serverProxy.web(req, res, { target: 'http://localhost:3000' });
  });

  require('http').createServer(app)
    .listen(9000)
    .on('listening', function () {
      console.log('Started connect web server on http://localhost:9000');
    });
});

// Minify and compile handlebars templates
// Handlebars can be loaded with a Webpack loader but without minification
gulp.task('templates', function () {
  return gulp.src('app/scripts/**/*.hbs')
    .pipe($.minifyHtml())
    .pipe($.handlebars())
    .pipe($.defineModule('commonjs'))
    .pipe(gulp.dest('.tmp/scripts'))
});

// Pack Javascripts
gulp.task('webpack', ['templates'], function(callback) {
  DevWebpackCompiler.getWebpack().run(function(err, stats) {
    if(err) throw new $.util.PluginError("webpack", err);
      $.util.log("[webpack]", stats.toString({colors: true}));
      callback();
  });
});

// Copy assets to distribution path
gulp.task('extras', function () {
  return gulp.src([
    'app/*.*',
    '!app/*.html'
  ]).pipe(gulp.dest('dist/app'));
});

// Pack JavaScript modules for production
gulp.task('webpack:build', ['templates'], function(callback) {
  var conf = Object.create(webpackConfig);

  conf.plugins = conf.plugins.concat(
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin()
  );

  // run webpack
  webpack(conf, function(err, stats) {
    if(err) throw new $.util.PluginError("webpack:build", err);
    $.util.log("[webpack:build]", stats.toString({
      colors: true
    }));
    callback();
  });
});

// Run karma for development, will watch and reload
gulp.task('tdd:frontend', function(callback) {
  karma.start({
    configFile: __dirname + '/karma.conf.js'
  }, callback);
  gulp.watch('app/scripts/**/*.hbs', ['templates']);
});

// Reload tests on server when file changes
gulp.task('tdd:server', function() {
  gulp.watch('server/**/*.js', ['test:server']);
  gulp.watch('test/server/**/*.js', ['test:server']);
});

// Run tests on frontend
gulp.task('test:frontend', ['templates'], function(callback) {
  karma.start({
    configFile: __dirname + '/karma.conf.js',
    singleRun: true
  }, callback);
});

// Run server tests
gulp.task('test:server', function() {
  var files = ['test/server/setup.js', 'test/server/unit/**/*.spec.js'];

  require('babel/register')({ modules: 'common' });
  return gulp.src(files, { read: false })
    .pipe($.mocha({ reporter: 'spec', growl: true }));
});

// Run tests and report for ci
gulp.task('test:frontend:ci', ['templates'], function(callback) {
  karma.start({
    configFile: __dirname + '/karma.conf.js',
    singleRun: true,
    browsers: ['PhantomJS'],
    reporters: ['dots', 'junit'],
    junitReporter: {
      outputFile: '.tmp/frontend-tests.xml',
    }
  }, callback);
});

// Run server tests
gulp.task('test:server:ci', function() {
  var files = ['test/server/setup.js', 'test/server/unit/**/*.spec.js'];
  process.env.XUNIT_FILE = '.tmp/server-tests.xml';

  // ensure .tmp path exists, otherwise an error will be throw
  var fs = require('fs');
  if (!fs.existsSync('.tmp')) {
    fs.mkdirSync('.tmp');
  }

  require('babel/register')({ modules: 'common' });
  return gulp.src(files, { read: false })
    .pipe($.mocha({ reporter: 'xunit-file' }));
});

// Run development server environmnet
gulp.task('serve', ['webpack', 'run:server', 'connect', 'watch'], function () {
  require('opn')('http://localhost:9000');
});

// Watch files for changes & reload
gulp.task('watch', ['connect'], function () {
  $.livereload.listen();

  // watch for changes
  gulp.watch([
    'app/*.html',
    '.tmp/styles/**/*.css',
    '.tmp/scripts/**/*.js',
    'app/images/**/*'
  ]).on('change', $.livereload.changed);

  gulp.watch('app/scripts/**/*.js', ['webpack']);
  gulp.watch('app/scripts/**/*.hbs', ['templates', 'webpack']);
  gulp.watch('app/styles/**/*.less', ['styles']);
});

// Watch for changes on server files
gulp.task('run:server', ['server:build'], function() {
  var preprocessed = gulp.src(['.tmp/server/app.js'])
    .pipe($.preprocess({
      context: { DEVELOPMENT: true }
    }))
    .pipe(gulp.dest('.tmp/server'))
    .on('end', function() {
      $.nodemon({
        script: '.tmp/server/app.js',
        watch: ['.tmp/server'],
        ignore: ['node_modules']
      });
    });
});

// Perfom frontend and backend tests
gulp.task('test', ['test:server', 'test:frontend']);

// Run all tests and create xunit reports, usefull for continuous integration
gulp.task('test:ci', ['test:server:ci', 'test:frontend:ci']);

// Put the whole project on tdd mode
gulp.task('tdd', ['tdd:server', 'tdd:frontend']);

// Compile and copy compiled server to dist
gulp.task('server', ['server:build'], function() {
  var merge = require('merge-stream');

  var copied = gulp.src([
    'package.json',
    '.tmp/server/**/*.js',
    '!.tmp/server/app.js'
  ]).pipe(gulp.dest('dist'));

  var preprocessed = gulp.src(['.tmp/server/app.js'])
    .pipe($.preprocess({
      context: { PRODUCTION: true }
    }))
    .pipe(gulp.dest('dist'));

  return merge(copied, preprocessed);
});

// Build the project for distribution
gulp.task('build', ['jshint', 'webpack:build', 'server', 'html', 'images', 'fonts', 'extras'], function () {
  var size = $.size({title: 'build', gzip: true })
  return gulp.src('dist/app/**/*.js')
    .pipe(size)
    .pipe($.notify({
      onLast: true,
      title: 'Build complete',
      message: function() {
        return 'Total scripts size (gzip) ' + size.prettySize;
      }
    }));
});

// Clean all and build from scratch
gulp.task('default', ['clean'], function () {
  gulp.start('build');
});
