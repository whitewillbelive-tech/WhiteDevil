/* Editable season-scoped floor plans. No network requests or third-party code. */
(() => {
  'use strict';
  const WIDTH = 1400, HEIGHT = 900;
  const types = [['room','공간 / 방'],['corridor','복도 / 통로'],['entrance','출입구'],['restricted','통제 구역'],['object','시설물']];
  const colors = {room:'#d9e5de',corridor:'#e7dfcc',entrance:'#d5dfeb',restricted:'#eed9d7',object:'#e3dcf0'};
  const sessions = new Map();
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = () => 'zone-'+(globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2));
  const numeric = (v,fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const color = z => /^#[0-9a-f]{6}$/i.test(z.color || '') ? z.color : (colors[z.type] || colors.room);
  function ink(z){
    if(z.display==='outline')return '#283e34';
    const rgb=color(z).slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    return luminance>.179?'#000000':'#ffffff';
  }
  const button = (action,label,attrs='') => `<button type="button" class="btn sm" data-plan-action="${action}" ${attrs}>${label}</button>`;
  function session(placeId,season){
    const key = `${placeId}/${season}`;
    if(!sessions.has(key)) sessions.set(key,{selected:null,zoom:1,pan:false,undo:[],redo:[],scrollX:0,scrollY:0});
    return sessions.get(key);
  }
  function zones(plan,state){
    return plan.map(z=>`<div class="wdplan-zone ${state.selected===z.id?'is-selected':''} wdplan-${esc(z.display||'solid')}" data-plan-zone="${esc(z.id)}" tabindex="0" role="button" aria-label="구역 ${esc(z.label||'이름 미정')}" style="left:${numeric(z.x,0)}px;top:${numeric(z.y,0)}px;width:${numeric(z.w,120)}px;height:${numeric(z.h,80)}px;--zone-color:${color(z)};--zone-ink:${ink(z)}"><span class="wdplan-zone-label">${esc(z.label||'이름 미정')}</span><small>${esc(types.find(t=>t[0]===z.type)?.[1]||'공간')}</small><span class="wdplan-resize" data-plan-resize aria-label="크기 조절" title="끌어서 크기 조절"></span></div>`).join('');
  }
  function eventLinks(events,selected){
    const list = selected ? events.filter(e=>e.zoneId===selected) : events;
    return `<div class="wdplan-linked"><strong>${selected?'선택 구역의 사건':'이 시즌 장소의 사건'} <span class="muted">${list.length}</span></strong>${list.length?`<div class="info-links">${list.map(e=>`<button type="button" class="mini-link" data-action="jump-event" data-id="${esc(e.id)}">S${esc(e.season)} · ${esc(e.title||'제목 미정')}</button>`).join('')}</div>`:'<p class="subtext">연결된 사건이 없습니다. 사건 편집 화면에서 이 장소와 구역을 지정하세요.</p>'}</div>`;
  }
  function inspector(plan,state,events){
    const z = plan.find(item=>item.id===state.selected);
    if(!z) return `<div class="wdplan-inspector"><p class="subtext">구역을 선택하면 이름·색상·좌표를 편집할 수 있습니다. 빈 배경을 끌거나 화면 이동 버튼으로 전개도를 이동하세요.</p>${eventLinks(events,null)}</div>`;
    return `<div class="wdplan-inspector"><div class="wdplan-fields"><label>구역 이름<input data-plan-field="label" value="${esc(z.label)}" aria-label="구역 이름"></label><label>구역 유형<select data-plan-field="type" aria-label="구역 유형">${types.map(([v,l])=>`<option value="${v}" ${z.type===v?'selected':''}>${l}</option>`).join('')}</select></label><label>구역 색상<input type="color" data-plan-field="color" value="${color(z)}" aria-label="구역 색상"></label><label>표시 방식<select data-plan-field="display" aria-label="표시 방식">${[['solid','색 채우기'],['outline','윤곽선'],['dashed','점선']].map(([v,l])=>`<option value="${v}" ${(z.display||'solid')===v?'selected':''}>${l}</option>`).join('')}</select></label>${[['x','가로 위치'],['y','세로 위치'],['w','너비'],['h','높이']].map(([v,l])=>`<label>${l}<input type="number" data-plan-field="${v}" value="${numeric(z[v],0)}" min="${v==='w'||v==='h'?20:0}" max="${v==='x'||v==='w'?WIDTH:HEIGHT}" step="1" aria-label="${l}"></label>`).join('')}<label class="wdplan-notes">구역 메모<textarea data-plan-field="notes" aria-label="구역 메모" rows="2">${esc(z.notes||'')}</textarea></label></div><div class="wdplan-toolbar">${button('duplicate','구역 복제')}${button('delete','구역 삭제')}</div>${eventLinks(events,z.id)}</div>`;
  }
  function render({placeId,season,plan=[],events=[]}){
    const state=session(placeId,season);
    if(!plan.some(z=>z.id===state.selected)) state.selected=null;
    return `<section class="wdplan" data-archive-plan data-plan-place="${esc(placeId)}" data-plan-season="${Number(season)}" aria-label="시즌 ${Number(season)} 장소 전개도"><div class="wdplan-heading"><div><h4>공간 전개도 <span class="pill gray">시즌 ${Number(season)} 독립 저장</span></h4><p class="subtext">구역을 끌어 이동하고 오른쪽 아래 모서리로 크기를 조절하세요.</p></div><span class="pill gray" data-plan-count>${plan.length}개 구역</span></div><div class="wdplan-toolbar">${types.map(([v,l])=>button('add',`+ ${l}`,`data-plan-type="${v}"`)).join('')}</div><div class="wdplan-toolbar wdplan-view-tools">${button('undo','↶ 실행 취소',`aria-label="전개도 실행 취소" ${state.undo.length?'':'disabled'}`)}${button('redo','↷ 다시 실행',`aria-label="전개도 다시 실행" ${state.redo.length?'':'disabled'}`)}<span class="wdplan-divider"></span>${button('zoom-out','−','aria-label="전개도 축소"')}<output data-plan-zoom>${Math.round(state.zoom*100)}%</output>${button('zoom-in','+','aria-label="전개도 확대"')}${button('reset-view','화면 맞춤')}${button('pan','화면 이동',`aria-pressed="${state.pan}"`)}</div><div class="wdplan-workspace" tabindex="0" aria-label="편집 가능한 전개도" style="cursor:${state.pan?'grab':'default'}"><div class="wdplan-surface" style="width:${WIDTH*state.zoom}px;height:${HEIGHT*state.zoom}px"><div class="wdplan-canvas" style="transform:scale(${state.zoom})">${zones(plan,state)}<div class="wdplan-caption">WHITE DEVIL · S${Number(season)} · GRID 20</div></div></div></div><div class="wdplan-toolbar wdplan-copy"><label>다른 시즌에서 복사 <select data-plan-copy-source aria-label="전개도 복사 원본 시즌">${Array.from({length:7},(_,i)=>i+1).filter(s=>s!==Number(season)).map(s=>`<option value="${s}">시즌 ${s}</option>`).join('')}</select></label>${button('copy','전개도 복사')}<small>복사는 현재 시즌만 변경합니다. 실행 취소로 되돌릴 수 있습니다.</small></div>${inspector(plan,state,events)}</section>`;
  }
  function mount(container,options){
    const roots = container.matches?.('[data-archive-plan]') ? [container] : [...container.querySelectorAll('[data-archive-plan]')];
    roots.forEach(root=>mountOne(root,options));
  }
  function mountOne(root,options){
    if(root.dataset.planMounted) return;
    root.dataset.planMounted='true';
    const placeId=root.dataset.planPlace,season=Number(root.dataset.planSeason),state=session(placeId,season);
    const getPlan=()=>options.getPlan(placeId,season);
    const getEvents=()=>options.getEvents?.(placeId,season)||[];
    const canEdit=()=>options.canEdit?.()!==false;
    const eventRefs=()=>getEvents().map(e=>({id:e.id,zoneId:e.zoneId||''}));
    let drag=null;
    const snapshot=()=>({plan:clone(getPlan()),refs:eventRefs()});
    const remember=()=>{state.undo.push(snapshot());if(state.undo.length>80)state.undo.shift();state.redo=[];};
    function notify(before,kind,beforeRefs=eventRefs()){
      const after=clone(getPlan()),ids=new Set(after.map(z=>z.id)),deletedIds=before.filter(z=>!ids.has(z.id)).map(z=>z.id);
      getEvents().forEach(e=>{if(deletedIds.includes(e.zoneId))e.zoneId='';});
      options.onChange?.({placeId,season,before,after,beforeRefs,kind,deletedIds});
    }
    function repaint(){
      const area=root.querySelector('.wdplan-workspace');
      if(area){state.scrollX=area.scrollLeft;state.scrollY=area.scrollTop;}
      const shell=document.createElement('div');shell.innerHTML=render({placeId,season,plan:getPlan(),events:getEvents()});
      const replacement=shell.firstElementChild;root.replaceWith(replacement);mountOne(replacement,options);
    }
    function mutate(kind,fn){if(!canEdit())return;const before=clone(getPlan()),beforeRefs=eventRefs();remember();fn();notify(before,kind,beforeRefs);repaint();}
    function restore(target,destination){
      if(!canEdit()||!target.length)return;
      const before=clone(getPlan()),beforeRefs=eventRefs(),saved=target.pop();destination.push(snapshot());
      getPlan().splice(0,getPlan().length,...clone(saved.plan));
      const refs=new Map(saved.refs.map(r=>[r.id,r.zoneId]));getEvents().forEach(e=>{if(refs.has(e.id))e.zoneId=refs.get(e.id);});
      notify(before,'undo',beforeRefs);repaint();
    }
    const area=root.querySelector('.wdplan-workspace');area.scrollLeft=state.scrollX;area.scrollTop=state.scrollY;
    area.addEventListener('scroll',()=>{state.scrollX=area.scrollLeft;state.scrollY=area.scrollTop;},{passive:true});
    root.addEventListener('click',event=>{
      const target=event.target.closest('[data-plan-action]');
      if(!target)return;
      event.stopPropagation();
      const action=target.dataset.planAction,plan=getPlan(),selected=plan.find(z=>z.id===state.selected);
      if(['add','delete','duplicate','undo','redo','copy'].includes(action)&&!canEdit())return;
      if(action==='add')mutate('add',()=>{const type=target.dataset.planType,z={id:id(),type,label:types.find(t=>t[0]===type)?.[1]||'새 구역',notes:'',x:40+(plan.length%8)*40,y:40+(Math.floor(plan.length/8)%8)*40,w:type==='corridor'?200:type==='entrance'?60:160,h:type==='corridor'||type==='entrance'?40:100,color:colors[type]||colors.room,display:'solid'};plan.push(z);state.selected=z.id;});
      else if(action==='delete'&&selected){const count=getEvents().filter(e=>e.zoneId===selected.id).length;if(count&&!confirm(`이 구역에 연결된 사건 ${count}개의 구역 연결이 해제됩니다. 구역을 삭제할까요?`))return;mutate('delete',()=>plan.splice(plan.indexOf(selected),1));}
      else if(action==='duplicate'&&selected)mutate('duplicate',()=>{const z={...clone(selected),id:id(),label:selected.label+' 복사',x:Math.min(WIDTH-selected.w,selected.x+20),y:Math.min(HEIGHT-selected.h,selected.y+20)};plan.push(z);state.selected=z.id;});
      else if(action==='undo')restore(state.undo,state.redo);
      else if(action==='redo')restore(state.redo,state.undo);
      else if(action==='copy'){
        const source=Number(root.querySelector('[data-plan-copy-source]').value),other=options.getPlan(placeId,source)||[];
        if(plan.length&&!confirm(`시즌 ${season}의 전개도를 시즌 ${source}의 전개도로 교체할까요? 현재 시즌만 변경되며 실행 취소할 수 있습니다.`))return;
        mutate('copy',()=>{plan.splice(0,plan.length,...clone(other));state.selected=null;});
      }else if(action==='pan'){state.pan=!state.pan;repaint();}
      else if(action==='zoom-in'||action==='zoom-out'){
        state.zoom=Math.max(.3,Math.min(2,state.zoom+(action==='zoom-in'?.15:-.15)));repaint();
      }else if(action==='reset-view'){state.zoom=Math.max(.3,Math.min(1,(area.clientWidth-10)/WIDTH));state.scrollX=state.scrollY=0;area.scrollLeft=area.scrollTop=0;repaint();}
    });
    root.addEventListener('input',event=>{
      const input=event.target.closest('[data-plan-field]');if(!input)return;
      event.stopPropagation();
      if(!canEdit()){repaint();return;}
      const z=getPlan().find(item=>item.id===state.selected);if(!z)return;
      const before=clone(getPlan());remember();const key=input.dataset.planField;
      if(['x','y','w','h'].includes(key)){
        const value=Number(input.value);if(!Number.isFinite(value))return;
        z[key]=Math.round(Math.max(key==='w'||key==='h'?20:0,Math.min(key==='x'?WIDTH-z.w:key==='y'?HEIGHT-z.h:key==='w'?WIDTH-z.x:HEIGHT-z.y,value)));
      }else z[key]=input.value;
      notify(before,'edit');
      const node=root.querySelector(`[data-plan-zone="${CSS.escape(z.id)}"]`);
      if(node){node.style.left=z.x+'px';node.style.top=z.y+'px';node.style.width=z.w+'px';node.style.height=z.h+'px';node.style.setProperty('--zone-color',color(z));node.style.setProperty('--zone-ink',ink(z));node.classList.remove('wdplan-solid','wdplan-outline','wdplan-dashed');node.classList.add('wdplan-'+(z.display||'solid'));node.querySelector('.wdplan-zone-label').textContent=z.label;node.querySelector('small').textContent=types.find(t=>t[0]===z.type)?.[1]||'공간';}
      root.querySelector('[data-plan-action="undo"]').disabled=false;
      root.querySelector('[data-plan-action="redo"]').disabled=true;
    });
    root.addEventListener('change',event=>{if(event.target.matches('[data-plan-field]'))event.stopPropagation();});
    area.addEventListener('pointerdown',event=>{
      if(event.button!==0&&event.button!==1)return;
      const element=event.target.closest('[data-plan-zone]'),z=element&&getPlan().find(item=>item.id===element.dataset.planZone);
      event.preventDefault();event.stopPropagation();
      if(z&&!state.pan&&event.button===0&&canEdit()){
        state.selected=z.id;
        root.querySelectorAll('[data-plan-zone]').forEach(el=>el.classList.toggle('is-selected',el===element));
        drag={mode:event.target.closest('[data-plan-resize]')?'resize':'move',z,start:clone(z),planRef:getPlan(),before:clone(getPlan()),clientX:event.clientX,clientY:event.clientY,moved:false};
      }else drag={mode:'pan',clientX:event.clientX,clientY:event.clientY,scrollX:area.scrollLeft,scrollY:area.scrollTop,moved:false};
      area.setPointerCapture(event.pointerId);
    });
    area.addEventListener('pointermove',event=>{
      if(!drag)return;
      if(drag.mode!=='pan'&&!canEdit())return;
      const dx=event.clientX-drag.clientX,dy=event.clientY-drag.clientY;
      if(Math.abs(dx)+Math.abs(dy)<2&&!drag.moved)return;
      if(!drag.moved&&drag.mode!=='pan')remember();drag.moved=true;
      if(drag.mode==='pan'){area.scrollLeft=drag.scrollX-dx;area.scrollTop=drag.scrollY-dy;return;}
      const z=drag.z;
      if(drag.mode==='move'){z.x=Math.round(Math.max(0,Math.min(WIDTH-z.w,drag.start.x+dx/state.zoom)));z.y=Math.round(Math.max(0,Math.min(HEIGHT-z.h,drag.start.y+dy/state.zoom)));}
      else{z.w=Math.round(Math.max(20,Math.min(WIDTH-z.x,drag.start.w+dx/state.zoom)));z.h=Math.round(Math.max(20,Math.min(HEIGHT-z.y,drag.start.h+dy/state.zoom)));}
      const node=root.querySelector(`[data-plan-zone="${CSS.escape(z.id)}"]`);node.style.left=z.x+'px';node.style.top=z.y+'px';node.style.width=z.w+'px';node.style.height=z.h+'px';
    });
    const finish=event=>{
      if(!drag)return;
      const done=drag;drag=null;
      if(area.hasPointerCapture(event.pointerId))area.releasePointerCapture(event.pointerId);
      if(done.mode!=='pan'&&done.moved){
        if(canEdit())notify(done.before,done.mode);
        else if(getPlan()===done.planRef){getPlan().splice(0,getPlan().length,...clone(done.before));state.undo.pop();}
      }
      if(done.mode!=='pan')repaint();
    };
    area.addEventListener('pointerup',finish);area.addEventListener('pointercancel',finish);
    root.addEventListener('keydown',event=>{
      if(event.target.matches('input,textarea,select'))return;
      if(!canEdit())return;
      const z=getPlan().find(item=>item.id===state.selected);
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();restore(event.shiftKey?state.redo:state.undo,event.shiftKey?state.undo:state.redo);return;}
      if(!z)return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const step=event.shiftKey?20:1;mutate('move',()=>{z.x=Math.max(0,Math.min(WIDTH-z.w,z.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0)));z.y=Math.max(0,Math.min(HEIGHT-z.h,z.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)));});}
      else if(event.key==='Delete'){event.preventDefault();event.stopPropagation();root.querySelector('[data-plan-action="delete"]')?.click();}
    });
  }
  window.ArchivePlan={render,mount,clearHistory:()=>{sessions.forEach(state=>{state.undo.length=0;state.redo.length=0;state.selected=null;});sessions.clear();}};
})();
