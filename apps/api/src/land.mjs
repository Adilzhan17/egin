import { validateCadastreDetails } from './cadastre-details.mjs';
// Optional land geometry extends existing field records without migrating data.
const fail = message => Object.assign(new Error(message), { status: 400 });
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const on = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-12 && p[0] <= Math.max(a[0], b[0]) + 1e-12 && p[1] >= Math.min(a[1], b[1]) - 1e-12 && p[1] <= Math.max(a[1], b[1]) + 1e-12;
const intersects = (a, b, c, d) => {
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  return ((x > 0 && y < 0 || x < 0 && y > 0) && (z > 0 && w < 0 || z < 0 && w > 0)) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
};
export function ringAreaHa(ring) {
  let sum=0;const rad=Math.PI/180;
  for(let i=0;i<ring.length-1;i++)sum+=(ring[i+1][0]-ring[i][0])*rad*(2+Math.sin(ring[i][1]*rad)+Math.sin(ring[i+1][1]*rad));
  return Math.abs(sum)*6371008.8**2/2/10000;
}
export function landAreaHa(boundary) {
  return boundary.coordinates.reduce((area,ring,index)=>area+(index===0?1:-1)*ringAreaHa(ring),0);
}
function ringContains(ring,point) {
  let inside=false;const [x,y]=point;
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1];
    if(on(a,b,point))return true;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function landContainsPoint(boundary,point) {
  return ringContains(boundary.coordinates[0],point)&&!boundary.coordinates.slice(1).some(ring=>ringContains(ring,point));
}
export function validateLand(data) {
  if (data.boundary !== undefined) {
    const b=data.boundary;
    if(!b||b.type!=='Polygon'||!Array.isArray(b.coordinates)||!b.coordinates.length||Object.keys(b).some(k=>!['type','coordinates'].includes(k)))throw fail('Границы: нужен GeoJSON Polygon с внешним контуром и необязательными внутренними вырезами');
    if(b.coordinates.some(ring=>!Array.isArray(ring)||ring.length<4)||b.coordinates.reduce((count,ring)=>count+ring.length,0)>2000)throw fail('Границы: каждый контур должен содержать от 4 точек, всего не более 2000 точек');
    for(const ring of b.coordinates){
      if(ring.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>=90))throw fail('Границы: координаты WGS84 [долгота, широта]');
      if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw fail('Каждый контур участка должен быть замкнут');
      const vertices=ring.slice(0,-1);
      if(new Set(vertices.map(p=>p.join(','))).size!==vertices.length)throw fail('В контуре есть повторяющиеся вершины');
      if(Math.max(...vertices.map(p=>p[0]))-Math.min(...vertices.map(p=>p[0]))>180)throw fail('Контуры через линию перемены дат пока не поддерживаются');
      for(let i=0;i<vertices.length;i++){
        const a=vertices[(i+vertices.length-1)%vertices.length],b=vertices[i],c=vertices[(i+1)%vertices.length];
        if(Math.abs(cross(a,b,c))<1e-12&&(a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1])>0)throw fail('В контуре есть наложенные рёбра');
      }
      for(let i=0;i<ring.length-1;i++)for(let j=i+2;j<ring.length-1;j++){
        if(i===0&&j===ring.length-2)continue;
        if(intersects(ring[i],ring[i+1],ring[j],ring[j+1]))throw fail('Граница участка пересекает сама себя');
      }
      if(ringAreaHa(ring)<0.0001)throw fail('Площадь каждого контура должна быть не меньше 1 м²');
    }
    for(let i=1;i<b.coordinates.length;i++){
      const hole=b.coordinates[i];
      for(let j=0;j<i;j++){
        const other=b.coordinates[j];
        for(let a=0;a<hole.length-1;a++)for(let c=0;c<other.length-1;c++)if(intersects(hole[a],hole[a+1],other[c],other[c+1]))throw fail('Внутренние вырезы не должны пересекать или касаться других границ');
        if(j===0&&!ringContains(other,hole[0]))throw fail('Внутренний вырез должен находиться внутри внешнего контура');
        if(j>0&&(ringContains(other,hole[0])||ringContains(hole,other[0])))throw fail('Внутренние вырезы не должны перекрываться или находиться друг внутри друга');
      }
    }
    const hectares=landAreaHa(b);
    if(!Number.isFinite(hectares)||hectares<0.0001||hectares>1000000)throw fail('Площадь участка без вырезов должна быть от 1 м² до 1 000 000 га');
  }
  if (data.cadastre !== undefined) {
    const c = data.cadastre;
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !['number', 'source', 'importedAt', 'details'].includes(k)) || !['user', 'geojson', 'demo', 'public-map'].includes(c.source) || typeof c.importedAt !== 'string' || c.importedAt.length > 30 || !/^\d{4}-\d{2}-\d{2}T/.test(c.importedAt) || !Number.isFinite(Date.parse(c.importedAt))) throw fail('Проверьте источник данных участка');
    if (c.number !== undefined && (typeof c.number !== 'string' || c.number.length > 80 || /[\x00-\x1f\x7f]/.test(c.number))) throw fail('Некорректный кадастровый номер');
    if (c.source === 'demo' && c.number) throw fail('Учебному участку нельзя присвоить кадастровый номер');
    if (c.details !== undefined) {
      if (c.source !== 'public-map') throw fail('Сведения ЕГКН доступны только для источника public-map');
      validateCadastreDetails(c.details);
      if (typeof c.number !== 'string' || !/^[\d\s:-]+$/.test(c.number) || c.number.replace(/[\s:-]/g, '') !== c.details.cadastralNumber) throw fail('Номер участка не совпадает со сведениями кадастра');
    }
  }
}
