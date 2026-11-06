// Run against Vite: EGIN_URL=http://127.0.0.1:4947 node tests/soilcore-geometry.cjs
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const path=require('node:path');

(async()=>{
  const origin=process.env.EGIN_URL||'http://127.0.0.1:4947';
  assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'Use a local Vite fixture');
  const artifacts=process.env.EGIN_SCREENSHOTS||path.resolve(__dirname,'../../../docs/egin-one/assembly-repair');mkdirSync(artifacts,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/__assembly-test',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
    await page.goto(origin+'/__assembly-test');
    const results=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js');
      const {buildDevice}=await import('/src/features/soilcore/scene/DeviceModel.ts');
      const {batchStatic}=await import('/src/features/soilcore/scene/batch.ts');
      const scene=new T.Scene();scene.background=new T.Color('#263b32');
      const root=new T.Group();scene.add(root);const device=buildDevice(root);
      const settings={assembly:'closed',hidden:[],cutaway:false,labels:false,reset:0,focus:0,selected:null};
      const checks=[];const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
      const get=name=>{const node=root.getObjectByName(name);if(!node)throw new Error('Missing '+name);return node;};
      device.update(settings,1);
      const bounds=object=>new T.Box3().setFromObject(object);
      const panel=device.parts.solar;
      // No mast or fixed support vertex can penetrate the active face of the panel.
      let highest=-Infinity;
      get('mast-assembly').traverse(object=>{
        if(!object.isMesh)return;
        const positions=object.geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++){
          const p=panel.worldToLocal(object.localToWorld(new T.Vector3().fromBufferAttribute(positions,i)));
          if(Math.abs(p.x)<.1085&&Math.abs(p.z)<.091)highest=Math.max(highest,p.y);
        }
      });
      check(highest<-.004,'Fixed support stays below panel backsheet');
      const beam=bounds(get('panel-cross-member'));
      check(panel.children.filter(x=>x.name==='panel-back-rail').every(rail=>beam.intersectsBox(bounds(rail))),'Cross-member contacts both back rails');
      for(const lug of panel.children.filter(x=>x.name==='panel-hinge-lug')){
        check(beam.intersectsBox(bounds(lug)),'Hinge lug contacts panel cross-member');
        check(bounds(get('panel-pivot-bolt')).intersectsBox(bounds(lug)),'Pivot bolt reaches panel hinge lug');
      }
      for(const name of ['mast-collar','clevis-cross-bolt'])check(bounds(get(name)).intersectsBox(bounds(get('mast'))),`${name}: seated on mast`);
      const transforms=new Set();root.traverse(object=>{
        check([...object.position,...object.quaternion,...object.scale].every(Number.isFinite)&&Math.min(...object.scale)>0,`${object.name||object.type}: valid transform`);
        if(!object.isMesh)return;
        const key=[object.geometry.uuid,object.material.uuid,...object.matrixWorld.elements.map(n=>n.toFixed(9))].join(':');
        check(!transforms.has(key),`${object.name||object.parent.name}: no duplicate mesh`);transforms.add(key);
      });
      for(const y of [.625,.677]){
        const bracket=get(`case-mount-${y}`),bar=bounds(bracket.getObjectByName('clamp-crossbar'));
        check(bar.intersectsBox(bounds(bracket.children[0])),`Mount ${y}: crossbar contacts pole clamp`);
        check(bar.min.z>-.016,`Mount ${y}: crossbar clears solid mast`);
        for(const stand of bracket.children.filter(x=>x.name==='case-standoff'))check(bar.intersectsBox(bounds(stand)),`Mount ${y}: standoff contacts crossbar`);
        for(const pad of bracket.children.filter(x=>x.name==='case-mount-pad'))check(bounds(pad).max.z>=.0245,`Mount ${y}: pad reaches housing`);
      }
      // Cable endpoints are measured in the mesh's frame, also under a transformed scene root.
      function connections(){
        for(const cable of device.cables){
          check(cable.mesh.parent===cable.group&&cable.nodes.every(node=>{let p=node;while(p&&p!==root)p=p.parent;return p===root;}),`${cable.group.name}: mesh and anchors remain in hierarchy`);
          const curve=cable.mesh.geometry.parameters.path;
          for(const [index,t] of [[0,0],[cable.nodes.length-1,1]]){
            const end=cable.group.localToWorld(curve.getPoint(t));
            check(end.distanceTo(cable.nodes[index].getWorldPosition(new T.Vector3()))<1e-7,`${cable.group.name}: terminal ${t} coincides`);
          }
          const positions=cable.mesh.geometry.getAttribute('position');
          check(Array.from(positions.array).every(Number.isFinite),`${cable.group.name}: finite tube geometry`);
        }
      }
      connections();
      const solar=device.cables.find(x=>x.group.name==='solar-power-cable'),sensor=device.cables.find(x=>x.group.name==='sensor-bus-cable');
      for(const cable of [solar,sensor]){
        const end=cable===solar?1:0;
        const tangent=cable.mesh.geometry.parameters.path.getTangent(end);
        check(Math.abs(tangent.y)>.9999,`${cable.group.name}: axial gland entry`);
        const samples=cable.mesh.geometry.parameters.path.getSpacedPoints(15000);
        for(const node of cable.nodes.filter(node=>/^(solar|sensor)-guide-[0-9]/.test(node.name))){
          const point=cable.group.worldToLocal(node.getWorldPosition(new T.Vector3()));
          check(Math.min(...samples.map(sample=>sample.distanceTo(point)))<.0001,`${node.name}: cable runs through retaining clip`);
        }
      }
      check(sensor.mesh.geometry.parameters.path.getTangent(1).y<-.9999,'Probe entry is axial');
      const seal=get('lid-captive-gasket');seal.geometry.computeBoundingBox();const sealBox=seal.geometry.boundingBox;
      check(sealBox.min.x>=-.059001&&sealBox.max.x<=.059001&&sealBox.min.y>=-.039001&&sealBox.max.y<=.039001,'Gasket stays inside lid perimeter');
      check(seal.position.z+sealBox.max.z>-.002,'Gasket is seated into lid');
      check(device.cables.every(cable=>cable.nodes.every(node=>{let p=node;while(p&&p!==device.lid)p=p.parent;return !p;})),'Lid contains a captive seal, no cable terminal');
      // Cast straight through each real bore, then through adjacent solid wall.
      const ray=new T.Raycaster();
      for(const x of [-.043,.043]){
        ray.set(new T.Vector3(x,.59,.052),new T.Vector3(0,1,0));
        check(ray.intersectObject(get('case-gland-wall')).length===0,'Cable passes through bottom bore');
        ray.set(new T.Vector3(x+.006,.59,.052),new T.Vector3(0,1,0));
        check(ray.intersectObject(get('case-gland-wall')).length>0,'Material surrounds bottom bore');
      }
      ray.set(new T.Vector3(.09,.649,.049),new T.Vector3(-1,0,0));
      check(ray.intersectObject(get('case-rf-wall')).length===0,'RF connector passes through side bore');
      const nuts=device.parts.antenna.children.filter(node=>node.name==='rf-locknut').map(bounds);
      check(Math.abs(nuts[0].max.x-.057)<1e-7,'Inside RF locknut seats on housing wall');
      check(Math.abs(nuts[1].min.x-.060)<1e-7,'Outside RF locknut seats on housing wall');
      const coax=device.cables.find(x=>x.group.name==='rf-insulated-coax');
      check(bounds(coax.group).max.x<.057,'Insulated coax stays inside RF wall');
      const near=(a,b)=>Math.abs(a-b)<1e-7;
      // Check the installed hardware, not only a ray through the cable centre.
      for(const name of ['solar-gland','sensor-gland']){
        const gland=get(name),wall=bounds(get('case-gland-wall'));
        check(near(bounds(gland.getObjectByName('gland-compression-nut')).max.y,wall.min.y),`${name}: outer nut seats on outside wall face`);
        check(near(bounds(gland.getObjectByName('gland-locknut')).min.y,wall.max.y),`${name}: locknut seats on inside wall face`);
        const barrel=gland.getObjectByName('gland-barrel');
        const radius=Math.max(...barrel.geometry.parameters.points.map(p=>p.x));
        for(let i=0;i<48;i++){
          const angle=i*Math.PI/24;
          ray.set(gland.localToWorld(new T.Vector3(Math.cos(angle)*radius,-.02,Math.sin(angle)*radius)),new T.Vector3(0,1,0));
          check(ray.intersectObject(get('case-gland-wall')).length===0,`${name}: barrel circumference clears wall bore ${i}`);
        }
        check(bounds(gland.getObjectByName('gland-breakout')).containsPoint(gland.getObjectByName('internal-terminal').getWorldPosition(new T.Vector3())),`${name}: jacket ends inside supported breakout`);
        for(const [a,b] of [['gland-body','gland-compression-nut'],['gland-strain-relief','gland-body'],['gland-breakout','gland-barrel']]){
          check(bounds(gland.getObjectByName(a)).expandByScalar(1e-7).intersectsBox(bounds(gland.getObjectByName(b))),`${name}: ${a} is seated against ${b}`);
        }
      }
      for(const [socket,seat] of [
        ['radio-coax-socket','radio-pcb'],['radio-data-input-socket','radio-pcb'],
        ['power-battery-negative-socket','power-pcb'],['power-battery-positive-socket','power-pcb'],
        ['power-output-socket','power-pcb'],['solar-power-input-socket','power-pcb'],
        ['controller-power-input-socket','controller-pcb'],['controller-bus-output-socket','controller-pcb'],['controller-radio-output-socket','controller-pcb'],
        ['rs485-controller-input-socket','rs485-contact-0'],['sensor-terminal--0.006-socket','rs485-contact--0.006'],['sensor-terminal-0.006-socket','rs485-contact-0.006'],
        ['battery-negative-terminal-socket','battery-holder'],['battery-positive-terminal-socket','battery-holder']
      ])check(bounds(get(socket)).expandByScalar(1e-7).intersectsBox(bounds(get(seat))),`${socket}: connector contacts its seat`);
      for(const [part,board,names] of [
        ['controller','controller-pcb',['controller-module','controller-header','controller-component','controller-contact']],
        ['power','power-pcb',['power-ic','power-inductor','power-capacitor-0','power-capacitor-1','power-capacitor-2']],
        ['rs485','rs485-pcb',['rs485-ic']],['antenna','radio-pcb',['radio-shield']]
      ])for(const mesh of device.parts[part].children.filter(node=>names.includes(node.name))){
        check(near(bounds(mesh).min.z,bounds(get(board)).max.z),`${mesh.name}: body seats on PCB surface, no floating component`);
      }
      check(near(bounds(get('controller-shield')).min.z,bounds(get('controller-module')).max.z),'Controller RF shield seats on module');
      for(const name of ['battery-negative-contact','battery-positive-contact'])check(bounds(get(name)).intersectsBox(bounds(get('battery-cell'))),`${name}: contact is seated on battery, no air gap`);
      const copperContact=get('battery-positive-contact'),copperVertices=copperContact.geometry.attributes.position;
      const cavity=new T.Box3(new T.Vector3(-.057,-.037,.0015),new T.Vector3(.057,.037,.0475));
      for(let i=0;i<copperVertices.count;i++){
        const p=device.parts.case.worldToLocal(copperContact.localToWorld(new T.Vector3().fromBufferAttribute(copperVertices,i)));
        check(cavity.containsPoint(p),'Copper battery contact stays inside enclosure cavity');
      }
      // A tube must fit the whole bore; a coincident endpoint alone can still clip a sleeve.
      root.traverse(port=>{
        if(!port.isMesh||port.geometry.type!=='LatheGeometry')return;
        const profile=port.geometry.parameters.points,inner=Math.min(...profile.map(p=>p.x)),outer=Math.max(...profile.map(p=>p.x));
        const lo=Math.min(...profile.map(p=>p.y)),hi=Math.max(...profile.map(p=>p.y));
        for(const cable of device.cables){
          if(!bounds(port).intersectsBox(bounds(cable.mesh)))continue;
          const positions=cable.mesh.geometry.attributes.position;let penetrates=false;
          for(let i=0;i<positions.count;i++){
            const p=port.worldToLocal(cable.mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions,i))),r=Math.hypot(p.x,p.z);
            if(p.y>lo+1e-6&&p.y<hi-1e-6&&r>inner+1e-5&&r<outer-1e-5){penetrates=true;break;}
          }
          check(!penetrates,`${cable.group.name}: jacket clears ${port.parent.name}/${port.name}`);
        }
      });
      // Cable sweep may cross the housing only through a bore, never a wall face.
      for(const cable of device.cables){
        const points=cable.mesh.geometry.parameters.path.getSpacedPoints(500);
        for(const wall of ['case-gland-wall','case-rf-wall','case-back-wall','case-left-wall','case-top-wall','mast'].map(get)){
          let crossings=0;
          for(let i=1;i<points.length;i++){
            const a=cable.group.localToWorld(points[i-1].clone()),b=cable.group.localToWorld(points[i].clone()),delta=b.clone().sub(a);
            ray.set(a,delta.clone().normalize());ray.far=delta.length();crossings+=ray.intersectObject(wall).length;
          }
          check(crossings===0,`${cable.group.name}: no wall crossing`);
        }
      }
      // Check the cable jacket, not just its centre line, against both wall faces.
      for(const cable of [solar,sensor,coax]){
        const positions=cable.mesh.geometry.getAttribute('position'),stride=cable.mesh.geometry.parameters.radialSegments+1;
        for(const wall of ['case-gland-wall','case-rf-wall','case-back-wall','case-left-wall','case-top-wall','mast'].map(get)){
          const side=wall.material.side;wall.material.side=T.DoubleSide;let hits=0;
          for(let i=stride;i<positions.count;i++){
            const a=cable.group.localToWorld(new T.Vector3().fromBufferAttribute(positions,i-stride));
            const b=cable.group.localToWorld(new T.Vector3().fromBufferAttribute(positions,i)),delta=b.clone().sub(a);
            ray.set(a,delta.clone().normalize());ray.far=delta.length();hits+=ray.intersectObject(wall).length;
          }
          wall.material.side=side;check(hits===0,`${cable.group.name}: jacket clears ${wall.name}`);
        }
      }
      // Internal wiring must also clear PCBs, components, screw posts and other hardware.
      // Only the actual termination bodies may encapsulate an endpoint.
      const terminationBodies={
        'solar-power-cable':['panel-junction-body','gland-breakout'],
        'sensor-bus-cable':['probe-potted-body','gland-breakout'],
        'rf-insulated-coax':['rf-bulkhead'],
        'battery-negative':['battery-holder'], 'battery-positive':['battery-holder'],
        'solar-internal-power':['gland-breakout'], 'sensor-internal-a':['gland-breakout'], 'sensor-internal-b':['gland-breakout']
      };
      const solids=[];for(const part of Object.values(device.parts))part.traverse(mesh=>{if(mesh.isMesh)solids.push({mesh,box:bounds(mesh)});});
      for(const cable of device.cables){
        const positions=cable.mesh.geometry.attributes.position,stride=cable.mesh.geometry.parameters.radialSegments+1;
        const cableBox=bounds(cable.mesh);
        for(const {mesh,box} of solids){
          if(!cableBox.intersectsBox(box))continue;
          const endpointSocket=cable.nodes.some((node,i)=>(i===0||i===cable.nodes.length-1)&&node.parent.getObjectByName(mesh.name)===mesh&&mesh.name===node.name+'-socket');
          const endpointBody=(terminationBodies[cable.group.name]||[]).includes(mesh.name)&&[cable.nodes[0],cable.nodes.at(-1)].some(node=>box.containsPoint(node.getWorldPosition(new T.Vector3())));
          if(endpointSocket||endpointBody)continue;
          const side=mesh.material.side;mesh.material.side=T.DoubleSide;let hit=false;
          for(let i=stride;i<positions.count&&!hit;i++){
            const a=cable.mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions,i-stride)),b=cable.mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions,i)),delta=b.clone().sub(a);
            ray.set(a,delta.clone().normalize());ray.far=delta.length();hit=ray.intersectObject(mesh,false).length>0;
          }
          mesh.material.side=side;check(!hit,`${cable.group.name}: jacket clears solid ${mesh.name||mesh.parent.name+' at '+mesh.position.toArray()}`);
        }
      }
      // Check cable-to-cable clearance outside the shared moulded breakouts.
      const routes=device.cables.map(cable=>({cable,points:cable.mesh.geometry.parameters.path.getSpacedPoints(Math.ceil(cable.mesh.geometry.parameters.path.getLength()/(cable.radius*.5)))}));
      for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
        const a=routes[i],b=routes[j],diameter=a.cable.radius+b.cable.radius,grid=new Map(),shared=[];
        for(const n of [a.cable.nodes[0],a.cable.nodes.at(-1)])for(const m of [b.cable.nodes[0],b.cable.nodes.at(-1)]){
          const body=n.parent===m.parent&&n.parent.getObjectByName('gland-breakout');if(body)shared.push(bounds(body));
        }
        const cell=p=>[p.x,p.y,p.z].map(v=>Math.floor(v/diameter));
        for(const p of b.points){const key=cell(p).join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p);}
        let collision=false;
        for(const p of a.points){
          const [x,y,z]=cell(p);
          for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
            for(const q of grid.get([x+dx,y+dy,z+dz].join(','))||[]){
              if(p.distanceToSquared(q)<(diameter-.00005)**2&&!shared.some(box=>box.containsPoint(p)&&box.containsPoint(q)))collision=true;
            }
          }
          if(collision)break;
        }
        check(!collision,`${a.cable.group.name} / ${b.cable.group.name}: jackets do not intersect outside a connector`);
      }
      // Transform checks include construction under a moved root, not just moving it afterwards.
      const transformedRoot=new T.Group();transformedRoot.position.set(-.4,.3,.2);transformedRoot.rotation.set(.2,-.4,.1);transformedRoot.scale.setScalar(.8);
      const transformedDevice=buildDevice(transformedRoot);transformedDevice.update(settings,1);
      const sourcePivot=get('panel-pivot-bolt'),movedPivot=transformedRoot.getObjectByName('panel-pivot-bolt');
      check(sourcePivot.position.distanceTo(movedPivot.position)<1e-7,'Panel hinge is built in device coordinates under a transformed root');
      const geometries=new Set(),materials=new Set(),textures=new Set();transformedRoot.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
      for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
      root.position.set(.3,-.2,.1);root.rotation.set(.12,.6,-.2);root.scale.setScalar(1.2);device.update(settings,1);connections();
      root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.setScalar(1);
      for(const assembly of ['open','exploded','closed']){device.update({...settings,assembly},1);connections();}
      device.update({...settings,hidden:['solar']},1);check(!solar.group.visible,'Hiding panel also hides its cable');
      device.update(settings,1);
      batchStatic(root);device.update({...settings,assembly:'exploded'},1);connections();device.update(settings,1);
      const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,1000);renderer.setPixelRatio(1);
      renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.appendChild(renderer.domElement);
      scene.add(new T.HemisphereLight('#f0fff4','#5f6956',2.3));
      for(const [x,y,z,intensity] of [[1,2,3,3],[-2,1,-2,2]]){const light=new T.DirectionalLight('#fff4df',intensity);light.position.set(x,y,z);scene.add(light);}
      const camera=new T.PerspectiveCamera(35,1.2,.001,10);
      window.assemblyView=(position,target,assembly='closed')=>{device.update({...settings,assembly},1);camera.position.fromArray(position);camera.lookAt(new T.Vector3(...target));renderer.render(scene,camera);};
      return {checks:checks.length,highestSupportInPanelFrame:highest,cables:device.cables.length};
    });
    const views=[
      ['panel-top',[.24,1.44,.29],[0,1.12,-.025]],
      ['panel-side',[.35,1.13,.02],[0,1.08,-.025]],
      ['panel-bottom',[.24,.88,.26],[0,1.105,-.025]],
      ['panel-connection',[-.20,1.00,-.30],[0,1.105,-.045]],
      ['case-open',[.20,.72,.35],[0,.648,.025],'open'],
      ['case-rear',[-.24,.70,-.27],[0,.65,0],'open'],
      ['case-bottom',[.17,.43,.25],[0,.62,.03],'open'],
      ['case-closed',[.23,.70,.32],[0,.65,.03]],
      ['case-exploded',[.36,.85,.52],[0,.65,.09],'exploded'],
      ['probe-connection',[.31,.03,.27],[.15,-.115,.025]],
      ['station',[1.2,1.15,2.6],[0,.49,0],'open']
    ];
    for(const [name,position,target,assembly] of views){await page.evaluate(([p,t,a])=>window.assemblyView(p,t,a),[position,target,assembly]);await page.screenshot({path:path.join(artifacts,name+'.png')});}
    assert.deepEqual(errors,[]);console.log('PASS assembly geometry',JSON.stringify(results));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
