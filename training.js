(() => {
  const reward = 16;
  const categories = ['队内训练', '模拟赛', '陪练与复盘', '正式赛'];
  const tidyName = value => value.trim().replace(/\s+/g, ' ').normalize('NFC');
  const parseRoster = value => [...new Set(value.split(/\r?\n/).map(tidyName).filter(Boolean))];
  const initialState = () => ({member:'', sessions:[]});

  function settleRewards(record) {
    if (!record.member) return 0;
    let earned = 0;
    for (const session of record.sessions) {
      if (session.confirmed && !session.claimedBy && session.roster.includes(record.member)) {
        session.claimedBy = record.member;
        earned += reward;
      }
    }
    return earned;
  }

  function mount({state, save, toast, esc, newId}) {
    const $ = selector => document.querySelector(selector);
    const root = $('#trainingHub');
    const record = state.trainingLog ??= initialState();
    let editing = '';

    function persist(message) {
      const earned = settleRewards(record);
      state.ink += earned;
      save();
      render();
      toast(earned ? message+'，已到账 '+earned+' 墨迹。' : message+'。');
    }

    function render() {
      const draft = record.sessions.find(session => session.id===editing && !session.confirmed);
      const today = new Date();
      const localDate = new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
      const form = '<form id="sessionForm" class="dev-form"><h3>'+(draft?'录入参与名单':'登记一场赛训')+
        '</h3><label>场次名称<input name="title" maxlength="60" required value="'+esc(draft?.title||'')+'"></label>'+
        '<div class="form-row"><label>日期<input name="date" type="date" required value="'+esc(draft?.date||localDate)+
        '"></label><label>类型<select name="category">'+categories.map(category=>
          '<option '+(draft?.category===category?'selected':'')+'>'+category+'</option>').join('')+
        '</select></label></div><label>参与者姓名，每行一位<textarea name="roster" rows="4" maxlength="1800" placeholder="参训、陪练、评委都可列入">'+
        esc(draft?.roster.join('\n')||'')+'</textarea></label>'+
        '<div class="form-actions"><button class="primary" value="draft">保存待确认</button>'+
        '<button class="secondary" value="confirm">确认名单</button>'+
        (draft?'<button class="chip" type="button" id="newSession">另建场次</button>':'')+'</div></form>';
      root.innerHTML='<div class="training-top"><div><span class="kicker">校队赛训</span><h2>赛训记录与墨迹奖励</h2>'+
        '<p>保存场次，录入名单，确认后，名单内的当前试玩身份获得 '+reward+
        ' 墨迹。每场在本浏览器只结算一次。</p></div><form id="memberForm"><label>当前试玩身份<input name="member" required maxlength="30" value="'+
        esc(record.member)+'" placeholder="填写名单上的名字"></label><button class="chip">保存身份</button></form></div>'+
        '<p class="training-note">场次、名单和奖励仅在当前浏览器记录。正式队内使用需要成员登录、组织者权限和跨设备同步。</p>'+
        '<div class="training-grid"><div>'+form+'</div><div><h3>历史场次</h3><div id="sessionList">'+
        (record.sessions.length?[...record.sessions].reverse().map(renderSession).join(''):'<p>暂无赛训场次。</p>')+'</div></div></div>';
      $('#memberForm').onsubmit = event => {
        event.preventDefault();
        const member = tidyName(event.currentTarget.elements.member.value);
        if (!member) return toast('请填写试玩身份。');
        record.member=member;
        persist('身份已保存');
      };
      $('#sessionForm').onsubmit = saveSession;
      if (draft) $('#newSession').onclick = () => {editing='';render();};
      root.querySelectorAll('[data-session]').forEach(button => {
        button.onclick=()=>{editing=button.dataset.session;render();};
      });
    }

    function renderSession(session) {
      const status = session.confirmed ? '名单已确认' : '待确认';
      const claimed = session.claimedBy ? '<span class="training-status">已发放 '+reward+' 墨迹</span>' : '';
      return '<article class="training-session"><h4>'+esc(session.title)+'</h4><p>'+esc(session.date)+' · '+esc(session.category)+
        ' · '+session.roster.length+' 人</p><div><span class="training-status">'+status+'</span>'+claimed+
        (session.confirmed?'':'<button class="chip" data-session="'+esc(session.id)+'">编辑名单</button>')+'</div>'+
        (session.roster.length?'<details><summary>查看名单</summary><p>'+session.roster.map(esc).join('、')+'</p></details>':'')+
        '</article>';
    }

    function saveSession(event) {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const title = String(values.get('title')).trim();
      const date = String(values.get('date'));
      const category = String(values.get('category'));
      const roster = parseRoster(String(values.get('roster')));
      const confirmed = event.submitter?.value==='confirm';
      if (!title || !date || !categories.includes(category)) return toast('请填写场次名称、日期和类型。');
      if (roster.length>60 || roster.some(name=>name.length>30)) return toast('名单最多 60 人，每个姓名最多 30 字。');
      if (confirmed && !roster.length) return toast('确认前请填写至少一名参与者。');
      const index = record.sessions.findIndex(session=>session.id===editing && !session.confirmed);
      if (index<0 && record.sessions.length>=100) return toast('本机试玩最多可登记 100 场。');
      const duplicate = record.sessions.some(session=>session.id!==editing && session.title===title && session.date===date);
      if (duplicate) return toast('同一天已有同名场次，请编辑原场次或补充区别。');
      const session={id:index>=0?editing:newId('session'),title,date,category,roster,confirmed,claimedBy:''};
      if (index>=0) record.sessions[index]=session;
      else record.sessions.push(session);
      editing=confirmed?'':session.id;
      persist(confirmed?'名单已确认':'已保存待确认场次');
    }
    return {render};
  }

  const training={mount,parseRoster,settleRewards};
  if (typeof module!=='undefined') module.exports=training;
  else globalThis.BianyuTraining=training;
})();
