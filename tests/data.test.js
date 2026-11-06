const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../data.js');

function fixture() {
  const d = D.template();
  d.characters.push({id: 'person1', name: '시험 인물', type: 'core', seasonStates: {}});
  d.characters.push({id: 'person2', name: '시즌 전용', type: 'guest', homeSeason: 3, seasonStates: {3: {...D.characterState(true), role: '목격자'}}});
  d.groups.push({id: 'group1', name: '시험 집단', seasonStates: {}});
  d.locations.push({id: 'place1', name: '시험 장소', seasonStates: {1: {...D.locationState(true), plan: [{id: 'zone1', type: 'room', label: '홀', notes: '', x: 10, y: 20, w: 100, h: 80}]}}});
  d.events.push({id: 'event1', title: '시험 사건', season: 1, locationId: 'place1', zoneId: 'zone1', personIds: ['person1'], groupIds: ['group1'], participantRoles: {person1: '발견자'}});
  return D.normalize(d);
}
function memoryStorage() {
  const values = new Map();
  return {getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => values.delete(key), values};
}

test('seven independent character states, guest scope, and unchanged identity', () => {
  const d = fixture(), c = d.characters[0];
  for (let s = 1; s <= 7; s++) c.seasonStates[s].role = `역할 ${s}`;
  assert.deepEqual(Object.values(c.seasonStates).map(st => st.role), ['역할 1','역할 2','역할 3','역할 4','역할 5','역할 6','역할 7']);
  assert.equal(d.characters.length, 2);
  assert.equal(d.characters[1].homeSeason, 3);
  assert.equal(d.characters[1].seasonStates[3].role, '목격자');
  assert.equal(d.characters[1].seasonStates[2].appears, false);
  assert.equal(D.validate(d), true);
});

test('v1 migration preserves every existing value and unknown source metadata', () => {
  const legacy = fixture(); legacy.schemaVersion = 1;
  legacy.project.source = {document: '원고.json', approved: false};
  legacy.characters[0].notes = '확정하지 않은 메모';
  delete legacy.characters[0].status;
  const migrated = D.normalize(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(legacy.schemaVersion, 1, 'caller data is untouched');
  assert.equal(migrated.characters[0].status, 'draft');
  assert.equal(migrated.characters[0].notes, legacy.characters[0].notes);
  assert.deepEqual(migrated.project.source, legacy.project.source);
  assert.deepEqual(migrated.locations[0].seasonStates[1].plan, legacy.locations[0].seasonStates[1].plan);
});

test('schema/IDs/season/reference/geometry validation rejects broken imports', () => {
  const invalid = [
    d => { d.schemaVersion = 500; },
    d => { d.seasons[6].id = 1; },
    d => { d.characters[1].id = d.characters[0].id; },
    d => { d.events[0].personIds = ['missing']; },
    d => { d.events[0].zoneId = 'missing'; },
    d => { d.events[0].participantRoles.person2 = '未参加'; },
    d => { d.locations[0].seasonStates[1].plan[0].x = '10'; },
    d => { d.locations[0].seasonStates[1].plan[0].w = -5; },
    d => { d.characters[0].seasonStates[1].appears = 'yes'; },
    d => { d.groups[0].status = 'invented'; },
    d => { d.characters[0].seasonStates[8] = {}; },
    d => { d.locations[0].parentId = 'place1'; }
  ];
  for (const breakData of invalid) { const d = fixture(); breakData(d); assert.throws(() => D.normalize(d)); }
  const malicious = JSON.parse(JSON.stringify(fixture()).replace('"schemaVersion":2', '"__proto__":{"polluted":true},"schemaVersion":2'));
  assert.throws(() => D.normalize(malicious), /허용되지/);
  assert.equal({}.polluted, undefined);
});

test('same zone IDs across seasons permitted, each plan remains independent', () => {
  const d = fixture(), p = d.locations[0];
  p.seasonStates[2].plan = structuredClone(p.seasonStates[1].plan);
  p.seasonStates[2].plan[0].x = 340;
  assert.equal(D.validate(d), true);
  assert.equal(p.seasonStates[1].plan[0].x, 10);
  p.seasonStates[2].plan.push(structuredClone(p.seasonStates[2].plan[0]));
  assert.throws(() => D.validate(d), /중복/);
});

test('membership reads and writes use character-season source in both directions', () => {
  const d = fixture();
  D.setMembership(d, 'person1', 1, 'group1', true);
  D.setMembership(d, 'person1', 1, 'group1', true);
  assert.deepEqual(d.characters[0].seasonStates[1].groupIds, ['group1']);
  assert.deepEqual(D.members(d, 'group1', 1).map(c => c.id), ['person1']);
  assert.equal(D.members(d, 'group1', 2).length, 0);
  D.setMembership(d, 'person1', 1, 'group1', false);
  assert.equal(D.members(d, 'group1', 1).length, 0);
});

test('deletions report and clean every typed reference, preserving unaffected records', () => {
  for (const kind of ['person','event','place','group']) {
    const d = fixture();
    d.characters[1].relationships.push({personId: 'person1', relation: '증언'});
    d.characters[0].seasonStates[1].eventIds = ['event1'];
    d.characters[0].seasonStates[1].groupIds = ['group1'];
    d.locations[0].seasonStates[1].managementIds = ['group1'];
    d.groups[0].headquartersId = 'place1';
    const recordId = {person:'person1',event:'event1',place:'place1',group:'group1'}[kind];
    assert.ok(D.referenceReport(d, kind, recordId).length > 0);
    D.removeRecord(d, kind, recordId);
    assert.equal(D.referenceReport(d, kind, recordId).length, 0);
    assert.equal(D.validate(d), true);
    assert.ok(d.characters.some(c => c.id === 'person2'));
  }
});

test('JSON backup import/reload/recovery roundtrip is lossless', () => {
  const storage = memoryStorage(), store = D.createStore(storage);
  assert.deepEqual(store.load(), D.template());
  const before = fixture(); store.save(before);
  const after = structuredClone(before); after.project.name = '가져온 아카이브';
  assert.deepEqual(store.import(JSON.stringify(after)), after);
  assert.deepEqual(D.createStore(storage).load(), after);
  assert.deepEqual(store.recover(), before);
  assert.deepEqual(store.recover(), after, 'recovery swaps so users can undo recovery');
});

test('legacy storage is readable and never overwritten during upgrade', () => {
  const storage = memoryStorage(), original = fixture(); original.schemaVersion = 1;
  const raw = JSON.stringify(original); storage.setItem(D.KEYS.legacy, raw);
  const store = D.createStore(storage), d = store.load(); store.save(d);
  assert.equal(d.schemaVersion, 2);
  assert.equal(storage.getItem(D.KEYS.legacy), raw);
  assert.deepEqual(D.createStore(storage).load(), d);
});

test('invalid import and quota failure retain existing archive', () => {
  const storage = memoryStorage(), store = D.createStore(storage), original = fixture();
  store.save(original); const raw = storage.getItem(D.KEYS.current);
  assert.throws(() => store.import('{"schemaVersion":2}'));
  assert.equal(storage.getItem(D.KEYS.current), raw);
  const baseSet = storage.setItem;
  storage.setItem = (key, value) => { if (key === D.KEYS.recovery) throw new Error('QuotaExceededError'); baseSet(key, value); };
  assert.throws(() => store.import(D.template()), /Quota/);
  assert.equal(storage.getItem(D.KEYS.current), raw);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.save(D.template()), /Quota/);
  assert.equal(storage.getItem(D.KEYS.current), raw);
});

