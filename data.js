/* 《하얀 악마》 설정 아카이브: versioned, local-only data and storage. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ArchiveData = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const VERSION = 2;
  const KEYS = Object.freeze({
    current: 'white-devil-story-archive-v2',
    legacy: 'white-devil-story-archive-v1',
    recovery: 'white-devil-story-archive-recovery',
    damaged: 'white-devil-story-archive-damaged'
  });
  const COLLECTIONS = {person: 'characters', event: 'events', place: 'locations', group: 'groups'};
  const STATUSES = ['draft', 'confirmed', 'held'];
  const SHAPES = ['room', 'corridor', 'entrance', 'restricted', 'object'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = value => JSON.parse(JSON.stringify(value));
  function fail(path, message) { throw new Error(`${path}: ${message}`); }
  function object(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '객체 형식이 필요합니다.');
  }
  function array(value, path) { if (!Array.isArray(value)) fail(path, '목록 형식이 필요합니다.'); }
  function text(value, path) { if (typeof value !== 'string') fail(path, '문자열 형식이 필요합니다.'); }
  function season(value, path) {
    if (!Number.isInteger(value) || value < 1 || value > 7) fail(path, '시즌은 1~7의 정수여야 합니다.');
  }
  function id(value, path) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(path, '안전한 고유 ID 형식이 아닙니다.');
  }
  function finite(value, path, minimum = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > 100000) fail(path, '유효한 수치 범위가 아닙니다.');
  }
  function safeJson(value, path = '데이터', depth = 0) {
    if (depth > 40) fail(path, '중첩이 너무 깊습니다.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail(path, '유한한 숫자가 필요합니다.'); return; }
    if (!value || typeof value !== 'object') fail(path, 'JSON 데이터만 허용됩니다.');
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) fail(path, '일반 JSON 객체가 필요합니다.');
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(path, '허용되지 않는 속성입니다.');
      safeJson(value[key], `${path}.${key}`, depth + 1);
    }
  }
  function defaults(target, values) {
    for (const [key, value] of Object.entries(values)) if (!own(target, key)) target[key] = clone(value);
    return target;
  }
  function characterState(appears = false) {
    return {appears, condition: '미정', role: '', groupIds: [], change: '', notes: '', physical: '', mental: '', goal: '', position: '', relationshipChanges: '', causes: '', eventIds: []};
  }
  function locationState(appears = false) { return {appears, function: '', changed: '', managementIds: [], plan: []}; }
  function groupState(appears = false) { return {appears, leader: '', goal: '', change: '', notes: ''}; }
  function template() {
    return {
      schemaVersion: VERSION,
      project: {name: '하얀 악마', description: '7개 시즌의 인물·사건·배경을 연결하는 설정 아카이브'},
      seasons: Array.from({length: 7}, (_, i) => ({id: i + 1, title: `시즌 ${i + 1}`, logline: ''})),
      characters: [], events: [], locations: [], groups: []
    };
  }
  function normalize(input) {
    safeJson(input);
    object(input, '데이터');
    if (![1, VERSION].includes(input.schemaVersion)) fail('schemaVersion', '지원하지 않는 데이터 버전입니다.');
    for (const key of ['seasons', ...Object.values(COLLECTIONS)]) array(input[key], key);
    const data = clone(input);
    data.schemaVersion = VERSION;
    defaults(data, {project: template().project});
    object(data.project, 'project');
    defaults(data.project, {name: '하얀 악마', description: ''});
    data.seasons.forEach((s, i) => { object(s, `seasons[${i}]`); defaults(s, {title: `시즌 ${s.id}`, logline: ''}); });
    for (const [kind, key] of Object.entries(COLLECTIONS)) {
      data[key].forEach((record, index) => {
        const path = `${key}[${index}]`;
        object(record, path);
        defaults(record, {status: 'draft'});
        if (kind === 'person') {
          defaults(record, {name: '', type: 'core', homeSeason: 1, alias: '', summary: '', notes: '', age: '', profile: '', appearance: '', personality: '', values: '', goal: '', relationships: [], seasonStates: {}});
        } else if (kind === 'event') {
          defaults(record, {season: 1, order: 1, title: '', timeLabel: '', locationId: '', zoneId: '', personIds: [], groupIds: [], outline: '', trigger: '', aftermath: '', reveal: '', notes: '', participantRoles: {}, followingEventIds: []});
        } else if (kind === 'place') {
          defaults(record, {name: '', kind: '건물', parentId: '', summary: '', notes: '', geography: '', structure: '', routes: '', facilities: '', seasonStates: {}});
        } else {
          defaults(record, {name: '', type: '기타', headquartersId: '', summary: '', structure: '', methods: '', notes: '', purpose: '', territory: '', rules: '', relations: '', seasonStates: {}});
        }
        if (kind !== 'event') {
          object(record.seasonStates, `${path}.seasonStates`);
          for (let s = 1; s <= 7; s++) {
            const create = kind === 'person' ? characterState : kind === 'place' ? locationState : groupState;
            if (!own(record.seasonStates, s)) record.seasonStates[s] = create(kind === 'person' && (record.type === 'core' || record.homeSeason === s));
            object(record.seasonStates[s], `${path}.seasonStates.${s}`);
            defaults(record.seasonStates[s], create(false));
            if (kind === 'place') {
              array(record.seasonStates[s].plan, `${path}.seasonStates.${s}.plan`);
              record.seasonStates[s].plan.forEach((shape, i) => {
                object(shape, `${path}.seasonStates.${s}.plan[${i}]`);
                defaults(shape, {type: 'room', label: '', notes: '', color: '#e3ece7', display: 'solid'});
              });
            }
          }
        }
      });
    }
    validate(data);
    return data;
  }
  function validate(data) {
    safeJson(data);
    object(data, '데이터');
    if (data.schemaVersion !== VERSION) fail('schemaVersion', `검증에는 버전 ${VERSION} 데이터가 필요합니다.`);
    object(data.project, 'project');
    text(data.project.name, 'project.name'); text(data.project.description, 'project.description');
    array(data.seasons, 'seasons');
    if (data.seasons.length !== 7) fail('seasons', '정확히 7개의 시즌이 필요합니다.');
    const seasonIds = new Set();
    data.seasons.forEach((s, i) => {
      object(s, `seasons[${i}]`); season(s.id, `seasons[${i}].id`);
      if (seasonIds.has(s.id)) fail('seasons', '시즌 ID가 중복되었습니다.');
      seasonIds.add(s.id); text(s.title, `seasons[${i}].title`); text(s.logline, `seasons[${i}].logline`);
    });
    const ids = {}, allIds = new Set();
    for (const [kind, key] of Object.entries(COLLECTIONS)) {
      array(data[key], key); ids[kind] = new Set();
      data[key].forEach((record, i) => {
        const path = `${key}[${i}]`; object(record, path); id(record.id, `${path}.id`);
        if (allIds.has(record.id)) fail(`${path}.id`, '고유 ID가 중복되었습니다.');
        allIds.add(record.id); ids[kind].add(record.id);
        if (!STATUSES.includes(record.status)) fail(`${path}.status`, '확정·검토·보류 상태가 올바르지 않습니다.');
      });
    }
    const ref = (kind, value, path, optional = false) => {
      if (optional && value === '') return;
      id(value, path); if (!ids[kind].has(value)) fail(path, '연결 대상이 없습니다.');
    };
    const refs = (kind, values, path) => {
      array(values, path); const seen = new Set();
      values.forEach((value, i) => { ref(kind, value, `${path}[${i}]`); if (seen.has(value)) fail(path, '연결 ID가 중복되었습니다.'); seen.add(value); });
    };
    const strings = (record, fields, path) => fields.forEach(f => { if (own(record, f)) text(record[f], `${path}.${f}`); });
    for (const [kind, key] of Object.entries(COLLECTIONS)) {
      data[key].forEach((record, i) => {
        const path = `${key}[${i}]`;
        strings(record, kind === 'event' ? ['title','timeLabel','outline','trigger','aftermath','reveal','notes'] : ['name','alias','summary','notes','age','profile','appearance','personality','values','goal','geography','structure','routes','facilities','purpose','territory','rules','relations','methods','kind','type'], path);
        if (kind === 'event') {
          season(record.season, `${path}.season`); finite(record.order, `${path}.order`);
          ref('place', record.locationId, `${path}.locationId`, true);
          refs('person', record.personIds, `${path}.personIds`); refs('group', record.groupIds, `${path}.groupIds`);
          refs('event', record.followingEventIds, `${path}.followingEventIds`);
          if (record.followingEventIds.includes(record.id)) fail(`${path}.followingEventIds`, '자기 자신을 후속 사건으로 지정할 수 없습니다.');
          text(record.zoneId, `${path}.zoneId`);
          if (record.zoneId) {
            const location = data.locations.find(p => p.id === record.locationId);
            if (!location || !location.seasonStates[record.season].plan.some(z => z.id === record.zoneId)) fail(`${path}.zoneId`, '해당 시즌·장소의 구역이 없습니다.');
          }
          object(record.participantRoles, `${path}.participantRoles`);
          for (const [personId, role] of Object.entries(record.participantRoles)) {
            ref('person', personId, `${path}.participantRoles`); text(role, `${path}.participantRoles.${personId}`);
            if (!record.personIds.includes(personId)) fail(`${path}.participantRoles`, '역할은 사건 참여 인물에게만 지정할 수 있습니다.');
          }
          return;
        }
        if (kind === 'person') {
          if (!['core', 'guest'].includes(record.type)) fail(`${path}.type`, '인물 분류가 올바르지 않습니다.');
          season(record.homeSeason, `${path}.homeSeason`); array(record.relationships, `${path}.relationships`);
          record.relationships.forEach((r, ri) => { object(r, `${path}.relationships[${ri}]`); ref('person', r.personId, `${path}.relationships[${ri}].personId`); text(r.relation, `${path}.relationships[${ri}].relation`); });
        } else if (kind === 'place') ref('place', record.parentId, `${path}.parentId`, true);
        else ref('place', record.headquartersId, `${path}.headquartersId`, true);
        object(record.seasonStates, `${path}.seasonStates`);
        for (const stateKey of Object.keys(record.seasonStates)) if (!/^[1-7]$/.test(stateKey)) fail(`${path}.seasonStates`, '시즌 키가 올바르지 않습니다.');
        for (let s = 1; s <= 7; s++) {
          const st = record.seasonStates[s], sp = `${path}.seasonStates.${s}`;
          object(st, sp); if (typeof st.appears !== 'boolean') fail(`${sp}.appears`, '등장 여부는 참/거짓이어야 합니다.');
          strings(st, ['condition','role','change','notes','physical','mental','goal','position','relationshipChanges','causes','function','changed','leader'], sp);
          if (kind === 'person') { refs('group', st.groupIds, `${sp}.groupIds`); refs('event', st.eventIds, `${sp}.eventIds`); }
          else if (kind === 'place') {
            refs('group', st.managementIds, `${sp}.managementIds`); array(st.plan, `${sp}.plan`);
            const seen = new Set();
            st.plan.forEach((shape, zi) => {
              const zp = `${sp}.plan[${zi}]`; object(shape, zp); id(shape.id, `${zp}.id`);
              if (seen.has(shape.id)) fail(zp, '같은 전개도에 구역 ID가 중복되었습니다.'); seen.add(shape.id);
              if (!SHAPES.includes(shape.type)) fail(`${zp}.type`, '지원하지 않는 구역 유형입니다.');
              text(shape.label, `${zp}.label`); text(shape.notes, `${zp}.notes`);
              for (const axis of ['x','y']) finite(shape[axis], `${zp}.${axis}`);
              for (const axis of ['w','h']) finite(shape[axis], `${zp}.${axis}`, 1);
              if (typeof shape.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(shape.color)) fail(`${zp}.color`, '구역 색상은 #RRGGBB 형식이어야 합니다.');
              if (!['solid','outline','dashed'].includes(shape.display)) fail(`${zp}.display`, '구역 표시 방식이 올바르지 않습니다.');
            });
          }
        }
      });
    }
    // A place hierarchy must be acyclic, including indirect parent loops.
    const byPlace = new Map(data.locations.map(p => [p.id, p]));
    for (const p of data.locations) {
      const seen = new Set([p.id]); let next = p.parentId;
      while (next) { if (seen.has(next)) fail('locations.parentId', '장소 계층에 순환 연결이 있습니다.'); seen.add(next); next = byPlace.get(next).parentId; }
    }
    return true;
  }
  function setMembership(data, personId, s, groupId, enabled) {
    season(Number(s), 'season');
    const person = data.characters.find(c => c.id === personId);
    if (!person || !data.groups.some(g => g.id === groupId)) fail('소속', '인물 또는 집단을 찾을 수 없습니다.');
    const key = Number(s);
    if (!person.seasonStates) person.seasonStates = {};
    if (!person.seasonStates[key]) person.seasonStates[key] = characterState(false);
    const values = person.seasonStates[key].groupIds || [];
    person.seasonStates[key].groupIds = enabled ? [...new Set([...values, groupId])] : values.filter(v => v !== groupId);
  }
  function members(data, groupId, s) {
    return data.characters.filter(c => (c.type !== 'guest' || c.homeSeason === Number(s)) && c.seasonStates?.[s]?.groupIds?.includes(groupId));
  }
  function referenceReport(data, kind, recordId) {
    const found = [];
    const add = (ownerKind, record, field) => found.push({kind: ownerKind, id: record.id, name: record.name || record.title || record.id, field});
    if (kind === 'person') {
      data.events.forEach(e => { if (e.personIds?.includes(recordId)) add('event', e, 'personIds'); });
      data.characters.forEach(c => { if (c.relationships?.some(r => r.personId === recordId)) add('person', c, 'relationships'); });
    } else if (kind === 'event') {
      data.events.forEach(e => { if (e.followingEventIds?.includes(recordId)) add('event', e, 'followingEventIds'); });
      data.characters.forEach(c => { if (Object.values(c.seasonStates || {}).some(st => st.eventIds?.includes(recordId))) add('person', c, 'seasonStates.eventIds'); });
    } else if (kind === 'place') {
      data.events.forEach(e => { if (e.locationId === recordId) add('event', e, 'locationId'); });
      data.locations.forEach(p => { if (p.parentId === recordId) add('place', p, 'parentId'); });
      data.groups.forEach(g => { if (g.headquartersId === recordId) add('group', g, 'headquartersId'); });
    } else if (kind === 'group') {
      data.events.forEach(e => { if (e.groupIds?.includes(recordId)) add('event', e, 'groupIds'); });
      data.characters.forEach(c => { if (Object.values(c.seasonStates || {}).some(st => st.groupIds?.includes(recordId))) add('person', c, 'seasonStates.groupIds'); });
      data.locations.forEach(p => { if (Object.values(p.seasonStates || {}).some(st => st.managementIds?.includes(recordId))) add('place', p, 'seasonStates.managementIds'); });
    }
    return found;
  }
  function removeRecord(data, kind, recordId) {
    const collection = COLLECTIONS[kind];
    if (!collection) fail('삭제', '지원하지 않는 기록 유형입니다.');
    const report = referenceReport(data, kind, recordId);
    data[collection] = data[collection].filter(record => record.id !== recordId);
    if (kind === 'person') {
      data.events.forEach(e => { e.personIds = (e.personIds || []).filter(v => v !== recordId); if (e.participantRoles) delete e.participantRoles[recordId]; });
      data.characters.forEach(c => { c.relationships = (c.relationships || []).filter(r => r.personId !== recordId); });
    } else if (kind === 'event') {
      data.events.forEach(e => { e.followingEventIds = (e.followingEventIds || []).filter(v => v !== recordId); });
      data.characters.forEach(c => Object.values(c.seasonStates || {}).forEach(st => { st.eventIds = (st.eventIds || []).filter(v => v !== recordId); }));
    } else if (kind === 'place') {
      data.events.forEach(e => { if (e.locationId === recordId) { e.locationId = ''; e.zoneId = ''; } });
      data.locations.forEach(p => { if (p.parentId === recordId) p.parentId = ''; });
      data.groups.forEach(g => { if (g.headquartersId === recordId) g.headquartersId = ''; });
    } else {
      data.events.forEach(e => { e.groupIds = (e.groupIds || []).filter(v => v !== recordId); });
      data.characters.forEach(c => Object.values(c.seasonStates || {}).forEach(st => { st.groupIds = (st.groupIds || []).filter(v => v !== recordId); }));
      data.locations.forEach(p => Object.values(p.seasonStates || {}).forEach(st => { st.managementIds = (st.managementIds || []).filter(v => v !== recordId); }));
    }
    return report;
  }
  function createStore(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('브라우저 저장소를 사용할 수 없습니다.');
    let expected, initialized = false, blocked = false;
    const read = key => storage.getItem(key);
    function rawCurrent() { return read(KEYS.current); }
    function load() {
      const raw = rawCurrent(); expected = raw; initialized = true;
      const source = raw === null ? read(KEYS.legacy) : raw;
      try { const value = source === null ? template() : normalize(JSON.parse(source)); blocked = false; return value; }
      catch (error) { blocked = true; throw new Error(`저장된 데이터를 읽을 수 없습니다. 원본은 보존되었습니다. JSON 가져오기 또는 복구를 이용하세요. (${error.message})`); }
    }
    function checkCurrent() {
      if (!initialized) load();
      if (rawCurrent() !== expected) throw new Error('다른 창에서 데이터가 변경되었습니다. 현재 내용을 JSON 백업한 뒤 새로고침하세요.');
    }
    function save(value) {
      const next = normalize(value); checkCurrent();
      if (blocked) throw new Error('손상된 저장 데이터 보호 중입니다. 검증된 JSON을 가져오거나 복구하세요.');
      const serialized = JSON.stringify(next); storage.setItem(KEYS.current, serialized); expected = serialized; return next;
    }
    function importData(value) {
      const next = normalize(typeof value === 'string' ? JSON.parse(value) : value);
      if (!initialized) { try { load(); } catch (_) { /* Import is the explicit damaged-data replacement route. */ } }
      checkCurrent();
      const currentRaw = expected === null ? read(KEYS.legacy) : expected;
      if (currentRaw !== null) {
        let previous;
        try { previous = normalize(JSON.parse(currentRaw)); }
        catch (_) { storage.setItem(KEYS.damaged, currentRaw); }
        if (previous) storage.setItem(KEYS.recovery, JSON.stringify(previous));
      } else storage.setItem(KEYS.recovery, JSON.stringify(template()));
      const serialized = JSON.stringify(next); storage.setItem(KEYS.current, serialized); expected = serialized; blocked = false; return next;
    }
    function recover() {
      const recoveryRaw = read(KEYS.recovery);
      if (recoveryRaw === null) throw new Error('복구할 이전 데이터가 없습니다.');
      const next = normalize(JSON.parse(recoveryRaw));
      if (!initialized) { try { load(); } catch (_) { /* Recovery may repair a damaged current record. */ } }
      checkCurrent();
      const currentRaw = expected === null ? read(KEYS.legacy) : expected;
      const serialized = JSON.stringify(next);
      // Never replace the recovery slot until the main write has succeeded.
      if (currentRaw !== null) storage.setItem(KEYS.damaged, currentRaw);
      storage.setItem(KEYS.current, serialized); expected = serialized; blocked = false;
      if (currentRaw !== null) {
        try { storage.setItem(KEYS.recovery, JSON.stringify(normalize(JSON.parse(currentRaw)))); }
        catch (_) { /* Recovered current and protected raw copy remain available. */ }
      }
      return next;
    }
    return {load, save, import: importData, recover, hasRecovery: () => read(KEYS.recovery) !== null};
  }
  return Object.freeze({VERSION, KEYS, STATUSES, template, normalize, migrate: normalize, validate, createStore, referenceReport, removeRecord, setMembership, members, characterState, locationState, groupState});
});
