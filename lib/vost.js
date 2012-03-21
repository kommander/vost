/**
 * A virtual host load balancer
 */ 

var Helper = require('./helper.js');
var http = require('http')
var net = require('net')
var EventEmitter = require('events').EventEmitter;

var Vost = module.exports = function(settings){
  this.settings = {
    hosts: [],
    retriesToDown: 3,
    targetRetryDelay: 5, // sec.
    delayAfterDown: 60 // sec.
  };

  Helper.mergeObjects(this.settings, settings);

  this.targetHosts = {};

  // Setup hosts
  for(var hostNum = 0; hostNum < this.settings.hosts.length; hostNum++){
    var host = this.settings.hosts[hostNum];
    var target = host.target;
    var targetArr = target.split(':');
    var targetObj = {
      hostName: targetArr[0],
      port: targetArr[1],
      lastSuccess: 0,
      retries: 0
    }
     
    if(Array.isArray(host.domain)){
      for(var i = 0; i < host.domain.length; i++){
        this.targetHosts[host.domain[i]] = targetObj;
      }
    } else {
      this.targetHosts[host.domain] = targetObj;
    }
  }

  var self = this;

  // Setup Server
  this._server = net.createServer(function(sock) {
    
    sock.once('data', function(data){
      var dataStr = data.toString();

      // Parse Host from http headers (if any)
      var hostArr = dataStr.match(/[\r\n]Host: (.*)[\r\n]/ig);

      if(hostArr != null){
        // Carve out host
        var hostArr = hostArr[0].replace(/Host: |[\r\n]/ig, '').split(':');
        var hostName = hostArr[0];
        var port = parseInt(hostArr[1], 10) || 80;
        
        // Lookup target host
        // Have own connection per connected sock
        // TODO: Handle RegEx domain settings
        var targetHost = self.targetHosts[hostName];
        if(typeof targetHost !== 'undefined'){

          //
          // Target Connection

          // Establish target connection to pipe through
          var targetConnection = sock.targetConnection = net.connect(targetHost.port, targetHost.hostName);
          targetConnection.hostObj = targetHost;

          // Handle closing target connection
          sock.targetConnection.on('close', function(){
            self.emit('target:close', this);
          });

          // Handle ending target connection
          sock.targetConnection.on('end', function(){
            self.emit('target:end', this);
          });

          // Hanndle error on target connection
          sock.targetConnection.on('error', function(err){
            self.emit('target:error', this, err);

            // Try to reconnect
            this._reconnectTarget(this);
          });

          // Handle timed out target connection
          sock.targetConnection.on('timeout', function(){
            self.emit('target:timeout', this);
            
            // Try to reconnect
            this._reconnectTarget(this);
          });

          //
          // Client Connection

          // Handle ending client connection
          sock.on('end', function(){
            self.emit('client:end', this);
            
            // Close target connection
            this.targetConnection.end();
          });

          // Handle closing client connection
          sock.on('close', function(){
            self.emit('client:close', this);
            
            // Close target connection
            this.targetConnection.end();
          });

          // Handle error on client connection
          sock.on('error', function(err){
            self.emit('client:error', this, err);
            
            // Close target connection
            this.targetConnection.end();
          });

          // Handle timed out client connection
          sock.on('timeout', function(){
            self.emit('client:timeout', this);
            
            // Close target connection
            this.targetConnection.end();
          });

          // Pipe on target connected
          sock.targetConnection.on('connect', function(){
            self.emit('target:connect', this);

            // Mark successfull connection
            targetHost.lastSuccess = Date.now();
            targetHost.retries = 0;

            // Pipe data
            sock.pipe(sock.targetConnection);
            sock.targetConnection.pipe(sock);
          });

          // Forward initial request
          if(!sock.targetConnection.connecting){
            sock.targetConnection.write(data);
          }
        } else {
          self.emit('client:no-host', hostName);

          // Say something...
          sock.write('not found.');
          sock.end();
          sock.destroy();
        }
      }
      
    });

  });
};

// Be an EventEmitter
Vost.prototype.__proto__ = EventEmitter.prototype;

/**
 * Reconnect a target connection after the configured timeout for given max times,
 * drop a host:down event after max retries are reached
 */
Vost.prototype._reconnectTarget = function(targetSocket) {
  targetSocket.hostObj.retries++;
  var nextRetry = this.settings.targetRetryDelay;
  if(targetSocket.hostObj.retries > this.settings.retriesToDown){
    this.emit('host:down', [targetSocket.hostObj]);
    var nextRetry = this.settings.delayAfterDown;
  } 
  
  // Retry 
  setTimeout(function(){
    targetSocket.connect(targetSocket.hostObj.port, targetSocket.hostObj.hostName);
  }, nextRetry * 1000);
};

/**
 * Make the internal server listen
 */
Vost.prototype.listen = function() {
  this._server.listen.apply(this._server, arguments);
};