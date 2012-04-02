/**
 * A virtual host load balancer
 *
 * TODO:
 * - parse response status codes if wanted and emit event with statuses to have service react on
 * to monitor hosts with Vost. Use status information to prioritize hosts in balancing
 */ 

var Helper = require('./helper.js');
var util = require('util');
var tls = require('tls');
var Crypto = require('crypto');
var net = require('net');
var EventEmitter = require('events').EventEmitter;

var Vost = module.exports = function(settings){
  this.settings = {
    ssl: false,
    hosts: [],
    failsToDown: 3,
    maxRetries: 3,
    targetRetryDelay: 1, // sec.
    // TODO: take message per host
    message404: 'host not found.', // text
    message503: 'host unavailable.' // text
  };

  Helper.mergeObjects(this.settings, settings);

  this.targetHosts = {};

  // Setup hosts
  for(var hostNum = 0; hostNum < this.settings.hosts.length; hostNum++){
    var host = this.settings.hosts[hostNum];

    // Check configuration
    if(!host.target && !host.redirect){
      throw new Error('Vost configuration error. No target or redirect.');
    }
    if(host.target && host.target.length < 1){
      throw new Error('Vost configuration error. Need at least one correct target.');
    }

    // Setup targets
    var targets = [];
    if(typeof host.target === 'string'){
      // Single target
      targets.push(this._createHostTarget(host.target, host.protocol));
    } else if(Array.isArray(host.target)){
      // Multiple targets
      for(var i = 0; i < host.target.length; i++){
        targets.push(this._createHostTarget(host.target[i], host.protocol));
      }
    }

    // Add a redirect target if configured
    if(host.redirect){
      var targetObj = {
        type: 1,
        address: host.redirect
      }
      targets.push(targetObj);
    } 
    
    // Setup hosts
    if(Array.isArray(host.domain)){
      for(var i = 0; i < host.domain.length; i++){
        this.targetHosts[host.domain[i]] = targets;
      }
    } else {
      this.targetHosts[host.domain] = targets;
    }
  }

  var self = this;

  // Setup Server
  this._server = net.createServer(function(sock) {
    
    // Handle connection    
    sock.once('data', function(data){
      self._handleRequest(data, sock);
    });

  });

  // TODO: Handle server error
  this._server.on('error', function(err){
    console.log('http server error', err);
  });

  //Setup SSL server
  // TODO: handle server error
  if(this.settings.ssl !== false){
    this._sslServer = tls.createServer(self.settings.ssl, function(cleartextStream) {
      cleartextStream.once('data', function(data){
        self._handleRequest(data, cleartextStream);
      });
    });

    // TODO:
    this._sslServer.on('clientError', function(err){
      console.log('ssl client error', err);
    });
  }
};

// Be an EventEmitter
Vost.prototype.__proto__ = EventEmitter.prototype;

/**
 * Create a host target object from a configuration string
 */
Vost.prototype._createHostTarget = function(str, protocol) {
  if(typeof str !== 'string'){
    throw new Error('Vost configuration error. Target needs to be a string.');
    // TODO: take more detailed target info from configuration as an object
  }

  var targetArr = str.split(':');
  var targetObj = {
    protocol: protocol || 'http',
    type: 0, // 0 = target, 1 = redirect 
    hostName: targetArr[0], // IP Adress or host name
    port: parseInt(targetArr[1]), // Port where the target is running at
    lastSuccess: 0, // Timestamp of last successfull connection
    lastTry: 0, // Timestamp of the last connection try
    retries: 0, // How often has the target been retryed to be connected
    fails: 0, // How often has a connection attempt failed
    reachable: true, // Be optimistic
    openConnections: 0 // How many clients are connected to the target?
  }
  return targetObj;
};

/**
 * Handle a received http request
 */ 
