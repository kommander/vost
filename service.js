var connect = require('connect');
var Path = require('path');
var Helper = require('./lib/helper.js');

// Default settings
var settings = {
  
};

// Load settings
if(Path.existsSync(__dirname + '/config.js')){
  Helper.mergeObjects(settings, require(__dirname + '/config.js'));
} 