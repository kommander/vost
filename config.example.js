/**
 * An example configuration for Vost
 */ 
module.exports = {
  port: 80,

  // TLS Server settings (see http://nodejs.org/api/tls.html#tls_class_tls_server)
  sslPort: 443,
  ssl: {
    key: fs.readFileSync('./server-key.pem'),
    cert: fs.readFileSync('./server-cert.pem')
  }

  //
  // Setup hosts

  hosts: [
    {
      domain: 'subdomain.yourname.com', // OR: ['subdomain1.yourname.com', 'subdomain2.yourname.com']
      target: 'localhost:8080' // OR: ['target1:8080', 'target2:8080']
    }
  ],

  retriesToDown: 3, // Mark host as down after this number of retries
  targetRetryDelay: 5, // sec. - wait before retrying to connect host
  
  message404: 'host not found.', // Host not setup
  message503: 'host unavailable.', // Host not reachable

  // Logger used in service.js
  logLevel: 'debug',
  logFile: null,

  // For debugging, this will info log the memory usage in given interval
  traceMemory: false,
  traceMemoryInterval: 1000,

  // If mail settings are given, an E-Mail can be sent on specific events
  // Install node-mailer to use E-Mail notifications (npm install mailer)
  mail: { 
    host: 'smtp.gmail.com',
    port: 465,
    ssl: true,
    username: '',
    password: '',
    from: ''
  },

  // An E-Mail will only be sent if the following settings are given
  // The E-Mail will contain the target information from the settings
  mailOnHostDown: {
    to: ['name1@domain.com', 'name2@domain.com'], // Always an array
    subject: 'Test server down'
  }
};