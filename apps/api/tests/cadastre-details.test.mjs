import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadastreDetails,validateCadastreDetails,CADASTRE_SOURCE_URL} from '../src/cadastre-details.mjs';
const context={cadastralNumber:'010170041505',fetchedAt:'2026-10-09T00:00:00.000Z',region:'Акмолинская область',district:'Макинск'};
const basic=()=>createCadastreDetails({},context);

test('public metadata whitelist preserves zero and distinguishes missing legal information',()=>{
  const detail=createCadastreDetails({squ:0,shape_length:'0',cost:0,address_ru:' <b>Город</b>\n улица ',rka:'123456',category_ru:'Земли населённых пунктов',tsn_ru:'Обслуживание участка',pravo_ru:'Частная собственность',status_name:'Действующий',owners:{items:[]},arrests:{items:[]},obrems:{items:[]},cuser:'SECRET OPERATOR',udate:'2025-01-01',unknown:'PRIVATE'},context);
  assert.equal(detail.registeredAreaHa,0);assert.equal(detail.perimeterM,0);assert.equal(detail.costKzt,0);assert.equal(detail.address,'Город улица');assert.equal(detail.status,'active');
  assert.equal(detail.owners.availability,'not_provided');assert.equal(detail.encumbrances.availability,'not_provided');
  assert.equal(detail.sourceUrl,CADASTRE_SOURCE_URL);assert.equal(detail.region,context.region);
  assert.doesNotMatch(JSON.stringify(detail),/PRIVATE|SECRET|cuser|udate|sourceUpdatedAt/);
  assert.equal(basic().status,'unknown');assert.equal(basic().registeredAreaHa,undefined);
  assert.equal(createCadastreDetails({date_end:'2024-03-02'},context).status,'archived');
});

test('organization legal names are allowed while personal names, IIN, BIN and contacts are redacted',()=>{
  const detail=createCadastreDetails({owners:{items:[{nameUl:'ТОО «Открытое поле»',bin:'123456789012',phone:'PRIVATE PHONE'},{nameUl:'ИП Иванов Иван',iin:'111111111111',fio:'PRIVATE PERSON',email:'PRIVATE EMAIL'},{nameUl:'ТОО «Не подтверждено»'},{fio:'PRIVATE NAME'},{name:'PRIVATE UNKNOWN'}]},arrests:{items:[{chargeTypeRu:'Арест',chargeOwnerRu:'PRIVATE COURT PERSON',regDate:'2024-01-01',docNum:'PRIVATE DOCUMENT'}]},obrems:{items:[{chargeTypeRu:'Залог',regDateClose:'2025-01-01'}]}},context);
  assert.deepEqual(detail.owners.items,[{type:'organization',name:'ТОО «Открытое поле»'},{type:'individual',name:'Физическое лицо'},{type:'unknown'},{type:'individual',name:'Физическое лицо'},{type:'unknown'}]);
  assert.equal(detail.encumbrances.items[0].kind,'arrest');assert.equal(detail.encumbrances.items[0].registeredAt,'2024-01-01T00:00:00.000Z');assert.equal(detail.encumbrances.items[1].kind,'encumbrance');
  assert.doesNotMatch(JSON.stringify(detail),/PRIVATE|123456789012|111111111111|Иванов|chargeOwner|docNum|email|phone/);
});

test('adapter bounds arrays and strings and omits malformed numbers rather than inventing zeros',()=>{
  const detail=createCadastreDetails({address_ru:'x'.repeat(1000),squ:-1,shape_length:'not a number',cost:Infinity,owners:{items:Array(1000).fill({fio:'private'})},arrests:{items:Array(1000).fill({})},obrems:{items:Array(1000).fill({})}},context);
  assert.equal(detail.address.length,600);assert.equal(detail.owners.items.length,20);assert.equal(detail.encumbrances.items.length,50);assert.equal(detail.costKzt,undefined);assert.equal(detail.registeredAreaHa,undefined);assert.equal(detail.perimeterM,undefined);
  assert.doesNotThrow(()=>validateCadastreDetails(detail));
});

test('untrusted saved snapshots reject arbitrary fields, personal identities and invalid provenance',()=>{
  for(const change of [{sourceUrl:'https://evil.test'},{fetchedAt:'yesterday'},{cadastralNumber:'123'},{costKzt:-1},{owners:{availability:'not_provided',items:[{type:'unknown'}]}},{owners:{availability:'available',items:[{type:'individual',name:'Иван Иванов'}]}},{owners:{availability:'available',items:[{type:'organization',name:'Иван Иванов'}]}},{owners:{availability:'available',items:[{type:'unknown',iin:'123456789012'}]}},{encumbrances:{availability:'available',items:[{kind:'arrest',chargeOwnerRu:'PRIVATE'}]}},{raw:{owners:'PRIVATE'}},{address:'<script>evil</script>'}])assert.throws(()=>validateCadastreDetails({...basic(),...change}),{status:400});
});
