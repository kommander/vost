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
      // TODO: Many targets can be load balanced
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
  // TODO: make object -> target.hostName -> target.port
  var targetArr = target.split(':');
   
  if(Array.isArray(host.domain)){
    for(var i = 0; i < host.domain.length; i++){
      hostConnections[host.domain[i]] = targetArr;
    }
  } else {
    hostConnections[host.domain] = targetArr;
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

      // Lookup target host
      // Have own connection per connected sock
      // TODO: Handle RegEx domain settings
      var targetHost = hostConnections[host];
      if(typeof targetHost !== 'undefined'){

        // Establish target connection to pipe through
        var targetConnection = net.connect(targetHost[1], targetHost[0]);

        // Handle closing target connection
        targetConnection.on('close', function(){
          console.log('target connection to ' + target + ' closed. (Reestablishing...)');
          targetConnection.connect(targetHost[1], targetHost[0]);
          // on error, close, timeout... retry a few times with timeout in between
          // let the timeout grow, after settings.dieTimeout mark the server as dead
          // and send an E-Mail if setup that the service died
        });
        targetConnection.on('error', function(err){
          console.log('target connection ' + target + ' error:', err);
          targetConnection.connect(targetHost[1], targetHost[0]);
        });
        targetConnection.on('timeout', function(){
          console.log('target connection ' + target + ' timeout.');
          targetConnection.connect(targetHost[1], targetHost[0]);
        });

        // Handle closing client connection
        sock.on('close', function(){
          // Close target connection
          targetConnection.destroy();
        });

        // Handle error on client connection
        sock.on('error', function(){
          // Close target connection
          targetConnection.destroy();
        });

        // Handle timed out client connection
        sock.on('timeout', function(){
          // Close target connection
          targetConnection.destroy();
        });

        // Pipe on target connected
        targetConnection.on('connect', function(err){
          console.log('Connection to ' + target + ' established.');
          sock.pipe(targetConnection);
          targetConnection.pipe(sock);
        });

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