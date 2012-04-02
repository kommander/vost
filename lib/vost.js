/**
 * A virtual host load balancer
 *
 * TODO:
 * - Provide redirecting hosts
 * - Balance targets and redirects
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
    retriesToDown: 3,
    targetRetryDelay: 5, // sec.
    // TODO: take message per host
    message404: 'host not found.', // text
    message503: 'host unavailable.' // text
  };

  Helper.mergeObjects(this.settings, settings);

  this.targetHosts = {};

  // Setup hosts
  for(var hostNum = 0; hostNum < this.settings.hosts.length; hostNum++){
    var host = this.settings.hosts[hostNum];

    // If key and cert are given, create SecureContext
    if(host.key && host.cert){
      util.print('Creating Credentials for ' + util.inspect(host.domain) + '...\n');
      var credentials = Crypto.createCredentials(host);
    }

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
    retries: 0, // How often has the target failed to be connected
    reachable: true // Be optimistic
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
   
    // TODO: Choose viable target, for now just take the first one
    // TODO: Count connections to target, update count on disconnects
    // TODO: Order targets by how many connections are open
    // TODO: Choose reachable target with least connections
    if(typeof targets !== 'undefined'){
      var selectedTarget = 0;
      var targetHost = targets[selectedTarget];
    }
    
    if(typeof targetHost !== 'undefined'){

      // Redirect
      if(targetHost.type == 1){
        // Create mutable response object
        var response = new Response({
          state: 302
        });
        response._headers.push('Location: ' + targetHost.address)

        // Send...
        sock.write(response.bake());

        // Get rid of socket
        sock.end();
        sock.destroy();
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
        this.targets[this.selectedTarget].reachable = true;

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
        self._reconnectTarget(this);
      });

      // Handle timed out target connection
      targetSocket.on('timeout', function(){
        self.emit('target:timeout', this);
        
        // TODO: Choose another target host if available

        // Try to reconnect
        self._reconnectTarget(this);
      });

      //
      // Client Connection

      // Handle ending client connection
      sock.on('end', function(){
        self.emit('client:end', this);
        
        // Close target connection
        this.targetSocket.end();
      });

      // Handle closing client connection
      sock.on('close', function(){
        self.emit('client:close', this);
        
        // Close target connection
        this.targetSocket.end();

        // Remove references
        delete this.targetSocket.clientSocket
        delete this.targetSocket;
      });

      // Handle error on client connection
      sock.on('error', function(err){
        self.emit('client:error', this, err);
        
        // Close target connection
        this.targetSocket.end();
      });

      // Handle timed out client connection
      sock.on('timeout', function(){
        self.emit('client:timeout', this);
        
        // Close target connection
        this.targetSocket.end();
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
 * Reconnect a target connection after the configured timeout for given max times,
 * drop a host:down event after max retries are reached
 */
Vost.prototype._reconnectTarget = function(targetSocket) {
  console.log('reconnect');
  var targetHost = targetSocket.targets[targetSocket.selectedTarget];
  targetHost.retries++;
  
  if(targetHost.retries > this.settings.retriesToDown){
    
    // Create mutable response object
    var response = new Response({
      state: 503,
      body: this.settings.message503
    });

    // Emit host:down only once for every reconnect timeout
    if(targetHost.reachable === true)
      this.emit('host:down', targetHost, response);

    // Set target host to not reachable
    targetHost.reachable = false;

    // Give response
    targetSocket.clientSocket.write(response.bake());
    
    // Get rid of client socket
    targetSocket.clientSocket.end();
    
    return;
  } 
  
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