test('corrupt current blocks ordinary writes and explicit import preserves damaged raw', () => {
  const storage = memoryStorage(), raw = '{broken JSON'; storage.setItem(D.KEYS.current, raw);
  const store = D.createStore(storage);
  assert.throws(() => store.load(), /원본은 보존/);
  assert.throws(() => store.save(D.template()), /보호/);
  assert.equal(storage.getItem(D.KEYS.current), raw);
  store.import(fixture());
  assert.equal(storage.getItem(D.KEYS.damaged), raw);
  assert.deepEqual(store.load(), fixture());
});

test('stale tabs cannot silently overwrite a newer archive', () => {
  const storage = memoryStorage(), first = D.createStore(storage), second = D.createStore(storage);
  const original = first.load(); second.load(); first.save(original);
  assert.throws(() => second.save(fixture()), /다른 창/);
  assert.deepEqual(D.createStore(storage).load(), original);
});

test('restore write failure keeps valid recovery and current records', () => {
  const storage = memoryStorage(), store = D.createStore(storage);
  store.save(fixture()); store.import(D.template());
  const current = storage.getItem(D.KEYS.current), recovery = storage.getItem(D.KEYS.recovery);
  const baseSet = storage.setItem;
  storage.setItem = (key, value) => { if (key === D.KEYS.current) throw new Error('QuotaExceededError'); baseSet(key, value); };
  assert.throws(() => store.recover(), /Quota/);
  assert.equal(storage.getItem(D.KEYS.current), current);
  assert.equal(storage.getItem(D.KEYS.recovery), recovery);
});

