import * as T from 'three';
import type {Part,SceneSettings} from '../types';
import {factory,printedLabel} from './geometry';
import {anchoredCable,attachment,roundedRectangle,sleeve} from './assemblyGeometry';

const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
// Shared by the wall bores and the installed glands (metres).
const glandLayout={xs:[-.043,.043],z:.026,barrelRadius:.004,boreRadius:.00415,wallThickness:.003};
export const engineeringDimensions={enclosure:[.12,.08,.05],panel:[.23,.195],poleHeight:1.08,probeDepth:.15};
export function buildDevice(root:T.Group){
  const f=factory(),metal=f.mat('#a6b1ad',{metalness:.84,roughness:.28}),dark=f.mat('#182725'),plastic=f.mat('#d7dbd3',{roughness:.38}),gasket=f.mat('#24332c'),pcb=f.mat('#205943'),gold=f.mat('#d3ae65',{metalness:.7,roughness:.26}),copper=f.mat('#c27048',{metalness:.5}),blue=f.mat('#2b6d98',{roughness:.4,metalness:.15});
  const parts=Object.fromEntries((['solar','case','controller','power','battery','rs485','antenna','probe'] as Part[]).map(id=>{const group=new T.Group();group.name=id;group.userData.part=id;root.add(group);return[id,group];})) as Record<Part,T.Group>;
  const {box,cylinder,link}=f;
  // All dimensions are metres. The enclosure is 120 × 80 × 50 mm.
  const support=new T.Group();support.name='mast-assembly';root.add(support);
  cylinder(support,.009,1.28,metal,0,.44,-.025).name='mast';
  cylinder(support,.010,.006,dark,0,1.077,-.025).name='mast-cap';
  for(const y of [.625,.677]){
    const bracket=new T.Group();bracket.name=`case-mount-${y}`;support.add(bracket);
    const clamp=new T.Mesh(new T.TorusGeometry(.0104,.0016,8,28),metal);clamp.position.set(0,y,-.025);clamp.rotation.x=Math.PI/2;bracket.add(clamp);
    box(bracket,.100,.010,.010,metal,0,y,-.0085).name='clamp-crossbar';
    for(const x of [-.041,.041]){
      box(bracket,.008,.010,.033,metal,x,y,.0085).name='case-standoff';
      box(bracket,.014,.016,.004,metal,x,y,.023).name='case-mount-pad';
      const bolt=cylinder(bracket,.0025,.008,dark,x,y,.024);bolt.rotation.x=Math.PI/2;
    }
  }
  const housing=parts.case;housing.position.set(0,.65,.026);
  box(housing,.12,.08,.003,plastic,0,0,0,.004).name='case-back-wall';
  box(housing,.003,.08,.047,plastic,-.0585,0,.024,.001).name='case-left-wall';
  // Right wall has a bore for the RF bulkhead; bottom wall has two gland bores.
  const rightShape=new T.Shape();rightShape.moveTo(-.0475,-.04);rightShape.lineTo(-.0005,-.04);rightShape.lineTo(-.0005,.04);rightShape.lineTo(-.0475,.04);rightShape.closePath();
  const rfHole=new T.Path();rfHole.absarc(-.023,-.001,.004,0,Math.PI*2,true);rightShape.holes.push(rfHole);
  const rightWall=new T.Mesh(new T.ExtrudeGeometry(rightShape,{depth:.003,bevelEnabled:false}),plastic);rightWall.name='case-rf-wall';rightWall.rotation.y=Math.PI/2;rightWall.position.x=.057;housing.add(rightWall);
  box(housing,.114,.003,.047,plastic,0,.0385,.024,.001).name='case-top-wall';
  const bottomShape=new T.Shape();bottomShape.moveTo(-.057,.0005);bottomShape.lineTo(.057,.0005);bottomShape.lineTo(.057,.0475);bottomShape.lineTo(-.057,.0475);bottomShape.closePath();
  for(const x of glandLayout.xs){const hole=new T.Path();hole.absarc(x,glandLayout.z,glandLayout.boreRadius,0,Math.PI*2,true);bottomShape.holes.push(hole);}
  const bottomWall=new T.Mesh(new T.ExtrudeGeometry(bottomShape,{depth:.003,bevelEnabled:false}),plastic);bottomWall.name='case-gland-wall';bottomWall.rotation.x=Math.PI/2;bottomWall.position.y=-.037;housing.add(bottomWall);
  for(const x of [-.05,.05])for(const y of [-.03,.03]){const post=cylinder(housing,.004,.043,plastic,x,y,.023);post.rotation.x=Math.PI/2;post.name='case-screw-post';}
  const hingePivot=new T.Group();hingePivot.position.set(-.06,0,.05);housing.add(hingePivot);const lid=new T.Group();lid.position.x=.06;hingePivot.add(lid);box(lid,.121,.081,.004,plastic,0,0,0,.005);
  for(const y of [-.024,.024]){cylinder(housing,.0028,.013,metal,-.061,y,.05);box(housing,.007,.009,.006,plastic,-.058,y,.048,.001);}
  // A captive flat gasket, seated in the lid, not a free cable or overshooting spline.
  lid.name='case-lid';
  const sealShape=roundedRectangle(.059,.039,.005);sealShape.holes.push(roundedRectangle(.0565,.0365,.0025));
  const seal=new T.Mesh(new T.ExtrudeGeometry(sealShape,{depth:.0012,bevelEnabled:false,curveSegments:8}),gasket);seal.name='lid-captive-gasket';seal.position.z=-.0028;lid.add(seal);
  for(const x of [-.05,.05])for(const y of [-.03,.03]){const screw=cylinder(lid,.0032,.002,metal,x,y,.003);screw.rotation.x=Math.PI/2;box(lid,.0035,.0007,.0004,dark,x,y,.0042,.0001);}
  const logo=printedLabel('EGIN One',.062,.023);logo.position.set(0,.004,.0021);lid.add(logo);
  const badge=printedLabel('SC / 01',.027,.009,'#61736b','#d7dbd3');badge.position.set(0,-.022,.0022);lid.add(badge);
  // Two glands: panel power on the left, differential sensor bus on the right.
  const glands=glandLayout.xs.map((x,i)=>{
    const gland=new T.Group();gland.name=i?'sensor-gland':'solar-gland';gland.position.set(x,-.04,glandLayout.z);housing.add(gland);
    // The narrow barrel alone passes through the wall. Both nuts seat on a wall face.
    sleeve(gland,'gland-barrel',glandLayout.barrelRadius,.0026,.008,plastic,V(0,.004,0));
    sleeve(gland,'gland-body',.006,.0026,.006,plastic,V(0,-.007,0));
    sleeve(gland,'gland-compression-nut',.0075,.0026,.004,plastic,V(0,-.002,0),6);
    sleeve(gland,'gland-locknut',.0063,glandLayout.barrelRadius,.003,plastic,V(0,glandLayout.wallThickness+.0015,0),6);
    sleeve(gland,'gland-strain-relief',.0036,.00225,.014,dark,V(0,-.017,0));
    // A moulded breakout terminates the jacket and supports the insulated inner leads.
    box(gland,.006,.006,.006,dark,0,.010,0,.001).name='gland-breakout';
    return {inner:attachment(gland,'internal-terminal',V(0,.010,0)),exit:attachment(gland,'axial-exit',V(0,-.033,0))};
  });
  const controller=parts.controller;controller.position.set(0,.6715,.045);box(controller,.092,.029,.0018,pcb).name='controller-pcb';
  // Mounted XIAO module, pin headers and the metal RF shield.
  box(controller,.021,.0178,.0024,dark,-.017,0,.0021).name='controller-module';box(controller,.015,.012,.0018,metal,-.017,0,.0042,.0005).name='controller-shield';
  for(let i=0;i<7;i++)for(const y of [-.012,.012])box(controller,.002,.003,.004,gold,-.033+i*.005,y,.0029,.0002).name='controller-header';
  for(const x of [-.04,.04])for(const y of [-.01,.01]){
    cylinder(controller,.002,.004,metal,x,y,-.002).rotation.x=Math.PI/2;
    const post=cylinder(controller,.0025,.017,plastic,x,y,-.009);post.rotation.x=Math.PI/2;post.name='controller-standoff';
  }
  for(let i=0;i<12;i++){const x=.006+(i%6)*.005,y=-.008+Math.floor(i/6)*.015;box(controller,.0028,.0036,.002,dark,x,y,.0019,.0001).name='controller-component';box(controller,.001,.0036,.0023,gold,x-.001,y,.00205,.0001).name='controller-contact';}
  const power=parts.power;power.position.set(-.033,.649,.049);box(power,.024,.012,.0015,pcb).name='power-pcb';box(power,.007,.005,.002,dark,-.003,.002,.00175).name='power-ic';box(power,.007,.006,.005,dark,.006,-.002,.00325,.001).name='power-inductor';
  for(let i=0;i<3;i++){const cap=cylinder(power,.0015,.0035,metal,-.008+i*.007,.004,.0025);cap.rotation.x=Math.PI/2;cap.name=`power-capacitor-${i}`;}
  const rs485=parts.rs485;rs485.position.set(.034,.649,.05);box(rs485,.027,.014,.0015,pcb).name='rs485-pcb';box(rs485,.007,.005,.002,dark,0,0,.00175).name='rs485-ic';box(rs485,.020,.005,.007,f.mat('#59a16b'),0,.006,.004,.0004).name='rs485-terminal-block';
  for(const board of [power,rs485])for(const x of [-.009,.009]){
    const length=board.position.z-.027;
    const post=cylinder(board,.002,length,plastic,x,-.002,-length/2);post.rotation.x=Math.PI/2;post.name='board-standoff';
  }
  for(const x of [-.006,0,.006]){const terminal=cylinder(rs485,.0018,.001,metal,x,.006,.008);terminal.rotation.x=Math.PI/2;terminal.name=`rs485-contact-${x}`;}
  const battery=parts.battery;battery.position.set(0,.628,.052);box(battery,.079,.018,.025,dark,0,-.002,-.002,.003).name='battery-holder';const cell=cylinder(battery,.014,.07,blue,0,0,0);cell.rotation.z=Math.PI/2;cell.name='battery-cell';
  box(battery,.075,.015,.014,dark,0,-.002,-.019).name='battery-cradle-back';
  for(const [x,material,name] of [[-.0355,metal,'battery-negative-contact'],[.0355,copper,'battery-positive-contact']] as const){
    const contact=cylinder(battery,.009,.0015,material,x,0,0);contact.rotation.z=Math.PI/2;contact.name=name;
  }
  box(battery,.012,.030,.027,dark,0,0,0,.001);
  const antenna=parts.antenna;antenna.position.set(.073,.649,.049);
  link(antenna,V(-.020,0,0),V(.004,0,0),.0038,metal).name='rf-bulkhead';
  for(const x of [-.017,-.012]){const nut=cylinder(antenna,.0055,.002,metal,x,0,0);nut.name='rf-locknut';nut.rotation.z=Math.PI/2;}
  cylinder(antenna,.0045,.018,dark,.004,.008,0);cylinder(antenna,.0028,.128,dark,.004,.079,0);const tip=new T.Mesh(new T.SphereGeometry(.0028,10,8),dark);tip.position.set(.004,.143,0);antenna.add(tip);
  // SX1262 daughterboard sits behind the controller and connects to the antenna.
  box(antenna,.023,.019,.002,pcb,-.055,.020,-.014).name='radio-pcb';box(antenna,.015,.012,.002,metal,-.055,.020,-.012).name='radio-shield';
  for(const x of [-.063,-.047]){const post=cylinder(antenna,.0018,.007,plastic,x,.020,-.0185);post.rotation.x=Math.PI/2;post.name='radio-standoff';}
  const cables:ReturnType<typeof anchoredCable>[]=[];
  const cable=(name:string,nodes:T.Object3D[],radius=.002,material:T.Material=dark,bend=.008)=>{const c=anchoredCable(root,name,nodes,radius,material,bend);cables.push(c);return c;};
  const at=(parent:T.Object3D,name:string,x:number,y:number,z:number)=>attachment(parent,name,V(x,y,z));
  const radioSocket=new T.Group();radioSocket.name='radio-coax-connector';radioSocket.position.set(-.046,.024,-.0115);radioSocket.rotation.x=Math.PI/2;antenna.add(radioSocket);
  sleeve(radioSocket,'radio-coax-socket',.0022,.0012,.0035,gold,V(0,0,0));
  cable('rf-insulated-coax',[
    at(radioSocket,'radio-coax-terminal',0,0,0),at(radioSocket,'radio-coax-exit',0,.0045,0),
    at(antenna,'coax-guide',-.023,.024,-.007),at(antenna,'coax-bend',-.022,0,0),
    at(antenna,'bulkhead-inside-terminal',-.019,0,0)
  ],.0011,dark,.003);
  const panel=parts.solar;panel.position.set(0,1.126,-.025);panel.rotation.x=.48;
  const frameMat=f.mat('#bdc7c1',{metalness:.86,roughness:.25}),cellMat=f.mat('#13394e',{metalness:.3,roughness:.25});
  box(panel,.23,.008,.195,frameMat,0,0,0,.002);box(panel,.217,.004,.182,dark,0,.005,0,.0005);
  const cells=new T.Group();panel.add(cells);
  for(let x=0;x<4;x++)for(let z=0;z<6;z++){
    const cx=-.080+x*.053,cz=-.075+z*.030;
    box(cells,.050,.0008,.027,cellMat,cx,.0074,cz,.001);
    for(let i=0;i<8;i++)box(cells,.049,.00012,.00018,metal,cx,.00786,cz-.011+i*.003,.00001);
    box(cells,.0005,.00016,.026,metal,cx,.00794,cz,.00001);
  }
  const glass=new T.MeshPhysicalMaterial({color:'#b5d7da',transparent:true,opacity:.12,roughness:.1,metalness:.08,clearcoat:1,depthWrite:false});box(panel,.217,.0005,.182,glass,0,.0082,0,.0001);
  for(const x of [-.075,.075]){box(panel,.009,.011,.15,metal,x,-.0085,0,.001).name='panel-back-rail';for(const z of [-.06,.06])cylinder(panel,.0025,.004,dark,x,-.015,z);}
  const junction=new T.Group();junction.name='panel-junction-box';junction.position.set(0,-.009,-.045);panel.add(junction);
  box(junction,.034,.012,.020,dark,0,0,0,.002).name='panel-junction-body';
  const panelSocket=sleeve(junction,'panel-cable-socket',.004,.00215,.009,dark,V(-.020,0,0));panelSocket.rotation.z=Math.PI/2;
  // The panel owns its rails, cross-member and hinge lugs. The mast stops below them.
  box(panel,.158,.012,.018,metal,0,-.019,0).name='panel-cross-member';
  for(const x of [-.012,.012])box(panel,.006,.023,.014,metal,x,-.031,0).name='panel-hinge-lug';
  root.updateMatrixWorld(true);
  const pivot=root.worldToLocal(panel.localToWorld(V(0,-.035,0)));
  for(const x of [-.021,.021]){
    link(support,V(x,1.067,-.025),V(x,pivot.y,pivot.z),.004,metal).name='mast-clevis';
  }
  cylinder(support,.012,.014,metal,0,1.067,-.025).name='mast-collar';
  link(support,V(-.025,1.067,-.025),V(.025,1.067,-.025),.004,metal).name='clevis-cross-bolt';
  link(support,V(-.027,pivot.y,pivot.z),V(.027,pivot.y,pivot.z),.003,metal).name='panel-pivot-bolt';
  const guides=[1.04,.93,.80,.70].map(y=>{
    const tie=new T.Mesh(new T.TorusGeometry(.0103,.0013,8,24),dark);tie.position.set(0,y,-.026);tie.rotation.x=Math.PI/2;support.add(tie);
    sleeve(support,'solar-cable-clip',.0034,.0021,.006,dark,V(0,y,-.037));
    return at(support,`solar-guide-${y}`,0,y,-.037);
  });
  cable('solar-power-cable',[
    at(junction,'panel-power-terminal',-.016,0,0),at(junction,'panel-cable-exit',-.034,0,0),
    at(support,'panel-service-bend',-.034,1.065,-.060),at(support,'solar-guide-approach',0,1.055,-.037),...guides,
    at(support,'solar-guide-departure',0,.69,-.037),at(support,'solar-route-side',-.043,.69,-.037),at(housing,'solar-route-rear',-.043,-.092,-.063),
    at(housing,'solar-drip-loop',-.043,-.092,.026),glands[0].exit,glands[0].inner
  ],.002,dark,.014);
  const probe=parts.probe;probe.position.set(.15,-.09,.025);box(probe,.045,.060,.015,dark,0,0,0,.004).name='probe-potted-body';
  const sensorLabel=printedLabel('SEN0604',.033,.013,'#b2bfc0','#182725');sensorLabel.position.set(0,.005,.0077);probe.add(sensorLabel);
  // Official SEN0604 drawing: four electrodes, 67 mm exposed; total length 127 mm.
  for(const x of [-.017,-.0057,.0057,.017]){cylinder(probe,.0016,.061,metal,x,-.0605,0);const point=new T.Mesh(new T.ConeGeometry(.0016,.006,10),metal);point.rotation.z=Math.PI;point.position.set(x,-.094,0);probe.add(point);}
  sleeve(probe,'probe-strain-relief',.0038,.00225,.020,dark,V(0,.039,0));
  const sensorGuides=[.50,.34,.18].map(y=>{
    const tie=new T.Mesh(new T.TorusGeometry(.0103,.0013,8,24),dark);tie.position.set(0,y,-.024);tie.rotation.x=Math.PI/2;support.add(tie);
    sleeve(support,'sensor-cable-clip',.0035,.0023,.006,dark,V(0,y,-.013));
    return at(support,`sensor-guide-${y}`,0,y,-.013);
  });
  cable('sensor-bus-cable',[
    glands[1].inner,glands[1].exit,at(housing,'sensor-drip-loop',.043,-.092,.026),
    at(housing,'sensor-drip-return',.043,-.092,-.039),
    at(support,'sensor-route-side',.043,.53,-.013),at(support,'sensor-guide-approach',0,.515,-.013),...sensorGuides,
    at(support,'sensor-guide-departure',0,.16,-.013),
    at(support,'sensor-ground-bend',.04,.025,-.013),at(probe,'probe-service-bend',0,.115,0),
    at(probe,'probe-axial-entry',0,.065,0),at(probe,'probe-terminal',0,.028,0)
  ],.0022,dark,.014);
  // Insulated harnesses have component-local terminals and guides, including in exploded view.
  const terminal=(parent:T.Group,name:string,p:T.Vector3,seat=parent===controller ? .0009 : .00075)=>{
    // Socket body reaches its PCB or terminal block; a floating cube is not a connector.
    const socket=new T.Group();socket.name=name+'-connector';socket.position.copy(p);parent.add(socket);
    const height=p.z+.0015-seat;
    box(socket,.003,.003,height,dark,0,0,.0015-height/2,.0003).name=name+'-socket';
    return attachment(socket,name,V(0,0,0));
  };
  const internal=(name:string,nodes:T.Object3D[],color:string)=>cable(name,nodes,.00065,f.mat(color,{roughness:.8}),.003);
  internal('battery-negative',[
    terminal(battery,'battery-negative-terminal',V(-.0395,0,0),-.0015),at(battery,'battery-negative-guide',-.045,0,0),
    at(power,'battery-negative-approach',-.013,-.008,.011),terminal(power,'power-battery-negative',V(-.009,-.0045,.003))
  ],'#313b34');
  internal('battery-positive',[
    terminal(battery,'battery-positive-terminal',V(.0395,0,0),-.0015),at(battery,'battery-positive-guide',.045,0,0),
    at(battery,'battery-rear-right',.045,.012,-.020),at(battery,'battery-rear-left',-.049,.012,-.020),
    at(power,'battery-positive-rear',-.016,-.008,-.017),at(power,'battery-positive-side',-.016,-.008,.014),
    at(power,'battery-positive-approach',-.004,-.008,.014),terminal(power,'power-battery-positive',V(-.004,-.0045,.003))
  ],'#b34d3e');
  internal('power-controller',[
    terminal(power,'power-output',V(-.0105,.0005,.003)),at(power,'power-output-approach',-.0105,.0005,.009),
    at(controller,'controller-power-approach',-.04,-.01,.015),
    terminal(controller,'controller-power-input',V(-.04,-.01,.002))
  ],'#ae7046');
  internal('controller-rs485',[
    terminal(controller,'controller-bus-output',V(.035,-.009,.003)),at(controller,'controller-bus-approach',.035,-.009,.017),
    at(rs485,'rs485-controller-approach',0,.006,.014),terminal(rs485,'rs485-controller-input',V(0,.006,.010),.0085)
  ],'#6b9eaa');
  internal('controller-radio',[
    terminal(controller,'controller-radio-output',V(.042,-.0025,.003)),at(controller,'radio-route-front',.052,-.0025,.003),
    at(controller,'radio-route-side',.052,-.0025,-.0035),at(antenna,'radio-route-rear',-.021,.0175,-.0075),
    at(antenna,'radio-route-cross',-.040,.0175,-.0075),
    at(antenna,'radio-input-approach',-.0455,.013,-.0075),terminal(antenna,'radio-data-input',V(-.0455,.013,-.010),-.013)
  ],'#788f98');
  internal('solar-internal-power',[
    glands[0].inner,at(housing,'solar-internal-guide',-.047,-.010,.035),at(power,'solar-internal-over-board',-.014,.008,.014),
    at(power,'solar-input-approach',.010,.004,.014),terminal(power,'solar-power-input',V(.010,.004,.003))
  ],'#ad5746');
  for(const [x,color] of [[-.006,'#93b58c'],[.006,'#d0bb76']] as const){
    internal(`sensor-internal-${x<0?'a':'b'}`,[
      at(glands[1].inner.parent!,`sensor-core-${x}`,0,.010,Math.sign(x)*.001),
      at(housing,`sensor-internal-guide-${x}`, .043,-.003,.035+x*.2),terminal(rs485,`sensor-terminal-${x}`,V(x,.006,.010),.0085)
    ],color);
  }
  const rest=new Map<Part,T.Vector3>();for(const [id,group] of Object.entries(parts))rest.set(id as Part,group.position.clone());
  const offsets:Partial<Record<Part,T.Vector3>>={controller:V(0,.055,.14),power:V(-.075,0,.13),rs485:V(.075,0,.13),battery:V(0,-.07,.13)};
  function update(settings:SceneSettings,blend:number){
    const exploded=settings.assembly==='exploded',open=settings.assembly!=='closed';
    hingePivot.position.lerp(exploded?V(.17,.02,.14):V(-.06,0,.05),blend);hingePivot.rotation.y=T.MathUtils.lerp(hingePivot.rotation.y,exploded?.4:open?-1.65:0,blend);
    for(const [id,group] of Object.entries(parts) as [Part,T.Group][]){group.position.lerp(rest.get(id)!.clone().add(exploded?(offsets[id]||V(0,0,0)):V(0,0,0)),blend);group.visible=!settings.hidden.includes(id);}
    root.updateMatrixWorld(true);
    for(const cable of cables)cable.update();
  }
  return {parts,lid,cables,update,anchors:{solar:V(0,1.14,.02),case:V(0,.65,.08),controller:V(-.017,.669,.052),power:V(-.033,.637,.055),battery:V(0,.622,.065),rs485:V(.034,.635,.055),antenna:V(.077,.75,.05),probe:V(.15,-.11,.025)} as Record<Part,T.Vector3>};
}
