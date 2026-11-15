'use strict';
// Loopback-only physical-input bench. No serial device or external request exists here.
const fs=require('fs'),path=require('path'),http=require('http');
function createBench(){
  // The shared bridge imports the production Grbl parser using extensionless imports.
  // Use the already installed transform, with caching disabled and no build output.
  require('@babel/register')({babelrc:false,configFile:false,cache:false,plugins:['@babel/plugin-transform-modules-commonjs'],only:[/src/],ignore:[/node_modules/]});
  const {createService}=require('../../src/server/services/touch/job-service.js');
  const {bridge}=require('../../src/server/services/touch/__tests__/support/sim-bridge.js');
  const Simulator=require('../../grbl-simulator/grbl-simulator');
  const sim=new Simulator({profile:'lunyee',homingMs:1200});
  const controller=bridge(sim),controllers={};
  const service=createService({get:()=>controllers},{get:()=>[]});
  let sequence=0,transport=0;
  const streams=new Set();
  function packet(id){return {version:1,epoch:'parcours-lunyee',sequence:++sequence,sentAt:Date.now(),transportId:id,controllers:service.list()};}
  function actor(body){return {kind:'touch',id:body.clientId||'parcours-test',label:body.clientLabel||'Parcours'};}
  function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
  function open(){controllers.SIM=controller;service.observe();return packet(null);}
  async function handle(req,res){
    const url=new URL(req.url,'http://127.0.0.1');
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403);res.end();return;}
    if(url.pathname==='/api/custom/health'){json(res,{loaded:true,protocol:1,transport:'ndjson'});return;}
    if(url.pathname==='/api/touch-job'&&req.method==='GET'){json(res,packet(null));return;}
    if(url.pathname==='/api/touch-events'){
      const id='parcours-'+(++transport),who=actor({clientId:url.searchParams.get('clientId')});service.openTransport(id,who);
      res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
      const send=()=>res.write(JSON.stringify(packet(id))+'\n');send();const timer=setInterval(send,250);streams.add(res);
      req.on('close',()=>{clearInterval(timer);streams.delete(res);service.closeTransport(id);});return;
    }
    if(req.method==='POST'){
      let text='';for await(const chunk of req){text+=chunk;if(text.length>32768)throw new Error('Request too large');}
      const body=JSON.parse(text||'{}');
      if(url.pathname==='/parcours/open'){json(res,open());return;}
      if(url.pathname==='/parcours/sim'){
        if(body.input==='probe'){sim.probeMode=body.state==='free'?'miss':'contact';sim.probeTriggered=body.state!=='free';sim.probeStuck=body.state==='permanent';sim.pinState.probe=body.state!=='free';}
        else if(body.input==='limit')sim.setLimitPin(body.axis||'x',body.on!==false);
        else if(body.input==='pilot'){service.control.claim('SIM',{kind:'touch',id:'other-device',label:'PC atelier'});}
        else throw new Error('Unknown simulated input');
        json(res,packet(null));return;
      }
      if(url.pathname==='/api/touch-job'){const data=await service.action(body,actor(body));json(res,{...data,snapshot:packet(body.transportId)});return;}
      if(url.pathname==='/api/touch-projects/read'){json(res,{version:'none',entry:null});return;}
      json(res,{});return;
    }
    if(url.pathname==='/api/watch/status'){json(res,{configured:false});return;}
    if(url.pathname==='/api/touch-backlight'){json(res,{available:false,local:true});return;}
    if(url.pathname==='/api/touch-projects'){json(res,{entries:[]});return;}
    if(url.pathname==='/connection-fixture.js'){
      res.writeHead(200,{'Content-Type':'text/javascript'});
      res.end("localStorage.setItem('cnc',JSON.stringify({state:{session:{token:'parcours-local'}}}));window.io={connect:function(){var h={},s={on:function(n,f){h[n]=f;},disconnect:function(){},emit:function(n,port,options,done){if(n==='list'){setTimeout(function(){if(h['serialport:list'])h['serialport:list']([{port:'SIM',manufacturer:'LUNYEE simulator',inuse:false}]);},0);}else if(n==='open'){fetch('/parcours/open',{method:'POST'}).then(function(){if(done)done(null);});}else throw Error('No physical command in the connection fixture');}};setTimeout(function(){if(h.connect)h.connect();},0);return s;}};");return;
    }
    const root=path.join(__dirname,'touch'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    let data=fs.readFileSync(file);if(file.endsWith('index.html'))data=data.toString().replace('/socket.io/socket.io.js','/connection-fixture.js');
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(data);
  }
  const server=http.createServer((req,res)=>{handle(req,res).catch(e=>json(res,{code:e.code,message:e.message,params:e.params,reasons:e.reasons},409));});
  async function close(){streams.forEach(res=>res.end());service.dispose();controller.close();sim.stopPlannerExecutor();if(typeof sim.dispose==='function')sim.dispose();else if(typeof sim.destroy==='function')sim.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));}
  return {server,service,sim,controller,open,close};
}
module.exports={createBench};
if(require.main===module){const bench=createBench();bench.server.listen(0,'127.0.0.1',()=>console.log('Local parcours fixture: http://127.0.0.1:'+bench.server.address().port+'/index.html'));process.on('SIGTERM',()=>bench.close().then(()=>process.exit()));}
