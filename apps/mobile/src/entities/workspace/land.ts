/** GeoJSON uses [longitude, latitude], in WGS84. No cadastral verification is inferred. */
export type Boundary = { type: 'Polygon'; coordinates: number[][][] };
export type Parcel = { name: string; boundary: Boundary; area: number; latitude: number; longitude: number; number?: string; demo?: boolean };
const fail = (message: string): never => { throw new Error(message); };
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const orient = (a: number[], b: number[], c: number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const between = (a: number[], b: number[], p: number[]) => p[0]>=Math.min(a[0],b[0])-1e-12 && p[0]<=Math.max(a[0],b[0])+1e-12 && p[1]>=Math.min(a[1],b[1])-1e-12 && p[1]<=Math.max(a[1],b[1])+1e-12;
function intersects(a: number[],b: number[],c: number[],d: number[]) { const x=orient(a,b,c),y=orient(a,b,d),z=orient(c,d,a),w=orient(c,d,b); return (x*y<0&&z*w<0)||Math.abs(x)<1e-12&&between(a,b,c)||Math.abs(y)<1e-12&&between(a,b,d)||Math.abs(z)<1e-12&&between(c,d,a)||Math.abs(w)<1e-12&&between(c,d,b); }
function ringContains(ring:number[][],point:number[]) {
  let inside=false;const [x,y]=point;
  for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if(Math.abs(orient(a,b,point))<1e-12&&between(a,b,point))return true;if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
  return inside;
}
export function boundaryContainsPoint(boundary:Boundary,point:number[]) {
  return ringContains(boundary.coordinates[0],point)&&!boundary.coordinates.slice(1).some(ring=>ringContains(ring,point));
}
function ringMetrics(ring:number[][]) {
  const rad=Math.PI/180;let sum=0,cross=0,cx=0,cy=0;const ox=ring[0][0],oy=ring[0][1];
  for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];sum+=(b[0]-a[0])*rad*(2+Math.sin(a[1]*rad)+Math.sin(b[1]*rad));const v=(a[0]-ox)*(b[1]-oy)-(b[0]-ox)*(a[1]-oy);cross+=v;cx+=(a[0]+b[0]-2*ox)*v;cy+=(a[1]+b[1]-2*oy)*v;}
  return {area:Math.abs(sum)*6371008.8**2/2/10000,weight:Math.abs(cross),longitude:ox+cx/(3*cross),latitude:oy+cy/(3*cross)};
}
function interiorPoint(boundary:Boundary,preferred:number[]) {
  if(boundaryContainsPoint(boundary,preferred))return preferred;
  // A centroid may lie inside a cutout or outside a concave parcel. Scan a
  // horizontal line through land and choose the widest valid interior interval.
  const ys=[...new Set(boundary.coordinates.flatMap(ring=>ring.map(p=>p[1])))].sort((a,b)=>a-b);
  const levels=[preferred[1],...ys.slice(1).map((y,i)=>(y+ys[i])/2)];
  for(const y of levels){
    const xs:number[]=[];
    for(const ring of boundary.coordinates)for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
    xs.sort((a,b)=>a-b);let best:number[]|undefined,width=0;
    for(let i=0;i<xs.length-1;i++){const p=[(xs[i]+xs[i+1])/2,y],span=xs[i+1]-xs[i];if(span>width&&boundaryContainsPoint(boundary,p)){best=p;width=span;}}
    if(best)return best;
  }
  return fail('Не удалось выбрать точку внутри участка. Проверьте контур.');
}
export function measureBoundary(input: unknown): Omit<Parcel,'name'> {
  if(isObject(input)&&input.type==='MultiPolygon'&&Array.isArray(input.coordinates)){
    if(input.coordinates.length!==1)return fail('Участок состоит из нескольких отдельных контуров. Пока поддерживается один Polygon с внутренними вырезами.');
    input={type:'Polygon',coordinates:input.coordinates[0]};
  }
  if(!isObject(input)||input.type!=='Polygon'||!Array.isArray(input.coordinates)||!input.coordinates.length)return fail('Нужен GeoJSON Polygon с внешним контуром и необязательными внутренними вырезами.');
  if(input.coordinates.some(ring=>!Array.isArray(ring)||ring.length<4)||input.coordinates.reduce((count,ring)=>count+(ring as unknown[]).length,0)>2000)return fail('Каждый контур должен содержать от 4 точек, всего не более 2000 координат.');
  const rings:number[][][]=input.coordinates.map(raw=>(raw as unknown[]).map(p=>{if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>=90)return fail('Координаты должны быть парами [долгота, широта] в WGS84.');return [p[0],p[1]];}));
  for(const ring of rings){
    if(ring[0][0]!==ring.at(-1)![0]||ring[0][1]!==ring.at(-1)![1])return fail('Каждый контур должен быть замкнут: первая и последняя координаты должны совпадать.');
    const points=ring.slice(0,-1);
    if(new Set(points.map(p=>p.join(','))).size!==points.length)return fail('В контуре есть повторяющиеся вершины.');
    if(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))>180)return fail('Контуры через линию перемены дат не поддерживаются.');
    for(let i=0;i<ring.length-1;i++)for(let j=i+2;j<ring.length-1;j++){
      if(i===0&&j===ring.length-2)continue;
      if(intersects(ring[i],ring[i+1],ring[j],ring[j+1]))return fail('Границы пересекаются или касаются сами себя. Исправьте контур.');
    }
    for(let i=0;i<points.length;i++){const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];if(Math.abs(orient(a,b,c))<1e-12&&(a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1])>0)return fail('В контуре есть наложенные рёбра.');}
    if(ringMetrics(ring).area<0.0001)return fail('Площадь каждого контура должна быть не меньше 1 м².');
  }
  for(let i=1;i<rings.length;i++)for(let j=0;j<i;j++){
    const hole=rings[i],other=rings[j];
    for(let a=0;a<hole.length-1;a++)for(let b=0;b<other.length-1;b++)if(intersects(hole[a],hole[a+1],other[b],other[b+1]))return fail('Внутренние вырезы не должны пересекать или касаться других границ.');
    if(j===0&&!ringContains(other,hole[0]))return fail('Внутренний вырез должен находиться внутри внешнего контура.');
    if(j>0&&(ringContains(other,hole[0])||ringContains(hole,other[0])))return fail('Внутренние вырезы не должны перекрываться или находиться друг внутри друга.');
  }
  let area=0,weight=0,x=0,y=0;
  for(let i=0;i<rings.length;i++){const metric=ringMetrics(rings[i]),sign=i===0?1:-1;area+=sign*metric.area;weight+=sign*metric.weight;x+=sign*metric.longitude*metric.weight;y+=sign*metric.latitude*metric.weight;}
  if(!Number.isFinite(area)||area<0.0001||area>1000000||weight<1e-14)return fail('Площадь участка без вырезов должна быть от 1 м² до 1 000 000 га.');
  const boundary:Boundary={type:'Polygon',coordinates:rings};
  const [longitude,latitude]=interiorPoint(boundary,[x/weight,y/weight]);
  return {boundary,area:Math.round(area*10000)/10000,longitude,latitude};
}

