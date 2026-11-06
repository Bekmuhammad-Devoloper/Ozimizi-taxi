// Keeps the throwaway test backend reachable from this machine only.
const net = require('net');
const orig = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number') {
    const cb = args.find((a) => typeof a === 'function');
    return cb ? orig.call(this, args[0], '127.0.0.1', cb) : orig.call(this, args[0], '127.0.0.1');
  }
  return orig.apply(this, args);
};
