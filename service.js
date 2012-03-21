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
        var targetConnection = sock.targetConnection = net.connect(targetHost[1], targetHost[0]);

        // Handle closing target connection
        sock.targetConnection.on('close', function(){
          console.log('target connection to ' + target + ' closed.');
        });
        sock.targetConnection.on('end', function(){
          console.log('target connection to ' + target + ' ended.');
        });
        sock.targetConnection.on('error', function(err){
          console.log('target connection ' + target + ' error:', err);
          this.connect(targetHost[1], targetHost[0]);
          // on error, timeout... retry a few times with timeout in between
          // let the timeout grow, after settings.dieTimeout mark the server as dead
          // and send an E-Mail if setup that the service died
        });
        sock.targetConnection.on('timeout', function(){
          console.log('target connection ' + target + ' timeout.');
          this.connect(targetHost[1], targetHost[0]);
        });

        // Handle closing client connection
        sock.on('close', function(){
          console.log('client connection closed');
          // Close target connection
          this.targetConnection.destroy();
        });

        // Handle error on client connection
        sock.on('error', function(){
          // Close target connection
          this.targetConnection.destroy();
        });

        // Handle timed out client connection
        sock.on('timeout', function(){
          console.log('client connection timed out');
          // Close target connection
          this.targetConnection.destroy();
        });

        // Pipe on target connected
        sock.targetConnection.on('connect', function(err){
          console.log('Connection to ' + target + ' established.');
          sock.pipe(sock.targetConnection);
          sock.targetConnection.pipe(sock);
        });

        // Forward initial request
        if(!sock.targetConnection.connecting){
          sock.targetConnection.write(data);
        }
      }
    }
    
  });

});

// Start Server
server.listen(settings.port);