Vost.prototype._handleRequest = function(data, sock) {
  var self = this;
  
  var dataStr = data.toString();
  
  // Parse Host from http headers (if any)
  var hostArr = dataStr.match(/[\r\n]{1,2}Host: (.*)[\r\n]{1,2}/ig);
  
  if(hostArr != null){
    
    // Carve out host
    var hostArr = hostArr[0].replace(/Host: |[\r\n]{1,2}/ig, '').split(':');
    var hostName = hostArr[0];
    var port = parseInt(hostArr[1], 10) || 80;
    
    // Lookup target host
    // Have own connection per connected sock
    // TODO: Handle RegEx domain settings
    var targets = self.targetHosts[hostName];
   
    // Choose reachable target with least connections
    if(typeof targets !== 'undefined' && targets.length > 0){
      var selectedTarget = this._nextTarget(targets);
      if(selectedTarget !== null){
        var targetHost = targets[selectedTarget];
      }
    }
    
    if(typeof targetHost !== 'undefined'){

      // Redirect
      if(targetHost.type == 1){
        this._redirect(sock, redirect);
        return;
      }

      //
      // Target Connection

      targetHost.lastTry = Date.now();

      // Establish target connection to pipe through
      var targetSocket = sock.targetSocket = net.connect(
        targetHost.port, 
        targetHost.hostName
      );

      targetSocket.selectedTarget = selectedTarget;
      targetSocket.targets = targets;
      targetSocket.clientSocket = sock;

      // Pipe on target connected
      targetSocket.on('connect', function(){
        self.emit('target:connect', this);

        // Mark successfull connection
        this.targets[this.selectedTarget].lastSuccess = Date.now();
        this.targets[this.selectedTarget].retries = 0;
        this.targets[this.selectedTarget].fails = 0;
        this.targets[this.selectedTarget].reachable = true;

        // Increase connection counter for target
        this.targets[this.selectedTarget].openConnections++;

        // Pipe data
        this.clientSocket.pipe(this);
        this.pipe(this.clientSocket);

        this.write(data);
      });

      // Handle closing target connection
      targetSocket.on('close', function(){
        self.emit('target:close', this);
      });

      // Handle ending target connection
      targetSocket.on('end', function(){
        self.emit('target:end', this);
      });

      // Hanndle error on target connection
      targetSocket.on('error', function(err){
        self.emit('target:error', this, err);

        // TODO: Choose another target host if available
        
        // Try to reconnect
        self._failTarget(this);
      });

      // Handle timed out target connection
      targetSocket.on('timeout', function(){
        self.emit('target:timeout', this);
        
        // TODO: Choose another target host if available

        // Try to reconnect
        self._failTarget(this);
      });

      //
      // Client Connection

      // Handle ending client connection
      sock.on('end', function(){
        self.emit('client:end', this);
        
        //self._closeTargetSocket(this.targetSocket);
      });

      // Handle closing client connection
      sock.on('close', function(){
        self.emit('client:close', this);
        
        // Close target connection
        self._closeTargetSocket(this.targetSocket);

        // Remove references
        delete this.targetSocket;
      });

      // Handle error on client connection
      sock.on('error', function(err){
        self.emit('client:error', this, err);
        
        // Close target connection
        self._closeTargetSocket(this.targetSocket);
      });

      // Handle timed out client connection
      sock.on('timeout', function(){
        self.emit('client:timeout', this);
        
        // Close target connection
        self._closeTargetSocket(this.targetSocket);
      });

    } else {

      // Create mutable response object
      var response = new Response({
        state: 404,
        body: self.settings.message404
      });

      // Host not found
      self.emit('host:not-found', hostName, response);
         
      // Say something...
      sock.write(response.bake());

      // Get rid of socket
      sock.end();
      sock.destroy();
    }
  }
};

/**
 * Send HTTP redirect to client
 */
Vost.prototype._redirect = function(clientSocket, redirect) {
  // Create mutable response object
  var response = new Response({
    state: 302
  });
  response._headers.push('Location: ' + redirect.address)

  // Send...
  clientSocket.write(response.bake());

  // Get rid of clientSocket
  clientSocket.end();
  clientSocket.destroy();
};

/**
 * Get next target index for a reachable host,
 * if no host is reachable and a redirect is set, return that
 */
Vost.prototype._nextTarget = function(targets, currentTarget) {
  var next = null;

  // Sort targets to get target with least connections on top
  targets.sort(function(a, b){
    return a.openConnections > b.openConnections;
  });

  // Select next reachable target
  for(var i = 0; i < targets.length; i++){
    if(i != currentTarget && targets[i].reachable === true){
      return i;
    }
  }
  
  // Return redirect if in target list
  if(next == null && targets[targets.length - 1].type = 1){
    return targets.length - 1
  }

  return next;
};

