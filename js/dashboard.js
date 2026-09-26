let reservasGlobal=[];
let currentCalendarDate=new Date();

function money(v){return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(v||0));}
function fd(v){return v?new Intl.DateTimeFormat('es-AR').format(new Date(v+'T12:00:00')):'';}
function esc(v=''){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function isoLocalDate(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function normalizarTelefono(t){return String(t||'').replace(/\D/g,'');}

function renderCalendar(){
  const y=currentCalendarDate.getFullYear(),m=currentCalendarDate.getMonth();
  const t=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(new Date(y,m,1));
  document.getElementById('calendarTitle').textContent=t.charAt(0).toUpperCase()+t.slice(1);
  const g=document.getElementById('calendarGrid');g.innerHTML='';
  const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),prev=new Date(y,m,0).getDate();
  for(let i=0;i<42;i++){
    let d,dt,out=false;
    if(i<first){d=prev-first+i+1;dt=new Date(y,m-1,d);out=true}
    else if(i>=first+days){d=i-first-days+1;dt=new Date(y,m+1,d);out=true}
    else{d=i-first+1;dt=new Date(y,m,d)}
    const iso=isoLocalDate(dt);
    const rr=reservasGlobal.filter(r=>r.fecha===iso&&r.estado!=='CANCELADA');
    const cell=document.createElement('div');cell.className='calendar-cell'+(out?' outside-month':'');
    const events=rr.map(r=>{const c=r.clientes?`${r.clientes.nombre||''} ${r.clientes.apellido||''}`.trim():'';const h=r.hora_inicio?r.hora_inicio.slice(0,5):'';const lab=[h,r.tipo_evento||'Evento',c].filter(Boolean).join(' · ');return `<div class="calendar-event ${r.estado==='CONFIRMADA'?'confirmed':'pre'}" title="${esc(lab)}">${esc(lab)}</div>`}).join('');
    cell.innerHTML=`<div class="calendar-day-number">${d}</div><div class="calendar-events">${events}</div>`;g.appendChild(cell);
  }
}

function mensajeWhatsApp(reserva,saldo){
  const nombre=reserva.clientes?`${reserva.clientes.nombre||''} ${reserva.clientes.apellido||''}`.trim():'cliente';
  return `Hola ${nombre}. Te recordamos que el evento reservado para el ${fd(reserva.fecha)} tiene un saldo pendiente de ${money(saldo)}. El pago total debe encontrarse cancelado antes del evento. Muchas gracias. AMUC.`;
}

async function renderPaymentAlerts(){
  const panel=document.getElementById('paymentAlertsPanel');
  const box=document.getElementById('paymentAlerts');
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const limite=new Date(hoy); limite.setDate(limite.getDate()+3);
  const alertas=[];

  for(const r of reservasGlobal){
    if(r.estado==='CANCELADA')continue;
    const fecha=new Date(r.fecha+'T00:00:00');
    if(fecha<hoy || fecha>limite)continue;
    const pagado=(r.pagos||[]).reduce((s,p)=>s+Number(p.importe||0),0);
    const saldo=Math.max(0,Number(r.valor_total||0)-pagado);
    if(saldo>0.009)alertas.push({r,saldo,dias:Math.round((fecha-hoy)/86400000)});
  }

  if(!alertas.length){panel.classList.add('hidden');box.innerHTML='';return;}
  panel.classList.remove('hidden');
  box.innerHTML=alertas.map(({r,saldo,dias})=>{
    const cliente=r.clientes?`${r.clientes.nombre||''} ${r.clientes.apellido||''}`.trim():'Cliente';
    const tel=normalizarTelefono(r.clientes?.telefono);
    const mensaje=encodeURIComponent(mensajeWhatsApp(r,saldo));
    const whatsapp=tel?`<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${mensaje}">Notificar por WhatsApp</a>`:'';
    const etiqueta=dias===0?'Evento hoy':dias===1?'Evento mañana':`Evento en ${dias} días`;
    return `<div class="payment-alert-item"><div><strong>${esc(cliente)}</strong><span>${etiqueta} · ${fd(r.fecha)} · Saldo pendiente ${money(saldo)}</span></div>${whatsapp}</div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded',async()=>{
  const c=await requireSession();if(!c)return;
  document.getElementById('welcomeText').textContent=`Bienvenido, ${c.perfil.nombre} ${c.perfil.apellido||''}`.trim();

  const[{data:r},{data:cl},{data:p}]=await Promise.all([
    supabaseClient.from('reservas').select('id,fecha,hora_inicio,hora_fin,tipo_evento,valor_total,estado,clientes(nombre,apellido,telefono),pagos(id,importe,concepto)').order('fecha'),
    supabaseClient.from('clientes').select('id'),
    supabaseClient.from('pagos').select('importe')
  ]);
  reservasGlobal=r||[];const ps=p||[];

  document.getElementById('statReservas').textContent=reservasGlobal.length;
  document.getElementById('statClientes').textContent=(cl||[]).length;
  document.getElementById('statTotalReservado').textContent=money(reservasGlobal.reduce((s,x)=>s+Number(x.valor_total||0),0));
  document.getElementById('statCobrado').textContent=money(ps.reduce((s,x)=>s+Number(x.importe||0),0));supabaseClient.from('whatsapp_solicitudes').select('id',{count:'exact',head:true}).eq('estado','PENDIENTE').then(({count})=>{const e=document.getElementById('statWhatsappPendientes');if(e)e.textContent=count||0;});

  document.getElementById('prevMonthBtn').onclick=()=>{currentCalendarDate=new Date(currentCalendarDate.getFullYear(),currentCalendarDate.getMonth()-1,1);renderCalendar()};
  document.getElementById('nextMonthBtn').onclick=()=>{currentCalendarDate=new Date(currentCalendarDate.getFullYear(),currentCalendarDate.getMonth()+1,1);renderCalendar()};
  renderCalendar();
  await renderPaymentAlerts();

  const hoy=isoLocalDate(new Date()),prox=reservasGlobal.filter(x=>x.fecha>=hoy&&x.estado!=='CANCELADA').slice(0,8),box=document.getElementById('proximasReservas');
  box.innerHTML=!prox.length?'<p class="muted">Todavía no hay próximas reservas.</p>':`<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Evento</th><th>Estado</th><th>Valor</th></tr></thead><tbody>${prox.map(x=>`<tr><td>${fd(x.fecha)}</td><td>${x.clientes?`${x.clientes.nombre||''} ${x.clientes.apellido||''}`:'-'}</td><td>${x.tipo_evento||'-'}</td><td><span class="badge">${x.estado}</span></td><td>${money(x.valor_total)}</td></tr>`).join('')}</tbody></table>`;
});