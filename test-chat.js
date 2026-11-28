// Chat va Telegram: ruxsatlar, o'qilmagan sanagich, ota-ona ulanishi (kod, webhook), bildirishnomalar (soxta Telegram bilan)
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const sent=[];global.fetch=async(url,o)=>{const m=/bot([^/]+)\/(\w+)/.exec(url),b=JSON.parse(o.body||'{}');sent.push({m:m[2],b,tok:m[1]});return{json:async()=>m[2]=='getMe'?(m[1].startsWith('999')?{ok:true,result:{username:'deutsch_bot'}}:{ok:false,description:'Unauthorized'}):{ok:true,result:true}}};
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs,h={})=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||'',host:'school.example.com',...h},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};const wait=()=>new Promise(r=>setTimeout(r,400));
const TOK='999111:'+'A'.repeat(35);
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const mk=async(l,f,s)=>(await call(A,'POST','/users',{login:l,first_name:f,last_name:s,password:'Teacher123',role:'teacher'})).j.id;
 const t1=await mk('ustoz1','Dilnoza','Karimova'),t2=await mk('ustoz2','Ali','Valiyev');
 const L=async(l,p='Teacher123')=>(await call('','POST','/login',{login:l,password:p})).ck;const T1=await L('ustoz1'),T2=await L('ustoz2');
 await call(A,'POST','/subjects',{name:'Fizika'});const sub=(await call(A,'GET','/subjects')).j[0].id;
 const c1=(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027',homeroom_id:t1})).j.id,c2=(await call(A,'POST','/classes',{name:'7-B',year:'2026-2027'})).j.id;
 await call(A,'POST','/assignments',{class_id:c1,subject_id:sub,teacher_id:t1});await call(A,'POST','/students',{class_id:c1,rows:[{name:'Aliyev Vali'}]});await call(A,'POST','/students',{class_id:c2,rows:[{name:'Boboyev Sami'}]});
 const S1=(await call(A,'GET','/students',null,{class_id:String(c1)})).j[0],S2=(await call(A,'GET','/students',null,{class_id:String(c2)})).j[0];
 const sa=(await call(A,'POST','/students/'+S1.id+'/account',{})).j,pa=(await call(A,'POST','/students/'+S1.id+'/parent',{})).j,pb=(await call(A,'POST','/students/'+S2.id+'/parent',{})).j;
 const SC=await L(sa.login,sa.password),P1=await L(pa.login,pa.password),P2=await L(pb.login,pb.password);
 // ruxsatlar
 const cc=async(ck,to)=>(await call(ck,'POST','/chat/send',{to,body:'salom'}));
 ok("o'qituvchi o'z sinfi ota-onasiga yoza oladi",(await cc(T1,'p'+S1.id)).s==200);
 ok("o'qituvchi boshqa sinf ota-onasiga yoza olmaydi",(await cc(T1,'p'+S2.id)).s==403);
 ok("ota-ona ustozga javob yoza oladi (student yo'li)",(await call(P1,'POST','/student/chat/send',{to:'u'+t1,body:'Rahmat, domla'})).s==200);
 ok("ota-ona boshqa sinf ustoziga yoza olmaydi",(await call(P1,'POST','/student/chat/send',{to:'u'+t2,body:'x'})).s==403);
 ok("ota-ona o'quvchiga yoza olmaydi",(await call(P1,'POST','/student/chat/send',{to:'s'+S1.id,body:'x'})).s==403);
 ok("o'quvchi o'quvchiga yoza olmaydi",(await call(SC,'POST','/student/chat/send',{to:'s'+S2.id,body:'x'})).s==403);
 ok("xodim-xodim ruxsat",(await cc(T2,'u'+t1)).s==200);
 ok("o'ziga yozish rad",(await cc(T1,'u'+t1)).s==403);
 ok("noto'g'ri qabul qiluvchi rad",(await cc(T1,'zzz')).s==403&&(await cc(A,'u999')).s==403);
 ok("bo'sh va juda uzun xabar rad",(await call(T1,'POST','/chat/send',{to:'p'+S1.id,body:'  '})).s==400&&(await call(T1,'POST','/chat/send',{to:'p'+S1.id,body:'x'.repeat(2001)})).s==400);
 ok("o'quvchi/ota-ona /chat (xodim yo'li) ga kira olmaydi",(await call(P1,'GET','/chat/threads')).s==403&&(await call(T1,'GET','/student/chat/threads')).s==403);
 // ro'yxatlar
 const th=(await call(T1,'GET','/chat/threads')).j;ok("o'qituvchi suhbatlari: ota-ona + xodim, o'qilmagan sanaladi",th.length==2&&th.find(x=>x.party=='p'+S1.id).unread==1&&th.find(x=>x.party=='u'+t2).unread==1);
 ok("unread umumiy",(await call(T1,'GET','/chat/unread')).j.n==2);
 const open=(await call(T1,'GET','/chat/'+th.find(x=>x.party=='p'+S1.id).id)).j;ok("suhbat ochildi: 2 xabar, o'qildi",open.msgs.length==2&&open.msgs[0].mine&&!open.msgs[1].mine&&open.can&&(await call(T1,'GET','/chat/unread')).j.n==1);
 ok("begona suhbatni ochib bo'lmaydi",(await call(T2,'GET','/chat/'+open.id)).s==404&&(await call(P2,'GET','/student/chat/'+open.id)).s==404);
 const af=(await call(T1,'GET','/chat/'+open.id,null,{after:String(open.msgs[0].id)})).j;ok("after bilan faqat yangi xabarlar",af.msgs.length==1);
 const co=(await call(P1,'GET','/student/chat/contacts')).j;ok("ota-ona kontaktlari: sinf ustozi va ma'muriyat, boshqa ustoz yo'q",co.some(x=>x.party=='u'+t1&&/Sinf rahbari/.test(x.sub))&&co.some(x=>/Administrator/.test(x.sub))&&!co.some(x=>x.party=='u'+t2));
 const cs=(await call(T1,'GET','/chat/contacts',null,{q:'aliyev'})).j;ok("ustoz qidiruvi: faqat o'z sinfi o'quvchisi/ota-onasi",cs.some(x=>x.party=='p'+S1.id)&&cs.some(x=>x.party=='s'+S1.id));
 ok("ustoz boshqa sinfni topolmaydi",!(await call(T1,'GET','/chat/contacts',null,{q:'boboyev'})).j.some(x=>x.party=='p'+S2.id));
 ok("admin barcha sinfni topadi",(await call(A,'GET','/chat/contacts',null,{q:'boboyev'})).j.some(x=>x.party=='p'+S2.id));
 ok("admin istalgan sinf ota-onasiga yozadi",(await cc(A,'p'+S2.id)).s==200);
 // tezlik cheklovi
 let last;for(let i=0;i<22;i++)last=await call(T2,'POST','/chat/send',{to:'u'+t1,body:'t'+i});ok("juda tez yuborish cheklanadi (429)",last.s==429);
 // Telegram sozlash
 ok("kod: bot sozlanmagan bo'lsa rad",(await call(P1,'POST','/student/tg/code')).s==400);
 ok("faqat admin sozlaydi",(await call(T1,'GET','/tg/config')).s==403&&(await call(T1,'PUT','/tg/config',{bot_token:TOK})).s==403);
 ok("noto'g'ri token formati rad",(await call(A,'PUT','/tg/config',{bot_token:'abc'})).s==400);
 ok("Telegram rad etgan token rad",(await call(A,'PUT','/tg/config',{bot_token:'123456:'+'B'.repeat(35)})).s==400);
 ok("token saqlandi",(await call(A,'PUT','/tg/config',{bot_token:TOK})).s==200);
 const cf=(await call(A,'GET','/tg/config')).j;ok("sozlama: token ko'rsatilmaydi, bot nomi bor, webhook url",cf.token_set&&cf.bot_username=='deutsch_bot'&&!JSON.stringify(cf).includes(TOK)&&/^https:\/\/school\.example\.com\/api\/tg\/webhook\//.test(cf.webhook_url));
 ok("webhook o'rnatildi",(await call(A,'POST','/tg/webhook-set')).s==200&&sent.some(x=>x.m=='setWebhook'&&x.b.url==cf.webhook_url));
 const code=(await call(P1,'POST','/student/tg/code')).j;ok("ota-ona kodi va havola",/^[A-Z2-9]{8}$/.test(code.code)&&code.url=='https://t.me/deutsch_bot?start='+code.code);
 ok("o'quvchi kod ola olmaydi",(await call(SC,'POST','/student/tg/code')).s==403);
 const wh='/tg/webhook/'+cf.webhook_url.split('/').pop();
 ok("webhook noto'g'ri sir bilan rad",(await call('','POST','/tg/webhook/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',{message:{chat:{id:1,type:'private'},text:'/start '+code.code}})).s==403);
 sent.length=0;ok("noto'g'ri kod ulamaydi",(await call('','POST',wh,{message:{chat:{id:777,type:'private'},text:'/start AAAAAAAA'}})).s==200&&(await call(P1,'GET','/student/tg')).j.linked==0&&sent.some(x=>/noto'g'ri/.test(x.b.text||'')));
 ok("to'g'ri kod ulaydi",(await call('','POST',wh,{message:{chat:{id:777,type:'private'},text:'/start '+code.code}})).s==200&&(await call(P1,'GET','/student/tg')).j.linked==1);
 ok("kod bir martalik",(await call('','POST',wh,{message:{chat:{id:888,type:'private'},text:'/start '+code.code}})).s==200&&(await call(P1,'GET','/student/tg')).j.linked==1);
 ok("guruh chatlari e'tiborga olinmaydi",(await call('','POST',wh,{message:{chat:{id:-5,type:'group'},text:'/start '+(await call(P1,'POST','/student/tg/code')).j.code}})).s==200&&(await call(P1,'GET','/student/tg')).j.linked==1);
 // bildirishnomalar
 sent.length=0;
 await call(T1,'PUT','/attendance',{student_id:S1.id,class_id:c1,subject_id:sub,date:'2026-11-20',slot:1,status:'kelmadi'});await wait();
 ok("sababsiz kelmadi: ota-onaga xabar",sent.some(x=>x.m=='sendMessage'&&x.b.chat_id=='777'&&/qatnashmadi/.test(x.b.text)));
 sent.length=0;await call(T1,'PUT','/attendance',{student_id:S1.id,class_id:c1,subject_id:sub,date:'2026-11-20',slot:1,status:'kelmadi'});await wait();ok("o'zgarmagan holat qayta yuborilmaydi",!sent.length);
 await call(T1,'PUT','/attendance',{student_id:S1.id,class_id:c1,subject_id:sub,date:'2026-11-21',slot:1,status:'keldi'});await wait();ok("'keldi' xabar yubormaydi",!sent.length);
 await call(T1,'PUT','/grades',{student_id:S1.id,class_id:c1,subject_id:sub,date:'2026-11-20',type:'joriy',value:4,max:5});await wait();
 ok("baho xabari",sent.some(x=>/4\/5/.test(x.b.text||'')&&x.b.chat_id=='777'));
 sent.length=0;await call(T1,'PUT','/grades',{student_id:S1.id,class_id:c1,subject_id:sub,date:'2026-11-20',type:'joriy',value:4,max:5});await wait();ok("o'zgarmagan baho qayta yuborilmaydi",!sent.length);
 await call(A,'PUT','/tg/config',{events:{ev_grade:false}});await call(T1,'PUT','/grades',{student_id:S1.id,class_id:c1,subject_id:sub,date:'2026-11-22',type:'joriy',value:5,max:5});await wait();ok("o'chirilgan hodisa xabar yubormaydi",!sent.length);
 await call(A,'PUT','/fin/config',{fin_users:[]});await call(A,'PUT','/fin/tariffs/class',{class_id:c1,monthly:1000000});await call(A,'POST','/fin/charges/generate',{period:'2026-11'});
 await call(A,'POST','/fin/payments',{student_id:S1.id,amount:400000,method:'naqd'});await wait();ok("to'lov xabari qoldiq bilan",sent.some(x=>/400\s000/.test(x.b.text||'')&&/Qoldiq: 600\s000/.test(x.b.text)));
 sent.length=0;await call(A,'POST','/announcements',{title:'Yig\'ilish',body:'Dushanba 18:00',audience:'parents'});await wait();ok("e'lon ota-onalarga yuboriladi",sent.some(x=>/Yig/.test(x.b.text||'')&&x.b.chat_id=='777'));
 sent.length=0;await call(A,'POST','/announcements',{title:'Xodimlar',body:'x',audience:'staff'});await wait();ok("xodimlar e'loni ota-onaga bormaydi",!sent.length);
 await call(P1,'GET','/student/chat/'+open.id); sent.length=0;await call(T1,'POST','/chat/send',{to:'p'+S1.id,body:'Uy vazifasi haqida'});await wait();ok("chat xabari: ota-onaga bildirishnoma (matnsiz)",sent.length==1&&!/Uy vazifasi/.test(sent[0].b.text));
 sent.length=0;await call(T1,'POST','/chat/send',{to:'p'+S1.id,body:'Yana'});await wait();ok("o'qilmagan bo'lsa takror bildirishnoma yo'q",!sent.length);
 ok("/stop ulanishni o'chiradi",(await call('','POST',wh,{message:{chat:{id:777,type:'private'},text:'/stop'}})).s==200&&(await call(P1,'GET','/student/tg')).j.linked==0);
 // zaxira nusxada sir yo'q
 const bk=JSON.stringify((await call(A,'GET','/backup')).j);ok("zaxirada bot tokeni va chat yo'q",!bk.includes(TOK)&&!bk.includes('Uy vazifasi'));
 // o'quvchi o'chirilsa chat tozalanadi
 ok("o'quvchi o'chirilganda chat tozalanadi",(await call(A,'DELETE','/students/'+S1.id)).s==200&&(await call(T1,'GET','/chat/threads')).j.every(x=>x.party!='p'+S1.id));
 ok("Telegram sozlamasini o'chirish",(await call(A,'DELETE','/tg/config')).s==200&&!(await call(A,'GET','/tg/config')).j.token_set);
 console.log('Hammasi o\'tdi');process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
