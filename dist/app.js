(() => {
  const R=globalThis.BianyuRules;
  const $=selector=>document.querySelector(selector);
  const all=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const grades=R.gradeNames;
  const fmt=value=>Number(value).toFixed(2);
  const storageKey='bianyu-v03';
  const sampleCampusColleges=['哲学与社会发展学院','经济学院','文学院','历史学院','考古学院','数学学院','物理学院','化学与化工学院','管理学院','马克思主义学院','国际教育学院','新闻传播学院','外国语学院','艺术学院','基础医学院','公共卫生学院','口腔医学院','护理与康复学院','药学院','材料科学与工程学院','机械工程学院','控制科学与工程学院','核科学与能源动力学院','电气工程学院','土建与水利学院','体育学院','软件学院','集成电路学院','密码科学与工程学院','人工智能学院','政治学与公共管理学院','法学院','信息科学与工程学院','计算机科学与技术学院','生命科学学院','环境科学与工程学院','网络空间安全学院'];
  const schema={
    character:{label:'人物',key:'characters',prefix:'p'},
    event:{label:'事件牌',key:'events',prefix:'e'},
    talent:{label:'专属天赋',key:'talents',prefix:'t'},
    bond:{label:'羁绊',key:'bonds',prefix:'b'}
  };
  const scopes=[['all','任意阶段'],['0','印象'],['1','环节'],['duo','双人自由辩'],['2','决胜']];
  const scoreEffects=[['flat','固定加分'],['percent','百分比加分']];
  const eventEffects=[...scoreEffects,['weaken','对方减分'],['guard','抵挡减分'],['draw','额外抽牌']];
  const upgrades=[8,12,16];
  let game=null, tab='character', editing=null;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)||'null'); } catch { return null; }
  }
  const previous=read('bianyu-demo-v1') || {};
  const state={dust:previous.dust??80,ink:previous.ink??20,xp:previous.xp??0,college:previous.college??'',
    team:[...R.initialTeam],deck:[...R.initialDeck],training:{},characters:[],events:[],talents:[],bonds:[],
    ...(read(storageKey)||{})};

  function fromLegacy(cards) {
    const content={characters:[],events:[]};
    for (const card of cards) {
      if (!card || typeof card.name!=='string') continue;
      const suffix=String(card.id||newId('old')).replace(/[^\w-]/g,'');
      if (card.type==='unit') {
        content.characters.push({id:'previous-p-'+suffix,name:card.name,campus:R.campuses[0],college:'',grade:0,
          stats:Array(5).fill(Math.min(100,60+(Number(card.power)||0)*3)),lore:card.lore||''});
      } else if (card.type==='event') {
        const effect=card.effect==='draw'?'draw':card.effect==='weaken'?'weaken':'flat';
        content.events.push({id:'previous-e-'+suffix,name:card.name,effect,value:effect==='draw'?1:5,
          phase:'all',lore:card.lore||''});
      }
    }
    return content;
  }

  if (!read(storageKey) && Array.isArray(previous.custom)) Object.assign(state,fromLegacy(previous.custom));
  function save() {
    try { localStorage.setItem(storageKey,JSON.stringify(state)); } catch { toast('浏览器无法保存，本次进度仅在当前页面有效。'); }
    renderProfile();
  }

  function toast(message) {
    const box=$('#toast');
    box.textContent=message;
    box.style.display='block';
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>{box.style.display='none';},2700);
  }

  function renderProfile() {
    const identity=state.college||'尚未选择学院';
    $('#collegeName').textContent=identity;
    for (const id of ['#collegeIcon','#profileBtn']) $(id).textContent=(state.college||'山')[0];
    $('#dust').textContent=state.dust;
    $('#ink').textContent=state.ink;
    $('#xpbar').style.width=(state.xp%100)+'%';
    $('#xptext').textContent='账号等级 '+(1+Math.floor(state.xp/100))+' · '+(state.xp%100)+'/100 成长经验';
  }

  function go(page) {
    all('.page').forEach(element=>element.classList.toggle('active',element.id===page));
    all('#nav button').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
    const labels={home:'探索首页',battle:'三票对局',collection:'卡牌工坊',rules:'游戏规则书',team:'校队正赛',developer:'开发者入口'};
    $('#breadcrumb').textContent='校队世界 / '+labels[page];
    if (page==='battle') game ? renderGame() : startGame();
    if (page==='collection') renderWorkshop();
    if (page==='developer') renderCreator();
    window.scrollTo(0,0);
  }

  function merge(base,custom) {
    return Object.fromEntries([...base,...custom].map(item=>[item.id,item]));
  }

  function catalogs() {
    const characters=merge(R.baseCharacters,state.characters);
    for (const [id,character] of Object.entries(characters)) {
      characters[id]={...character,talents:state.talents.filter(talent=>talent.character===id)};
    }
    return {characters,events:merge(R.baseEvents,state.events)};
  }

  function startGame() {
    const options=catalogs();
    const team=state.team.filter(id=>options.characters[id]);
    const deck=state.deck.filter(id=>options.events[id]);
    const playerTeam=team.length===4 ? team : [...R.initialTeam];
    const playerDeck=deck.length===15 ? deck : [...R.initialDeck];
    const enemyTeam=R.shuffle(R.baseCharacters.map(character=>character.id)).slice(0,4);
    function side(ids, cards, training) {
      const pile=R.shuffle(cards);
      return {team:ids,pile,hand:pile.splice(0,4),training,remaining:Object.fromEntries(ids.map(id=>[id,2])),
        bond:R.matchingBond(state.bonds,ids,options.characters)};
    }
    game={...options,player:side(playerTeam,playerDeck,{...state.training}),enemy:side(enemyTeam,R.initialDeck,{}),
      history:[],selection:[],slot:0,eventIndex:null,revealed:false,finished:false};
    if (team.length!==4 || deck.length!==15) toast('配置尚未完成，本局使用初始阵容或牌组。');
    renderGame();
  }

  function describeEvent(card) {
    if (card.effect==='guard') return '抵挡本轮对方的减分事件';
    if (card.effect==='draw') return '结算后多抽 '+card.value+' 张';
    if (card.effect==='weaken') return '对方本轮 '+(-card.value)+' 分';
    return '本轮得分 +'+card.value+(card.effect==='percent'?'%':' 分');
  }

  function scopeLabel(scope) { return scopes.find(entry=>entry[0]===scope)?.[1]||'任意阶段'; }
  function currentRound() { return game.history.length-(game.revealed?1:0); }

  function pickCharacter(id) {
    const candidate=[...game.selection];
    if (candidate[game.slot]===id) {
      candidate[game.slot]=null;
      game.selection=candidate;
      renderGame();
      return;
    }
    candidate[game.slot]=id;
    if (!legalChoices().some(lineup=>fits(lineup,candidate))) return;
    game.selection=candidate;
    const next=R.allPhases[currentRound()].roles.findIndex((_,index)=>!candidate[index]);
    if (next>=0) game.slot=next;
    renderGame();
  }

  function fits(lineup,picks) {return lineup.every((id,index)=>!picks[index]||picks[index]===id);}
  function legalChoices() { return R.legalLineups(game.player.team,game.player.remaining,currentRound()); }

  function pickEnemy(round) {
    const {enemy,characters}=game;
    const lineup=R.legalLineups(enemy.team,enemy.remaining,round)
      .map(ids=>({ids,priority:R.lineupBase(ids,characters,enemy.training,round)+Math.random()*18}))
      .sort((a,b)=>b.priority-a.priority)[0].ids;
    const events=enemy.hand.map((id,index)=>({card:game.events[id],index}))
      .filter(({card})=>R.phaseMatches(card.phase,round));
    const top=R.shuffle(events)[0];
    return {lineup,eventIndex:top && (round===5||Math.random()>.25) ? top.index : null};
  }

  function reveal() {
    const round=currentRound();
    const lineup=legalChoices().find(choice=>fits(choice,game.selection));
    if (!lineup || lineup.some((id,index)=>id!==game.selection[index])) return;
    const opponent=pickEnemy(round);
    const getEvent=(side,index)=>index===null?null:game.events[side.hand[index]];
    const events={player:getEvent(game.player,game.eventIndex),enemy:getEvent(game.enemy,opponent.eventIndex)};
    const result={};
    for (const key of ['player','enemy']) {
      const own=game[key];
      const ids=key==='player'?lineup:opponent.lineup;
      const other=key==='player'?'enemy':'player';
      const event=events[key];
      result[key]={lineup:ids,event,...R.scoreRound({round,lineup:ids,characters:game.characters,
        training:own.training,event,opponentEvent:events[other],bond:own.bond})};
      own.remaining=R.spendAppearances(own.remaining,ids);
      const used=key==='player'?game.eventIndex:opponent.eventIndex;
      if (used!==null) own.hand.splice(used,1);
      if (event?.effect==='draw') own.hand.push(...own.pile.splice(0,event.value));
    }
    game.history.push(result);
    game.revealed=true;
    if (game.history.length===6) {
      const votes=R.roundVotes(game.history);
      const total=votes.reduce((points,tally)=>points+tally[0],0);
      game.finished=true;
      game.outcome=total>1.5?'胜利':total<1.5?'惜败':'平局';
      const won=total>1.5;
      game.reward=won?[18,8,30]:[10,5,18];
      const [dust,ink,xp]=game.reward;
      state.dust+=dust; state.ink+=ink; state.xp+=xp;
      save();
    }
    renderGame();
    $('#roundResult').scrollIntoView({block:'nearest'});
  }

  function advance() {
    for (const team of [game.player,game.enemy]) team.hand.push(...team.pile.splice(0,1));
    game.selection=[];
    game.eventIndex=null;
    game.slot=0;
    game.revealed=false;
    renderGame();
  }

  function renderGame() {
    const round=currentRound();
    const phase=R.allPhases[round];
    const tallies=R.roundVotes(game.history);
    $('#voteBoard').innerHTML=R.voteNames.map((name,index)=>{
      const tally=tallies[index];
      const status=tally?(tally[0]===tally[1]?'各半票':tally[0]>tally[1]?'你方得票':'对方得票'):'待结算';
      return '<div class="vote-tile '+(phase.vote===index?'current':'')+'"><span>'+name+'票</span><strong>'+status+'</strong></div>';
    }).join('');
    $('#roundText').textContent='第 '+(round+1)+' / 6 轮 · '+R.voteNames[phase.vote]+'票';
    $('#phaseName').textContent=game.finished?'对局结束 · '+game.outcome:phase.name;
    const voteTotal=game.finished?tallies.reduce((sum,tally)=>sum+tally[0],0):null;
    $('#battleHint').textContent=game.finished?'最终票数 · 你方 '+voteTotal+' : '+(3-voteTotal)+' 对方':phase.roles.length===2?
      '两位不同人物分别承担两个位置。点击当前已选人物可取消。':'派出一名人物，可以同时打出一张事件。';
    const result=$('#roundResult');
    result.innerHTML=game.revealed?renderResult(game.history[round],phase):'';
    $('#battleControls').hidden=game.revealed;
    if (game.revealed) {
      if (game.finished) {
        const [dust,ink,xp]=game.reward;
        result.insertAdjacentHTML('beforeend','<div class="round-actions"><span>奖励 · '+dust+' 灵感 / '+ink+' 墨迹 / '+xp+' 经验</span><button class="primary" id="advanceRound">再来一局</button></div>');
        $('#advanceRound').onclick=startGame;
      } else {
        result.insertAdjacentHTML('beforeend','<div class="round-actions"><button class="primary" id="advanceRound">进入下一轮</button></div>');
        $('#advanceRound').onclick=advance;
      }
    } else renderPicks(phase,round);
    $('#battleLog').innerHTML=game.history.length ? game.history.map((past,index)=>
      '<div>'+R.allPhases[index].name+' · '+fmt(past.player.total)+' 对 '+fmt(past.enemy.total)+'</div>').reverse().join(''):'<p>完成首轮后显示比分。</p>';
  }

  function renderResult(past,phase) {
    return '<div class="result-grid">'+['player','enemy'].map(key=>{
      const side=past[key];
      const label=key==='player'?'你方':'对方';
      const names=side.lineup.map((id,i)=>phase.roles[i]+' '+esc(game.characters[id].name)).join(' · ');
      const adjustments=side.modifiers.map(modifier=>esc(modifier.label)+' '+(modifier.value>=0?'+':'')+
        modifier.value+(modifier.effect==='percent'?'%':'')).join('，');
      return '<div><span class="muted">'+label+'</span><strong>'+fmt(side.total)+'</strong><p>'+names+
        '</p><p>事件：'+esc(side.event?.name||'未使用')+'</p><small>基础 '+fmt(side.base)+
        (adjustments?' · '+adjustments:'')+'</small></div>';
    }).join('')+'</div>';
  }

  function renderPicks(phase,round) {
    const choices=legalChoices();
    const player=game.player;
    $('#rolePicks').innerHTML=phase.roles.map((role,index)=>'<button class="chip '+(game.slot===index?'active':'')+
      '" data-slot="'+index+'">'+role+' · '+esc(game.characters[game.selection[index]]?.name||'待选')+'</button>').join('');
    all('[data-slot]').forEach(button=>button.onclick=()=>{game.slot=Number(button.dataset.slot); renderGame();});
    $('#rosterPicks').innerHTML=player.team.map((id,index)=>{
      const person=game.characters[id];
      const candidate=[...game.selection];
      candidate[game.slot]=id;
      const legal=choices.some(lineup=>fits(lineup,candidate));
      return '<button class="roster-card '+(game.selection.includes(id)?'chosen':'')+'" data-pick="'+index+
        '" '+(legal?'':'disabled')+'><small>'+esc(person.campus)+' · '+grades[person.grade]+'</small><strong>'+esc(person.name)+
        '</strong><span>剩余 '+player.remaining[id]+' 次</span></button>';
    }).join('');
    all('[data-pick]').forEach(button=>button.onclick=()=>pickCharacter(player.team[Number(button.dataset.pick)]));
    const hand=$('#hand');
    const handScroll=hand.scrollLeft;
    hand.innerHTML=player.hand.length?player.hand.map((id,index)=>{
      const event=game.events[id];
      return '<button class="game-card event '+(game.eventIndex===index?'selected':'')+'" data-hand="'+index+'" '+
        (R.phaseMatches(event.phase,round)?'':'disabled')+'><span class="card-top">'+scopeLabel(event.phase)+
        '</span><strong>'+esc(event.name)+'</strong><p>'+describeEvent(event)+'</p></button>';
    }).join(''):'<p>当前没有事件手牌。</p>';
    hand.scrollLeft=handScroll;
    all('[data-hand]').forEach(button=>button.onclick=()=>{
      const index=Number(button.dataset.hand);
      game.eventIndex=game.eventIndex===index?null:index;
      renderGame();
    });
    const ready=choices.some(lineup=>lineup.every((id,index)=>id===game.selection[index]));
    $('#confirmRound').disabled=!ready;
    $('#estimate').textContent=ready?'预计基础分 '+fmt(R.lineupBase(game.selection,game.characters,player.training,round)):'先选齐本轮出场人物';
  }

  function renderWorkshop() {
    const {characters,events}=catalogs();
    const bond=R.matchingBond(state.bonds,state.team,characters);
    $('#teamCounter').textContent=state.team.length+' / 4'+(bond?' · 羁绊 '+bond.name:'');
    $('#deckCounter').textContent=state.deck.length+' / 15';
    $('#characterGrid').innerHTML=Object.values(characters).map((person,index)=>{
      const inTeam=state.team.includes(person.id);
      const tier=state.training[person.id]||0;
      return '<article class="workshop-card '+(inTeam?'chosen':'')+'"><span class="kicker">'+esc(person.campus)+
        (person.college?' · '+esc(person.college):'')+'</span><h3>'+esc(person.name)+'</h3><small>'+grades[person.grade]+' · 培养 '+tier+
        '</small><p class="stat-line">'+person.stats.map((stat,i)=>R.statNames[i]+' '+stat).join(' · ')+'</p>'+
        '<div class="form-actions"><button class="secondary" data-team-pick="'+index+'">'+(inTeam?'移出阵容':'加入阵容')+'</button>'+
        '<button class="chip" data-upgrade="'+index+'" '+(tier>=upgrades.length?'disabled':'')+'>'+
        (tier>=upgrades.length?'已满阶':'培养 · '+upgrades[tier]+' 墨迹')+'</button></div></article>';
    }).join('');
    const people=Object.values(characters);
    all('[data-team-pick]').forEach(button=>button.onclick=()=>{
      const {id}=people[Number(button.dataset.teamPick)];
      if (state.team.includes(id)) state.team=state.team.filter(item=>item!==id);
      else if (state.team.length<4) state.team.push(id);
      else return toast('先移出一名人物，再加入新人物。');
      save(); renderWorkshop();
    });
    all('[data-upgrade]').forEach(button=>button.onclick=()=>{
      const {id}=people[Number(button.dataset.upgrade)];
      const tier=state.training[id]||0;
      if (state.ink<upgrades[tier]) return toast('墨迹不足，可以通过对局获得。');
      if (tier>=upgrades.length) return;
      state.ink-=upgrades[tier];
      state.training[id]=tier+1;
      save(); renderWorkshop();
    });
    const items=Object.values(events);
    $('#eventGrid').innerHTML=items.map((event,index)=>{
      const count=state.deck.filter(id=>id===event.id).length;
      return '<article class="workshop-card '+(count?'chosen':'')+'"><span class="kicker">'+scopeLabel(event.phase)+
        '</span><h3>'+esc(event.name)+'</h3><p>'+describeEvent(event)+'</p><div class="event-quantity"><button class="chip" data-remove-event="'+
        index+'" aria-label="移出一张 '+esc(event.name)+'" '+(count?'':'disabled')+'>−</button><strong>'+count+
        ' / 2</strong><button class="chip" data-add-event="'+index+'" aria-label="加入一张 '+esc(event.name)+
        '" '+(count===2?'disabled':'')+'>+</button></div></article>';
    }).join('');
    all('[data-remove-event]').forEach(button=>button.onclick=()=>{
      const index=state.deck.indexOf(items[Number(button.dataset.removeEvent)].id);
      state.deck.splice(index,1); save(); renderWorkshop();
    });
    all('[data-add-event]').forEach(button=>button.onclick=()=>{
      if (state.deck.length===15) return toast('牌组已满，先移出一张事件牌。');
      state.deck.push(items[Number(button.dataset.addEvent)].id); save(); renderWorkshop();
    });
  }

  function newId(prefix) {
    return prefix+'-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));
  }

  function input(label,name,value,attrs='') {
    return '<label>'+label+'<input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
  }
  function select(label,name,choices,value) {
    return '<label>'+label+'<select name="'+name+'">'+choices.map(([id,text])=>
      '<option value="'+esc(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';
  }
  const number=(label,name,value,min,max)=>input(label,name,value,'type="number" min="'+min+'" max="'+max+'" step="1" required');
  const lore=value=>'<label>故事／校队梗<textarea name="lore" rows="3" maxlength="120">'+esc(value)+'</textarea></label>';

  function creatorItems() {
    const {characters,events}=catalogs();
    if (tab==='character') return Object.values(characters);
    if (tab==='event') return Object.values(events);
    return state[schema[tab].key];
  }

  function renderCreator() {
    const catalog=catalogs();
    const persons=Object.values(catalog.characters).map(person=>[person.id,person.name]);
    const camp=R.campuses.map(name=>[name,name]);
    const items=creatorItems();
    const item=editing?items.find(entry=>entry.id===editing)||{}:{};
    $('#creatorTabs').innerHTML=Object.entries(schema).map(([id,{label}])=>'<button class="chip '+(id===tab?'active':'')+
      '" data-creator="'+id+'">'+label+'</button>').join('');
    all('[data-creator]').forEach(button=>button.onclick=()=>{tab=button.dataset.creator;editing=null;renderCreator();});
    $('#creatorListTitle').textContent=schema[tab].label+'列表';
    $('#creatorList').innerHTML=items.length?items.map((entry,index)=>'<div class="custom-item"><strong>'+esc(entry.name)+
      '</strong><button data-edit="'+index+'">编辑</button></div>').join(''):'<p>尚未配置。可以在左侧新增。</p>';
    all('[data-edit]').forEach(button=>button.onclick=()=>{editing=items[Number(button.dataset.edit)].id;renderCreator();$('#creatorForm').scrollIntoView({block:'nearest'});});
    let fields=input(schema[tab].label+'名称','name',item.name,'required maxlength="30"');
    if (tab==='character') {
      fields+='<div class="form-row">'+select('校区','campus',camp,item.campus)+select('年级','grade',grades.map((grade,i)=>[i,grade]),item.grade)+
        '</div>'+input('学院（可以留空）','college',item.college,'maxlength="40"')+
        '<div class="attribute-fields">'+R.statNames.map((name,i)=>number(name,'stat'+i,item.stats?.[i]??65,0,100)).join('')+'</div>'+lore(item.lore);
    } else {
      if (tab==='talent') fields+=select('所属人物','character',persons,item.character)+number('解锁培养阶','tier',item.tier??1,0,3);
      if (tab==='bond') fields+=select('羁绊类型','kind',[['campus','同校区'],['college','同学院'],['pair','指定人物搭配']],item.kind)+
        '<div data-bond-fields="campus">'+select('校区','campus',camp,item.campus||item.key)+'</div>'+
        '<div data-bond-fields="college">'+input('学院','college',item.kind==='college'?item.key:'','maxlength="40"')+'</div>'+
        '<div data-bond-fields="pair" class="form-row">'+select('人物一','first',persons,item.first)+
        select('人物二','second',persons,item.second||persons[1][0])+'</div>'+
        '<div data-bond-fields="count">'+number('至少满足人数','count',item.count??2,2,4)+'</div>'+
        select('触发方式','together',[['false','满足阵容条件'],['true','符合条件的人物同轮出场']],item.together??false);
      fields+='<div class="form-row">'+select('生效阶段','phase',scopes,item.phase)+
        select('效果','effect',tab==='event'?eventEffects:scoreEffects,item.effect)+'</div>'+
        number('效果数值（分 / % / 张）','value',item.value??4,0,25);
      if (tab==='event') fields+=lore(item.lore);
    }
    const form=$('#creatorForm');
    form.innerHTML='<h2>'+(item.id?'编辑':'新建')+schema[tab].label+'</h2>'+fields+
      '<div class="form-actions"><button class="primary" type="submit">保存</button><button class="secondary" type="button" id="clearCreator">'+
      (item.id?'新建一项':'清空表单')+'</button></div>';
    $('#clearCreator').onclick=()=>{editing=null;renderCreator();};
    if (tab==='bond') {
      const toggle=()=>{
        const kind=form.elements.kind.value;
        for (const element of all('[data-bond-fields]')) {
          const field=element.dataset.bondFields;
          element.hidden=field==='campus'?kind==='pair':field==='count'?kind==='pair':field!==kind;
        }
      };
      form.elements.kind.onchange=toggle;
      toggle();
    }
    form.onsubmit=submitCreator;
  }

  function submitCreator(event) {
    event.preventDefault();
    const values=Object.fromEntries(new FormData(event.currentTarget).entries());
    const type=schema[tab];
    const entry={id:editing||newId(type.prefix),name:values.name.trim()};
    if (!entry.name) return toast('请输入名称。');
    if (tab==='character') Object.assign(entry,{campus:values.campus,college:values.college.trim(),
      grade:Number(values.grade),stats:R.statNames.map((_,i)=>Number(values['stat'+i])),lore:values.lore.trim()});
    else {
      Object.assign(entry,{phase:values.phase,effect:values.effect,value:Number(values.value)});
      if (tab==='event') {
        entry.lore=values.lore.trim();
        if (entry.effect==='guard') entry.value=0;
        if (entry.effect==='draw' && (entry.value<1||entry.value>3)) return toast('抽牌数量请设为 1 至 3。');
      }
      if (tab==='talent') Object.assign(entry,{character:values.character,tier:Number(values.tier)});
      if (tab==='bond') {
        Object.assign(entry,{kind:values.kind,campus:values.campus,key:values.kind==='college'?values.college.trim():values.campus,
          first:values.first,second:values.second,count:values.kind==='pair'?2:Number(values.count),together:values.together==='true'});
        if (entry.kind==='pair'&&entry.first===entry.second) return toast('请选择两名不同人物。');
        if (entry.kind==='college'&&!entry.key) return toast('请输入要匹配的学院。');
        if (entry.together&&entry.count>2) return toast('同轮出场条件最多支持 2 人。');
      }
    }
    const destination=state[type.key];
    const index=destination.findIndex(item=>item.id===entry.id);
    if (index>=0) destination[index]=entry;
    else destination.push(entry);
    save();
    editing=entry.id;
    renderCreator();
    toast('已保存，下次开局生效。');
  }

  function validateContent(data) {
    const checked={};
    const id=value=>typeof value==='string'&&/^[a-z][\w-]{0,90}$/i.test(value);
    const text=(value,max)=>typeof value==='string'&&value.length<=max;
    const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
    const basic=entry=>entry&&id(entry.id)&&text(entry.name,30)&&entry.name.trim();
    const score=(entry,allowEvents)=>scopes.some(([name])=>name===entry.phase)&&
      (allowEvents?eventEffects:scoreEffects).some(([effect])=>effect===entry.effect)&&integer(entry.value,0,25);
    const validators={
      characters:c=>R.campuses.includes(c.campus)&&text(c.college,40)&&integer(c.grade,0,3)&&
        Array.isArray(c.stats)&&c.stats.length===5&&c.stats.every(n=>integer(n,0,100))&&text(c.lore,120),
      events:c=>score(c,true)&&text(c.lore,120)&&(c.effect!=='draw'||integer(c.value,1,3)),
      talents:c=>score(c,false)&&integer(c.tier,0,3)&&id(c.character),
      bonds:c=>score(c,false)&&typeof c.together==='boolean'&&integer(c.count,2,c.together?2:4)&&
        ((c.kind==='pair'&&c.count===2&&id(c.first)&&id(c.second)&&c.first!==c.second)||
          (c.kind==='campus'&&R.campuses.includes(c.key))||
          (c.kind==='college'&&R.campuses.includes(c.campus)&&text(c.key,40)&&c.key.trim()))
    };
    for (const [key,validate] of Object.entries(validators)) {
      const list=data[key]||[];
      if (!Array.isArray(list)||list.length>250||!list.every(item=>basic(item)&&validate(item))) throw Error();
      checked[key]=list;
    }
    return checked;
  }

  $('#nav').addEventListener('click',event=>{
    const button=event.target.closest('[data-page]');
    if (button) go(button.dataset.page);
  });
  all('[data-go]').forEach(button=>button.onclick=()=>go(button.dataset.go));
  $('#collegeGrid').innerHTML=sampleCampusColleges.map(name=>'<button type="button">'+esc(name)+'</button>').join('');
  all('#collegeGrid button').forEach(button=>button.onclick=()=>{
    state.college=button.textContent; save(); $('#collegeDialog').close(); toast('学院身份已选择。');
  });
  $('#profileBtn').onclick=$('#collegeBtn').onclick=()=>$('#collegeDialog').showModal();
  $('#newGame').onclick=()=>{
    if (game.history.length&&!game.finished&&!window.confirm('重新开局会放弃当前进度，继续吗？')) return;
    startGame();
  };
  $('#confirmRound').onclick=reveal;
  $('#resetDeck').onclick=()=>{state.team=[...R.initialTeam];state.deck=[...R.initialDeck];save();renderWorkshop();};
  $('#exportCards').onclick=()=>{
    const content=Object.fromEntries(Object.values(schema).map(({key})=>[key,state[key]]));
    const url=URL.createObjectURL(new Blob([JSON.stringify({format:'bianyu-three-votes-v1',...content},null,2)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='辩域三票内容.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('#importCards').onchange=async event=>{
    const file=event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size>1000000) throw Error();
      const content=JSON.parse(await file.text());
      const data=content.format==='bianyu-cards-v1'&&Array.isArray(content.cards)?fromLegacy(content.cards):
        content.format==='bianyu-three-votes-v1'?content:null;
      if (!data) throw Error();
      const checked=validateContent(data);
      let added=0;
      for (const [key,items] of Object.entries(checked)) {
        state[key]=Object.values(merge(state[key],items));
        added+=items.length;
      }
      save(); renderCreator();
      toast('已导入 '+added+' 项设计。同 ID 内容已更新。');
    } catch { toast('无法导入，请检查 JSON 文件及字段格式。'); }
    event.target.value='';
  };
  renderProfile();
  if (!state.college) $('#collegeDialog').showModal();
})();
