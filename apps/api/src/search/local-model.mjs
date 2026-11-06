// The pinned multilingual ONNX model is served locally by market-inference/server.py.
const cache=new Map();let retryAfter=0;
export async function embeddings(texts,{fetcher=fetch,origin=process.env.LOCAL_SEARCH_INFERENCE_URL||process.env.MARKET_INFERENCE_URL||'http://127.0.0.1:4939'}={}){
 if(Date.now()<retryAfter)throw Error('Local model unavailable');
 const missing=[...new Set(texts.filter(text=>!cache.has(text)))];
 try{
  for(let i=0;i<missing.length;i+=16){const batch=missing.slice(i,i+16),response=await fetcher(origin+'/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:batch}),signal:AbortSignal.timeout(2200)});if(!response.ok)throw Error('Local model unavailable');const {vectors}=await response.json();if(!Array.isArray(vectors)||vectors.length!==batch.length||vectors.some(v=>!Array.isArray(v)||v.length!==384||v.some(n=>!Number.isFinite(n))))throw Error('Invalid model vectors');batch.forEach((text,j)=>{if(cache.size>=600)cache.delete(cache.keys().next().value);cache.set(text,vectors[j]);});}
  return texts.map(text=>cache.get(text));
 }catch(e){retryAfter=Date.now()+10000;throw e;}
}
export async function rerank(query,candidates){
 if(query.length<4||!candidates.length)return {items:candidates,mode:'local-prefix'};
 try{const vectors=await embeddings([query,...candidates.map(c=>c.name)]),q=vectors[0];return {mode:'local-hybrid',items:candidates.map((item,i)=>({...item,score:item.score+(q.reduce((sum,x,j)=>sum+x*vectors[i+1][j],0))*.07})).sort((a,b)=>b.score-a.score)};}catch{return {items:candidates,mode:'local-fuzzy'};}
}
