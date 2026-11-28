// Parolni tiklash (Telegram kodi) va server avto-zaxirasi
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';process.env.BACKUP_DIR='/tmp/school-bk-test';process.env.BACKUP_KEEP='2';
const sent=[];global.fetch=async(url,o)=>{const m=/bot([^/]+)\/(\w+)/.exec(url),b=JSON.parse(o.body||'{}');sent.push({m:m[2],b});return{json:async()=>m[2]=='getMe'?{ok:true,result:{username:'deutsch_bot'}}:{ok:true,result:true}}};
const fs=require('fs');fs.rmSync('/tmp/school-bk-test',{recursive:true,force:true});
const api=require('./netlify/functions/api'),{handler}=api;const assert=require('assert');
const call=async(ck,m,p,b,ip)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||'',host:'school.example.com','x-forwarded-for':ip||'1.1.1.'+Math.floor(Math.random()*250)},body:b?JSON.stringify(b):null});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};const wait=()=>new Promise(r=>setTimeout(r,300));
const codeOf=()=>{const x=[...sent].reverse().find(z=>/tiklash kodi/.test(z.b.text||''));return x&&/<b>(\d{6})<\/b>/.exec(x.b.text)[1]};
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const c=(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027'})).j.id;await call(A,'POST','/students',{class_id:c,rows:[{name:'Aliyev Vali'},{name:'Boboyev Sami'}]});
 const ss=(await call(A,'GET','/students?class_id='+c)).j??[];const S=(await handler({httpMethod:'GET',path:'/api/students',headers:{cookie:A},queryStringParameters:{class_id:String(c)}}));const L=JSON.parse(S.body);
 const pa=(await call(A,'POST','/students/'+L[0].id+'/parent',{})).j,sa=(await call(A,'POST','/students/'+L[0].id+'/account',{})).j,pb=(await call(A,'POST','/students/'+L[1].id+'/parent',{})).j;
 // telegram sozlash va ulash (A o'quvchisi ota-onasi)
 await call(A,'PUT','/tg/config',{bot_token:'999111:'+'A'.repeat(35)});const cf=(await call(A,'GET','/tg/config')).j;
 const P1=(await call('','POST','/login',{login:pa.login,password:pa.password})).ck;const code=(await call(P1,'POST','/student/tg/code')).j.code;
 const wh='/tg/webhook/'+cf.webhook_url.split('/').pop();await call('','POST',wh,{message:{chat:{id:555,type:'private'},text:'/start '+code}});
 const linked=(await call(P1,'GET','/student/tg')).j.linked;
 ok("ota-ona Telegrami ulangan (sinov sharti)",linked==1);
 sent.length=0;
 const f0=await call('','POST','/forgot',{login:'yoq.login'});ok("mavjud bo'lmagan login: bir xil javob, kod yuborilmadi",f0.s==200&&f0.j.ok&&!codeOf());
 const f1=await call('','POST','/forgot',{login:pb.login});await wait();ok("Telegram ulanmagan hisob: bir xil javob, kod yo'q",f1.s==200&&f1.j.message==f0.j.message&&!codeOf());
 const f2=await call('','POST','/forgot',{login:pa.login});await wait();const k=codeOf();ok("ota-ona logini: kod Telegramga yuborildi",f2.s==200&&/^\d{6}$/.test(k)&&sent.some(x=>x.b.chat_id=='555'));
 sent.length=0;await call('','POST','/forgot',{login:pa.login});await wait();ok("60 soniya ichida qayta yuborilmaydi",!codeOf());
 ok("noto'g'ri kod rad",(await call('','POST','/forgot-confirm',{login:pa.login,code:'000000',password:'YangiParol1'})).s==400);
 ok("qisqa parol rad",(await call('','POST','/forgot-confirm',{login:pa.login,code:k,password:'qisqa'})).s==400);
 ok("boshqa login uchun kod yaramaydi",(await call('','POST','/forgot-confirm',{login:sa.login,code:k,password:'YangiParol1'})).s==400);
 const cf1=await call('','POST','/forgot-confirm',{login:pa.login,code:k,password:'YangiParol1'});ok("to'g'ri kod: parol almashdi",cf1.s==200);
 ok("yangi parol bilan kiriladi, eskisi bilan emas",(await call('','POST','/login',{login:pa.login,password:'YangiParol1'})).s==200&&(await call('','POST','/login',{login:pa.login,password:pa.password})).s!=200);
 ok("eski sessiya bekor bo'ldi",(await call(P1,'GET','/me')).s==401);
 ok("kod bir martalik",(await call('','POST','/forgot-confirm',{login:pa.login,code:k,password:'BoshqaParol1'})).s==400);
 // o'quvchi logini ota-ona Telegramiga yuboradi
 sent.length=0;await call('','POST','/forgot',{login:sa.login});await wait();const k2=codeOf();ok("o'quvchi logini uchun kod ota-onaga yuboriladi",/^\d{6}$/.test(k2));
 for(let i=0;i<5;i++)await call('','POST','/forgot-confirm',{login:sa.login,code:'111111',password:'YangiParol1'},'9.9.9.'+i);
 ok("5 xato urinishdan keyin to'g'ri kod ham rad (kod yaroqsiz)",(await call('','POST','/forgot-confirm',{login:sa.login,code:k2,password:'YangiParol2'},'8.8.8.8')).s==400);
 // tezlik cheklovi
 let last;for(let i=0;i<6;i++)last=await call('','POST','/forgot',{login:'limit.test'},'7.7.7.7');ok("tez-tez so'rash cheklanadi (429)",last.s==429);
 // avto-zaxira
 ok("server.js ulamasa avto-zaxira qo'llab-quvvatlanmaydi",(await call(A,'GET','/backups')).j.supported===false&&(await call(A,'POST','/backups/run')).s==501);
 require('./backup')(api.backupData);
 const bl=(await call(A,'GET','/backups')).j;ok("endi qo'llab-quvvatlanadi, fayllar yo'q, doimiy (BACKUP_DIR)",bl.supported&&bl.files.length==0&&bl.persistent);
 const rn=await call(A,'POST','/backups/run');ok("zaxira olindi",rn.s==200&&/^zaxira-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(rn.j.name)&&rn.j.size>100);
 const rd=await call(A,'GET','/backups/'+rn.j.name);ok("zaxira o'qiladi: o'quvchilar bor, parol xeshlari yo'q",rd.s==200&&rd.j.students.length==2&&rd.j.users.every(x=>!('pass' in x)));
 ok("noto'g'ri fayl nomi/yo'l rad",(await call(A,'GET','/backups/..%2f..%2fetc%2fpasswd')).s!=200&&(await call(A,'GET','/backups/zaxira-2020-01-01.json.gz')).s==404);
 ok("faqat admin",(await call((await call('','POST','/login',{login:pa.login,password:'YangiParol1'})).ck,'GET','/backups')).s==403);
 for(const d of ['2026-01-01','2026-01-02','2026-01-03'])fs.writeFileSync('/tmp/school-bk-test/zaxira-'+d+'.json.gz',require('zlib').gzipSync('{}'));
 await call(A,'POST','/backups/run');ok("eski zaxiralar KEEP bo'yicha o'chiriladi",(await call(A,'GET','/backups')).j.files.length==2);
 console.log("Hammasi o'tdi");process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
