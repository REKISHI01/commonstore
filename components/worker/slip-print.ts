// Cetak / simpan PDF slip payroll lewat dialog print browser (Ctrl+P → Save as PDF).
// Slip dirender sebagai snapshot: angka diambil dari payroll_items yang terkunci saat finalisasi.

export function printPayrollSlip(item:any, run:any){
  const rupiah=(v:any)=>'Rp '+Number(v||0).toLocaleString('id-ID')
  const esc=(s:any)=>String(s??'').replace(/[<>&]/g, c=>c==='<'?'&lt;':c==='>'?'&gt;':'&amp;')
  const b=item.businessSnapshot||{}
  const paid=run?.status==='paid'
  const w=window.open('', '_blank', 'width=680,height=860')
  if(!w)return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Slip ${esc(item.monthKey)} - ${esc(item.workerName)}</title><style>
    body{font-family:ui-sans-serif,system-ui,'Segoe UI',Arial,sans-serif;margin:32px;color:#111}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:12px}
    h1{font-size:16px;margin:0 0 2px}
    .muted{color:#666;font-size:12px}
    .badge{display:inline-block;border:1.5px solid #111;border-radius:999px;padding:3px 12px;font-size:10px;font-weight:800;letter-spacing:.1em}
    table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}
    td{padding:8px 0;border-bottom:1px solid #e5e5e5}
    td:last-child{text-align:right;font-weight:700;white-space:nowrap}
    tr.total td{font-size:15px;border-top:2px solid #111;border-bottom:none;padding-top:12px}
    .foot{margin-top:22px;font-size:11px;color:#666;line-height:1.5}
  </style></head><body>
    <div class="head">
      <div><h1>Slip Gaji ${esc(item.monthKey)}</h1><div class="muted">Itemku Profit Management · ${esc(item.workerName||'Worker')}</div></div>
      <div style="text-align:right"><div class="badge">${paid?'PAID':'FINALIZED'}</div><div class="muted">${paid&&run?.paidAt?`Dibayar ${new Date(run.paidAt).toLocaleDateString('id-ID')}`:'Sudah difinalisasi'}</div></div>
    </div>
    <table>
      <tr><td>Gaji tetap</td><td>${rupiah(item.baseSalary)}</td></tr>
      <tr><td>Profit share ${esc(item.sharePercent)}%</td><td>${rupiah(item.shareAmount)}</td></tr>
      <tr><td>Profit bersih bisnis</td><td>${rupiah(b.netProfit)}</td></tr>
      <tr><td>Cadangan usaha</td><td>${rupiah(b.reserveAmount)}</td></tr>
      <tr><td>Profit distributable</td><td>${rupiah(b.distributableProfit)}</td></tr>
      <tr><td>Jumlah Worker bulan itu</td><td>${esc(b.workerCount||0)}</td></tr>
      <tr class="total"><td>Total diterima</td><td>${rupiah(item.totalPay)}</td></tr>
    </table>
    <p class="foot">Slip ini adalah snapshot historis yang dibuat saat finalisasi payroll bulan ${esc(item.monthKey)} dan tidak berubah meskipun skema gaji diperbarui setelahnya. Simpan atau cetak halaman ini sebagai bukti.</p>
  </body></html>`)
  w.document.close(); w.focus(); setTimeout(()=>w.print(), 300)
}
