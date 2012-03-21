/**
 * Vost - vHost-Proxy
 *
 * TODO: move into lib/vost.js -> export server -> use here in service with com. line args. & cluster
 */ 

var connect = require('connect');
var Path = require('path');
var Helper = require('./lib/helper.js');
var http = require('http')
var net = require('net')

// Default settings
var settings = {
  port: 80,
  hosts: [
  	{
  		domain: [
        'yro.sl.lo'
  		],
  		target: 'localhost:4040' 
  	}
  ]
};

// Load settings
if(Path.existsSync(__dirname + '/config.js')){
  Helper.mergeObjects(settings, require(__dirname + '/config.js'));
} 

var hostConnections = {};

// Setup host connections (temporary testing)
for(var hostNum = 0; hostNum < settings.hosts.length; hostNum++){
  var host = settings.hosts[hostNum];
  var target = host.target;
  var targetArr = target.split(':');
  var connection = net.connect(targetArr[1], targetArr[0], function(){
    console.log('Connection to ' + target + ' established.');
  });
  connection.on('close', function(){
    console.log('target connection to ' + target + ' closed. (Reestablishing...)');
    connection.connect(targetArr[1], targetArr[0]);
    // on error, close, timeout... retry a few times with timeout in between
    // let the timeout grow, after settings.dieTimeout mark the server as dead
    // and send an E-Mail if setup that the service died
  });
  connection.on('error', function(err){
    console.log('target connection ' + target + ' error:', err);
    connection.connect(targetArr[1], targetArr[0]);
  });
  connection.on('timeout', function(){
    console.log('target connection ' + target + ' timeout.');
    connection.connect(targetArr[1], targetArr[0]);
  });
  
  if(Array.isArray(host.domain)){
    // for each target a connection entry...
    for(var i = 0; i < host.domain.length; i++){
      hostConnections[host.domain[i]] = connection;
    }
  } else {
    hostConnections[host.domain] = connection;
  }
}

// Setup Server
var server = net.createServer(function(sock) {
  
  sock.once('data', function(data){
    var dataStr = data.toString();

    // Parse Host from http headers (if any)
    var hostArr = dataStr.match(/[\r\n]Host: (.*)[\r\n]/ig);

    if(hostArr != null){
      // Carve out host
      var host = hostArr[0].replace(/Host: |[\r\n]/ig, '');

      // Lookup target host connection
      // TODO: Have own connection per connected sock
      var targetConnection = hostConnections[host];
      if(typeof targetConnection !== 'undefined'){
        // Pipe
        sock.pipe(targetConnection);
        targetConnection.pipe(sock);

        // Forward initial request
        if(!targetConnection.connecting){
          targetConnection.write(data);
        }
      }
    }
    
  });

});

// Start Server
server.listen(settings.port);