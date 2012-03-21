/**
 * Vost - vHost-Proxy
 *
 * TODO: com. line args. & cluster
 */ 

var Path = require('path');
var Vost = require('./lib/vost.js');

// Default settings
var settings = {
  port: 80,
  hosts: [
  	{
  		domain: [
        'yro.sl.lo'
  		],
  		target: 'localhost:4040' 
      // TODO: Many targets can be load balanced
  	}
  ]
};

// Load settings
if(Path.existsSync(__dirname + '/config.js')){
  Helper.mergeObjects(settings, require(__dirname + '/config.js'));
} 

// Create a vost instance
var vost = new Vost(settings);

// Start Server
vost.listen(settings.port);