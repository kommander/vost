var http = require('http')
var util = require('util')

//Take command line arguments
var settings = {
	ports: [4040]
};

process.argv.forEach(function (val, index, array) {
  if(index < 2)
    return;
  var valArr = val.split('=');
  switch(valArr[0]){
    case 'ports':
        settings.ports = valArr[1].split(',');
      break;
    default:
      util.print('Argument unknown or malformed: ' + val + '\nStopping process.');
      process.exit();
  }
});

// Setup Server Instances
for(var i = 0; i < settings.ports.length; i++){
  var port = parseInt(settings.ports[i], 10);
  var server = http.createServer((function(port){
    return function(req, res) {
	    console.log('Received request for: ', req.headers.host, req.url, '@', port);
      //res.statusCode = 500;
	    res.end('Here I am. (' + req.headers.host + req.url + ' @ ' + port + ')');
    };
	})(port));
	server.listen(port);	
}
