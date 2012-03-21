/**
 * An example configuration for Vost
 */ 
module.exports = {
  hosts: [
    {
      domain: 'subdomain.yourname.com', // OR: ['subdomain1.yourname.com', 'subdomain2.yourname.com']
      target: 'localhost:8080' // OR: ['target1:8080', 'target2:8080']
    }
  ],
  retriesToDown: 3,
  targetRetryDelay: 5, // sec.
  delayAfterDown: 60 // sec.
};