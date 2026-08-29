import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd()
const required=['app/page.tsx','app/worker/page.tsx','app/error.tsx','app/client-monitor.tsx','app/api/health/route.ts','features/v4/owner-v50.tsx','features/v4/owner-v51.tsx','features/v4/owner-v52.tsx','lib/v50.ts','lib/v51.ts','lib/v52.ts','lib/api-guard.ts','supabase/schema-v5.2.sql','V5.2-README.md','public/sw.js']
let failed=0
const check=(ok,label)=>{console.log(`${ok?'✓':'✗'} ${label}`);if(!ok)failed++}
for(const file of required)check(fs.existsSync(path.join(root,file)),`required file: ${file}`)
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
check(pkg.version==='5.2.0','package version 5.2.0')
const next=fs.readFileSync(path.join(root,'next.config.mjs'),'utf8')
check(!next.includes('ignoreBuildErrors'),'TypeScript build errors are not ignored')
check(next.includes('X-Frame-Options')&&next.includes('X-Content-Type-Options'),'security headers configured')
const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8')
check(sw.includes('itemku-profit-v5-2'),'PWA cache is V5.2')
const schema=fs.readFileSync(path.join(root,'supabase/schema-v5.2.sql'),'utf8')
for(const needle of ['create_order_atomic','transition_order_atomic','assign_order_atomic','enable row level security'])check(schema.toLowerCase().includes(needle.toLowerCase()),`schema contains ${needle}`)
const page=fs.readFileSync(path.join(root,'app/page.tsx'),'utf8')
for(const needle of ['FinalControlCenterView','ObservabilityCenterView','RecoveryCenterView','AutomationRunnerView','ApprovalCenterView','ScheduledReportsView','MaintenanceCenterView','itemkuLastBackupAt'])check(page.includes(needle),`${needle} connected`)
const v51=fs.readFileSync(path.join(root,'lib/v51.ts'),'utf8')
check(v51.includes("crypto.subtle.digest('SHA-256'"),'SHA-256 backup integrity enabled')
check(v51.includes('indexedDB.open'),'IndexedDB recovery vault enabled')
const v52=fs.readFileSync(path.join(root,'lib/v52.ts'),'utf8')
check(v52.includes('runAutomation'),'Automation Runner logic enabled')
check(v52.includes('applyApproval'),'Approval apply gate enabled')
check(v52.includes('runDueReportSchedules'),'Scheduled Reports enabled')
check(v52.includes('safeMaintenance'),'Safe Maintenance enabled')
const recovery=fs.readFileSync(path.join(root,'features/v4/owner-v51.tsx'),'utf8')
check(recovery.includes('exportV52Backup')&&recovery.includes('restoreV52Backup'),'V5.2 backup/recovery connected')
const monitor=fs.readFileSync(path.join(root,'app/client-monitor.tsx'),'utf8')
check(monitor.includes('unhandledrejection')&&monitor.includes("addEventListener('error'"),'client error monitoring enabled')
if(failed){console.error(`\nRelease check failed: ${failed} issue(s).`);process.exit(1)}
console.log('\nRelease check passed. V5.2 automation package is internally consistent.')
