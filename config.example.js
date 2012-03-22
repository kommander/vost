/**
 * An example configuration for Vost
 */ 
module.exports = {
  port: 80,

  //
  // Setup hosts

  hosts: [
    {
      domain: 'subdomain.yourname.com', // OR: ['subdomain1.yourname.com', 'subdomain2.yourname.com']
      target: 'localhost:8080' // OR: ['target1:8080', 'target2:8080']
    }
  ],

  retriesToDown: 3,
  targetRetryDelay: 5, // sec.
  delayAfterDown: 60, // sec.
  message404: 'host not found.',
  logLevel: 'debug',
  logFile: null,
  traceMemory: false,
  traceMemoryInterval: 1000,
  mail: { // If mail settings are given, an E-Mail can be sent on specific events
    host: 'smtp.gmail.com',
    port: 465,
    ssl: true,
    username: '',
    password: '',
    from: ''
  },
  mailOnHostDown: ['name1@domain.com', 'name2@domain.com']
};