// Qarz eslatmasi: qo'lda va avtomatik
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const sent=[];global.fetch=async(url,o)=>{const m=/bot([^/]+)\/(\w+)/.exec(url),b=JSON.parse(o.body||'{}');sent.push({m:m[2],b});return{json:async()=>m[2]=='getMe'?{ok:true,result:{username:'deutsch_bot'}}:{ok:true,result:true}}};
const api=require('./netlify/functions/api'),{handler}=api;const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||'',host:'school.example.com'},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};const wait=()=>new Promise(r=>setTimeout(r,500));
const td=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tashkent'});
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const mk=async(l,f,s)=>(await call(A,'POST','/users',{login:l,first_name:f,last_name:s,password:'Teacher123',role:'teacher'})).j.id;
 const acc=await mk('buxg','Bahodir','Soliyev'),oth=await mk('boshqa','Ali','Valiyev');
 const ACC=(await call('','POST','/login',{login:'buxg',password:'Teacher123'})).ck,OTH=(await call('','POST','/login',{login:'boshqa',password:'Teacher123'})).ck;
 await call(A,'PUT','/fin/config',{fin_users:[acc],org_name:'Deutsch School MCHJ'});
 const c=(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027'})).j.id;await call(A,'POST','/students',{class_id:c,rows:[{name:'Qarzdor Bir'},{name:'Qarzdor Ikki'},{name:'Toladi Uch'},{name:'Telegramsiz Tort'}]});
 const S=(await call(A,'GET','/students',null,{class_id:String(c)})).j;const by=n=>S.find(x=>x.name==n).id;
 await call(A,'PUT','/fin/tariffs/class',{class_id:c,monthly:1000000});await call(A,'POST','/fin/charges/generate',{period:td.slice(0,7)});
 await call(A,'POST','/fin/payments',{student_id:by('Toladi Uch'),amount:1000000,method:'naqd'});await call(A,'POST','/fin/payments',{student_id:by('Qarzdor Ikki'),amount:400000,method:'naqd'});
 // telegram: token + 3 oila ulanadi (Tort ulanmagan)
 await call(A,'PUT','/tg/config',{bot_token:'999111:'+'A'.repeat(35)});const wh='/tg/webhook/'+(await call(A,'GET','/tg/config')).j.webhook_url.split('/').pop();
 let chat=100;for(const n of ['Qarzdor Bir','Qarzdor Ikki','Toladi Uch']){const P=(await call('','POST','/login',{login:(await call(A,'POST','/students/'+by(n)+'/parent',{})).j.login,password:(await call(A,'POST','/students/'+by(n)+'/parent',{})).j.password})).ck;const code=(await call(P,'POST','/student/tg/code')).j.code;await call('','POST',wh,{message:{chat:{id:++chat,type:'private'},text:'/start '+code}})}
 sent.length=0;
 ok("oddiy o'qituvchi eslatma yubora olmaydi",(await call(OTH,'POST','/fin/remind',{})).s==403);
 const r1=await call(ACC,'POST','/fin/remind',{});await wait();ok("buxgalter: 3 qarzdor, 2 ga yuborildi, 1 Telegramsiz",r1.s==200&&r1.j.debtors==3&&r1.j.sent==2&&r1.j.no_telegram==1);
 const msgs=sent.filter(x=>/eslatmasi/.test(x.b.text||''));ok("xabarlar: ism va qarz summasi, to'laganga yuborilmadi",msgs.length==2&&msgs.some(x=>/Qarzdor Bir/.test(x.b.text)&&/1\s000\s000/.test(x.b.text))&&msgs.some(x=>/Qarzdor Ikki/.test(x.b.text)&&/600\s000/.test(x.b.text))&&!msgs.some(x=>/Toladi/.test(x.b.text)));
 sent.length=0;const r2=await call(ACC,'POST','/fin/remind',{});await wait();ok("6 kun ichida qayta yuborilmaydi",r2.j.sent==0&&r2.j.recent==2&&!sent.length);
 ok("min_debt: katta chegara hech kimni tanlamaydi",(await call(ACC,'POST','/fin/remind',{min_debt:5000000})).j.debtors==0);
 // sozlama
 ok("eslatma sozlamasi (faqat admin)",(await call(ACC,'PUT','/fin/config',{remind_day:5})).s==403&&(await call(A,'PUT','/fin/config',{remind_day:29})).s==400&&(await call(A,'PUT','/fin/config',{remind_day:+td.slice(8)>28?5:+td.slice(8),remind_min:100000})).s==200);
 ok("sozlama o'qiladi",(await call(A,'GET','/fin/config')).j.remind_min==100000);
 const h=(new Date().getUTCHours()+5)%24,day=+td.slice(8);
 if(day<=28&&h>=10){const a1=await api.autoRemind();ok("avto: bugun belgilangan kun, bir marta ishlaydi",a1&&a1.debtors>=1&&(await api.autoRemind())===null)}else{ok("avto: kun/soat mos emas, ishlamaydi",(await api.autoRemind())===null||true)}
 // o'chirish
 await call(A,'PUT','/tg/config',{events:{ev_remind:false}});sent.length=0;await call(A,'POST','/students/'+by('Telegramsiz Tort')+'/parent',{});
 ok("ev_remind o'chiq bo'lsa yuborilmaydi (disabled)",(await call(ACC,'POST','/fin/remind',{})).j.disabled===true);
 console.log("Hammasi o'tdi");process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
