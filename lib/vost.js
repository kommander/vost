/**
 * A virtual host load balancer
 *
 * TODO:
 * - Provide redirecting hosts
 * - Balance targets and redirects
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

    // TODO: create and use multiple targets
    var target = host.target;
    var targetArr = target.split(':');
    var targetObj = {
      hostName: targetArr[0],
      port: targetArr[1],
      credentials: credentials,
      lastSuccess: 0,
      lastTry: 0,
      retries: 0,
      reachable: true
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
      self._handleRequest(data, sock);
    });
  });

  //Setup SSL server
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
 * Handle a received http request
 */ 
Vost.prototype._handleRequest = function(data, sock) {
  var self = this;
  
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
      targetHost.lastTry = Date.now();
      var targetConnection = sock.targetConnection = net.connect(targetHost.port, targetHost.hostName);
      targetConnection.hostObj = targetHost;
      targetConnection.clientSocket = sock;

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

        // TODO: Choose another target host if available
        
        // Try to reconnect
        self._reconnectTarget(this);
      });

      // Handle timed out target connection
      sock.targetConnection.on('timeout', function(){
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
        this.targetConnection.end();
      });

      // Handle closing client connection
      sock.on('close', function(){
        self.emit('client:close', this);
        
        // Close target connection
        this.targetConnection.end();

        // Remove references
        delete this.targetConnection.clientSocket
        delete this.targetConnection;
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
        targetHost.reachable = true;

        // Pipe data
        sock.pipe(sock.targetConnection);
        sock.targetConnection.pipe(sock);
      });

      // Forward initial request
      if(!sock.targetConnection.connecting){
        sock.targetConnection.write(data);
      }
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
  targetSocket.hostObj.retries++;
  
  if(targetSocket.hostObj.retries > this.settings.retriesToDown){
    
    // Create mutable response object
    var response = new Response({
      state: 503,
      body: this.settings.message503
    });

    // Emit host:down only once for every reconnect timeout
    if(targetSocket.hostObj.reachable === true)
      this.emit('host:down', targetSocket.hostObj, response);

    // Set target host to not reachable
    targetSocket.hostObj.reachable = false;

    // Give response
    targetSocket.clientSocket.write(response.bake());
    
    // Get rid of client socket
    targetSocket.clientSocket.end();
    
    return;
  } 
  
  // Retry 
  setTimeout(function(){
    if(targetSocket.hostObj.reachable === true){
      targetSocket.hostObj.lastTry = Date.now();
      targetSocket.connect(targetSocket.hostObj.port, targetSocket.hostObj.hostName);
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
Response.STATE[404] = '404 Not Found';
Response.STATE[503] = '503 Service Unavailable';