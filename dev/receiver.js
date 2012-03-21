var http = require('http')

// Setup Server
var server = http.createServer(function(req, res) {
  console.log('Received request for: ', req.headers.host, req.url);
  res.end('Here I am. (' + req.url + ')');
});
server.listen(4040);