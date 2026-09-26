let perfilWhatsapp=null,solicitudesWhatsapp=[];
const fmtFecha=v=>v?new Intl.DateTimeFormat('es-AR').format(new Date(v+'T12:00:00')):'-';
const fmtFH=v=>v?new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'-';
const esc=(v='')=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const estadoLabel=e=>({PENDIENTE:'Pendiente',EN_REVISION:'En revisión',CONVERTIDA_EN_RESERVA:'Convertida',DESCARTADA:'Descartada'}[e]||e||'-');

document.addEventListener('DOMContentLoaded',async()=>{
  const ctx=await requireSession(); if(!ctx)return; perfilWhatsapp=ctx;
  document.getElementById('refreshBtn').onclick=loadSolicitudes;
  document.getElementById('estadoFiltro').onchange=render;
  document.getElementById('waSearch').oninput=render;
  document.getElementById('closeConversationBtn').onclick=()=>document.getElementById('conversationModal').classList.add('hidden');
  await loadSolicitudes();
});

async function loadSolicitudes(){
  const {data,error}=await supabaseClient.from('whatsapp_solicitudes').select('*').order('created_at',{ascending:false});
  if(error){document.getElementById('solicitudesTable').innerHTML=`<p class="error">${esc(error.message)}</p>`;return;}
  solicitudesWhatsapp=data||[];
  const c=e=>solicitudesWhatsapp.filter(x=>x.estado===e).length;
  waPendientes.textContent=c('PENDIENTE');waRevision.textContent=c('EN_REVISION');waConvertidas.textContent=c('CONVERTIDA_EN_RESERVA');waDescartadas.textContent=c('DESCARTADA');
  render();
}
function render(){
  const estado=estadoFiltro.value,q=waSearch.value.trim().toLowerCase();
  const rows=solicitudesWhatsapp.filter(s=>(estado==='TODOS'||s.estado===estado)&&(!q||[s.nombre_apellido,s.dni,s.telefono,s.email,s.tipo_evento].filter(Boolean).join(' ').toLowerCase().includes(q)));
  const box=solicitudesTable;
  if(!rows.length){box.innerHTML='<p class="muted">No hay solicitudes.</p>';return;}
  box.innerHTML=`<table><thead><tr><th>Solicitud</th><th>Cliente</th><th>Contacto</th><th>Evento</th><th>Fecha / horario</th><th>Condición</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows.map(s=>`<tr>
  <td><strong>#${s.id}</strong><small>${fmtFH(s.created_at)}</small></td>
  <td><strong>${esc(s.nombre_apellido||'Sin nombre')}</strong><small>DNI: ${esc(s.dni||'-')}</small></td>
  <td>${esc(s.telefono||'-')}<small>${esc(s.email||'')}</small></td>
  <td>${esc(s.tipo_evento||'-')}<small>${Number(s.cantidad_personas||0)} personas</small></td>
  <td>${fmtFecha(s.fecha_evento)}<small>${s.hora_inicio?.slice(0,5)||'-'} a ${s.hora_fin?.slice(0,5)||'-'}</small></td>
  <td>${s.afiliado===true?'Afiliado':s.afiliado===false?'No afiliado':'-'}</td>
  <td>${estadoLabel(s.estado)}</td>
  <td><div class="wa-actions">
  ${s.estado==='PENDIENTE'?`<button class="btn btn-small btn-secondary" data-a="take" data-id="${s.id}">Tomar</button>`:''}
  <button class="btn btn-small btn-secondary" data-a="conversation" data-id="${s.id}">Conversación</button>
  ${(s.estado==='PENDIENTE'||s.estado==='EN_REVISION')?`<button class="btn btn-small btn-primary" data-a="reserve" data-id="${s.id}">Crear reserva</button><button class="btn btn-small btn-danger-soft" data-a="discard" data-id="${s.id}">Descartar</button>`:''}
  </div></td></tr>`).join('')}</tbody></table>`;
  box.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.id);if(b.dataset.a==='take')await tomar(id);if(b.dataset.a==='conversation')await conversacion(id);if(b.dataset.a==='reserve')crearReserva(id);if(b.dataset.a==='discard')await descartar(id);});
}
async function tomar(id){
  const s=solicitudesWhatsapp.find(x=>x.id===id);
  let {error}=await supabaseClient.from('whatsapp_solicitudes').update({estado:'EN_REVISION',operador_id:perfilWhatsapp.session.user.id,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){alert(error.message);return;}
  if(s?.conversacion_id)await supabaseClient.from('whatsapp_conversaciones').update({estado:'OPERADOR',operador_id:perfilWhatsapp.session.user.id,updated_at:new Date().toISOString()}).eq('id',s.conversacion_id);
  await loadSolicitudes();
}
async function descartar(id){
  if(!confirm('¿Descartar esta solicitud?'))return;
  const s=solicitudesWhatsapp.find(x=>x.id===id);
  const {error}=await supabaseClient.from('whatsapp_solicitudes').update({estado:'DESCARTADA',operador_id:perfilWhatsapp.session.user.id,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){alert(error.message);return;}
  if(s?.conversacion_id)await supabaseClient.from('whatsapp_conversaciones').update({estado:'CERRADA',updated_at:new Date().toISOString()}).eq('id',s.conversacion_id);
  await loadSolicitudes();
}
async function conversacion(id){
  const s=solicitudesWhatsapp.find(x=>x.id===id);if(!s?.conversacion_id){alert('Sin conversación asociada.');return;}
  conversationSubtitle.textContent=`${s.nombre_apellido||'Cliente'} · ${s.telefono||''}`;
  conversationMessages.innerHTML='<p class="muted">Cargando...</p>';conversationModal.classList.remove('hidden');
  const {data,error}=await supabaseClient.from('whatsapp_mensajes').select('*').eq('conversacion_id',s.conversacion_id).order('created_at');
  if(error){conversationMessages.innerHTML=`<p class="error">${esc(error.message)}</p>`;return;}
  conversationMessages.innerHTML=(data||[]).map(m=>`<div class="wa-message ${m.origen==='CLIENTE'?'incoming':'outgoing'}"><div class="wa-message-meta"><strong>${esc(m.origen)}</strong><span>${fmtFH(m.created_at)}</span></div><div>${esc(m.mensaje||'['+m.tipo+']')}</div></div>`).join('')||'<p class="muted">Sin mensajes.</p>';
}
function crearReserva(id){
  const s=solicitudesWhatsapp.find(x=>x.id===id);if(!s)return;
  sessionStorage.setItem('agenda_amuc_whatsapp_solicitud',JSON.stringify(s));
  location.href='reservas.html?from=whatsapp';
}
