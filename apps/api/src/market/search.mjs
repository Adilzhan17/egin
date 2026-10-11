const layoutLatin = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.';
const layoutRussian = 'йцукенгшщзхъфывапролджэячсмитьбю';
const aliases = [
  [/джон\s*дир|жон\s*дир|john\s*deere/giu, 'john deere'],
  [/\b(?:wheat)\b|бидай/giu, 'пшеница'],
  [/тұқым|тукым|семена/giu, 'семена'],
  [/жалға\s*алу|жалга\s*алу|аренду|аренда/giu, 'аренда'],
  [/егін\s*жинау/giu, 'уборка урожая'],
];
export function normalizeMarketQuery(query) {
  const normalized = String(query || '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  const candidates = [normalized];
  if (/^[a-z\s]+$/i.test(normalized)) candidates.push([...normalized].map(c => layoutLatin.includes(c) ? layoutRussian[layoutLatin.indexOf(c)] : c).join(''));
  for (const candidate of [...candidates]) {
    let expanded = candidate;
    for (const [pattern, replacement] of aliases) expanded = expanded.replace(pattern, replacement);
    candidates.push(expanded);
  }
  return [...new Set(candidates.filter(Boolean))].slice(0, 5);
}

const vectorLiteral = vector => {
  if (!Array.isArray(vector) || vector.length !== 384 || !vector.every(Number.isFinite)) throw new Error('Invalid embedding');
  return '[' + vector.join(',') + ']';
};
async function embed(texts, timeout = 2200) {
  const origin = process.env.MARKET_INFERENCE_URL;
  if (!origin) throw new Error('Inference not configured');
  const response = await fetch(origin + '/embed', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({texts}), signal:AbortSignal.timeout(timeout)});
  if (!response.ok) throw new Error('Inference unavailable');
  const body = await response.json();
  if (!Array.isArray(body.vectors) || body.vectors.length !== texts.length) throw new Error('Invalid embedding count');
  body.vectors.forEach(vectorLiteral);
  return body.vectors;
}
// Bounded query embedding cache; public query text only, never draft/user content.
const cache = new Map();
export async function searchPlan({pool, query}) {
  const variants = normalizeMarketQuery(query);
  if (!variants.length || !process.env.MARKET_INFERENCE_URL) return {variants, semanticIds:[], mode:'lexical-fuzzy'};
  try {
    const key = variants[0];
    let vector = cache.get(key);
    if (!vector) {
      vector = vectorLiteral((await embed([query]))[0]);
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, vector);
    }
    const rows = await pool.query(`SELECT e.listing_id FROM market_search_embeddings e
      JOIN market_listings l ON l.id=e.listing_id AND l.status='published'
      WHERE e.source_version=l.version AND (e.embedding <=> $1::vector) < .65
      ORDER BY e.embedding <=> $1::vector LIMIT 100`, [vector]);
    return {variants, semanticIds:rows.rows.map(row => row.listing_id), mode:'hybrid'};
  } catch {
    return {variants, semanticIds:[], mode:'lexical-fuzzy'};
  }
}

export async function startMarketSearch(pool) {
  const migration = await pool.connect();
  try {
    await migration.query('BEGIN');
    await migration.query("SELECT pg_advisory_xact_lock(hashtext('egin-market-search-migrations'))");
    await migration.query(`CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS market_search_embeddings (
      listing_id uuid PRIMARY KEY REFERENCES market_listings(id) ON DELETE CASCADE,
      source_version integer NOT NULL, embedding vector(384) NOT NULL, indexed_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS market_embeddings_cosine ON market_search_embeddings USING hnsw (embedding vector_cosine_ops);`);
    await migration.query('COMMIT');
  } catch (error) { await migration.query('ROLLBACK'); throw error; }
  finally { migration.release(); }
  let closed = false, busy = false;
  async function tick() {
    if (closed || busy || !process.env.MARKET_INFERENCE_URL) return;
    busy = true;
    try {
      const rows = (await pool.query(`SELECT l.id,l.version,l.title,l.description,l.attributes FROM market_listings l
        LEFT JOIN market_search_embeddings e ON e.listing_id=l.id
        WHERE l.status='published' AND (e.listing_id IS NULL OR e.source_version<>l.version)
        ORDER BY l.updated_at LIMIT 8`)).rows;
      if (rows.length) {
        const vectors = await embed(rows.map(row => `${row.title}. ${row.description}. ${JSON.stringify(row.attributes)}`.slice(0,8000)), 15000);
        for (let i=0; i<rows.length && !closed; i++) {
          // Never index a row that changed while inference was running.
          await pool.query(`INSERT INTO market_search_embeddings(listing_id,source_version,embedding)
            SELECT id,version,$3::vector FROM market_listings WHERE id=$1 AND version=$2 AND status='published'
            ON CONFLICT(listing_id) DO UPDATE SET source_version=excluded.source_version,embedding=excluded.embedding,indexed_at=now()`,
            [rows[i].id,rows[i].version,vectorLiteral(vectors[i])]);
        }
      }
      await pool.query(`DELETE FROM market_search_embeddings e USING market_listings l WHERE l.id=e.listing_id AND l.status<>'published'`);
    } catch {
      // Retry from durable listing versions next interval. Publishing stays available.
    } finally { busy=false; }
  }
  const timer = setInterval(tick,15000); timer.unref(); void tick();
  return {close(){closed=true;clearInterval(timer);},tick};
}
