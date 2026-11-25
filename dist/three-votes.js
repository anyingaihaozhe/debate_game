(() => {
  const allPhases = [
    { name: '开场陈词', vote: 0, roles: ['主陈'], weights: [[40,10,35,10,5]] },
    { name: '印象交锋', vote: 0, roles: ['主陈'], weights: [[40,10,35,10,5]] },
    { name: '定点质询', vote: 1, roles: ['质询'], weights: [[10,45,5,35,5]] },
    { name: '自由辩 · 驳论', vote: 1, roles: ['主攻', '接应'], weights: [[20,30,5,35,10],[10,40,5,25,20]] },
    { name: '自由辩 · 小结', vote: 1, roles: ['归纳', '补位'], weights: [[25,10,5,25,35],[15,30,10,25,20]] },
    { name: '决胜结辩', vote: 2, roles: ['结辩'], weights: [[20,15,10,20,35]] }
  ];
  const statNames = ['陈词','反应','风度','论证','统筹'];
  const campuses = ['中心','洪家楼','趵突泉','兴隆山','软件园','青岛'];
  const voteNames = ['印象','环节','决胜'];
  const gradeNames = ['大一','大二','大三','大四'];
  const baseCharacters = [
    ['初稿主笔',0,0,[82,56,74,68,60]],
    ['即席追问',1,1,[58,83,67,76,56]],
    ['安静收束',5,2,[69,56,64,72,79]],
    ['交锋搭档',3,1,[66,76,61,77,60]],
    ['稳场发言',2,2,[72,58,83,60,67]],
    ['板书拆解',4,3,[60,70,58,88,70]]
  ].map(([name,campus,grade,stats],i) => ({id:'p'+i,name,campus:campuses[campus],college:'',grade,stats,talents:[],lore:'试玩人物'}));
  const baseEvents = [
    ['还有五分钟交稿','flat',6,'all'],
    ['补上一条证据','flat',9,'1'],
    ['先听我说完','guard',0,'all'],
    ['翻到下一页','draw',1,'all'],
    ['开场气势','percent',12,'0'],
    ['话锋一转','weaken',6,'all'],
    ['默契接棒','percent',12,'duo'],
    ['最后一句','flat',9,'2']
  ].map(([name,effect,value,phase],i) => ({id:'e'+i,name,effect,value,phase,lore:''}));
  const initialTeam = ['p0','p1','p2','p3'];
  const initialDeck = baseEvents.flatMap((event,i) => Array(i===7?1:2).fill(event.id));

  function shuffle(items, rng=Math.random) {
    const copy = [...items];
    for (let i=copy.length-1; i>0; i--) {
      const j=Math.floor(rng()*(i+1));
      [copy[i],copy[j]]=[copy[j],copy[i]];
    }
    return copy;
  }

  function availableLineups(team, remaining, round) {
    const eligible=team.filter(id => remaining[id]>0);
    if (allPhases[round].roles.length===1) return eligible.map(id => [id]);
    return eligible.flatMap(id => eligible.filter(other => other!==id).map(other => [id,other]));
  }

  function canComplete(team, remaining, round) {
    if (round===allPhases.length) return true;
    if (team.some(id => remaining[id]>allPhases.length-round)) return false;
    return availableLineups(team,remaining,round).some(lineup =>
      canComplete(team,spendAppearances(remaining,lineup),round+1));
  }

  function spendAppearances(remaining, lineup) {
    const result={...remaining};
    for (const id of lineup) result[id]--;
    return result;
  }

  function legalLineups(team, remaining, round) {
    return availableLineups(team,remaining,round).filter(lineup =>
      canComplete(team,spendAppearances(remaining,lineup),round+1));
  }

  function phaseMatches(scope, round) {
    const phase=allPhases[round];
    return scope==='all' || scope===String(phase.vote) || (scope==='duo' && phase.roles.length===2);
  }

  function lineupBase(lineup, characters, training, round) {
    const phase=allPhases[round];
    const individual=lineup.map((id,position) => {
      const character=characters[id];
      const gradeBonus=character.grade*2;
      const growth=training[id] || 0;
      return character.stats.reduce((sum,stat,i) =>
        sum+(stat+gradeBonus+growth)*phase.weights[position][i]/100,0);
    });
    return individual.reduce((total,score) => total+score,0)/individual.length;
  }

  function bondCount(bond, ids, characters) {
    if (bond.kind==='pair') return bond.first!==bond.second &&
      ids.includes(bond.first) && ids.includes(bond.second) ? 2 : 0;
    return ids.filter(id => {
      const p=characters[id];
      return bond.kind==='campus' ? p.campus===bond.key : p.campus===bond.campus && p.college===bond.key;
    }).length;
  }

  function matchingBond(bonds, team, characters) {
    return bonds.find(bond => bondCount(bond,team,characters)>=bond.count) || null;
  }

  function scoreRound({round,lineup,characters,training,event,opponentEvent,bond}) {
    const base=lineupBase(lineup,characters,training,round);
    const modifiers=[];
    const add=(label,effect,value) => modifiers.push({label,effect,value});
    if (event && ['flat','percent'].includes(event.effect)) add(event.name,event.effect,event.value);
    if (opponentEvent?.effect==='weaken' && event?.effect!=='guard') add(opponentEvent.name,'flat',-opponentEvent.value);
    for (const id of lineup) {
      for (const talent of characters[id].talents) {
        if ((training[id] || 0)>=talent.tier && phaseMatches(talent.phase,round)) {
          add(characters[id].name+' · '+talent.name,talent.effect,talent.value);
        }
      }
    }
    if (bond && phaseMatches(bond.phase,round) &&
        (!bond.together || bondCount(bond,lineup,characters)>=bond.count)) {
      add(bond.name,bond.effect,bond.value);
    }
    const sum=effect => modifiers.filter(m => m.effect===effect).reduce((total,m) => total+m.value,0);
    const percentage=Math.min(25,sum('percent'));
    return {base,modifiers,percentage,total:Math.round(Math.max(0,(base+sum('flat'))*(1+percentage/100))*100)/100};
  }

  function roundVotes(history) {
    const compare=(a,b) => a===b ? [.5,.5] : a>b ? [1,0] : [0,1];
    const sum=(past,side) => Math.round(past.reduce((total,item) => total+item[side].total,0)*100)/100;
    const impression=history.slice(0,2);
    const events=history.slice(2,5);
    const sections=events.map(round => compare(round.player.total,round.enemy.total));
    const subtotals=sections.reduce(([left,right],[a,b]) => [left+a,right+b],[0,0]);
    const final=side => Math.round((sum(history.slice(0,5),side)*.06+history[5][side].total*.7)*100)/100;
    return [
      impression.length===2 ? compare(sum(impression,'player'),sum(impression,'enemy')) : null,
      sections.length===3 ? compare(...subtotals) : null,
      history.length===6 ? compare(final('player'),final('enemy')) : null
    ];
  }

  const rules={allPhases,statNames,campuses,voteNames,gradeNames,baseCharacters,baseEvents,initialTeam,initialDeck,
    shuffle,legalLineups,spendAppearances,phaseMatches,lineupBase,matchingBond,scoreRound,roundVotes};
  if (typeof module!=='undefined') module.exports=rules;
  else globalThis.BianyuRules=rules;
})();
