# Vost
### A simple vHost-Proxy & Load Balancer

License: MIT
Author: https://github.com/kommander
Repo: https://github.com/kommander/vost

### Configuration
A configuration file for the service is by default expected at _vost/config.js_.
<pre>
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
</pre>

### Run
The service.js is a preset for a simple setup with Vost.
<pre>
node path/to/vost/service.js
</pre>


