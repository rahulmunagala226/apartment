const $ = s => document.querySelector(s);
const state = { user:null, page:'dashboard', query:'', modal:null, editId:null };
const navItems = [
  ['dashboard','▦','Dashboard'],
  ['visits','↔','Visit activity'],
  ['residents','♙','Residents'],
  ['visitors','♧','Visitors'],
  ['inside','◷','Currently inside']
];
const residentNav = [['dashboard','▦','Dashboard'],['history','◷','Visitor history'],['profile','♙','My profile']];
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options={}) {
  const res = await fetch('/api'+url,{headers:{'Content-Type':'application/json'},...options});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Request failed.');
  return data;
}
function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.className='toast show'+(error?' error':'');setTimeout(()=>t.className='toast',3000)}
function niceDate(value){if(!value)return '—';return new Date(String(value).replace(' ','T')).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function setPage(page){state.page=page;state.query='';render()}
function renderNav(){
  const items=state.user.role==='security'?navItems:residentNav;
  $('#nav').innerHTML=items.map(([id,icon,label])=>`<button class="${state.page===id?'active':''}" data-page="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('');
  $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
}
function shell(){
  $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');
  $('#userName').textContent=state.user.username;$('#userRole').textContent=state.user.role==='security'?'Security staff':'Resident account';
  $('#todayLabel').textContent=new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  renderNav();
}
async function start(){
  try{const data=await api('/session');if(data.user){state.user=data.user;state.page='dashboard';shell();await render()}}
  catch(e){console.error(e)}
}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{const d=await api('/login',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))});state.user=d.user;state.page='dashboard';shell();await render()}catch(err){toast(err.message,true)}};
$('#logout').onclick=async()=>{await api('/logout',{method:'POST'});state.user=null;$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden')};
$('#closeModal').onclick=$('#cancelModal').onclick=()=>$('#modal').close();

async function render(){
  renderNav();
  const titles={dashboard:'Dashboard',visits:'Visit activity',residents:'Resident directory',visitors:'Visitor directory',inside:'Currently inside',history:'Visitor history',profile:'My profile'};
  $('#pageTitle').textContent=titles[state.page]||'Dashboard';
  const root=$('#content');root.innerHTML='<div class="empty">Loading records…</div>';
  try{
    if(state.page==='dashboard')root.innerHTML=await dashboard();
    else if(state.page==='residents')root.innerHTML=await residentPage();
    else if(state.page==='visitors')root.innerHTML=await visitorPage();
    else if(['visits','inside'].includes(state.page))root.innerHTML=await visitsPage(state.page==='inside');
    else if(state.page==='history')root.innerHTML=await historyPage();
    else if(state.page==='profile')root.innerHTML=await profilePage();
    bindPage();
  }catch(e){root.innerHTML=`<div class="panel empty">${esc(e.message)}</div>`}
}
function statsCards(d){return `<div class="stats">${[['Residents',d.residents,'♙','Registered in community'],['Visitors',d.visitors,'♧','Unique visitor profiles'],['Total visits',d.visits,'↔','Recorded visits'],['Inside now',d.inside,'◷','Active at the gate']].map(x=>`<div class="stat"><div class="stat-top">${x[0]}<span class="stat-icon">${x[2]}</span></div><strong>${x[1]}</strong><small>${x[3]}</small></div>`).join('')}</div>`}
async function dashboard(){
 const d=await api('/dashboard');
 return `${statsCards(d)}<div class="section-head"><div><h3>Recent activity</h3><p>Latest visitor movements across the community.</p></div>${state.user.role==='security'?'<button class="primary small" data-action="new-visit">＋ Register visit</button>':''}</div>${tablePanel('Latest visits',d.recent,visitColumns,false)}`;
}
const visitColumns=[['Visitor',r=>`<b>${esc(r.visitor_name)}</b><span class="sub">${esc(r.visitor_phone||'No phone')}</span>`],['Resident',r=>`<b>${esc(r.resident_name)}</b><span class="sub">Flat ${esc(r.flat_no)}</span>`],['Entry',r=>esc(niceDate(r.entry_time))],['Exit',r=>esc(niceDate(r.exit_time))],['Status',r=>badge(r.status)]];
function badge(s){return `<span class="badge ${s==='Exited'?'exited':''}">${esc(s)}</span>`}
function tablePanel(title,rows,cols,search=true,actions=''){
 return `<div class="panel"><div class="panel-head"><div><h3>${title}</h3><p>${rows.length} record${rows.length===1?'':'s'} found</p></div>${search?`<div class="table-tools"><input class="search" id="tableSearch" placeholder="Search records…" value="${esc(state.query)}"></div>`:''}</div><div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}${actions?'<th>Actions</th>':''}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${cols.map(c=>`<td>${c[1](r)}</td>`).join('')}${actions?`<td>${actions(r)}</td>`:''}</tr>`).join(''):`<tr><td class="empty" colspan="${cols.length+(actions?1:0)}">No matching records found.</td></tr>`}</tbody></table></div></div>`;
}
async function residentPage(){
 const rows=await api('/residents?q='+encodeURIComponent(state.query));
 const cols=[['Resident',r=>`<b>${esc(r.name)}</b><span class="sub">ID ${r.resident_id}</span>`],['Flat',r=>`<b>${esc(r.flat_no)}</b>`],['Phone',r=>esc(r.phone||'—')],['Email',r=>esc(r.email||'—')]];
 return `<div class="section-head"><div><h3>Resident directory</h3><p>Manage resident records and apartment details.</p></div><button class="primary small" data-action="add-resident">＋ Add resident</button></div>${tablePanel('All residents',rows,cols,true,r=>`<div class="actions"><button class="mini" data-edit-resident="${r.resident_id}">Edit</button><button class="mini danger" data-delete-resident="${r.resident_id}">Delete</button></div>`)}`;
}
async function visitorPage(){
 const rows=await api('/visitors?q='+encodeURIComponent(state.query));
 const cols=[['Visitor',r=>`<b>${esc(r.name)}</b><span class="sub">ID ${r.visitor_id}</span>`],['Phone',r=>esc(r.phone||'—')],['Vehicle',r=>esc(r.vehicle_no||'—')],['Purpose',r=>esc(r.purpose)]];
 return `<div class="section-head"><div><h3>Visitor directory</h3><p>Maintain reusable visitor profiles.</p></div><button class="primary small" data-action="add-visitor">＋ Add visitor</button></div>${tablePanel('All visitors',rows,cols,true,r=>`<div class="actions"><button class="mini" data-edit-visitor="${r.visitor_id}">Edit</button><button class="mini danger" data-delete-visitor="${r.visitor_id}">Delete</button></div>`)}`;
}
async function visitsPage(inside){
 const rows=await api('/visits?q='+encodeURIComponent(state.query));
 const filtered=inside?rows.filter(r=>r.status==='Inside'):rows;
 const cols=[['Visitor',r=>`<b>${esc(r.visitor_name)}</b><span class="sub">${esc(r.visitor_phone||'No phone')}</span>`],['Resident / flat',r=>`<b>${esc(r.resident_name)}</b><span class="sub">${esc(r.flat_no)}</span>`],['Purpose',r=>esc(r.purpose)],['Entry time',r=>esc(niceDate(r.entry_time))],['Status',r=>badge(r.status)]];
 return `${inside?'<div class="section-head"><div><h3>Visitors currently inside</h3><p>Record an exit when a visitor leaves the premises.</p></div><button class="primary small" data-action="new-visit">＋ Register visit</button></div>':''}${tablePanel(inside?'Active visits':'All visit records',filtered,cols,true,r=>r.status==='Inside'?`<button class="mini" data-exit="${r.visit_id}">Record exit</button>`:'<span class="sub">Completed</span>')}`;
}
async function historyPage(){
 const rows=await api('/my-visits?q='+encodeURIComponent(state.query));
 const cols=[['Visitor',r=>`<b>${esc(r.visitor_name)}</b><span class="sub">${esc(r.visitor_phone||'No phone')}</span>`],['Purpose',r=>esc(r.purpose)],['Entry',r=>esc(niceDate(r.entry_time))],['Exit',r=>esc(niceDate(r.exit_time))],['Status',r=>badge(r.status)]];
 return `<div class="section-head"><div><h3>Your visitor history</h3><p>Only visits associated with your resident account are shown.</p></div></div>${tablePanel('Visit history',rows,cols,true)}`;
}
async function profilePage(){
 const r=await api('/my-profile');
 return `<div class="panel"><div class="profile-card"><div class="profile-initial">${esc(r.name[0]||'R')}</div><div><h3>${esc(r.name)}</h3><p>Resident · Flat ${esc(r.flat_no)}</p></div></div><div style="padding:0 25px 25px"><div class="profile-meta"><div class="meta"><span>Flat number</span><b>${esc(r.flat_no)}</b></div><div class="meta"><span>Phone</span><b>${esc(r.phone||'Not provided')}</b></div><div class="meta"><span>Email</span><b>${esc(r.email||'Not provided')}</b></div></div></div></div>`;
}
function bindPage(){
 const search=$('#tableSearch');if(search){let timer;search.oninput=()=>{state.query=search.value;clearTimeout(timer);timer=setTimeout(render,220)}}
 document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>openForm(b.dataset.action));
 document.querySelectorAll('[data-edit-resident]').forEach(b=>b.onclick=()=>editRecord('resident',b.dataset.editResident));
 document.querySelectorAll('[data-edit-visitor]').forEach(b=>b.onclick=()=>editRecord('visitor',b.dataset.editVisitor));
 document.querySelectorAll('[data-delete-resident]').forEach(b=>b.onclick=()=>deleteRecord('residents',b.dataset.deleteResident));
 document.querySelectorAll('[data-delete-visitor]').forEach(b=>b.onclick=()=>deleteRecord('visitors',b.dataset.deleteVisitor));
 document.querySelectorAll('[data-exit]').forEach(b=>b.onclick=()=>exitVisit(b.dataset.exit));
}
async function deleteRecord(type,id){if(!confirm('Delete this record? This action cannot be undone.'))return;try{await api(`/${type}/${id}`,{method:'DELETE'});toast('Record deleted.');render()}catch(e){toast(e.message,true)}}
async function exitVisit(id){if(!confirm('Record this visitor as exited now?'))return;try{await api(`/visits/${id}/exit`,{method:'POST'});toast('Visitor exit recorded.');render()}catch(e){toast(e.message,true)}}
async function editRecord(type,id){const rows=await api(`/${type==='resident'?'residents':'visitors'}`);const row=rows.find(x=>x[type+'_id']==id);if(row)openForm(type==='resident'?'add-resident':'add-visitor',row)}
async function openForm(action,row=null){
 state.modal={action,row};state.editId=row?.[action==='add-resident'?'resident_id':'visitor_id']||null;
 const isRes=action==='add-resident',isVisit=action==='new-visit';
 $('#modalTitle').textContent=isVisit?'Register visitor entry':(row?'Edit ':'Add ')+(isRes?'resident':'visitor');
 let fields='';
 if(isVisit){
  const data=await api('/lookups');
  fields=`<label>Visitor<select name="visitor_id" required>${data.visitors.map(v=>`<option value="${v.visitor_id}">${esc(v.name)}${v.phone?' · '+esc(v.phone):''}</option>`).join('')}</select></label><label>Resident / flat<select name="resident_id" required>${data.residents.map(r=>`<option value="${r.resident_id}">${esc(r.name)} · ${esc(r.flat_no)}</option>`).join('')}</select></label><p class="muted full-field">Entry time is recorded automatically when you save.</p>`;
  if(!data.visitors.length||!data.residents.length){toast('Add a resident and visitor profile first.',true);return}
 }else if(isRes){
  fields=input('name','Full name',row?.name,true)+input('flat_no','Flat number',row?.flat_no,true)+input('phone','Phone',row?.phone)+input('email','Email',row?.email);
 }else{
  fields=input('name','Visitor name',row?.name,true)+input('phone','Phone',row?.phone)+input('vehicle_no','Vehicle number',row?.vehicle_no)+input('purpose','Purpose of visit',row?.purpose,true);
 }
 $('#modalFields').innerHTML=fields;$('#modal').showModal();
}
function input(name,label,value='',required=false){return `<label>${label}<input name="${name}" maxlength="${name==='purpose'?150:name==='flat_no'?20:name==='vehicle_no'?30:name==='phone'?15:name==='email'?100:100}" value="${esc(value||'')}" ${required?'required':''}></label>`}
$('#modalForm').onsubmit=async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const {action}=state.modal;
 try{
  if(action==='new-visit')await api('/visits',{method:'POST',body:JSON.stringify({visitor_id:Number(data.visitor_id),resident_id:Number(data.resident_id)})});
  else {const type=action==='add-resident'?'residents':'visitors';const method=state.editId?'PUT':'POST';await api(`/${type}${state.editId?'/'+state.editId:''}`,{method,body:JSON.stringify(data)})}
  $('#modal').close();toast(action==='new-visit'?'Visit entry registered.':'Record saved successfully.');state.query='';render();
 }catch(err){toast(err.message,true)}
};
start();
