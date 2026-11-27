const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const interfaces = () => ({
  'Wi-Fi': [{family:'IPv4', address:'192.168.8.106', internal:false}],
  'Ethernet': [{family:'IPv4', address:'192.168.1.10', internal:false}],
  'vEthernet': [{family:'IPv4', address:'172.20.1.10', internal:false}],
});
test('only local and active Wi-Fi URLs are advertised; unrelated interfaces cannot connect', async () => {
  const {studioLocalNetwork} = await import('../../frontend/wifi-host.js');
  const server = {httpServer:new EventEmitter(), resolvedUrls:{local:['https://localhost:5173/'],network:['https://192.168.8.106:5173/','https://192.168.1.10:5173/','https://172.20.1.10:5173/']}, printUrls(){return this.resolvedUrls;}};
  studioLocalNetwork({interfaces, requestedHost:''}).configureServer(server);
  assert.deepEqual(server.printUrls(),{local:['https://localhost:5173/'],network:['https://192.168.8.106:5173/']});
  for (const [address, blocked] of [['127.0.0.1',false],['::1',false],['::ffff:192.168.8.106',false],['192.168.1.10',true],['172.20.1.10',true]]) {
    let destroyed=false;
    server.httpServer.emit('connection',{localAddress:address,destroy(){destroyed=true;}});
    assert.equal(destroyed,blocked,address);
  }
});
test('no Wi-Fi falls back to local-only; explicit Wi-Fi override remains supported', async () => {
  const {studioLocalNetwork} = await import('../../frontend/wifi-host.js');
  const create = () => ({httpServer:new EventEmitter(),resolvedUrls:{local:['http://localhost:5173/'],network:['http://192.168.1.10:5173/']},printUrls(){return this.resolvedUrls;}});
  const noWifi=create();studioLocalNetwork({interfaces:()=>({}),requestedHost:''}).configureServer(noWifi);
  assert.deepEqual(noWifi.printUrls().network,[]);
  const override=create();studioLocalNetwork({interfaces,requestedHost:'192.168.1.10'}).configureServer(override);
  assert.deepEqual(override.printUrls().network,['http://192.168.1.10:5173/']);
});
test('queue controls prevent check-in on an incorrect booking date',()=>{
  const queue=fs.readFileSync(path.resolve(__dirname,'../../frontend/src/pages/admin/Queue.jsx'),'utf8');
  assert.match(queue,/disabled=\{loading \|\| date !== studioToday\(\) \|\| appt.date !== studioToday\(\)\}/);
  assert.match(queue,/\["add_to_queue", "call_next"\]\.includes\(action\)/);
  assert.match(queue,/waiting.length > 0 && !nowServing && date === studioToday\(\)/);
});
