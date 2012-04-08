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
  sslPort: 443,
  logLevel: 'warn',
  logFile: null,
  traceMemory: false,
  traceMemoryInterval: 1000,
  mailOnStatus: {
    delay: 3600 // Seconds
  }
};

// E-Mail State
var mailing = {
  lastStatusMail: 0
}

// Load settings
// TODO: take path to config file from command line arguments
if(Path.existsSync(__dirname + '/config.js')){
  var fileSettings = require(__dirname + '/config.js');
  Helper.mergeObjects(settings, fileSettings);
}

// Create Logger isntance
var logger = require('./lib/logger.js').createLogger(settings.logFile, settings.logLevel);

// Load mailer module if mail settings are available
if(typeof settings.mail !== 'undefined'){
  try {
    var mailer = require('mailer');
  } catch(e){
    throw new Error('Mail configuration set, but could not load mailer module. (npm install mailer)');
  }
}


// Create a vost instance
var vost = new Vost(settings);

function sendmail(to, subject, body){
  mailer.send({
    host : settings.mail.host,
    port : settings.mail.port, 
    ssl: settings.mail.ssl,
    domain : "localhost", 
    to : to,
    from : settings.mail.from,
    subject : subject,
    body: body,
    authentication : "login", 
    username : settings.mail.username,
    password : settings.mail.password
  }, function(err){
    if(err)
      logger.error(err);
  });
}

//
// Handle target connection events
vost.on('target:close', function(socket){
  var targetHost = socket.targets[socket.selectedTarget];
  logger.debug('Target connection to ' + targetHost.hostName + ':' + targetHost.port + ' closed.');
});
vost.on('target:end', function(socket){
  var targetHost = socket.targets[socket.selectedTarget];
  logger.debug('Target connection to ' + targetHost.hostName + ':' + targetHost.port + ' ended.');
});
vost.on('target:error', function(socket, err){
  var targetHost = socket.targets[socket.selectedTarget];
  logger.error('Target connection to ' + targetHost.hostName + ':' + targetHost.port + ' error:', err);
});
vost.on('target:timeout', function(socket){
  var targetHost = socket.targets[socket.selectedTarget];
  logger.warn('Target connection to ' + targetHost.hostName + ':' + targetHost.port + ' timed out.');
});
vost.on('target:connect', function(socket){
  var targetHost = socket.targets[socket.selectedTarget];
  logger.debug('Connection to ' + targetHost.hostName + ':' + targetHost.port + ' established.');
});
vost.on('target:status', function(socket, status){
  var targetHost = socket.targets[socket.selectedTarget];
  logger.debug('Connection to ' + targetHost.hostName + ':' + targetHost.port + ' returned status: ' + status);

  // Send out status E-Mail if setup
  if(settings.mailOnStatus.on
    && settings.mailOnStatus.on.indexOf(status) != -1
    && Date.now() - mailing.lastStatusMail > settings.mailOnStatus.delay * 1000){
    sendmail(
      settings.mailOnStatus.to.join(','),
      settings.mailOnStatus.subject || 'Vost: Target Host Error',
      'The target host ' + targetHost.hostName + ':' + targetHost.port + ' returned a status of 500 Server Error.'
    );
    mailing.lastStatusMail = Date.now();
  }

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
  logger.error('Client connection error:', err);
});
vost.on('client:timeout', function(socket){
  logger.warn('Client connection timed out.');
});

// Host not found
vost.on('host:not-found', function(hostName){
  logger.debug('Requested host not found:', hostName);
});

// Host down
vost.on('host:down', function(targetHost){
  logger.warn('Host ' + targetHost.hostName + ':' + targetHost.port + ' down.');

  // Send out E-Mail if setup
  if(settings.mailOnHostDown){
    sendmail(
      settings.mailOnHostDown.to.join(','),
      settings.mailOnHostDown.subject || 'Vost: Virtual Host Down',
      'The target host ' + targetHost.hostName + ':' + targetHost.port + ' is down.'
    );
  }

});

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
vost.listen(settings.port, settings.sslPort);