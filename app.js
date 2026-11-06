/* 하얀 악마 설정 아카이브 — 독립형 오프라인 MVP. 외부 서버 전송 없음. */
(() => {
  'use strict';
  const D = window.ArchiveData;
  let store;
  try{store=D.createStore(window.localStorage);}catch(error){store={load(){throw error;},save(){throw error;},import(){throw error;},recover(){throw error;}};}
  const APP = document.getElementById('app');
  const IMPORT = document.getElementById('import-file');
  const TOAST = document.getElementById('toast');
  const aliveOptions = ['미정','생존','사망','실종','의식불명','퇴장','기타'];
  const statusOptions = [['draft','검토 중'],['confirmed','확정 설정'],['held','폐기 / 보류']];
  const ui = {tab:'overview',season:0,castFilter:'all',bgTab:'places',selectedPerson:null,selectedEvent:null,selectedPlace:null,selectedGroup:null,personSeason:1,search:'',peopleView:'cards',eventView:'time',eventFilter:'',statusFilter:''};
  let toastTimer = null, saveError = '', loadError = '', conflict = false, lastSaved = '', editKey = '';
  const undoStack=[], redoStack=[];
  let data;
  try { data=store.load(); lastSaved=JSON.stringify(data); } catch(e) { loadError=e.message; data=D.template(); }
  function checkpoint(key='') {
    if (key && key===editKey) return;
    const raw=JSON.stringify(data);
    if (undoStack.at(-1)!==raw) undoStack.push(raw);
    if(undoStack.length>80)undoStack.shift();
    redoStack.length=0; editKey=key;
  }
  function save() {
    if(loadError||conflict)return false;
    try { store.save(data); lastSaved=JSON.stringify(data); saveError=''; updateSaveState(); return true; }
    catch(e){saveError=e.message;updateSaveState();toast('자동 저장 실패: JSON 백업을 내려받으세요. '+e.message);return false;}
  }
  function updateSaveState(){const node=document.getElementById('save-state');if(node){node.textContent=conflict?'다른 창에서 변경됨':saveError?'저장 실패 · 백업 필요':'자동 저장됨';node.classList.toggle('save-failed',!!saveError||conflict);}APP.querySelector('[data-action=undo]')?.toggleAttribute('disabled',!undoStack.length);APP.querySelector('[data-action=redo]')?.toggleAttribute('disabled',!redoStack.length);const banner=document.getElementById('storage-alert');if(banner){banner.hidden=!saveError&&!conflict;banner.textContent=conflict?'다른 창에서 변경되었습니다. 덮어쓰기를 막기 위해 편집을 잠갔습니다. 현재 내용을 JSON 백업한 뒤 새로고침하세요.':'저장 공간 또는 브라우저 오류로 변경 내용이 저장되지 않았습니다. 창을 닫기 전에 JSON 백업을 내려받으세요. '+saveError;}}
  function undo(redo=false){const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;to.push(JSON.stringify(data));data=JSON.parse(from.pop());window.ArchivePlan?.clearHistory?.();editKey='';save();layout();toast(redo?'변경을 다시 적용했습니다.':'이전 편집 상태로 되돌렸습니다.');}
  function toast(msg){TOAST.textContent=msg;TOAST.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>TOAST.classList.remove('show'),3300)}
  function uid(){return 'a'+crypto.randomUUID().replaceAll('-','')}
  function esc(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function short(v,n=75){v=String(v??'').trim();return v.length>n?v.slice(0,n)+'…':v}
  function seasonName(s){return data.seasons.find(x=>x.id===Number(s))?.title || `시즌 ${s}`;}
  function activeSeason(){return ui.season===0?1:ui.season;}
  function selectedSeasonForCharacter(c){return c.type==='guest'?c.homeSeason:ui.personSeason;}
  function current(kind){return ({person:data.characters,event:data.events,place:data.locations,group:data.groups})[kind] || [];}
  function get(kind,id){return current(kind).find(x=>x.id===id);}
  function seasonDefault(appears=false){return {appears, condition:'미정', role:'', goal:'',physical:'',mental:'',position:'',relationshipChanges:'',eventIds:[], groupIds:[], change:'', notes:''};}
  function locationSeasonDefault(appears=false){return {appears, function:'', changed:'', managementIds:[], plan:[]};}
  function groupSeasonDefault(appears=false){return {appears, leader:'', goal:'', change:'', notes:''};}
  function sEntry(obj,s,def){if(!obj.seasonStates)obj.seasonStates={};if(!obj.seasonStates[s])obj.seasonStates[s]=def();return obj.seasonStates[s];}
  function charEntry(c,s){return sEntry(c,s,()=>seasonDefault(c.type==='core'));}
  function placeEntry(p,s){return sEntry(p,s,()=>locationSeasonDefault(false));}
  function groupEntry(g,s){return sEntry(g,s,()=>groupSeasonDefault(false));}
  function inSeason(c,s){return c.type==='guest' ? Number(c.homeSeason)===Number(s) : !!charEntry(c,s).appears;}
  function pickCondition(c,s){return charEntry(c,s).condition || '미정';}
  function matches(q,...strings){return !q||strings.some(t=>String(t??'').toLowerCase().includes(q.toLowerCase()));}
  function cnames(ids){return (ids||[]).map(id=>get('person',id)?.name).filter(Boolean);}
  function gnames(ids){return (ids||[]).map(id=>get('group',id)?.name).filter(Boolean);}
  function optString(options,value){return options.map(x=>{const [v,l]=Array.isArray(x)?x:[x,x];return `<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`}).join('')}
  function icon(name){const body={home:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',timeline:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="19" r="2"/><path d="M11 5h10M11 12h10M11 19h10"/>',map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',plus:'<path d="M12 5v14M5 12h14"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',upload:'<path d="M12 21V9m-4 4 4-4 4 4M4 7V4h16v3"/>',trash:'<path d="M4 7h16M10 11v7m4-7v7M6 7l1 14h10l1-14M9 7V4h6v3"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',arrow:'<path d="M5 12h14M12 5l7 7-7 7"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',check:'<path d="m4 12 5 5 11-11"/>',settings:'<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h4"/>'}[name]||'';return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`}
  const btn=(action,label,more='',cls='btn')=>`<button type="button" class="${cls}" data-action="${action}" ${more}>${label}</button>`;
  function editAttrs(kind,id,field,season){return `data-bind="${esc(kind)}" data-id="${esc(id)}" data-field="${esc(field)}" ${season==null?'':`data-season="${esc(season)}"`}`;}
  function input(kind,id,field,val,placeholder='',type='text',season){return `<input type="${type}" ${editAttrs(kind,id,field,season)} value="${esc(val)}" placeholder="${esc(placeholder)}">`}
  function textarea(kind,id,field,val,placeholder='',season,rows=3){return `<textarea rows="${rows}" ${editAttrs(kind,id,field,season)} placeholder="${esc(placeholder)}">${esc(val)}</textarea>`}
  function select(kind,id,field,val,options,season){return `<select ${editAttrs(kind,id,field,season)}>${optString(options,val)}</select>`}
  function check(kind,id,field,val,season){return `<input type="checkbox" ${editAttrs(kind,id,field,season)} ${val?'checked':''}>`}
  function field(label,inner,hint='',full=false){inner=inner.replace(/<(input|select|textarea) /, '<$1 aria-label="'+esc(label)+'" ');return `<div class="field ${full?'full':''}"><label>${esc(label)}</label>${inner}${hint?`<small class="field-hint">${esc(hint)}</small>`:''}</div>`}
  function panelEmpty(k,desc){return `<div class="blank-slate"><span class="mark">◌</span><h3>${esc(k)}</h3><p>${esc(desc)}</p></div>`}
  function jump(kind,id,text){return `<button class="mini-link" data-action="jump-${kind}" data-id="${esc(id)}">${esc(text)}</button>`}
  function sp(idx){return `<span class="pill gray">S${idx}</span>`}
  function topbar(){return `<div class="topbar"><div class="crumb">STORY BIBLE <span>/</span> 나의 집필 작업실</div><div class="top-actions"><span id="save-state" role="status" class="save-indicator">자동 저장됨</span>${btn('undo','↶ 편집 취소',undoStack.length?'':'disabled','btn sm')}${btn('redo','↷ 다시 실행',redoStack.length?'':'disabled','btn sm')}${btn('export',icon('download')+' JSON 백업','','btn sm')}${btn('import',icon('upload')+' 가져오기','','btn sm')}${btn('recover','이전 상태 복구','','btn sm ghost')}</div></div><div id="storage-alert" class="storage-alert" role="alert" hidden></div>`}
  function rail(){return `<nav class="seasonrail" aria-label="시즌 필터">${[{id:0,title:'전체' },...data.seasons].map(s=>`<button data-action="season" data-season="${s.id}" aria-pressed="${ui.season===s.id}" class="seasonbtn ${ui.season===s.id?'active':''} ${s.id===0?'isall':''}" title="${esc(s.title)}">${s.id===0?'ALL':`S${s.id}`}<span>${s.id===0?'전체 시즌':esc(s.title)}</span></button>`).join('')}</nav>`}
  function pageHead(title,desc,button=''){return `<div class="page-head"><div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div>${button}</div>`}
  function layout(){APP.innerHTML=`<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="eyebrow">THE WHITE DEVIL</div><h1>하얀 악마</h1><small>설정 아카이브</small></div><nav class="side-menu">${[['overview','home','전체 개요'],['people','people','인물'],['events','timeline','사건'],['background','map','배경']].map(([tab,ico,title])=>`<button class="side-btn ${ui.tab===tab?'active':''}" data-action="tab" data-tab="${tab}">${icon(ico)}${title}</button>`).join('')}</nav><div class="side-bottom"><span class="small-pill">독립 설정 아카이브</span><p>모든 입력은 이 브라우저에 자동 저장됩니다. 다른 PC로 옮기려면 JSON 백업을 이용하세요.</p></div></aside><main class="main">${rail()}${topbar()}${({overview:overview,people:people,events:events,background:background})[ui.tab]() }<div class="footer-help">《하얀 악마》 전용 · 7개 시즌 · 로컬 저장 · JSON 백업</div></main></div>`;updateSaveState(); mountPlan();}
  function mountPlan(){if(!window.ArchivePlan)return;ArchivePlan.mount(APP,{getPlan:(id,s)=>placeEntry(get('place',id),s).plan,getEvents:(id,s)=>data.events.filter(e=>e.locationId===id&&e.season===s),canEdit:()=>!conflict&&!loadError,onChange:({placeId,season,before,beforeRefs,deletedIds})=>{const raw=structuredClone(data);placeEntry(get('place',placeId),season);raw.locations.find(x=>x.id===placeId).seasonStates[season].plan=before;for(const r of beforeRefs||[]){const e=raw.events.find(x=>x.id===r.id);if(e)e.zoneId=r.zoneId;}undoStack.push(JSON.stringify(raw));redoStack.length=0;editKey='';if(deletedIds?.length)data.events.filter(e=>e.locationId===placeId&&e.season===season&&deletedIds.includes(e.zoneId)).forEach(e=>e.zoneId='');save();},onError:toast});}
  function statusField(kind,record){return field('설정 상태',select(kind,record.id,'status',record.status||'draft',statusOptions),'상태는 작가가 직접 지정합니다.');}
  function statusBadge(record){return `<span class="pill status-${esc(record.status||'draft')}">${esc(statusOptions.find(x=>x[0]===(record.status||'draft'))?.[1])}</span>`;}
  function statusMatch(record){return !ui.statusFilter||(record.status||'draft')===ui.statusFilter;}
  function statusFilter(){return `<select data-status-filter aria-label="설정 상태 필터"><option value="">모든 설정 상태</option>${optString(statusOptions,ui.statusFilter)}</select>`;}
  function recordId(record){return `<div class="record-id">ID · ${esc(record.id)}</div>`;}


  function overview(){
    const s=ui.season, cc=data.characters.filter(c=>s===0?true:inSeason(c,s)).length;
    const ec=data.events.filter(e=>s===0||e.season===s).length;
    const lc=data.locations.filter(p=>s===0?true:placeEntry(p,s).appears).length;
    const gc=data.groups.filter(g=>s===0?true:groupEntry(g,s).appears).length;
    const showEvents=data.events.filter(e=>s===0||e.season===s).sort(eventOrder).slice(0,7);
    return `${pageHead('시즌 종합 개요','시즌을 기준으로 인물·사건·장소·집단을 함께 관리합니다.')}
      <div class="metrics">${[['등록 인물',cc,'공통 + 시즌 전용'],['등록 사건',ec,'시간순 서사'],['등장 장소',lc,'전개도 포함'],['등장 집단',gc,'시즌별 조직 상태']].map(([a,b,c])=>`<div class="metric"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('')}</div>
      <div class="two-col"><div class="panel panel-pad"><div class="panel-title">7개 시즌 구성</div><p class="subtext" style="margin:-9px 0 12px">시즌명을 수정하거나 각 시즌의 핵심 줄거리를 기록하세요.</p>${data.seasons.map(z=>`<div class="overview-season"><div style="flex:1;min-width:0">${sp(z.id)}<div class="inline-edit" style="margin-top:7px">${input('season',z.id,'title',z.title,'시즌 제목')}</div><div style="margin-top:5px">${textarea('season',z.id,'logline',z.logline,'시즌의 중심 서사를 한두 문장으로',undefined,2)}</div></div>${btn('season',icon('arrow'),`data-season="${z.id}" aria-label="시즌 ${z.id} 선택"`,'btn sm')}</div>`).join('')}</div>
      <div class="panel panel-pad"><div class="panel-title">${s===0?'전체 사건 타임라인':`${esc(seasonName(s))} · 사건 타임라인`}</div>${showEvents.length?`<div class="tline">${showEvents.map(e=>`<div class="tline-item"><div class="tagline"><span class="stepno">S${e.season} · #${esc(e.order)}</span><span class="tiny">${esc(e.timeLabel||'시점 미정')}</span></div><h4>${jump('event',e.id,e.title||'제목 없는 사건')}</h4><p>${esc(short(e.outline||'사건 개요 미입력',110))}</p><div class="tagline" style="margin-top:7px">${e.locationId?jump('place',e.locationId,'장소 · '+(get('place',e.locationId)?.name||'미등록')):''}${e.personIds?.length?`<span class="tiny">관련 인물 ${e.personIds.length}명</span>`:''}</div></div>`).join('')}</div>`:panelEmpty('등록된 사건이 없습니다.','사건 메뉴에서 사건을 추가하면 여기에 시간순으로 표시됩니다.')}
      <div style="margin-top:18px;display:flex;gap:6px">${btn('tab','사건 관리 열기',`data-tab="events"`,'btn sm')} ${btn('new-event',icon('plus')+' 사건 추가','','btn sm primary')}</div></div></div>
      <div class="noticebar" style="margin-top:20px"><div><strong style="font-size:12px">설정의 연결 원칙</strong><div class="subtext">인물·장소·집단은 하나의 공통 객체로 유지하고, 시즌별 상태만 분리합니다. 사건은 기존 객체를 참조합니다.</div></div>${btn('export','전체 데이터 백업', '', 'btn sm')}</div>`;
  }
  function eventOrder(a,b){return a.season-b.season||(Number(a.order)||0)-(Number(b.order)||0)||String(a.title).localeCompare(String(b.title))}

  function characterMatrix(chars){return `<div class="panel matrix-panel"><div class="panel-pad"><div class="subhead">공통 인물 × 7개 시즌 <small>각 셀을 선택하면 해당 시즌을 편집합니다.</small></div><div class="season-table-wrap"><table class="season-table comparison"><thead><tr><th>인물</th>${data.seasons.map(z=>`<th>${esc(z.title)}</th>`).join('')}</tr></thead><tbody>${chars.map(c=>`<tr><th>${esc(c.name)}</th>${data.seasons.map(z=>{const a=charEntry(c,z.id);return `<td><button data-action="compare-cell" data-id="${c.id}" data-season="${z.id}"><b>${a.appears?esc(a.condition):'미등장'}</b><span>${esc(a.role||'역할 미정')}</span><span>${esc(gnames(a.groupIds).join(', ')||'소속 미정')}</span><small>${esc(a.change||'변화 미기록')}</small></button></td>`;}).join('')}</tr>`).join('')||'<tr><td colspan="8">공통 인물을 등록하면 비교할 수 있습니다.</td></tr>'}</tbody></table></div></div></div>`;}
  function backgroundComparison(record,kind){return `<div class="sectionline"></div><div class="subhead">7개 시즌 변화 비교</div><div class="season-table-wrap"><table class="season-table"><thead><tr><th>시즌</th><th>등장</th><th>${kind==='place'?'용도':'목표'}</th><th>변화</th></tr></thead><tbody>${data.seasons.map(z=>{const st=kind==='place'?placeEntry(record,z.id):groupEntry(record,z.id);return `<tr><td>${btn('season','S'+z.id,`data-season="${z.id}"`,'chipbtn')}</td><td>${st.appears?'등장':'미등장'}</td><td>${esc(st.function||st.goal||'—')}</td><td>${esc(st.changed||st.change||'—')}</td></tr>`;}).join('')}</tbody></table></div>`;}
  function people(){
    const q=ui.search;
    const chars=data.characters.filter(c=>statusMatch(c)&&(ui.castFilter==='core'?c.type==='core':ui.castFilter==='guest'?c.type==='guest':true) && (ui.season===0||c.type==='core'||c.homeSeason===ui.season) && matches(q,c.name,c.alias,c.summary,c.notes));
    const core=chars.filter(c=>c.type==='core').sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    const guest=chars.filter(c=>c.type==='guest').sort((a,b)=>a.homeSeason-b.homeSeason||a.name.localeCompare(b.name,'ko'));
    const selectedChar=get('person',ui.selectedPerson);const c=selectedChar&&(ui.season===0||selectedChar.type==='core'||selectedChar.homeSeason===ui.season)?selectedChar:null;
    return `${pageHead('인물 아카이브','고정 등장인물과 시즌 한정 인물을 분리하고, 시즌별 상태 변화를 기록합니다.',btn('new-person',icon('plus')+' 인물 추가','','btn primary'))}
      <div class="view-tools"><div class="segmented">${[['cards','인물 목록'],['compare','인물 × 시즌 비교표']].map(([v,l])=>btn('people-view',l,`data-value="${v}"`,ui.peopleView===v?'active':'')).join('')}</div>${statusFilter()}</div>${ui.peopleView==='compare'?characterMatrix(core):''}<div class="editor-layout"><div class="panel list-panel"><div class="list-head"><div class="heading-row"><h3>등록 인물 <span class="muted">${chars.length}</span></h3></div><input data-search placeholder="이름 · 별칭 · 설정 검색" value="${esc(q)}" aria-label="인물 검색"><div class="segmented">${[['all','전체'],['core','공통'],['guest','시즌 전용']].map(([a,b])=>`<button data-action="castfilter" data-filter="${a}" class="${ui.castFilter===a?'active':''}">${b}</button>`).join('')}</div></div><div class="list-scroll">${ui.castFilter!=='guest'?renderPersonGroup('공통 등장인물',core):''}${ui.castFilter!=='core'?renderPersonGroup('시즌 전용 인물',guest):''}${!chars.length?`<div class="empty"><strong>일치하는 인물이 없습니다.</strong><p>인물을 추가하거나 검색어를 변경하세요.</p></div>`:''}</div></div>
      <div class="panel edit-panel">${c?personDetail(c):panelEmpty('인물을 선택하세요.','왼쪽에서 인물을 선택하거나 새 인물을 등록할 수 있습니다.')}</div></div>`;
  }
  function renderPersonGroup(label,people){return `<div class="list-section">${label} · ${people.length}</div>${people.map(c=>`<button class="listrow ${ui.selectedPerson===c.id?'active':''}" data-action="select-person" data-id="${c.id}"><span style="min-width:0"><strong>${esc(c.name||'(이름 미정)')}</strong>${statusBadge(c)}<small>${esc(short(c.summary||c.alias||(c.type==='core'?'7시즌 공통 인물':'시즌 한정 인물'),42))}</small></span>${c.type==='core'?`<span class="pill">공통</span>`:sp(c.homeSeason)}</button>`).join('')}`}
  function personDetail(c){const iscore=c.type==='core';let selected=selectedSeasonForCharacter(c);if(!selected||selected<1||selected>7){selected=c.type==='guest'?c.homeSeason:1;ui.personSeason=selected}const entry=charEntry(c,selected);
    const ev=data.events.filter(e=>e.personIds?.includes(c.id)).sort(eventOrder);
    return `<div class="edit-head"><div><div class="smallcaps">CHARACTER · ${iscore?'RECURRING':'SEASON ONLY'}</div><h3>${esc(c.name||'(이름 미정)')}</h3><small>${iscore?'공통 등장인물 — 시즌별 상태 관리':`시즌 ${c.homeSeason}에만 등장하는 인물`}</small></div>${btn('delete-person',icon('trash')+' 삭제',`data-id="${c.id}"`,'btn sm danger')}</div>
      <div class="editor-body">${recordId(c)}<div class="fields">${statusField('person',c)}${field('인물 이름',input('person',c.id,'name',c.name,'정식 이름'))}${field('분류',select('person',c.id,'type',c.type,[['core','공통 등장인물'],['guest','시즌 전용 인물']]))}${c.type==='guest'?field('등장 시즌',select('person',c.id,'homeSeason',c.homeSeason,data.seasons.map(z=>[z.id,z.title]))):''}${field('별칭 / 호칭',input('person',c.id,'alias',c.alias,'별명 · 가명'))}${['age','profile','appearance','personality','values','goal'].map((k,i)=>field(['나이','기초 프로필','외모','성격','가치관','목적'][i],textarea('person',c.id,k,c[k]||'','미정인 정보는 비워 두세요.',undefined,2))).join('')}${field('핵심 설정',textarea('person',c.id,'summary',c.summary,'성격, 능력, 서사적 기능 등'),'',true)}${field('관계 / 비밀 / 메모',textarea('person',c.id,'notes',c.notes,'관계와 떡밥, 모순 검토 사항 등'),'',true)}</div>
      <div class="sectionline"></div><div class="subhead">시즌별 인물 상태 <small>${iscore?'7개 시즌의 출연 여부와 변화 추적':'단일 시즌 전용 기록'}</small></div>
      ${iscore?`<div class="season-table-wrap"><table class="season-table"><thead><tr><th>시즌</th><th>등장</th><th>상태</th><th>소속 집단</th><th>주요 변화</th></tr></thead><tbody>${data.seasons.map(z=>{const a=charEntry(c,z.id);return `<tr class="canselect ${selected===z.id?'active':''}" data-action="person-season" data-season="${z.id}"><td><b>S${z.id}</b></td><td>${a.appears?'<span class="pill green">등장</span>':'<span class="pill gray">미등장</span>'}</td><td>${esc(a.condition)}</td><td class="truncate">${esc(gnames(a.groupIds).join(', ')||'—')}</td><td class="truncate">${esc(short(a.change||'—',35))}</td></tr>`}).join('')}</tbody></table></div>`:''}
      <div class="panel" style="box-shadow:none;background:#fbfaf8"><div class="panel-pad"><div class="tagline" style="justify-content:space-between;margin-bottom:14px"><div class="subhead" style="margin:0">S${selected} · ${esc(seasonName(selected))}</div><span class="pill ${entry.appears?'green':'gray'}">${entry.appears?'등장':'미등장'}</span></div>
      <div class="fields">${iscore?`<label class="checkline full">${check('person-season',c.id,'appears',entry.appears,selected)} 이 시즌에 등장</label>`:''}${field('생존 / 활동 상태',select('person-season',c.id,'condition',entry.condition,aliveOptions,selected))}${field('해당 시즌의 역할',input('person-season',c.id,'role',entry.role,'주도자 / 목격자 / 용의자 …','text',selected))}${['physical','mental','goal','position','relationshipChanges'].map((k,i)=>field(['신체 상태','정신 상태','시즌 목표','소속 내 지위','관계 변화'][i],textarea('person-season',c.id,k,entry[k]||'','',selected,2))).join('')}${field('시즌 내 변화',textarea('person-season',c.id,'change',entry.change,'시즌 초 → 시즌 말 변화',selected,3),'',true)}${field('시즌 상세 메모',textarea('person-season',c.id,'notes',entry.notes,'감정선 · 관계 변화 · 비밀 등',selected,3),'',true)}</div>
      <div class="subhead">시즌 ${selected} 소속 집단</div><div class="info-links">${(entry.groupIds||[]).map(id=>jump('group',id,get('group',id)?.name||'집단')).join('')}</div>${data.groups.length?`<div class="checkbox-grid">${data.groups.map(g=>`<label class="checkcard"><input type="checkbox" data-bind="person-group" data-id="${c.id}" data-group="${g.id}" data-season="${selected}" ${entry.groupIds?.includes(g.id)?'checked':''}><span>${esc(g.name)}</span></label>`).join('')}</div>`:`<div class="notice">등록된 집단이 없습니다. 배경 → 집단에서 집단을 먼저 추가하면 소속을 지정할 수 있습니다.</div>`}</div></div>
      <div class="sectionline"></div><div class="subhead">변화의 원인이 된 사건 · S${selected}</div><div class="checkbox-grid">${data.events.filter(e=>e.season===selected).map(e=>`<label class="checkcard"><input type="checkbox" data-bind="cause-event" data-id="${c.id}" data-event="${e.id}" data-season="${selected}" ${entry.eventIds?.includes(e.id)?'checked':''}><span>${esc(e.title)}</span></label>`).join('')||'<p class="muted">이 시즌의 사건을 먼저 등록하세요.</p>'}</div>
      <div class="sectionline"></div><div class="subhead">인물 관계</div><div class="fields">${data.characters.filter(x=>x.id!==c.id).map(x=>field(x.name,`<input data-bind="relationship" data-id="${c.id}" data-person="${x.id}" value="${esc(c.relationships?.find(r=>r.personId===x.id)?.relation||'')}" placeholder="관계 · 호칭 · 갈등" aria-label="${esc(x.name)} 관계">`)+jump('person',x.id,x.name+' 상세')).join('')||'<p class="muted">다른 인물을 추가하면 관계를 기록할 수 있습니다.</p>'}</div>
      <div class="sectionline"></div><div class="subhead">이 인물과 연결된 사건 <small>${ev.length}개</small></div>${ev.length?`<div class="tline">${ev.map(e=>`<div class="tline-item"><div class="tiny">S${e.season} · ${esc(e.timeLabel||`#${e.order}`)}</div>${jump('event',e.id,e.title||'제목 없는 사건')}<p>${esc(short(e.outline||'',90))}</p></div>`).join('')}</div>`:`<div class="muted-msg">아직 연결된 사건이 없습니다. 사건에서 관련 인물을 지정하세요.</div>`}</div>`;
  }

  function events(){
    const q=ui.search;let list=data.events.filter(e=>statusMatch(e)&&(ui.season===0||e.season===ui.season)&&matches(q,e.title,e.timeLabel,e.outline,cnames(e.personIds).join(' '),get('place',e.locationId)?.name));list.sort(eventOrder);
    if(ui.eventFilter)list=list.filter(e=>ui.eventView==='space'?e.locationId===ui.eventFilter:ui.eventView==='person'?e.personIds?.includes(ui.eventFilter):true);
    const selected=get('event',ui.selectedEvent),e=selected&&(ui.season===0||selected.season===ui.season)?selected:null;
    const options=ui.eventView==='space'?data.locations:data.characters.filter(c=>ui.season===0||c.type==='core'||c.homeSeason===ui.season);
    const groups=ui.eventView==='time'?data.seasons.map(z=>({id:z.id,label:z.title,items:list.filter(v=>v.season===z.id)})):ui.eventView==='space'?[...data.locations.map(p=>({id:p.id,label:p.name,items:list.filter(v=>v.locationId===p.id)})),{id:'',label:'장소 미정',items:list.filter(v=>!v.locationId)}]:[...data.characters.map(c=>({id:c.id,label:c.name,items:list.filter(v=>v.personIds?.includes(c.id))})),{id:'',label:'참여 인물 미정',items:list.filter(v=>!v.personIds?.length)}];
    return `${pageHead('사건 아카이브','하나의 사건을 시간·공간·인물의 관점에서 탐색합니다.',btn('new-event',icon('plus')+' 사건 추가','','btn primary'))}<div class="view-tools"><div class="segmented">${[['time','시간별 보기'],['space','공간별 보기'],['person','인물별 보기']].map(([v,l])=>btn('event-view',l,`data-value="${v}"`,ui.eventView===v?'active':'')).join('')}</div>${statusFilter()}</div>
    <div class="editor-layout"><div class="panel list-panel"><div class="list-head"><h3>사건 ${list.length}</h3><input data-search placeholder="사건 · 인물 · 장소 검색" value="${esc(q)}" aria-label="사건 검색">${ui.eventView!=='time'?`<select data-event-filter aria-label="사건 연결 대상 필터"><option value="">${ui.eventView==='space'?'모든 장소':'모든 인물'}</option>${optString(options.map(o=>[o.id,o.name]),ui.eventFilter)}</select>`:''}</div><div class="list-scroll">${groups.filter(g=>g.items.length).map(g=>`<div class="list-section">${esc(g.label)} · ${g.items.length}</div>${g.items.map(e=>`<button class="listrow ${e.id===ui.selectedEvent?'active':''}" data-action="select-event" data-id="${e.id}"><span><span class="stepno">S${e.season} · #${e.order}</span><strong>${esc(e.title||'제목 없는 사건')}</strong><small>${esc(e.timeLabel||'시점 미정')} · ${esc(get('place',e.locationId)?.name||'장소 미정')}</small>${statusBadge(e)}</span></button>`).join('')}`).join('')||'<div class="empty">일치하는 사건이 없습니다.</div>'}</div></div><div class="panel edit-panel">${e?eventDetail(e):panelEmpty('사건을 선택하세요.','시간과 연결 대상을 기준으로 사건을 탐색할 수 있습니다.')}</div></div>`;
  }
  function eventDetail(e){
    let locOpts=[['','미정'],...data.locations.map(p=>[p.id,p.name])];
    const persons=data.characters.filter(c=>c.type==='core'||c.homeSeason===Number(e.season)||e.personIds?.includes(c.id));
    return `<div class="edit-head"><div><div class="smallcaps">EVENT · S${e.season} · #${esc(e.order)}</div><h3>${esc(e.title||'(제목 미정)')}</h3><small>시간 · 장소 · 인물을 기준으로 연결됨</small></div><div class="list-actions">${btn('move-event-up','↑',`data-id="${e.id}"`,'btn sm')}${btn('move-event-down','↓',`data-id="${e.id}"`,'btn sm')}${btn('delete-event',icon('trash'),`data-id="${e.id}"`,'btn sm danger')}</div></div>
    <div class="editor-body">${recordId(e)}<div class="fields">${statusField('event',e)}${field('사건 제목',input('event',e.id,'title',e.title,'사건명'),'',true)}${field('소속 시즌',select('event',e.id,'season',e.season,data.seasons.map(z=>[z.id,z.title])))}${field('시즌 내 순서',input('event',e.id,'order',e.order,'1','number'),'동일 시즌에서 숫자가 작은 사건부터 표시')}${field('발생 시점 / 시간대',input('event',e.id,'timeLabel',e.timeLabel,'예: 3월 첫째 주 수요일 21:30'),'정확한 연도가 정해지지 않아도 기록 가능',true)}${field('발생 장소',select('event',e.id,'locationId',e.locationId,locOpts),'',true)}${field('사건 현장 구역',select('event',e.id,'zoneId',e.zoneId||'',[['','구역 미정'],...(get('place',e.locationId)?placeEntry(get('place',e.locationId),e.season).plan:[]).map(z=>[z.id,z.label])]),'선택한 장소의 해당 시즌 전개도와 연결됩니다.',true)}${field('사건 개요',textarea('event',e.id,'outline',e.outline,'무슨 일이 일어나는가?',undefined,4),'',true)}${field('원인 / 선행 사건',textarea('event',e.id,'trigger',e.trigger,'사건이 발생한 원인'),' ',true)}${field('결과 / 후속 영향',textarea('event',e.id,'aftermath',e.aftermath,'누가 무엇을 잃거나 얻게 되는가?'),' ',true)}${field('독자에게 공개되는 정보 / 단서',textarea('event',e.id,'reveal',e.reveal,'진상과 노출 시점 구분'),' ',true)}${field('작가 메모',textarea('event',e.id,'notes',e.notes,'반전 · 복선 · 시점 등'),' ',true)}</div>
    ${e.locationId&&get('place',e.locationId)?`<div class="source-note">등록된 공간과 연결되어 있습니다. ${jump('place',e.locationId,'장소 전개도 열기')}</div>`:''}
    <div class="sectionline"></div><div class="subhead">관련 인물 <small>${e.personIds?.length||0}명</small></div>${persons.length?`<div class="checkbox-grid">${persons.map(c=>`<label class="checkcard"><input type="checkbox" data-bind="event-person" data-id="${e.id}" data-person="${c.id}" ${e.personIds?.includes(c.id)?'checked':''}><span>${esc(c.name)}${c.type==='guest'?` (S${c.homeSeason})`:''}</span></label>`).join('')}</div>`:`<div class="notice">등록된 인물이 없습니다. 인물 탭에서 먼저 인물을 추가하세요.</div>`}
    <div class="fields">${(e.personIds||[]).map(id=>field((get('person',id)?.name||'인물')+'의 사건 역할',`<input data-bind="participant-role" data-id="${e.id}" data-person="${id}" value="${esc(e.participantRoles?.[id]||'')}" aria-label="${esc(get('person',id)?.name)}의 사건 역할" placeholder="목격자 · 주도자 · 피해자 등">`)).join('')}</div><div class="info-links">${(e.personIds||[]).map(id=>jump('person',id,get('person',id)?.name||'인물')).join('')}${(e.groupIds||[]).map(id=>jump('group',id,get('group',id)?.name||'집단')).join('')}</div><div class="sectionline"></div><div class="subhead">후속 사건 및 복선 연결</div><div class="checkbox-grid">${data.events.filter(v=>v.id!==e.id).map(v=>`<label class="checkcard"><input type="checkbox" data-bind="following-event" data-id="${e.id}" data-event="${v.id}" ${e.followingEventIds?.includes(v.id)?'checked':''}><span>S${v.season} · ${esc(v.title)}</span></label>`).join('')}</div><div class="info-links">${(e.followingEventIds||[]).map(id=>jump('event',id,get('event',id)?.title||'사건')).join('')}</div>
    <div class="sectionline"></div><div class="subhead">관련 집단 <small>${e.groupIds?.length||0}개</small></div>${data.groups.length?`<div class="checkbox-grid">${data.groups.map(g=>`<label class="checkcard"><input type="checkbox" data-bind="event-group" data-id="${e.id}" data-group="${g.id}" ${e.groupIds?.includes(g.id)?'checked':''}><span>${esc(g.name)}</span></label>`).join('')}</div>`:`<div class="notice">집단을 등록하면 사건의 개입 세력을 연결할 수 있습니다.</div>`}</div>`;
  }

  function background(){
    const place=ui.bgTab==='places';
    const btnTitle=place?'장소 추가':'집단 추가',act=place?'new-place':'new-group';
    return `${pageHead('배경 아카이브','장소의 시즌별 변화와 전개도, 집단의 구조 및 등장 인물을 함께 관리합니다.',btn(act,icon('plus')+' '+btnTitle,'','btn primary'))}<div class="view-tools">${statusFilter()}</div><div class="tabs"><button class="tabbtn ${place?'active':''}" data-action="bg-tab" data-value="places">장소 · 전개도</button><button class="tabbtn ${!place?'active':''}" data-action="bg-tab" data-value="groups">집단 · 조직</button></div>${place?places():groups()}`;
  }
  function places(){
    const s=ui.season;
    const list=data.locations.filter(p=>statusMatch(p)&&(s===0||placeEntry(p,s).appears)&&matches(ui.search,p.name,p.kind,p.summary,p.notes)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    const p=get('place',ui.selectedPlace);
    return `<div class="editor-layout"><div class="panel list-panel"><div class="list-head"><div class="heading-row"><h3>장소 <span class="muted">${list.length}</span></h3></div><input data-search placeholder="장소 이름 · 용도 검색" value="${esc(ui.search)}" aria-label="장소 검색"></div><div class="list-scroll">${list.length?list.map(p=>`<button class="listrow ${ui.selectedPlace===p.id?'active':''}" data-action="select-place" data-id="${p.id}"><span style="min-width:0"><strong>${esc(p.name||'(장소 미정)')}</strong><small>${esc(short(p.summary||p.kind||'장소 설정 미입력',42))}</small></span><span class="pill gray">${esc(p.kind||'장소')}</span></button>`).join(''):`<div class="empty"><strong>표시할 장소가 없습니다.</strong><p>장소를 등록하거나 해당 시즌의 등장 여부를 확인하세요.</p></div>`}</div></div><div class="panel edit-panel">${p?placeDetail(p):panelEmpty('장소를 선택하세요.','사건 현장의 구조를 전개도로 직접 설계할 수 있습니다.')}</div></div>`;
  }
  function placeDetail(p){
    const s=ui.season||1, e=placeEntry(p,s),events=data.events.filter(v=>v.locationId===p.id).sort(eventOrder);
    const parentOpts=[['','상위 장소 없음'],...data.locations.filter(x=>x.id!==p.id).map(x=>[x.id,x.name])];

    return `<div class="edit-head"><div><div class="smallcaps">LOCATION · S${s}</div><h3>${esc(p.name||'(장소 미정)')}</h3><small>시즌별 장소 상태 + 독립 전개도</small></div>${btn('delete-place',icon('trash')+' 삭제',`data-id="${p.id}"`,'btn sm danger')}</div><div class="editor-body">${recordId(p)}
    <div class="fields">${statusField('place',p)}${field('장소명',input('place',p.id,'name',p.name,'장소 이름'))}${field('분류',select('place',p.id,'kind',p.kind,[['건물','건물'],['건물 내부','건물 내부'],['야외','야외'],['도시 / 구역','도시 / 구역'],['비밀 공간','비밀 공간'],['기타','기타']]))}${field('상위 장소 / 소속 건물',select('place',p.id,'parentId',p.parentId,parentOpts),'장소 안에 다른 장소를 등록하는 계층 관계',true)}${field('공통 장소 설정',textarea('place',p.id,'summary',p.summary,'형태 · 목적 · 주요 특징'),'',true)}${['geography','structure','routes','facilities'].map((k,i)=>field(['지리적 위치','규모 및 구조','출입구 및 이동 경로','시설물과 주요 장치'][i],textarea('place',p.id,k,p[k]||'','',undefined,2))).join('')}${field('공통 메모',textarea('place',p.id,'notes',p.notes,'출입 조건, 숨겨진 시설, 참고 사항'),'',true)}</div>
    ${ui.season===0?backgroundComparison(p,'place'):''}<div class="sectionline"></div><div class="subhead">시즌별 등장 현황</div><div class="chiplist" style="margin-bottom:15px">${data.seasons.map(z=>`<button class="chipbtn ${s===z.id?'picked':''}" data-action="season" data-season="${z.id}">S${z.id} ${placeEntry(p,z.id).appears?'●':'○'}</button>`).join('')}</div>
    <div class="panel" style="background:#fbfaf8;box-shadow:none"><div class="panel-pad"><div class="tagline" style="justify-content:space-between;margin-bottom:16px"><b>S${s} · ${esc(seasonName(s))}</b><label class="checkline">${check('place-season',p.id,'appears',e.appears,s)} 이 시즌에 등장</label></div><div class="fields">${field('시즌 내 장소 기능',textarea('place-season',p.id,'function',e.function,'시즌의 주요 사건이 발생하는 역할',s,2),'',true)}${field('시즌에 따른 변경 사항',textarea('place-season',p.id,'changed',e.changed,'증축 · 파괴 · 소유권 · 접근성 변화',s,2),'',true)}</div><div class="subhead">관리 / 점유 집단</div><div class="info-links">${(e.managementIds||[]).map(id=>jump('group',id,get('group',id)?.name||'집단')).join('')}</div>${data.groups.length?`<div class="checkbox-grid">${data.groups.map(g=>`<label class="checkcard"><input type="checkbox" data-bind="place-group" data-id="${p.id}" data-season="${s}" data-group="${g.id}" ${e.managementIds?.includes(g.id)?'checked':''}><span>${esc(g.name)}</span></label>`).join('')}</div>`:`<div class="muted-msg">집단을 등록하면 이 장소를 점유하거나 통제하는 집단을 지정할 수 있습니다.</div>`}</div></div>
    ${ArchivePlan.render({placeId:p.id,season:s,plan:e.plan,events:data.events.filter(v=>v.locationId===p.id&&v.season===s)})}
    <div class="sectionline"></div><div class="subhead">이 장소와 연결된 사건 <small>${events.length}개</small></div>${events.length?`<div class="info-links">${events.map(v=>jump('event',v.id,`S${v.season} · ${v.title}`)).join('')}</div>`:`<div class="muted-msg">아직 이 장소에 연결된 사건이 없습니다.</div>`}</div>`;
  }
  function groups(){
    const s=ui.season;const list=data.groups.filter(g=>statusMatch(g)&&(s===0||groupEntry(g,s).appears)&&matches(ui.search,g.name,g.type,g.summary,g.structure)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    const g=get('group',ui.selectedGroup);
    return `<div class="editor-layout"><div class="panel list-panel"><div class="list-head"><div class="heading-row"><h3>배경 집단 <span class="muted">${list.length}</span></h3></div><input data-search placeholder="집단명 · 목적 · 설정 검색" value="${esc(ui.search)}" aria-label="집단 검색"></div><div class="list-scroll">${list.length?list.map(g=>`<button class="listrow ${ui.selectedGroup===g.id?'active':''}" data-action="select-group" data-id="${g.id}"><span style="min-width:0"><strong>${esc(g.name||'(집단명 미정)')}</strong><small>${esc(short(g.summary||g.type||'설정 미입력',42))}</small></span><span class="pill gray">${esc(g.type||'집단')}</span></button>`).join(''):`<div class="empty"><strong>표시할 집단이 없습니다.</strong><p>조직·학교·세력 등을 등록하거나 등장 시즌을 변경하세요.</p></div>`}</div></div><div class="panel edit-panel">${g?groupDetail(g):panelEmpty('집단을 선택하세요.','집단을 만들고 시즌별 목표·지도부·구성원 변화를 기록하세요.')}</div></div>`;
  }
  function groupDetail(g){
    const s=ui.season||1, e=groupEntry(g,s);
    const locOpts=[['','본거지 미정'],...data.locations.map(p=>[p.id,p.name])];
    const groupCharacters=data.characters.filter(c=>(c.type!=='guest'||c.homeSeason===s)&&(inSeason(c,s)||charEntry(c,s).groupIds?.includes(g.id)));
    const people=groupCharacters.filter(c=>charEntry(c,s).groupIds?.includes(g.id));
    const groupEvents=data.events.filter(v=>v.groupIds?.includes(g.id)).sort(eventOrder);
    return `<div class="edit-head"><div><div class="smallcaps">FACTION · S${s}</div><h3>${esc(g.name||'(집단명 미정)')}</h3><small>조직 · 소속 인물 · 시즌별 변화</small></div>${btn('delete-group',icon('trash')+' 삭제',`data-id="${g.id}"`,'btn sm danger')}</div><div class="editor-body">${recordId(g)}<div class="fields">${statusField('group',g)}${field('집단명',input('group',g.id,'name',g.name,'정식 집단명'))}${field('분류',select('group',g.id,'type',g.type,[['학교','학교'],['학생 조직','학생 조직'],['종교 집단','종교 집단'],['비밀 결사','비밀 결사'],['공공 기관','공공 기관'],['기업','기업'],['기타','기타']]))}${field('본거지',select('group',g.id,'headquartersId',g.headquartersId,locOpts),'',true)}${field('집단의 정체성 / 이념',textarea('group',g.id,'summary',g.summary,'가치관 · 존재 이유'),'',true)}${field('조직 구조',textarea('group',g.id,'structure',g.structure,'지도부 · 내부 계급 · 의사결정 체계'),'',true)}${field('활동 방식 / 비밀',textarea('group',g.id,'methods',g.methods,'행동 양식 · 통제 수단 · 내부 갈등'),'',true)}${['purpose','rules','territory','relations'].map((k,i)=>field(['설립 목적','내부 규칙','활동 영역','다른 집단과의 관계'][i],textarea('group',g.id,k,g[k]||'','',undefined,2))).join('')}${field('비고',textarea('group',g.id,'notes',g.notes,'추가 설정'),'',true)}</div>
    ${ui.season===0?backgroundComparison(g,'group'):''}<div class="sectionline"></div><div class="subhead">시즌별 활동 현황</div><div class="chiplist" style="margin-bottom:14px">${data.seasons.map(z=>`<button class="chipbtn ${s===z.id?'picked':''}" data-action="season" data-season="${z.id}">S${z.id} ${groupEntry(g,z.id).appears?'●':'○'}</button>`).join('')}</div>
    <div class="panel" style="background:#fbfaf8;box-shadow:none"><div class="panel-pad"><div class="tagline" style="justify-content:space-between;margin-bottom:16px"><b>S${s} · ${esc(seasonName(s))}</b><label class="checkline">${check('group-season',g.id,'appears',e.appears,s)} 이 시즌에 활동</label></div><div class="fields">${field('시즌 책임자 / 지도부',input('group-season',g.id,'leader',e.leader,'인물명 또는 지도 체계','text',s),'',true)}${field('시즌별 주요 목표',textarea('group-season',g.id,'goal',e.goal,'집단이 무엇을 달성하려 하는가?',s,2),'',true)}${field('시즌별 변동',textarea('group-season',g.id,'change',e.change,'분열 · 통합 · 몰락 · 영향력 변화',s,2),'',true)}${field('추가 메모',textarea('group-season',g.id,'notes',e.notes,'이 시즌의 숨겨진 활동',s,2),'',true)}</div></div></div>
    <div class="sectionline"></div><div class="subhead">시즌 ${s} 구성원 <small>${people.length}명 / 전체 ${groupCharacters.length}명</small></div><div class="source-note">여기에서 소속을 변경하면 인물의 시즌별 소속 정보에도 동시에 반영됩니다.</div>${groupCharacters.length?`<div class="checkbox-grid">${groupCharacters.map(c=>`<label class="checkcard"><input type="checkbox" data-bind="group-member" data-id="${g.id}" data-person="${c.id}" data-season="${s}" ${charEntry(c,s).groupIds?.includes(g.id)?'checked':''}><span>${esc(c.name)} ${c.type==='guest'?`(S${c.homeSeason})`:''}</span></label>`).join('')}</div>`:`<div class="muted-msg">해당 시즌에 등장하는 인물을 먼저 등록하세요.</div>`}
    <div class="info-links">${people.map(c=>jump('person',c.id,c.name)).join('')}</div><div class="sectionline"></div><div class="subhead">연결된 사건 <small>${groupEvents.length}개</small></div>${groupEvents.length?`<div class="info-links">${groupEvents.map(ev=>jump('event',ev.id,`S${ev.season} · ${ev.title}`)).join('')}</div>`:`<div class="muted-msg">연결된 사건이 아직 없습니다.</div>`}</div>`;
  }

  function createPerson(){
    checkpoint();
    const s=activeSeason(),id=uid();
    const c={id,status:'draft',name:'새 인물',type:'core',homeSeason:s,alias:'',summary:'',notes:'',seasonStates:{}};
    for(let i=1;i<=7;i++)c.seasonStates[i]=seasonDefault(true);
    data.characters.push(c);ui.tab='people';ui.castFilter='all';ui.search='';ui.selectedPerson=id;ui.personSeason=s;save();layout();toast('인물이 추가되었습니다.');
  }
  function createEvent(){
    checkpoint();
    const s=activeSeason(),id=uid();const orders=data.events.filter(e=>e.season===s).map(e=>Number(e.order)||0);
    data.events.push({id,status:'draft',zoneId:'',participantRoles:{},followingEventIds:[],season:s,order:Math.max(0,...orders)+1,title:'새 사건',timeLabel:'',locationId:'',personIds:[],groupIds:[],outline:'',trigger:'',aftermath:'',reveal:'',notes:''});
    ui.tab='events';ui.search='';ui.selectedEvent=id;save();layout();toast('사건이 추가되었습니다.');
  }
  function createPlace(){
    checkpoint();
    const s=activeSeason(),id=uid(),p={id,status:'draft',name:'새 장소',kind:'건물',parentId:'',summary:'',notes:'',seasonStates:{}};
    p.seasonStates[s]=locationSeasonDefault(true);data.locations.push(p);
    ui.tab='background';ui.bgTab='places';ui.search='';ui.selectedPlace=id;ui.selectedShape=null;save();layout();toast('장소가 추가되었습니다.');
  }
  function createGroup(){
    checkpoint();
    const s=activeSeason(),id=uid(),g={id,status:'draft',name:'새 집단',type:'기타',headquartersId:'',summary:'',structure:'',methods:'',notes:'',seasonStates:{}};
    g.seasonStates[s]=groupSeasonDefault(true);data.groups.push(g);
    ui.tab='background';ui.bgTab='groups';ui.search='';ui.selectedGroup=id;save();layout();toast('집단이 추가되었습니다.');
  }
  function deleteRecord(kind,id){
    const names={person:'인물',event:'사건',place:'장소',group:'집단'};
    const record=get(kind,id);if(!record)return;
    const refs=D.referenceReport(data,kind,id);
    if(!confirm(`「${record.name||record.title}」 기록을 삭제할까요? 연결 참조 ${refs.length}건도 해제됩니다. 편집 취소로 복원할 수 있습니다.`))return;
    checkpoint();D.removeRecord(data,kind,id);
    ui.selectedPerson=null;ui.selectedEvent=null;ui.selectedPlace=null;ui.selectedGroup=null;
    save();layout();toast('기록과 연결 참조를 삭제했습니다.');
  }
  function moveEvent(id,delta){
    const e=get('event',id);if(!e)return;
    const list=data.events.filter(x=>x.season===e.season).sort(eventOrder);
    const ix=list.findIndex(x=>x.id===id),other=list[ix+delta];if(!other)return;
    checkpoint();
    // 동일 숫자 순서가 있어도 안전하게 전부 1~N 정렬 후 교환
    const next=[...list];[next[ix],next[ix+delta]]=[next[ix+delta],next[ix]];
    next.forEach((item,i)=>{item.order=i+1});save();layout();
  }
  function toggleArray(list,value,on){if(!Array.isArray(list))list=[];return on?[...new Set([...list,value])]:list.filter(x=>x!==value)}
  function numeric(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
  function boundUpdate(el){
    if(conflict||loadError)return;
    const kind=el.dataset.bind,id=el.dataset.id,fieldName=el.dataset.field;
    checkpoint([kind,id,fieldName,el.dataset.season,el.dataset.person,el.dataset.group].join(':'));
    const season=Number(el.dataset.season),val=el.type==='checkbox'?el.checked:el.value;
    if(kind==='season'){
      const z=data.seasons.find(x=>x.id===Number(id));if(z)z[fieldName]=String(val);
    }else if(kind==='person'||kind==='event'||kind==='place'||kind==='group'){
      const target=get(kind,id);if(!target)return;
      const old=target[fieldName];target[fieldName]=['season','homeSeason','order'].includes(fieldName)?Math.max(1,Math.trunc(numeric(val,1))):val;
      if(kind==='place'&&fieldName==='parentId'){try{D.normalize(data);}catch(e){target[fieldName]=old;toast('상위 장소 지정 실패: '+e.message);layout();return;}}
      if(kind==='person'&&fieldName==='type'&&old!==val){
        if(val==='guest'){
          target.homeSeason=ui.season||ui.personSeason||1;
          charEntry(target,target.homeSeason).appears=true;
          ui.personSeason=target.homeSeason;
        }else{
          for(let i=1;i<=7;i++)charEntry(target,i);
        }
      }
      if(kind==='person'&&fieldName==='homeSeason'){
        const prev=Number(old),next=Number(target.homeSeason);
        const oldEntry=target.seasonStates?.[prev]||seasonDefault(true);
        const dst=target.seasonStates[next];
        const meaningful=dst&&(['notes','change','role','goal','physical','mental','position','relationshipChanges','causes'].some(k=>dst[k])||(dst.condition&&dst.condition!=='미정')||dst.groupIds?.length||dst.eventIds?.length);
        if(!meaningful)target.seasonStates[next]={...structuredClone(oldEntry),appears:true};else dst.appears=true;
        ui.personSeason=next;
      }
      if(kind==='event'&&['locationId','season'].includes(fieldName)&&String(old)!==String(val)){target.zoneId='';}
      if(kind==='event'&&fieldName==='season'){
        // 시즌 변경 후 기존 인물·장소 연결을 유지하되 사용자가 확인하도록 안내
        toast('사건 시즌이 변경되었습니다. 관련 인물의 시즌 소속도 확인하세요.');
      }
    } else if(kind==='person-season'){
      const c=get('person',id);if(c)charEntry(c,season)[fieldName]=val;
    } else if(kind==='place-season'){
      const p=get('place',id);if(p)placeEntry(p,season)[fieldName]=val;
    } else if(kind==='group-season'){
      const g=get('group',id);if(g)groupEntry(g,season)[fieldName]=val;
    } else if(kind==='person-group'){
      const c=get('person',id);if(c){const a=charEntry(c,season);a.groupIds=toggleArray(a.groupIds,el.dataset.group,val)}
    } else if(kind==='group-member'){
      const c=get('person',el.dataset.person);if(c){const a=charEntry(c,season);a.groupIds=toggleArray(a.groupIds,id,val)}
    } else if(kind==='place-group'){
      const p=get('place',id);if(p){const a=placeEntry(p,season);a.managementIds=toggleArray(a.managementIds,el.dataset.group,val)}
    } else if(kind==='event-person'){
      const e=get('event',id);if(e){e.personIds=toggleArray(e.personIds,el.dataset.person,val);if(!val&&e.participantRoles)delete e.participantRoles[el.dataset.person];}
    } else if(kind==='event-group'){
      const e=get('event',id);if(e)e.groupIds=toggleArray(e.groupIds,el.dataset.group,val);
    } else if(kind==='participant-role'){const e=get('event',id);if(e){e.participantRoles ||= {};e.participantRoles[el.dataset.person]=val;}}
    else if(kind==='following-event'){const e=get('event',id);if(e)e.followingEventIds=toggleArray(e.followingEventIds,el.dataset.event,val);}
    else if(kind==='cause-event'){const c=get('person',id);if(c)charEntry(c,season).eventIds=toggleArray(charEntry(c,season).eventIds,el.dataset.event,val);}
    else if(kind==='relationship'){const c=get('person',id);if(c){c.relationships ||= [];let r=c.relationships.find(x=>x.personId===el.dataset.person);if(!r){r={personId:el.dataset.person,relation:''};c.relationships.push(r);}r.relation=String(val);}}
    save();
  }
  function downloadText(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function downloadBackup(){
    const file=new Blob([JSON.stringify(D.normalize(data),null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(file),a=document.createElement('a');
    const today=new Date();const stamp=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('');
    a.href=url;a.download=`white-devil-archive-${stamp}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('JSON 백업 파일을 저장했습니다.');
  }
  async function importBackup(file){
    if(!file)return;
    if(file.size>25*1024*1024){toast('25MB 이하의 JSON 파일만 가져올 수 있습니다.');return;}
    try{const incoming=D.normalize(JSON.parse(await file.text()));
      const counts=`인물 ${incoming.characters.length} · 사건 ${incoming.events.length} · 장소 ${incoming.locations.length} · 집단 ${incoming.groups.length}`;
      if(!confirm(`검증 완료: ${counts}\n이 백업으로 전체 데이터를 교체할까요? 현재 데이터는 복구 슬롯에 보관됩니다.`))return;
      checkpoint();data=store.import(incoming);saveError='';resetSelection();layout();toast('검증된 백업을 가져왔습니다. 이전 상태 복구가 가능합니다.');
    }catch(e){toast('가져오기 실패: '+e.message);}
  }
  function resetSelection(){window.ArchivePlan?.clearHistory?.();ui.selectedPerson=null;ui.selectedEvent=null;ui.selectedGroup=null;ui.selectedPlace=null;ui.search='';ui.eventFilter='';ui.statusFilter='';editKey='';}
  function recover(){if(!confirm('복구 슬롯의 데이터로 교체할까요? 현재 데이터도 복구 슬롯에 보관됩니다.'))return;try{checkpoint();data=store.recover();saveError='';resetSelection();layout();toast('이전 데이터를 복구했습니다.');}catch(e){toast('복구 실패: '+e.message);}}
  function handleAction(el){
    const a=el.dataset.action,id=el.dataset.id;
    if(conflict&&!['export'].includes(a)){toast('다른 창의 변경을 확인하려면 먼저 JSON 백업 후 새로고침하세요.');return;}
    editKey='';
    switch(a){
      case 'undo':undo();return;
      case 'redo':undo(true);return;
      case 'compare-cell':ui.selectedPerson=id;ui.personSeason=Number(el.dataset.season);break;
      case 'people-view':ui.peopleView=el.dataset.value;break;
      case 'event-view':ui.eventView=el.dataset.value;ui.eventFilter='';break;
      case 'tab': ui.tab=el.dataset.tab;ui.search='';break;
      case 'season':ui.season=Number(el.dataset.season);ui.personSeason=activeSeason();ui.selectedShape=null;break;
      case 'castfilter':ui.castFilter=el.dataset.filter;break;
      case 'bg-tab':ui.bgTab=el.dataset.value;ui.search='';ui.selectedShape=null;break;
      case 'new-person':createPerson();return;
      case 'new-event':createEvent();return;
      case 'new-place':createPlace();return;
      case 'new-group':createGroup();return;
      case 'select-person':ui.selectedPerson=id;ui.personSeason=ui.season||1;break;
      case 'person-season':ui.personSeason=Number(el.dataset.season);break;
      case 'select-event':ui.selectedEvent=id;break;
      case 'select-place':ui.selectedPlace=id;ui.selectedShape=null;break;
      case 'select-group':ui.selectedGroup=id;break;
      case 'jump-person':if(get('person',id)?.type==='guest')ui.season=get('person',id).homeSeason;ui.personSeason=activeSeason();ui.tab='people';ui.selectedPerson=id;ui.search='';ui.castFilter='all';break;
      case 'jump-event':ui.tab='events';ui.selectedEvent=id;ui.search='';ui.season=Number(get('event',id)?.season||ui.season);break;
      case 'jump-place':requestAnimationFrame(()=>APP.querySelector('[data-archive-plan]')?.scrollIntoView({block:'start'}));ui.tab='background';ui.bgTab='places';ui.selectedPlace=id;ui.search='';ui.selectedShape=null;break;
      case 'jump-group':ui.tab='background';ui.bgTab='groups';ui.selectedGroup=id;ui.search='';break;
      case 'delete-person':deleteRecord('person',id);return;
      case 'delete-event':deleteRecord('event',id);return;
      case 'delete-place':deleteRecord('place',id);return;
      case 'delete-group':deleteRecord('group',id);return;
      case 'move-event-up':moveEvent(id,-1);return;
      case 'move-event-down':moveEvent(id,1);return;
      case 'export':downloadBackup();return;
      case 'import':IMPORT.click();return;
      case 'recover':recover();return;
      default:return;
    }
    layout();
  }
  APP.addEventListener('click',ev=>{
    const node=ev.target.closest('[data-action]');
    if(node && APP.contains(node))handleAction(node);
  });
  APP.addEventListener('focusout',ev=>{if(ev.target.matches('[data-bind]'))editKey='';});
  APP.addEventListener('input',ev=>{
    const el=ev.target;
    if(el.matches('[data-search]')){
      const index=el.selectionStart??el.value.length;ui.search=el.value;layout();
      const newEl=APP.querySelector('[data-search]');if(newEl){newEl.focus();newEl.setSelectionRange(index,index)}
    }else if(el.matches('[data-bind]')&&el.type!=='checkbox'&&el.tagName!=='SELECT')boundUpdate(el);
  });
  APP.addEventListener('change',ev=>{
    const el=ev.target;
    if(el.matches('[data-status-filter]')){ui.statusFilter=el.value;layout();}
    else if(el.matches('[data-event-filter]')){ui.eventFilter=el.value;layout();}
    else if(el.matches('[data-bind]')&&(el.type==='checkbox'||el.tagName==='SELECT')){boundUpdate(el);layout();}
  });
  IMPORT.addEventListener('change',e=>{importBackup(e.target.files?.[0]);IMPORT.value=''});

  window.addEventListener('beforeunload',e=>{if(saveError||conflict){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',e=>{if(e.key===D.KEYS.current&&e.newValue!==null){conflict=true;updateSaveState();APP.querySelectorAll('[data-bind],[data-plan-action],[data-plan-field]').forEach(x=>x.disabled=true);}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.target.matches('input,textarea,select')&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}});
  if(loadError){APP.innerHTML=`<main class="fatal-error"><h1>저장 데이터를 안전하게 확인해야 합니다</h1><p>${esc(loadError)}</p><p>기존 저장 내용을 덮어쓰지 않았습니다. 원본을 내려받아 보관한 뒤 복구 슬롯이나 JSON 백업으로 복원하세요.</p><button id="download-raw" class="btn">저장 원본 내려받기</button><button id="load-recovery" class="btn">복구 슬롯 사용</button><input id="repair-file" type="file" accept="application/json,.json" aria-label="복원할 JSON 백업"></main>`;document.getElementById('download-raw').onclick=()=>{for(const key of Object.values(D.KEYS)){let raw=localStorage.getItem(key);if(raw)downloadText(raw,key+'.json');}};document.getElementById('load-recovery').onclick=()=>{try{store.recover();location.reload();}catch(e){toast(e.message);}};document.getElementById('repair-file').onchange=async e=>{try{const text=await e.target.files[0].text();D.normalize(JSON.parse(text));if(confirm('현재 원본을 먼저 내려받았나요? 검증된 백업으로 저장 데이터를 복원합니다.')){store.import(text);location.reload();}}catch(err){toast(err.message);}};}else layout();
})();
