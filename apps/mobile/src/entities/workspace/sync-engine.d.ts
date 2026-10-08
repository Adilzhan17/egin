export function buildSyncBatches<T extends {id:string;kind:string;data:unknown;version:number;deleted:boolean}>(records:T[], maxBytes?:number): {records:T[];body:string}[];
export function runSync(automatic?: boolean): Promise<{state:string;message:string}>;
