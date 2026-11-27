// Local development is always loopback-only; the cloud reverse proxy needs an all-interface bind.
function serverHost(environment = process.env.NODE_ENV) {
  return environment === 'production' ? '0.0.0.0' : '127.0.0.1';
}
module.exports = { serverHost };
