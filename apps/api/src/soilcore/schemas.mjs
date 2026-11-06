export const error=(status,message)=>Object.assign(new Error(message),{status});
function number(value,min,max,name){if(!Number.isFinite(value)||value<min||value>max)throw error(400,`Некорректное поле ${name}`);return value;}
export function hardwarePayload(body,deviceId){
  if(!body||!Number.isSafeInteger(body.seq)||body.seq<0||typeof body.timestamp!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(body.timestamp)||!Number.isFinite(Date.parse(body.timestamp))||new Date(body.timestamp).toISOString().slice(0,19)!==body.timestamp.slice(0,19))throw error(400,'Некорректные seq или UTC timestamp');
  let readings=null;
  if(body.readings){const r=body.readings;readings={soil_moisture_pct:number(r.soil_moisture_pct,0,100,'влажность'),soil_temperature_c:number(r.soil_temperature_c,-40,80,'температура'),ec_us_cm:number(r.ec_us_cm,0,20000,'EC'),soil_ph:number(r.soil_ph,0,14,'pH')};}
  const sensorError=body.sensor_error===undefined?null:body.sensor_error;
  if(sensorError!==null&&!['timeout','crc','modbus_exception','range','storage'].includes(sensorError))throw error(400,'Неизвестная ошибка прибора');
  if(!readings&&!sensorError)throw error(400,'Отсутствуют показания или ошибка сенсора');
  let power=null,radio=null;
  if(body.power){const p=body.power;power={battery_mv:number(p.battery_mv,0,6000,'напряжение'),battery_soc_est_pct:p.battery_soc_est_pct==null?null:number(p.battery_soc_est_pct,0,100,'заряд'),solar_input_mw:p.solar_input_mw==null?null:number(p.solar_input_mw,0,10000,'генерация'),estimated:true};}
  if(body.radio){const r=body.radio;if(!['connected','offline'].includes(r.status)||!Number.isSafeInteger(r.buffered_packets)||r.buffered_packets<0||r.buffered_packets>100000)throw error(400,'Некорректное состояние связи');radio={status:r.status,buffered_packets:r.buffered_packets,rssi_dbm:r.rssi_dbm==null?null:number(r.rssi_dbm,-160,0,'RSSI')};}
  return {schema_version:1,device_id:deviceId,seq:body.seq,timestamp:new Date(body.timestamp).toISOString(),source:'hardware',readings,power,radio,quality_flags:['PH_UNVALIDATED','MOISTURE_NOT_SOIL_CALIBRATED'],sensor_error:sensorError,firmware_version:typeof body.firmware_version==='string'?body.firmware_version.slice(0,80):null};
}
