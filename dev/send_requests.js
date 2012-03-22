/**
 * Send some requests
 */
var http = require('http');
var util = require('util');

var host = 'localhost';
var port = '9001';
var howMany = 10000;
var delay = 5;
var counter = 0;
var _currentDelay = 0;

console.log('Sending ' + howMany + ' requests to ' + host + ':' + port);

for(var i = 0; i < howMany; i++){

  setTimeout(function(){

    var options = {
      host: host,
      port: port,
      path: '/',
      method: 'GET'
    };

    var req = http.request(options, function(res) {
      
      var data = [];
      res.on('data', function(d) {
        data.push(d);
      });
      res.on('end', function() {
        util.print('.');
        counter++;
        if(counter == howMany){
          console.log('Done.');
        }
      });
    });
    
    req.end();

  }, _currentDelay);

  _currentDelay += delay;
}
  