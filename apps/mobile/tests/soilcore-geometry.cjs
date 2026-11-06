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
      // Cast straight through each real bore, then through adjacent solid wall.
      const ray=new T.Raycaster();
      for(const x of [-.043,.043]){
        ray.set(new T.Vector3(x,.59,.052),new T.Vector3(0,1,0));
        check(ray.intersectObject(get('case-gland-wall')).length===0,'Cable passes through bottom bore');
        ray.set(new T.Vector3(x+.004,.59,.052),new T.Vector3(0,1,0));
        check(ray.intersectObject(get('case-gland-wall')).length>0,'Material surrounds bottom bore');
      }
      ray.set(new T.Vector3(.09,.649,.049),new T.Vector3(-1,0,0));
      check(ray.intersectObject(get('case-rf-wall')).length===0,'RF connector passes through side bore');
      const nuts=device.parts.antenna.children.filter(node=>node.name==='rf-locknut').map(bounds);
      check(Math.abs(nuts[0].max.x-.057)<1e-7,'Inside RF locknut seats on housing wall');
      check(Math.abs(nuts[1].min.x-.060)<1e-7,'Outside RF locknut seats on housing wall');
      const coax=device.cables.find(x=>x.group.name==='rf-insulated-coax');
      check(bounds(coax.group).max.x<.057,'Insulated coax stays inside RF wall');
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
