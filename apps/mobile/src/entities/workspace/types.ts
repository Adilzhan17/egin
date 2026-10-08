export type Kind = 'entry' | 'field' | 'sensor' | 'profile';
export type Entry = { title: string; text: string; date: string; fieldId: string; assets: string[] };
export type CadastralDetails = {
  sourceUrl: string; fetchedAt: string; cadastralNumber: string;
  region?: string; district?: string; address?: string; addressKz?: string; addressCode?: string;
  category?: string; purpose?: string; purposeKz?: string; rightType?: string;
  registeredAreaHa?: number; perimeterM?: number; costKzt?: number;
  status: 'active' | 'archived' | 'unknown'; statusLabel?: string;
  owners: { availability: 'available' | 'not_provided'; items: { type: 'organization' | 'individual' | 'unknown'; name?: string }[] };
  encumbrances: { availability: 'available' | 'not_provided'; items: { kind: 'arrest' | 'encumbrance'; type?: string; registeredAt?: string; closedAt?: string }[] };
};
export type Field = { name: string; latitude: number; longitude: number; area: number; crop: 'wheat' | 'tomato' | 'apple' | 'sunflower' | 'unknown'; boundary?: { type: 'Polygon'; coordinates: number[][][] }; cadastre?: { number?: string; source: 'user' | 'geojson' | 'demo' | 'public-map'; importedAt: string; details?: CadastralDetails } };
export type Sensor = { name: string; serial: string; type: 'moisture' | 'temperature' | 'weather'; fieldId: string };
export type Profile = { name: string; farm: string; phone: string };
export type Data = Entry | Field | Sensor | Profile;
export type Remote = { id: string; kind: Kind; data: Data; version: number; deleted: boolean };
export type Row<T = Data> = Omit<Remote, 'data'> & { key: string; owner: string; data: T; dirty: boolean; localRevision: number; updated: string; conflict?: Remote };
export type Asset = { key: string; owner: string; id: string; blob: Blob; name: string; uploaded: boolean };
export type SessionUser = { id: string; name: string };
