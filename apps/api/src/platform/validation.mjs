export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function object(value){if(!value||typeof value!=='object'||Array.isArray(value))throw fail(422,'Проверьте данные формы');return value;}
export function fields(value,keys){object(value);if(Object.keys(value).some(key=>!keys.includes(key)))throw fail(422,'Неизвестное поле запроса');return value;}
export function text(value,max=250,required=false){if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail(422,'Проверьте текстовое поле');return value.trim();}
export function integer(value,min,max){if(!Number.isInteger(value)||value<min||value>max)throw fail(422,'Проверьте числовое значение');return value;}
export function identifier(value){if(!uuid(value))throw fail(422,'Некорректный идентификатор');return value;}
export function money(value,{positive=false}={}){if(typeof value!=='string'||!/^\d{1,12}(?:\.\d{1,2})?$/.test(value))throw fail(422,'Укажите сумму строкой с точностью до двух знаков');const [a,b='']=value.split('.');const amount=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(positive&&amount===0n)throw fail(422,'Сумма должна быть больше нуля');return `${amount/100n}.${String(amount%100n).padStart(2,'0')}`;}
export const cents=value=>{const[a,b='']=String(value).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
export const amount=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
export const iso=value=>value?new Date(value).toISOString():null;
