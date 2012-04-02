# Vost
### A simple vHost-Proxy & Load Balancer

License: MIT
Author: https://github.com/kommander
Repo: https://github.com/kommander/vost

### Features
* Simple Setup
* Load Balancing
* Redirects
* SSL
* Host Event E-Mail Notifications

### Configuration
A configuration file for the service is by default expected at _vost/config.js_.
To find out more about the configuration parameters, have a look at  _vost/config.example.js_.

#### Proxy Hosts
The _hosts_ configuration expects an Array with host objects.
A host reacts on a domain and proxies traffic to one of the specified _targets_
<pre>
module.exports = {
  hosts: [
    {
      domain: 'subdomain.yourname.com', // OR: ['subdomain1.yourname.com', 'subdomain2.yourname.com']
      target: 'localhost:8080' // OR: ['target1:8080', 'target2:8080']
    }
  ]
};
</pre>

#### Redirect Hosts
A request for a host can be automatically redirected to another domain,
by specifying a redirect instead of a target.
<pre>
module.exports = {
  hosts: [
    {
      domain: 'subdomain.yourname.com', // OR: ['subdomain1.yourname.com', 'subdomain2.yourname.com']
      redirect: 'http://www.somethingelse.com' // Include the protocol in the URL
    }
  ]
};
</pre>

### Run
The service.js is a preset for a simple setup with Vost.
<pre>
node path/to/vost/service.js
</pre>