test('actual starter v1 fields and generated ID format migrate without changing geometry or text', () => {
  // Mirrors starter createPerson/createEvent/createPlace/createGroup/addShape output,
  // before any v2 defaults are present. No fictional settings are production data.
  const personId = 'af28dm91cmhnb7jh2', groupId = 'ag28dm91cmhnb7jh3', placeId = 'ap28dm91cmhnb7jh4';
  const old = {
    schemaVersion: 1,
    project: {name: '하얀 악마', description: '원본 설명'},
    seasons: Array.from({length: 7}, (_, i) => ({id: i + 1, title: `시즌 ${i + 1}`, logline: ''})),
    characters: [{id: personId, name: '테스트 인물', type: 'core', homeSeason: 1, alias: '별칭', summary: '원본 설정', notes: '  줄 바꿈\n\n공백 보존  ', seasonStates: {1: {appears: true, condition: '미정', role: '증언자', groupIds: [groupId], change: '원본 변화', notes: ''}}}],
    events: [{id: 'ae28dm91cmhnb7jh5', season: 1, order: 3, title: '기존 사건', timeLabel: '', locationId: placeId, personIds: [personId], groupIds: [groupId], outline: '개요', trigger: '원인', aftermath: '결과', reveal: '단서', notes: '메모'}],
    locations: [{id: placeId, name: '기존 장소', kind: '건물', parentId: '', summary: '', notes: '', seasonStates: {1: {appears: true, function: '', changed: '', managementIds: [groupId], plan: [{id: 'az28dm91cmhnb7jh6', type: 'corridor', label: '통로', notes: '', x: 40, y: 42, w: 160, h: 34}]}}}],
    groups: [{id: groupId, name: '기존 집단', type: '기타', headquartersId: placeId, summary: '', structure: '', methods: '방법 원본', notes: '', seasonStates: {1: {appears: true, leader: '', goal: '', change: '', notes: ''}}}]
  };
  const raw = JSON.stringify(old), migrated = D.normalize(old);
  assert.equal(JSON.stringify(old), raw, 'migration never mutates caller JSON');
  assert.equal(migrated.characters[0].notes, '  줄 바꿈\n\n공백 보존  ');
  assert.equal(migrated.characters[0].id, personId);
  const shape = migrated.locations[0].seasonStates[1].plan[0];
  assert.deepEqual({id: shape.id, x: shape.x, y: shape.y, w: shape.w, h: shape.h}, {id: 'az28dm91cmhnb7jh6', x: 40, y: 42, w: 160, h: 34});
  assert.equal(shape.type, 'corridor');
  assert.equal(migrated.events[0].order, 3);
  assert.deepEqual(D.normalize(JSON.parse(JSON.stringify(migrated))), migrated, 'v2 export imports losslessly');
});

test('save normalizes raw new records but never changes the caller object', () => {
  const storage = memoryStorage(), store = D.createStore(storage), raw = D.template();
  raw.characters.push({id: 'new_person', name: '입력 중', type: 'core', seasonStates: {}});
  raw.locations.push({id: 'new_place', name: '새 장소', seasonStates: {1: {...D.locationState(true), plan: [{id: 'shape',type: 'room',label: '새 공간',notes: '',x: 0,y: 0,w: 120,h: 78}]}}});
  raw.project.extra = {sourceFile: '사용자 원고', accepted: false};
  const before = JSON.stringify(raw); store.save(raw);
  assert.equal(JSON.stringify(raw), before);
  const exported = store.load();
  assert.equal(exported.characters[0].status, 'draft');
  assert.equal(exported.characters[0].seasonStates[7].appears, true);
  assert.deepEqual(exported.project.extra, raw.project.extra);
  assert.equal(exported.locations[0].seasonStates[1].plan[0].w, 120);
});

test('indirect location cycles are rejected while valid nested hierarchies remain valid', () => {
  const d = fixture();
  d.locations.push({id: 'place2', name: '하위 장소', parentId: 'place1', seasonStates: {}});
  d.locations.push({id: 'place3', name: '더 작은 장소', parentId: 'place2', seasonStates: {}});
  assert.doesNotThrow(() => D.normalize(d));
  d.locations[0].parentId = 'place3';
  assert.throws(() => D.normalize(d), /순환/);
});

test('unavailable storage reads fail without any writes', () => {
  let writes = 0;
  const storage = {getItem() { throw new Error('SecurityError'); }, setItem() { writes++; }};
  const store = D.createStore(storage);
  assert.throws(() => store.load(), /SecurityError/);
  assert.throws(() => store.save(D.template()), /SecurityError/);
  assert.throws(() => store.import(fixture()), /SecurityError/);
  assert.equal(writes, 0);
});

test('wrong optional field types fail instead of erasing supplied content', () => {
  for (const mutate of [d => { d.characters[0].appearance = ['wrong']; }, d => { d.groups[0].methods = {}; }, d => { d.characters[0].relationships = '텍스트'; }]) {
    const d = fixture(); mutate(d); const original = JSON.stringify(d);
    assert.throws(() => D.normalize(d));
    assert.equal(JSON.stringify(d), original);
  }
});