/**
 * Close the target socket and decrease connection counter
 */ 
Vost.prototype._closeTargetSocket = function(targetSocket) {
  // Close target connection
  targetSocket.end();
    
  if(!targetSocket._closed){
    // Decrease connection counter for target
    targetSocket.targets[targetSocket.selectedTarget].openConnections--;

    // Remove references
    delete targetSocket.clientSocket;
    delete targetSocket.targets;

    // Avoid multiple closing attempts
    targetSocket._closed = true;
  }
};

Vost.prototype._markHostDown = function(targetHost) {
  
  // Emit host:down only once
  if(targetHost.reachable === true)
    this.emit('host:down', targetHost, response);

  // Set target host to not reachable
  targetHost.reachable = false;
  
};

Vost.prototype._replyHostDown = function(targetSocket) {
  var targetHost = targetSocket.targets[targetSocket.selectedTarget];
  
  // Create mutable response object
  var response = new Response({
    state: 503,
    body: this.settings.message503
  });

  // Give response
  targetSocket.clientSocket.write(response.bake());
  
  // Get rid of client socket
  targetSocket.clientSocket.end();
    
};

/**
 * Mark target as failed
 */
Vost.prototype._failTarget = function(targetSocket) {
  
  var targetHost = targetSocket.targets[targetSocket.selectedTarget];
  targetHost.fails++;

  // Too many fails, seems down
  if(targetHost.fails >= this.settings.failsToDown){
    this._markHostDown(targetSocket);
  }
  
  // If has another target, choose next
  if(targetSocket.targets.length > 1){
    var selectedTarget = this._nextTarget(targetSocket.targets, targetSocket.selectedTarget);
    targetSocket.selectedTarget = selectedTarget;
    if(selectedTarget !== null){
      var targetHost = targetSocket.targets[selectedTarget];

      // Redirect
      if(targetHost.type == 1){
        this._redirect(sock, redirect);
        return;
      }

      // Connect next host

    } else {
      this._replyHostDown(targetSocket);
    }      
    return;
  }

  // If current target reached max retries, tell client host is down
  if(targetHost.retries >= this.settings.maxRetries){
    this._replyHostDown(targetSocket);
  } else {
    // otherwise retry current target
    this._reconnectTarget(targetSocket);
  }  
  
};

/**
 * Reconnect a target connection after the configured timeout for given max times,
 * mark not reachable after maxRetries
 */
Vost.prototype._reconnectTarget = function(targetSocket) {
  var targetHost = targetSocket.targets[targetSocket.selectedTarget];
  targetHost.retries++;
  
  // Retry 
  setTimeout(function(){
    if(targetHost.reachable === true){
      targetHost.lastTry = Date.now();
      targetSocket.connect(targetHost.port, targetHost.hostName);
    }
  }, this.settings.targetRetryDelay * 1000);

};

/**
 * Make the internal server listen
 * if SSL was set to true, the second argument specifies the SSL Server port
 */
Vost.prototype.listen = function(port, sslPort) {
  this._server.listen.call(this._server, port);

  // Start SSL server if setup
  if(this.settings.ssl !== false){
    this._sslServer.listen.call(this._sslServer, sslPort);
  }
};

/**
 * Support common node api
 */
Vost.createServer = function(settings){
  return new Vost(settings);
}

//
// HTTP Response

/**
 * A simple response wrapper, closing the connection by default
 */
var Response = function(options){
  this._protocol = options.protocol || 'HTTP/1.1';
  this._state = Response.STATE[options.state] || Response.STATE[200];
  this._headers = [
    'X-Powered-By: Vost',
    'Server: Vost',
    'Content-Type: text/plain; charset=utf-8',
    'Connection: close'
  ];
  this._body = options.body || 'nothing to say.';
}

/**
 * Return a string for sending
 */
Response.prototype.bake = function() {
  // Add content length header
  this._headers.push('Content-Length: ' + this._body.length.toString());
           
  return this._protocol + ' ' + this._state + '\n' +
    this._headers.join('\n') + '\n\n' + this._body;
};

// Statics
Response.STATE = {};
Response.STATE[200] = '200 OK';
Response.STATE[302] = '302 Moved Temporarily';
Response.STATE[404] = '404 Not Found';
Response.STATE[503] = '503 Service Unavailable';