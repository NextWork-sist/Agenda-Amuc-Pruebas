
let documentacionActual = null;

function docFechaAR(fechaISO){
  if(!fechaISO) return '';
  const [y,m,d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

function sumarUnDiaISO(fechaISO){
  const d = new Date(`${fechaISO}T12:00:00`);
  d.setDate(d.getDate()+1);
  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')
  ].join('-');
}

function fechaEgresoReserva(reserva){
  if(!reserva?.fecha) return '';
  if(!reserva.hora_inicio || !reserva.hora_fin) return reserva.fecha;
  return reserva.hora_fin <= reserva.hora_inicio
    ? sumarUnDiaISO(reserva.fecha)
    : reserva.fecha;
}

function nombreCompletoCliente(c){
  return [c?.apellido, c?.nombre].filter(Boolean).join(', ');
}

async function fetchFile(url,nombre){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`No se pudo cargar ${nombre}`);
  const blob = await r.blob();
  return new File([blob], nombre, {type:'application/pdf'});
}


function parseFechaHoraLocal(fechaISO,hora){
  const [y,m,d] = fechaISO.split('-').map(Number);
  const [hh,mm] = hora.slice(0,5).split(':').map(Number);
  return new Date(y,m-1,d,hh,mm,0,0);
}

function fechaISOLocal(date){
  return [
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')
  ].join('-');
}

function horaLocal(date){
  return [
    String(date.getHours()).padStart(2,'0'),
    String(date.getMinutes()).padStart(2,'0')
  ].join(':');
}

function calcularIngresoEgreso(reserva){
  const inicio = parseFechaHoraLocal(reserva.fecha,reserva.hora_inicio);
  let fin = parseFechaHoraLocal(reserva.fecha,reserva.hora_fin);

  // Si finaliza a la misma hora o antes, el evento cruza medianoche.
  if(fin <= inicio){
    fin.setDate(fin.getDate()+1);
  }

  const ingreso = new Date(inicio.getTime() - 30*60*1000);
  const egreso = new Date(fin.getTime() + 30*60*1000);

  return {
    ingresoFecha: fechaISOLocal(ingreso),
    ingresoHora: horaLocal(ingreso),
    egresoFecha: fechaISOLocal(egreso),
    egresoHora: horaLocal(egreso)
  };
}

async function crearFichaReservaPDF(reserva,cliente){
  const template = await fetch('../assets/documentos/salon_fiestas_ficha.pdf').then(r=>r.arrayBuffer());
  const pdfDoc = await PDFLib.PDFDocument.load(template);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const {height} = page.getSize();

  const drawTop = (x,top,text,size=9.5,maxWidth=null)=>{
    let value = String(text ?? '');
    let fontSize = size;
    if(maxWidth){
      while(fontSize > 7 && font.widthOfTextAtSize(value,fontSize) > maxWidth){
        fontSize -= 0.25;
      }
    }
    page.drawText(value,{
      x,
      y:height-top,
      size:fontSize,
      font,
      color:PDFLib.rgb(0,0,0)
    });
  };

  const {
    ingresoFecha,
    ingresoHora,
    egresoFecha,
    egresoHora
  } = calcularIngresoEgreso(reserva);

  drawTop(148,145,docFechaAR(reserva.fecha),9.5,92);
  drawTop(286,145,`${reserva.hora_inicio?.slice(0,5)||''} a ${reserva.hora_fin?.slice(0,5)||''}`,9.5,80);
  drawTop(452,145,String(reserva.cantidad_horas ?? ''),9.5,55);
  drawTop(107,158,reserva.tipo_evento || '',9.5,405);

  drawTop(168,279,nombreCompletoCliente(cliente),9.5,335);
  drawTop(105,294,cliente?.dni || '',9.5,150);
  drawTop(317,294,cliente?.telefono || '',9.5,170);
  drawTop(168,324,cliente?.email || '',9.5,330);

  drawTop(106,540,docFechaAR(ingresoFecha),9.5,150);
  drawTop(319,540,ingresoHora,9.5,120);

  drawTop(106,651,docFechaAR(egresoFecha),9.5,150);
  drawTop(319,651,egresoHora,9.5,120);

  const bytes = await pdfDoc.save();
  return new File(
    [bytes],
    `Ficha_Salon_AMUC_Reserva_${reserva.id || 'nueva'}.pdf`,
    {type:'application/pdf'}
  );
}

async function crearReglamentoPDF(reserva){
  return await fetchFile(
    '../assets/documentos/reglamento_de_uso_salon_de_fiestas.pdf',
    `Reglamento_Uso_Salon_AMUC_Reserva_${reserva.id || 'nueva'}.pdf`
  );
}

