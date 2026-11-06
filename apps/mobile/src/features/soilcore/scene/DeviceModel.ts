import * as T from 'three';
import type {Part,SceneSettings} from '../types';
import {factory,printedLabel} from './geometry';

const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
export const engineeringDimensions={enclosure:[.12,.08,.05],panel:[.23,.195],poleHeight:1.12,probeDepth:.15};
export function buildDevice(root:T.Group){
  const f=factory(),metal=f.mat('#a6b1ad',{metalness:.84,roughness:.28}),dark=f.mat('#182725'),plastic=f.mat('#d7dbd3',{roughness:.38}),gasket=f.mat('#24332c'),pcb=f.mat('#205943'),gold=f.mat('#d3ae65',{metalness:.7,roughness:.26}),copper=f.mat('#c27048',{metalness:.5}),blue=f.mat('#2b6d98',{roughness:.4,metalness:.15});
  const parts=Object.fromEntries((['solar','case','controller','power','battery','rs485','antenna','probe'] as Part[]).map(id=>{const group=new T.Group();group.userData.part=id;root.add(group);return[id,group];})) as Record<Part,T.Group>;
  const {box,cylinder,link,tube}=f;
  // All dimensions are metres. The enclosure is 120 × 80 × 50 mm.
  const support=new T.Group();root.add(support);cylinder(support,.009,1.35,metal,0,.475,-.025);cylinder(support,.011,.015,dark,0,1.143,-.025);
  for(const y of [.625,.677]){
    const clamp=new T.Mesh(new T.TorusGeometry(.011,.0016,8,28),metal);clamp.position.set(0,y,-.025);clamp.rotation.x=Math.PI/2;support.add(clamp);
    box(support,.105,.010,.005,metal,0,y,-.006);link(support,V(-.041,y,-.008),V(-.041,y,.018),.002,metal);link(support,V(.041,y,-.008),V(.041,y,.018),.002,metal);
  }
  const housing=parts.case;housing.position.set(0,.65,.026);
  box(housing,.12,.08,.003,plastic,0,0,0,.004);
  box(housing,.003,.08,.047,plastic,-.0585,0,.024,.001);box(housing,.003,.08,.047,plastic,.0585,0,.024,.001);
  box(housing,.114,.003,.047,plastic,0,.0385,.024,.001);box(housing,.114,.003,.047,plastic,0,-.0385,.024,.001);
  for(const x of [-.05,.05])for(const y of [-.03,.03])cylinder(housing,.004,.043,plastic,x,y,.023).rotation.x=Math.PI/2;
  const hingePivot=new T.Group();hingePivot.position.set(-.06,0,.05);housing.add(hingePivot);const lid=new T.Group();lid.position.x=.06;hingePivot.add(lid);box(lid,.121,.081,.004,plastic,0,0,0,.005);
  for(const y of [-.024,.024]){cylinder(housing,.0028,.013,metal,-.061,y,.05);box(housing,.007,.009,.006,plastic,-.058,y,.048,.001);}
  const sealPoints=[V(-.054,-.034,-.003),V(-.054,.034,-.003),V(.054,.034,-.003),V(.054,-.034,-.003),V(-.054,-.034,-.003)];tube(lid,sealPoints,.0015,gasket);
  for(const x of [-.05,.05])for(const y of [-.03,.03]){const screw=cylinder(lid,.0032,.002,metal,x,y,.003);screw.rotation.x=Math.PI/2;box(lid,.0035,.0007,.0004,dark,x,y,.0042,.0001);}
  const logo=printedLabel('EGIN One',.062,.023);logo.position.set(0,.004,.0021);lid.add(logo);
  const badge=printedLabel('SC / 01',.027,.009,'#61736b','#d7dbd3');badge.position.set(0,-.022,.0022);lid.add(badge);
  // Two glands: panel power on the left, differential sensor bus on the right.
  for(const x of [-.032,.032]){cylinder(housing,.006,.014,plastic,x,-.046,.026);const nut=new T.Mesh(new T.CylinderGeometry(.0075,.0075,.005,6),plastic);nut.position.set(x,-.040,.026);housing.add(nut);cylinder(housing,.003,.012,dark,x,-.056,.026);}
  const controller=parts.controller;controller.position.set(0,.6715,.045);box(controller,.092,.029,.0018,pcb);
  // Mounted XIAO module, pin headers and the metal RF shield.
  box(controller,.021,.0178,.0024,dark,-.017,0,.0022);box(controller,.015,.012,.0018,metal,-.017,0,.0042,.0005);
  for(let i=0;i<7;i++)for(const y of [-.012,.012])box(controller,.002,.003,.004,gold,-.033+i*.005,y,.003,.0002);
  for(const x of [-.04,.04])for(const y of [-.01,.01]){cylinder(controller,.002,.004,metal,x,y,-.002).rotation.x=Math.PI/2;}
  for(let i=0;i<12;i++){const x=.006+(i%6)*.005,y=-.008+Math.floor(i/6)*.015;box(controller,.0028,.0036,.002,dark,x,y,.0025,.0001);box(controller,.001,.0036,.0023,gold,x-.001,y,.0028,.0001);}
  const power=parts.power;power.position.set(-.033,.649,.049);box(power,.024,.012,.0015,pcb);box(power,.007,.005,.002,dark,-.003,.002,.002);box(power,.007,.006,.005,dark,.006,-.002,.003,.001);
  for(let i=0;i<3;i++){cylinder(power,.0015,.0035,metal,-.008+i*.007,.004,.004).rotation.x=Math.PI/2;}
  const rs485=parts.rs485;rs485.position.set(.034,.649,.05);box(rs485,.027,.014,.0015,pcb);box(rs485,.007,.005,.002,dark,0,0,.002);box(rs485,.020,.005,.007,f.mat('#59a16b'),0,.006,.004,.0004);
  for(const x of [-.006,0,.006]){const terminal=cylinder(rs485,.0018,.001,metal,x,.006,.008);terminal.rotation.x=Math.PI/2;}
  const battery=parts.battery;battery.position.set(0,.628,.052);box(battery,.079,.018,.025,dark,0,-.002,-.002,.003);const cell=cylinder(battery,.014,.07,blue,0,0,0);cell.rotation.z=Math.PI/2;
  cylinder(battery,.009,.0015,metal,-.036,0,0).rotation.z=Math.PI/2;cylinder(battery,.009,.0015,copper,.036,0,0).rotation.z=Math.PI/2;box(battery,.012,.030,.027,dark,0,0,0,.001);
  const antenna=parts.antenna;antenna.position.set(.073,.649,.049);
  link(antenna,V(-.014,0,0),V(.004,0,0),.0038,metal);cylinder(antenna,.0045,.018,dark,.004,.008,0);cylinder(antenna,.0028,.128,dark,.004,.079,0);const tip=new T.Mesh(new T.SphereGeometry(.0028,10,8),dark);tip.position.set(.004,.143,0);antenna.add(tip);
  // SX1262 daughterboard sits behind the controller and connects to the antenna.
  box(antenna,.023,.019,.002,pcb,-.055,.020,-.014);box(antenna,.015,.012,.002,metal,-.055,.020,-.011);
  tube(antenna,[V(-.044,.024,-.010),V(-.024,.034,-.003),V(.002,.010,0)],.0008,gold);
  const panel=parts.solar;panel.position.set(0,1.126,-.025);panel.rotation.x=.48;
  const frameMat=f.mat('#bdc7c1',{metalness:.86,roughness:.25}),cellMat=f.mat('#13394e',{metalness:.3,roughness:.25});
  box(panel,.23,.008,.195,frameMat,0,0,0,.002);box(panel,.217,.004,.182,dark,0,.005,0,.0005);
  const cells=new T.Group();panel.add(cells);
  for(let x=0;x<4;x++)for(let z=0;z<6;z++){
    const cx=-.080+x*.053,cz=-.075+z*.030;
    box(cells,.050,.0008,.027,cellMat,cx,.008,cz,.001);
    for(let i=0;i<8;i++)box(cells,.049,.00012,.00018,metal,cx,.0086,cz-.011+i*.003,.00001);
    box(cells,.0005,.00016,.026,metal,cx,.0087,cz,.00001);
  }
  const glass=new T.MeshPhysicalMaterial({color:'#b5d7da',transparent:true,opacity:.12,roughness:.1,metalness:.08,clearcoat:1,depthWrite:false});box(panel,.217,.0005,.182,glass,0,.0095,0,.0001);
  for(const x of [-.075,.075]){box(panel,.009,.010,.15,metal,x,-.010,0,.001);for(const z of [-.06,.06])cylinder(panel,.0025,.005,dark,x,-.017,z);}
  box(panel,.034,.010,.020,dark,0,-.012,-.045,.002);
  // Tilt bracket, cross bolt and support all meet the panel rails.
  link(support,V(-.075,1.103,-.035),V(.075,1.103,-.035),.004,metal);
  link(support,V(-.035,1.060,-.025),V(-.075,1.103,-.035),.003,metal);link(support,V(.035,1.060,-.025),V(.075,1.103,-.035),.003,metal);
  cylinder(support,.012,.010,metal,0,1.068,-.025);link(support,V(-.017,1.067,-.025),V(.017,1.067,-.025),.004,dark);
  // Panel cable is secured to the rear pole and enters the left gland.
  tube(root,[V(0,1.095,-.07),V(-.013,1.06,-.054),V(-.014,.85,-.048),V(-.032,.58,.052),V(-.032,.595,.052)],.002,dark);
  for(const y of [.8,.93,1.04]){const tie=new T.Mesh(new T.TorusGeometry(.011,.0009,6,20),dark);tie.position.set(0,y,-.025);tie.rotation.x=Math.PI/2;support.add(tie);}
  const probe=parts.probe;probe.position.set(.15,-.09,.025);box(probe,.045,.060,.015,dark,0,0,0,.004);
  const sensorLabel=printedLabel('SEN0604',.033,.013,'#b2bfc0','#182725');sensorLabel.position.set(0,.005,.0077);probe.add(sensorLabel);
  // Official SEN0604 drawing: four electrodes, 67 mm exposed; total length 127 mm.
  for(const x of [-.017,-.0057,.0057,.017]){cylinder(probe,.0016,.061,metal,x,-.0605,0);const point=new T.Mesh(new T.ConeGeometry(.0016,.006,10),metal);point.rotation.z=Math.PI;point.position.set(x,-.094,0);probe.add(point);}
  cylinder(probe,.003,.020,dark,0,.041,0);
  tube(root,[V(.032,.595,.052),V(.038,.42,.038),V(.022,.10,.012),V(.112,-.012,.020),V(.15,-.054,.025)],.0022,dark);
  // Harness endpoints follow the boards in exploded view; normal routes stay inside the enclosure.
  const harnesses:{line:T.Line;a:T.Group;b:T.Group;ap:T.Vector3;bp:T.Vector3}[]=[];
  const solarInlet=new T.Group(),sensorInlet=new T.Group();solarInlet.position.set(-.032,.614,.052);sensorInlet.position.set(.032,.614,.052);root.add(solarInlet,sensorInlet);
  for(const [a,b,color,ap,bp] of [[battery,power,'#b34d3e',V(-.036,0,0),V(0,-.005,.003)],[battery,power,'#313b34',V(.036,0,0),V(.005,-.005,.003)],[power,controller,'#ae7046',V(0,.005,.003),V(-.04,-.01,.002)],[controller,rs485,'#6b9eaa',V(.035,-.009,.003),V(0,.007,.003)],[controller,antenna,'#d2ad67',V(.04,.008,.003),V(-.055,.015,-.01)],[solarInlet,power,'#ad5746',V(0,0,0),V(-.008,.003,.005)],[sensorInlet,rs485,'#93b58c',V(0,0,0),V(-.006,.006,.008)],[sensorInlet,rs485,'#d0bb76',V(.002,0,0),V(.006,.006,.008)]] as [T.Group,T.Group,string,T.Vector3,T.Vector3][]){const g=new T.BufferGeometry().setFromPoints(Array.from({length:20},()=>new T.Vector3()));const line=new T.Line(g,new T.LineBasicMaterial({color}));root.add(line);harnesses.push({line,a,b,ap,bp});}
  const rest=new Map<Part,T.Vector3>();for(const [id,group] of Object.entries(parts))rest.set(id as Part,group.position.clone());
  const offsets:Partial<Record<Part,T.Vector3>>={controller:V(0,.055,.14),power:V(-.075,0,.13),rs485:V(.075,0,.13),battery:V(0,-.07,.13)};
  function update(settings:SceneSettings,blend:number){
    const exploded=settings.assembly==='exploded',open=settings.assembly!=='closed';
    hingePivot.position.lerp(exploded?V(.17,.02,.14):V(-.06,0,.05),blend);hingePivot.rotation.y=T.MathUtils.lerp(hingePivot.rotation.y,exploded?.4:open?-1.65:0,blend);
    for(const [id,group] of Object.entries(parts) as [Part,T.Group][]){group.position.lerp(rest.get(id)!.clone().add(exploded?(offsets[id]||V(0,0,0)):V(0,0,0)),blend);group.visible=!settings.hidden.includes(id);}
    root.updateMatrixWorld(true);
    for(const h of harnesses){const a=h.a.localToWorld(h.ap.clone()),b=h.b.localToWorld(h.bp.clone()),mid=a.clone().lerp(b,.5);mid.z+=.008;const pts=new T.CatmullRomCurve3([a,mid,b]).getPoints(19);const attr=h.line.geometry.getAttribute('position') as T.BufferAttribute;pts.forEach((v,i)=>attr.setXYZ(i,v.x,v.y,v.z));attr.needsUpdate=true;h.line.geometry.computeBoundingSphere();h.line.visible=h.a.visible&&h.b.visible;}
  }
  return {parts,lid,update,anchors:{solar:V(0,1.14,.02),case:V(0,.65,.08),controller:V(-.017,.669,.052),power:V(-.033,.637,.055),battery:V(0,.622,.065),rs485:V(.034,.635,.055),antenna:V(.077,.75,.05),probe:V(.15,-.11,.025)} as Record<Part,T.Vector3>};
}
