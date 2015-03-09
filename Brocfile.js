var babel = require('broccoli-babel-transpiler');
var sass = require('broccoli-sass');
var mergeTrees = require('broccoli-merge-trees');

var scripts = babel(['js']);
var styles = sass(['scss'], 'uncal.scss', 'uncal.css');

module.exports = mergeTrees([scripts, styles]);
