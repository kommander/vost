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
  logLevel: 'debug',
  logFile: null,
  traceMemory: false,
  traceMemoryInterval: 1000
};

// Load settings
if(Path.existsSync(__dirname + '/config.js')){
  var fileSettings = require(__dirname + '/config.js');
  Helper.mergeObjects(settings, fileSettings);
}

// Create Logger isntance
var logger = require('./lib/logger.js').createLogger(settings.logFile, settings.logLevel);

// Create a vost instance
var vost = new Vost(settings);

// Create Debug output if wanted
if(settings.logLevel === 'debug'){
  //
  // Handle target connection events
  vost.on('target:close', function(socket){
    logger.debug('Target connection to ' + socket.hostObj.hostName + ' closed.');
  });
  vost.on('target:end', function(socket){
    logger.debug('Target connection to ' + socket.hostObj.hostName + ' ended.');
  });
  vost.on('target:error', function(socket, err){
    logger.debug('Target connection to ' + socket.hostObj.hostName + ' error:', err);
  });
  vost.on('target:timeout', function(socket){
    logger.debug('Target connection to ' + socket.hostObj.hostName + ' timed out.');
  });
  vost.on('target:connect', function(socket){
    logger.debug('Connection to ' + socket.hostObj.hostName + ' established.');
  });
            
  //
  // Handle client connection events
  vost.on('client:end', function(socket){
    logger.debug('Client connection ended.');
  });
  vost.on('client:close', function(socket){
    logger.debug('Client connection close.');
  });
  vost.on('client:error', function(socket, err){
    logger.debug('Client connection error:', err);
  });
  vost.on('client:timeout', function(socket){
    logger.debug('Client connection timed out.');
  });

  // Host not found
  vost.on('client:no-host', function(hostName){
    logger.debug('Requested host not found:', hostName);
  });
}

// Output memory stats every now and then
if(settings.traceMemory === true){
  setInterval(function(){
    logger.info('Memory:', process.memoryUsage());
  }, settings.traceMemoryInterval);
}

// Catch process exceptions that bubble up
process.on('uncaughtException', function (err) {
  if(settings.debug === true)
    logger.debug('Caught exception: ', err.stack);
});

// Start Server
vost.listen(settings.port);