function descargarArchivo(file){
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

async function prepararArchivosReserva(){
  if(!documentacionActual) throw new Error('No hay una reserva seleccionada.');
  if(documentacionActual.files) return documentacionActual.files;

  const ficha = await crearFichaReservaPDF(
    documentacionActual.reserva,
    documentacionActual.cliente
  );
  const reglamento = await crearReglamentoPDF(documentacionActual.reserva);

  documentacionActual.files = [ficha,reglamento];
  return documentacionActual.files;
}

async function compartirArchivosReserva(){
  try{
    const files = await prepararArchivosReserva();
    const r = documentacionActual.reserva;
    const c = documentacionActual.cliente;
    const text = `Reserva Salón AMUC - ${docFechaAR(r.fecha)} - ${r.hora_inicio?.slice(0,5)} a ${r.hora_fin?.slice(0,5)} - ${nombreCompletoCliente(c)}`;

    if(navigator.share && navigator.canShare && navigator.canShare({files})){
      await navigator.share({
        title:'Documentación reserva Salón AMUC',
        text,
        files
      });
      return;
    }

    files.forEach(descargarArchivo);
    alert('Este navegador no permite adjuntar archivos desde la web. Los dos PDF fueron descargados para que puedas adjuntarlos en WhatsApp o correo.');
  }catch(err){
    console.error(err);
    alert('No se pudieron preparar los documentos: '+err.message);
  }
}

async function descargarFichaReserva(){
  try{
    const [ficha] = await prepararArchivosReserva();
    descargarArchivo(ficha);
  }catch(err){ alert(err.message); }
}

async function descargarReglamentoReserva(){
  try{
    const [,reglamento] = await prepararArchivosReserva();
    descargarArchivo(reglamento);
  }catch(err){ alert(err.message); }
}

function textoMensajeReserva(){
  const r=documentacionActual.reserva;
  const c=documentacionActual.cliente;
  const fechaSalida=docFechaAR(fechaEgresoReserva(r));
  return `Hola ${c?.nombre||''}. Te enviamos la documentación correspondiente a tu reserva del Salón de Fiestas AMUC para el ${docFechaAR(r.fecha)}, de ${r.hora_inicio?.slice(0,5)} a ${r.hora_fin?.slice(0,5)} hs. Egreso: ${fechaSalida} ${r.hora_fin?.slice(0,5)} hs.`;
}

async function whatsappReserva(){
  const mensaje=encodeURIComponent(textoMensajeReserva());
  const tel=String(documentacionActual?.cliente?.telefono||'').replace(/\D/g,'');
  const url=tel ? `https://wa.me/${tel}?text=${mensaje}` : `https://wa.me/?text=${mensaje}`;
  window.open(url,'_blank');
}

function correoReserva(){
  const c=documentacionActual?.cliente||{};
  const r=documentacionActual?.reserva||{};
  const to=c.email||'';
  const subject=encodeURIComponent(`Documentación reserva Salón AMUC - ${docFechaAR(r.fecha)}`);
  const body=encodeURIComponent(textoMensajeReserva() + '\n\nSe adjuntan la ficha del evento y el reglamento de uso.');
  window.location.href=`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
}

function mostrarDocumentosReserva(reserva,cliente){
  documentacionActual={reserva,cliente,files:null};

  const panel=document.getElementById('documentosReservaPanel');
  const resumen=document.getElementById('documentosReservaResumen');
  if(!panel||!resumen) return;

  resumen.innerHTML=`
    <div><span>Reserva</span><strong>#${reserva.id}</strong></div>
    <div><span>Cliente</span><strong>${nombreCompletoCliente(cliente)}</strong></div>
    <div><span>Evento</span><strong>${docFechaAR(reserva.fecha)} · ${reserva.hora_inicio?.slice(0,5)} a ${reserva.hora_fin?.slice(0,5)}</strong></div>
    <div><span>Documentos</span><strong>Ficha + Reglamento</strong></div>
  `;
  panel.classList.remove('hidden');
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('compartirArchivosBtn')?.addEventListener('click',compartirArchivosReserva);
  document.getElementById('descargarFichaBtn')?.addEventListener('click',descargarFichaReserva);
  document.getElementById('descargarReglamentoBtn')?.addEventListener('click',descargarReglamentoReserva);
  document.getElementById('whatsappMensajeBtn')?.addEventListener('click',whatsappReserva);
  document.getElementById('correoMensajeBtn')?.addEventListener('click',correoReserva);
});
