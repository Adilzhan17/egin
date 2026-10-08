/** GeoJSON uses [longitude, latitude], in WGS84. No cadastral verification is inferred. */
export type Boundary = { type: 'Polygon'; coordinates: number[][][] };
export type Parcel = { name: string; boundary: Boundary; area: number; latitude: number; longitude: number; number?: string; demo?: boolean };
const fail = (message: string): never => { throw new Error(message); };
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const orient = (a: number[], b: number[], c: number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const between = (a: number[], b: number[], p: number[]) => p[0]>=Math.min(a[0],b[0])-1e-12 && p[0]<=Math.max(a[0],b[0])+1e-12 && p[1]>=Math.min(a[1],b[1])-1e-12 && p[1]<=Math.max(a[1],b[1])+1e-12;
function intersects(a: number[],b: number[],c: number[],d: number[]) { const x=orient(a,b,c),y=orient(a,b,d),z=orient(c,d,a),w=orient(c,d,b); return (x*y<0&&z*w<0)||Math.abs(x)<1e-12&&between(a,b,c)||Math.abs(y)<1e-12&&between(a,b,d)||Math.abs(z)<1e-12&&between(c,d,a)||Math.abs(w)<1e-12&&between(c,d,b); }
export function measureBoundary(input: unknown): Omit<Parcel,'name'> {
  if (!isObject(input)||input.type!=='Polygon'||!Array.isArray(input.coordinates)) return fail('Нужен контур GeoJSON Polygon. Точки и MultiPolygon пока не поддерживаются.');
  if(input.coordinates.length!==1) return fail('Контуры с внутренними вырезами пока не поддерживаются. Нужен Polygon с одним внешним кольцом.');
  const raw=input.coordinates[0];
  if(!Array.isArray(raw)||raw.length<4||raw.length>2000) return fail('Контур должен содержать от 4 до 2000 координат, включая замыкающую точку.');
  const ring:number[][]=raw.map(p=>{if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>=90)return fail('Координаты должны быть парами [долгота, широта] в WGS84.');return [p[0],p[1]];});
  if(ring[0][0]!==ring.at(-1)![0]||ring[0][1]!==ring.at(-1)![1])return fail('Контур не замкнут: первая и последняя координаты должны совпадать.');
  const points=ring.slice(0,-1);
  if(new Set(points.map(p=>p.join(','))).size!==points.length)return fail('В контуре есть повторяющиеся вершины.');
  if(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))>180)return fail('Контуры через линию перемены дат не поддерживаются.');
  for(let i=0;i<ring.length-1;i++)for(let j=i+1;j<ring.length-1;j++){
    if(j===i+1||i===0&&j===ring.length-2)continue;
    if(intersects(ring[i],ring[i+1],ring[j],ring[j+1]))return fail('Границы пересекаются или касаются сами себя. Исправьте контур.');
  }
  // Reject adjacent backtracking as well as crossings of non-adjacent edges.
  for(let i=0;i<points.length;i++){const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];if(Math.abs(orient(a,b,c))<1e-12&&(a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1])>0)return fail('В контуре есть наложенные рёбра.');}
  const rad=Math.PI/180;let sum=0,cross=0,cx=0,cy=0;const ox=ring[0][0],oy=ring[0][1];
  for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];sum+=(b[0]-a[0])*rad*(2+Math.sin(a[1]*rad)+Math.sin(b[1]*rad));const v=(a[0]-ox)*(b[1]-oy)-(b[0]-ox)*(a[1]-oy);cross+=v;cx+=(a[0]+b[0]-2*ox)*v;cy+=(a[1]+b[1]-2*oy)*v;}
  const area=Math.abs(sum)*6371008.8**2/2/10000;
  if(!Number.isFinite(area)||area<0.0001||area>1000000||Math.abs(cross)<1e-14)return fail('Площадь контура должна быть от 1 м² до 1 000 000 га.');
  return {boundary:{type:'Polygon',coordinates:[ring]},area:Math.round(area*10000)/10000,longitude:ox+cx/(3*cross),latitude:oy+cy/(3*cross)};
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
    const parcel=measureBoundary(shape);vertices+=parcel.boundary.coordinates[0].length;
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
