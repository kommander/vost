/**
 * Vost - vHost-Proxy
 *
 * License: MIT
 * Author: https://github.com/kommander
 * Repo: https://github.com/kommander/vost 
 * 
 * TODO: com. line args. & cluster
 */ 

var Path = require('path');
var Vost = require('./lib/vost.js');
var Helper = require('./lib/helper.js');

// Default settings
var settings = {
  port: 80,
  debug: false
};

// Load settings
if(Path.existsSync(__dirname + '/config.js')){
  var fileSettings = require(__dirname + '/config.js');
  Helper.mergeObjects(settings, fileSettings);
} 

// Create a vost instance
var vost = new Vost(settings);

// Create Debug output if wanted
if(settings.debug === true){
  //
  // Handle target connection events
  vost.on('target:close', function(socket){
    console.log('Target connection to ' + socket.targetObj.hostName + ' closed.');
  });
  vost.on('target:end', function(socket){
    console.log('Target connection to ' + socket.targetObj.hostName + ' ended.');
  });
  vost.on('target:error', function(socket, err){
    console.log('Target connection to ' + socket.targetObj.hostName + ' error:', err);
  });
  vost.on('target:timeout', function(socket){
    console.log('Target connection to ' + socket.targetObj.hostName + ' timed out.');
  });
  vost.on('target:connect', function(socket){
    console.log('Connection to ' + socket.targetObj.hostName + ' established.');
  });
            
  //
  // Handle client connection events
  vost.on('client:end', function(socket){
    console.log('Client connection from', socket.address(), 'ended.');
  });
  vost.on('client:close', function(socket){
    console.log('Client connection from', socket.address(), 'close.');
  });
  vost.on('client:error', function(socket, err){
    console.log('Client connection from', socket.address(), 'error:', err);
  });
  vost.on('client:error', function(socket){
    console.log('Client connection from', socket.address(), ' timed out.');
  });
}

// Start Server
vost.listen(settings.port);