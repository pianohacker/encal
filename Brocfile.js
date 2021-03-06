var babel = require('broccoli-babel-transpiler');
var sass = require('broccoli-sass');
var mergeTrees = require('broccoli-merge-trees');
var pickFiles = require('broccoli-static-compiler');

var scripts = pickFiles(babel('js', {
		modules: 'amd',
	}), {
	srcDir: '/',
	destDir: '/assets'
});
var styles = sass(['scss'], 'encal.scss', 'assets/encal.css');

module.exports = mergeTrees(['static', scripts, styles]);