export function parseLandGeoJSON(text: string): Parcel[] {
  if(new TextEncoder().encode(text).length>2*1024*1024)return fail('Файл слишком большой. Максимум — 2 МБ.');
  let root:unknown;try{root=JSON.parse(text);}catch{return fail('Не удалось прочитать JSON. Выберите файл .geojson или .json.');}
  if(!isObject(root))return fail('Некорректный GeoJSON.');
  if(root.crs)return fail('Используйте GeoJSON WGS84 без свойства crs. Перепроецируйте данные в EPSG:4326.');
  const items=root.type==='FeatureCollection'?root.features:[root];
  if(!Array.isArray(items)||!items.length||items.length>200)return fail('Файл должен содержать от 1 до 200 участков.');
  let vertices=0;
  return items.map((item,index)=>{
    if(!isObject(item)||item.crs)return fail(`Участок ${index+1}: некорректный GeoJSON WGS84.`);
    const shape=item.type==='Feature'?item.geometry:item;
    if(isObject(shape)&&shape.crs)return fail('Свойство crs не поддерживается. Используйте WGS84.');
    const parcel=measureBoundary(shape);vertices+=parcel.boundary.coordinates.reduce((count,ring)=>count+ring.length,0);
    if(vertices>2000)return fail('В файле больше 2000 вершин. Уменьшите число участков или детализацию.');
    const props=isObject(item.properties)?item.properties:{};
    const name=typeof props.name==='string'?props.name.trim().slice(0,80):'';
    const number=typeof props.cadastral_number==='string'?props.cadastral_number.trim().slice(0,80):undefined;
    return {...parcel,name:name||`Участок ${index+1}`,number,demo:props.source==='demo'};
  });
}
export const DEMO_PARCELS: Parcel[] = [
  [[71.018,51.347],[71.031,51.349],[71.034,51.342],[71.021,51.339],[71.018,51.347]],
  [[71.036,51.349],[71.05,51.348],[71.049,51.34],[71.037,51.341],[71.036,51.349]],
].map((ring,i)=>({name:`Демо · участок ${i+1}`,...measureBoundary({type:'Polygon',coordinates:[ring]})}));
