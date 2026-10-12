import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { SceneOptions } from './create-scene';
import './plant-scene-2d.css';

type Props = { options: SceneOptions; phase?: number; clockLabel?: string };
const phaseNames = ['Семя', 'Росток', 'Рост', 'Зрелость'];
const cropNames = { wheat: 'Пшеница', tomato: 'Томат', apple: 'Яблоня', sunflower: 'Подсолнечник' };
const periodNames = { dawn: 'утро', day: 'день', dusk: 'закат', night: 'ночь' };
const conditionNames: Record<string, string> = { sun: 'ясно', night: 'ясно', cloud: 'облачно', rain: 'дождь', snow: 'снег', fog: 'туман', storm: 'гроза', wind: 'ветрено' };

/** A deterministic illustration: phase is a visual preview, not a crop diagnosis. */
export default function PlantScene2D({ options, phase, clockLabel }: Props) {
  const id = useId().replace(/:/g, '');
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateMotion(); updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.01 });
    if (host.current) observer?.observe(host.current);
    return () => { observer?.disconnect(); media.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);

  const growth = Math.max(0, Math.min(3, Math.round(phase ?? options.stage)));
  const period = options.timeOfDay ?? (options.isDaytime === false || options.weather === 'night' ? 'night' : 'day');
  const condition = options.condition ?? options.weather;
  const rainy = condition === 'rain' || condition === 'storm';
  const snowy = condition === 'snow';
  const cloudy = ['cloud', 'rain', 'storm', 'snow', 'fog'].includes(condition) || (options.cloudCover ?? 0) > 55;
  const night = period === 'night';
  const moving = options.active && options.motion && visible && pageVisible && !reducedMotion;
  const paint = (name: string) => `url(#${id}-${name})`;
  const sceneStyle = { '--plant-breeze': `${Math.min(5.5, 1.5 + (options.windSpeed ?? 7) / 12)}deg` } as CSSProperties;
  const halo = night ? '#45685d' : condition === 'storm' ? '#d1ddd9' : period === 'dusk' ? '#f6d8b9' : period === 'dawn' ? '#f4e8d6' : '#dce9d6';

  return <div ref={host} className="plant-2d-scene" data-period={period} data-condition={condition} data-phase={growth} data-running={moving} style={sceneStyle}>
    <svg viewBox="0 0 440 420" role="img" aria-labelledby={`${id}-title ${id}-description`} preserveAspectRatio="xMidYMid meet">
      <title id={`${id}-title`}>{cropNames[options.crop]} · {phaseNames[growth]}</title>
      <desc id={`${id}-description`}>Иллюстрация растения. {periodNames[period]}, {conditionNames[condition] ?? 'погода участка'}{clockLabel ? `, ${clockLabel}` : ''}. Фаза показана для примера.</desc>
      <defs>
        <radialGradient id={`${id}-sky`}><stop stopColor={halo} stopOpacity=".75" /><stop offset="1" stopColor={halo} stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}-glow`}><stop stopColor={night ? '#dbe5d3' : '#f9d9ad'} stopOpacity=".4" /><stop offset="1" stopColor={halo} stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}-leaf`} cx=".28" cy=".18" r=".95"><stop stopColor="#abc593" /><stop offset=".4" stopColor="#719c70" /><stop offset=".78" stopColor="#477955" /><stop offset="1" stopColor="#2e6047" /></radialGradient>
        <filter id={`${id}-soft-shadow`} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#244f36" floodOpacity=".12" /></filter>
        <linearGradient id={`${id}-young`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#67946b" /><stop offset="1" stopColor="#b2c9a0" /></linearGradient>
        <linearGradient id={`${id}-stem`}><stop stopColor="#3c6540" /><stop offset=".5" stopColor="#7a9851" /><stop offset="1" stopColor="#48713e" /></linearGradient>
        <linearGradient id={`${id}-gold`}><stop stopColor="#a9843f" /><stop offset="1" stopColor="#e6cc87" /></linearGradient>
        <radialGradient id={`${id}-fruit`} cx=".3" cy=".25" r=".8"><stop stopColor="#d9a176" /><stop offset=".45" stopColor="#ba7051" /><stop offset="1" stopColor="#934f3c" /></radialGradient>
        <clipPath id={`${id}-scene-clip`}><rect width="440" height="420" /></clipPath>
        <g id={`${id}-leaf-shape`} filter={paint('soft-shadow')}>
          <path d="M0 0 C-27 4-62-16-56-44 C-52-57-34-56-22-49 C-3-39 9-16 0 0Z" fill={paint('leaf')} />
          <path d="M-1-1 C-15-15-30-31-49-43 C-32-33-12-32-2-18 Q3-8-1-1Z" fill="#244f3c" opacity=".13" />
          <path d="M-6-8 Q-24-29-46-42 M-17-20Q-28-18-37-24 M-29-31Q-29-39-36-44" fill="none" stroke="#d9e5bc" strokeWidth=".85" strokeLinecap="round" opacity=".4" />
          <path d="M-47-43Q-40-49-30-43" fill="none" stroke="#e1edca" strokeWidth="2.2" strokeLinecap="round" opacity=".35" />
        </g>
        <g id={`${id}-cloud`}><path d="M0 29 C-9 13 4-1 21 7 C23-12 51-16 64 1 C78-2 89 6 90 16 C113 12 127 29 113 38 C82 43 29 43 8 38 Q0 36 0 29Z" /></g>
      </defs>

      <g clipPath={paint('scene-clip')}>
        <ellipse cx="220" cy="225" rx="206" ry="185" fill={paint('sky')} />
        <circle cx={period === 'dusk' ? 346 : 92} cy={period === 'day' ? 76 : 150} r={period === 'dusk' ? 136 : 95} fill={paint('glow')} opacity={cloudy ? '.45' : '1'} />
        {night ? <>
          {[ [100,110], [309,100], [334,180], [116,224] ].map(([x,y], i) => <circle key={i} className="plant-2d-star" cx={x} cy={y} r={i % 3 === 0 ? 1.7 : 1} fill="#edf5df" opacity={cloudy ? '.25' : '.8'} style={{ animationDelay: `${-i * .7}s` }} />)}
          <path d="M102 64 C76 64 67 95 84 111 C98 125 117 118 125 104 C96 111 84 84 102 64Z" fill="#f1efd6" opacity={cloudy ? '.2' : '.55'} transform="translate(55 8) scale(.65)" />
        </> : <circle cx={period === 'dusk' ? 345 : 91} cy={period === 'day' ? 76 : 153} r={period === 'day' ? 12 : 16} fill={period === 'dusk' ? '#fff0be' : '#fff9df'} opacity={cloudy ? '.2' : '.5'} />}
        {clockLabel && <text x="220" y="78" textAnchor="middle" fill={night ? '#eef4e3' : '#365d4b'} fontSize="52" fontWeight="300" letterSpacing="-2.5" opacity={night ? '.35' : '.3'} aria-hidden="true">{clockLabel}</text>}
        {cloudy && <g className="plant-2d-clouds" fill={night ? '#819697' : condition === 'storm' ? '#829994' : '#c3d1c8'} opacity=".28">
          <use href={`#${id}-cloud`} transform="translate(77 111) scale(.62)" className="plant-2d-cloud" />
          <use href={`#${id}-cloud`} transform="translate(286 144) scale(.5)" className="plant-2d-cloud plant-2d-cloud--far" />
        </g>}
        <ellipse cx="220" cy="312" rx={growth === 0 ? 24 : 72} ry="11" fill={night ? '#081f18' : '#8fa889'} opacity=".08" />
        <ellipse cx="220" cy="311" rx={growth === 0 ? 14 : 43} ry="4" fill={night ? '#081f18' : '#67836b'} opacity=".13" />
        {!rainy && !snowy && <g aria-hidden="true">{[[99,196],[327,244],[132,284],[301,137],[108,116]].map(([x,y],i) => <g key={i} className="plant-2d-mote" style={{ animationDelay: `${-i * 1.7}s` }}><circle cx={x} cy={y} r={night ? 3 : 2} fill={night ? '#e4e9ba' : '#b3c596'} opacity=".65" /><circle cx={x} cy={y} r="6" fill={night ? '#e4e9ba' : '#b3c596'} opacity=".08" /></g>)}</g>}
        <g transform="translate(0 35)">
        {growth === 0 ? <g><ellipse cx="220" cy="275" rx="10" ry="6" transform="rotate(-24 220 275)" fill="#d5b580" /><path d="M218 277Q225 273 225 269" fill="none" stroke="#946e43" strokeWidth="1.1" /><path d="M220 269Q215 256 224 249" stroke="#719650" strokeWidth="3" fill="none" /><path d="M224 249Q214 246 215 239Q228 240 224 249Z" fill={paint('young')} /></g> : <g className="plant-2d-plant">
          {options.crop === 'wheat' && growth > 1 ? <g>
            {[{x:196,y:131,a:-12},{x:219,y:96,a:2},{x:242,y:140,a:14}].map(({x,y,a},i) => <g key={x}>
              <path d={`M220 269 Q${x} 208 ${x} ${y + 12}`} stroke={paint('stem')} strokeWidth="3.2" fill="none" />
              <path d={`M${210 + i * 9} 226Q${154 + i * 39} 201 ${141 + i * 45} 172Q${173 + i * 30} 183 ${210 + i * 9} 226Z`} fill={paint('leaf')} />
              <g transform={`translate(${x} ${y}) rotate(${a})`}>
                <path d="M0 34V-27" stroke={growth === 3 ? '#b89d58' : '#718b46'} strokeWidth="2" />
                {[0,1,2,3,4].map(n => <g key={n} transform={`translate(0 ${24 - n * 9})`}><path d="M0 1Q-17-4-10-16Q1-13 0 1Z M1 1Q17-4 10-16Q0-13 1 1Z" fill={growth === 3 ? paint('gold') : paint('young')} /><path d="M-8-10L-15-28 M8-10L15-28" stroke={growth === 3 ? '#cbb277' : '#829d59'} strokeWidth=".7" /></g>)}
              </g>
            </g>)}
          </g> : <g transform={growth === 1 ? 'translate(220 266) scale(1.35) translate(-220 -266)' : undefined}>
            <path d={growth === 1 ? "M219 267 C223 240 211 217 218 190 Q222 171 220 154" : "M219 267 C223 240 211 217 218 190 C224 166 215 144 225 116"} fill="none" stroke={options.crop === 'apple' && growth > 1 ? '#7d7950' : paint('stem')} strokeWidth={options.crop === 'apple' && growth > 1 ? '7' : '5.5'} strokeLinecap="round" />
            <path d="M218 218Q199 204 174 196 M220 185Q240 174 267 169" fill="none" stroke="#668349" strokeWidth="3" strokeLinecap="round" />
            <use href={`#${id}-leaf-shape`} transform={growth === 1 ? "translate(176 198) rotate(-5) scale(1.12)" : "translate(176 198) rotate(-28) scale(1.12)"} />
            <use href={`#${id}-leaf-shape`} transform={growth === 1 ? "translate(266 170) rotate(5) scale(-1.02 1.02)" : "translate(266 170) rotate(32) scale(-1.02 1.02)"} />
            <use href={`#${id}-leaf-shape`} transform={growth === 1 ? "translate(220 167) rotate(18) scale(.7)" : "translate(222 151) rotate(15) scale(.8)"} />
            {growth > 1 ? <path d="M224 124 C223 101 239 88 256 88 C258 105 242 124 224 124Z" fill={paint('young')} /> : <path d="M220 156 C212 137 226 123 240 128 C246 142 233 155 220 156Z" fill={paint('young')} />}
            
            {growth > 1 && <>
              <path d="M220 242Q241 220 271 220 M217 175Q192 160 184 148" fill="none" stroke="#638448" strokeWidth="2.6" strokeLinecap="round" />
              <use href={`#${id}-leaf-shape`} transform="translate(270 220) rotate(64) scale(-.9 .9)" />
              <use href={`#${id}-leaf-shape`} transform="translate(184 149) rotate(-21) scale(.84)" />
              <use href={`#${id}-leaf-shape`} transform="translate(219 244) rotate(-55) scale(.8)" />
            </>}
            {growth === 3 && (options.crop === 'sunflower' ? <g transform="translate(228 94)">
              {Array.from({length: 12}, (_, i) => <ellipse key={i} cx="0" cy="-19" rx="6" ry="14" transform={`rotate(${i * 30})`} fill={i % 2 ? '#efd38c' : '#dfba67'} />)}
              <circle r="14" fill="#796144" /><circle r="10" fill="#967b4e" />{Array.from({length: 7},(_,i) => <circle key={i} cx={Math.cos(i)*6} cy={Math.sin(i)*6} r="1.2" fill="#d3b078" />)}
            </g> : [{x:172,y:198},{x:272,y:174},{x:256,y:228}].map(({x,y},i) => <g key={x} transform={`translate(${x} ${y}) rotate(${i * 12 - 10})`}>
              <path d="M0 0Q-1-7 2-11" stroke="#677341" strokeWidth="1.7" fill="none" strokeLinecap="round" />
              <path d="M0 0C-14-7-18 7-11 17Q-5 25 0 20Q7 25 13 16C19 3 11-7 0 0Z" fill={paint('fruit')} />
              <path d="M-8 3Q-12 7-9 12" fill="none" stroke="#f4c29c" strokeWidth="1.4" strokeLinecap="round" opacity=".4" />
              {options.crop === 'tomato' && <path d="M0 0L-8-3-3 2-6 7 1 3 7 7 5 1 10-3 2-1 0-6Z" fill="#547c43" />}
            </g>))}
          </g>}
        </g>}

        </g>

        {condition === 'fog' && <g stroke={night ? '#bacac7' : '#fff'} strokeWidth="12" strokeLinecap="round" opacity=".35" className="plant-2d-fog"><path d="M31 185H175 M208 206H415 M14 245H163 M277 253H398" /></g>}
        {(rainy || snowy) && <g className="plant-2d-precipitation" clipPath={paint('scene-clip')} aria-hidden="true">
          {Array.from({ length: snowy ? 14 : 18 }, (_, i) => <g key={i} className={snowy ? 'plant-2d-snow' : 'plant-2d-rain'} style={{ animationDelay: `${-(i * .47)}s`, animationDuration: snowy ? `${4.8 + i % 4}s` : `${.9 + (i % 4) * .15}s` }}>
            {snowy ? <circle cx={18 + ((i * 83) % 407)} cy={-30 + ((i * 71) % 320)} r={1.3 + i % 3 * .6} fill="#fff" opacity=".6" /> : <path d={`M${22 + ((i * 67) % 403)} ${-35 + ((i * 61) % 295)} l-5 17`} stroke={night ? '#b2d0dd' : '#789f9e'} strokeWidth="1.25" strokeLinecap="round" opacity=".4" />}
          </g>)}
        </g>}

      </g>
    </svg>
  </div>;
}
