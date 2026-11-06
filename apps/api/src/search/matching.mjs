const latin="qwertyuiop[]asdfghjkl;'zxcvbnm,.", russian='йцукенгшщзхъфывапролджэячсмитьбю';
export function normalize(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,160);}
export function variants(value){const text=normalize(value),out=[text];if(/^[a-z\s]+$/.test(text))out.push([...text].map(c=>russian[latin.indexOf(c)]||c).join(''));return [...new Set(out.filter(Boolean))];}
export function distance(a,b,max=3){
 if(a===b)return 0;if(Math.abs(a.length-b.length)>5)return 6;
 let before,previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const row=[i];let minimum=i;for(let j=1;j<=b.length;j++){row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));if(before&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],before[j-2]+1);minimum=Math.min(minimum,row[j]);}if(minimum>max)return max+1;before=previous;previous=row;}
 return previous[b.length];
}
export function lexicalScore(query,name){
 const q=normalize(query),n=normalize(name);if(!q||!n)return 0;
 if(q===n)return 1;
 if(n.startsWith(q))return .93+Math.min(.045,q.length/n.length*.045);
 if(n.split(/[\s-]+/).some(word=>word.startsWith(q)))return .88;
 if(q.length<3||q.length>64||n.length>80)return 0;
 let score=0;
 for(const candidate of [n,...n.split(/[\s-]+/)]){
  if(Math.abs(q.length-candidate.length)>Math.max(2,Math.floor(q.length*.4)))continue;
  const d=distance(q,candidate),similarity=1-d/Math.max(q.length,candidate.length);
  if(d<=Math.min(3,Math.floor(q.length*.4))&&similarity>=.58)score=Math.max(score,.5+similarity*.33);
 }
 return score;
}
