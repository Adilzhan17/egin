export type Mode='simulation'|'hardware';
export type View='overview'|'twin'|'analytics'|'health'|'history';
export type Part='solar'|'case'|'controller'|'power'|'battery'|'rs485'|'antenna'|'probe';
export type Scenario='normal'|'rain'|'drought'|'salinity'|'offline'|'low_battery'|'restore'|'sensor_offline';
export type ReadingKey='soil_moisture_pct'|'soil_temperature_c'|'ec_us_cm'|'soil_ph';
export type Readings=Record<ReadingKey,number>;
export interface Snapshot{
  device_id:string;seq:number;run_id?:string;timestamp:string|null;received_at?:string;source:'simulation'|'hardware';
  quality_flags:string[];firmware_status?:string;firmware_version?:string|null;sensor_error?:string|null;stale?:boolean;alerts?:string[];has_checkpoint?:boolean;
  readings:Readings|null;
  power:{battery_mv:number;battery_soc_est_pct:number|null;solar_input_mw:number|null;estimated?:boolean}|null;
  radio:{status:string;buffered_packets:number;firmware_queue_packets?:number|null;lost_packets?:number;rssi_dbm?:number|null}|null;
  simulation?:{playing:boolean;speed:number;scenario:Scenario;virtual_time:string;rain_mm_h:number;sensor_online:boolean;battery_saving?:boolean;soil_depth_cm?:number};
}
export interface Device{device_id:string;name:string;created:number;last_seen:string|null;stale:boolean;sensor_error:string|null}
export interface DeviceEvent{id:number;mode:Mode;timestamp:string;virtual_time:string|null;code:string;severity:'info'|'warning'|'critical';title:string;detail:string|null;device_id:string|null}
export interface SceneSettings{cutaway:boolean;assembly:'closed'|'open'|'exploded';labels:boolean;hidden:Part[];reset:number;focus:number;selected:Part|null}
export const format=(value:number|null|undefined,digits=1)=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value):'—';
export const dateTime=(value:string|null|undefined)=>value?new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Нет измерений';
