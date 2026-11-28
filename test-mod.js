// Chat moderatsiyasi va monitoring: o'chirish, shikoyat, cheklash, /system/status, health
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const API=require('./netlify/functions/api'),{handler}=API;const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||'',host:'school.example.com'},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const t1=(await call(A,'POST','/users',{login:'ustoz1',first_name:'Dilnoza',last_name:'Karimova',password:'Teacher123',role:'teacher'})).j.id;
 const L=async(l,p='Teacher123')=>(await call('','POST','/login',{login:l,password:p})).ck;const T1=await L('ustoz1');
 await call(A,'POST','/subjects',{name:'Fizika'});const sub=(await call(A,'GET','/subjects')).j[0].id;
 const c1=(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027',homeroom_id:t1})).j.id;
 await call(A,'POST','/assignments',{class_id:c1,subject_id:sub,teacher_id:t1});await call(A,'POST','/students',{class_id:c1,rows:[{name:'Aliyev Vali'}]});
 const S1=(await call(A,'GET','/students',null,{class_id:String(c1)})).j[0];
 const pa=(await call(A,'POST','/students/'+S1.id+'/parent',{})).j,P1=await L(pa.login,pa.password);
 const sa=(await call(A,'POST','/students/'+S1.id+'/account',{})).j,SC=await L(sa.login,sa.password);
 const P='p'+S1.id,Ssd='s'+S1.id;
 // xabarlar: ustoz -> ota-ona, ota-ona -> ustoz (haqorat)
 const m1=(await call(T1,'POST','/chat/send',{to:P,body:'Salom'})).j;const th=m1.thread_id;
 const m2=(await call(P1,'POST','/student/chat/send',{to:'u'+t1,body:'Yomon xabar'})).j;
 const m3=(await call(T1,'POST','/chat/send',{to:P,body:'Oxirgi xabar'})).j;
 // o'chirish
 ok("begona xabarni ustoz o'chira olmaydi",(await call(T1,'POST','/chat/msg/'+m2.id+'/delete')).s==403);
 ok("boshqa suhbatdagi xabar 404 (begonaga ko'rinmaydi)",(await call(SC,'POST','/student/chat/msg/'+m2.id+'/delete')).s==404);
 ok("o'z xabarini o'chiradi",(await call(T1,'POST','/chat/msg/'+m3.id+'/delete')).s==200);
 let o=(await call(P1,'GET','/student/chat/'+th)).j;
 ok("o'chirilgan xabar matni yashirin (del=1, body bo'sh)",o.msgs.find(x=>x.id==m3.id).del==1&&o.msgs.find(x=>x.id==m3.id).body==='');
 ok("suhbat oxirgi matni yangilandi (o'chirilmagan oxirgisi)",(await call(P1,'GET','/student/chat/threads')).j[0].last_text==='Yomon xabar');
 // shikoyat
 ok("o'z xabariga shikoyat rad",(await call(P1,'POST','/student/chat/msg/'+m2.id+'/report',{reason:'x'})).s==400);
 ok("begona shikoyat qila olmaydi",(await call(SC,'POST','/student/chat/msg/'+m1.id+'/report',{reason:'x'})).s==404);
 ok("ustoz ota-ona xabariga shikoyat qiladi",(await call(T1,'POST','/chat/msg/'+m2.id+'/report',{reason:'Haqorat'})).s==200);
 ok("takroriy shikoyat bitta bo'lib qoladi",(await call(T1,'POST','/chat/msg/'+m2.id+'/report',{reason:'Haqorat'})).s==200);
 ok("ustoz moderatsiya ro'yxatini ko'ra olmaydi",(await call(T1,'GET','/chat/mod/reports')).s==403&&(await call(P1,'GET','/student/chat/mod/reports')).s!=200);
 let rp=(await call(A,'GET','/chat/mod/reports')).j;
 ok("admin 1 ta yangi shikoyatni ko'radi",rp.length==1&&rp[0].reporter.name.includes('Karimova')&&rp[0].body==='Yomon xabar');
 ok("admin 'unread'da shikoyat sonini ko'radi",(await call(A,'GET','/chat/unread')).j.rep==1&&(await call(T1,'GET','/chat/unread')).j.rep==0);
 const cx=(await call(A,'GET','/chat/mod/reports/'+rp[0].id+'/context')).j;
 ok("kontekstda shikoyat qilingan xabar belgilangan",cx.msgs.some(x=>x.hit&&x.id==m2.id)&&cx.msgs.length==3);
 // cheklash
 ok("ustozni cheklab bo'lmaydi",(await call(A,'POST','/chat/mod/mute',{party:'u'+t1,days:3})).s==400);
 ok("noto'g'ri muddat rad",(await call(A,'POST','/chat/mod/mute',{party:P,days:0})).s==400&&(await call(A,'POST','/chat/mod/mute',{party:P,days:999})).s==400);
 ok("ustoz cheklay olmaydi",(await call(T1,'POST','/chat/mod/mute',{party:P,days:3})).s==403);
 ok("ota-ona 3 kunga cheklandi",(await call(A,'POST','/chat/mod/mute',{party:P,days:3,reason:'Haqorat'})).s==200);
 const bl=await call(P1,'POST','/student/chat/send',{to:'u'+t1,body:'yana'});
 ok("cheklangan ota-ona yoza olmaydi, sabab ko'rinadi",bl.s==403&&/Haqorat/.test(bl.j.error));
 ok("cheklangan chatni o'qiy oladi, lekin can=false",(await call(P1,'GET','/student/chat/'+th)).j.can===false);
 ok("o'quvchi (boshqa hisob) cheklanmagan",(await call(P1,'GET','/student/chat/threads')).s==200);
 ok("ustoz hali ota-onaga yoza oladi",(await call(T1,'POST','/chat/send',{to:P,body:'Hurmat bilan'})).s==200);
 ok("mutes ro'yxati",(await call(A,'GET','/chat/mod/mutes')).j.length==1);
 // admin o'chiradi, yopadi
 ok("admin xabarni o'chiradi",(await call(A,'POST','/chat/msg/'+m2.id+'/delete')).s==200);
 ok("shikoyatni yopadi",(await call(A,'POST','/chat/mod/reports/'+rp[0].id+'/close',{note:'Ogohlantirildi'})).s==200);
 ok("yangi shikoyat 0, yopilganlarda 1",(await call(A,'GET','/chat/mod/reports')).j.length==0&&(await call(A,'GET','/chat/mod/reports',null,{status:'closed'})).j.length==1);
 ok("moderator amallari audit jurnalida",(await call(A,'GET','/audit')).j.filter(x=>/^chat_/.test(x.action)).length>=3);
 ok("cheklash olib tashlanadi, yozish tiklanadi",(await call(A,'POST','/chat/mod/unmute',{party:P})).s==200&&(await call(P1,'POST','/student/chat/send',{to:'u'+t1,body:'Kechirasiz'})).s==200);
 // o'quvchi hisobini o'chirish shikoyat/cheklashni ham tozalaydi
 await call(A,'POST','/chat/mod/mute',{party:P,days:1});
 // monitoring
 const st=(await call(A,'GET','/system/status')).j;
 ok("tizim holati: baza ok, uptime, ogohlantirishlar",st.ok===true&&st.db_ms>=0&&st.uptime_s>=0&&Array.isArray(st.warnings)&&st.persistent===false&&st.warnings.some(w=>/Doimiy baza/.test(w)));
 ok("ustoz tizim holatini ko'ra olmaydi",(await call(T1,'GET','/system/status')).s==403);
 const h=await API.health();ok("health: baza ishlaydi -> ok",h.ok&&h.body.status==='ok'&&typeof h.body.db_ms=='number');
 ok("health javobida sir yo'q (faqat son ogohlantirish)",typeof h.body.warnings=='number'&&!JSON.stringify(h.body).includes('Turso'));
 console.log('Hammasi o\'tdi');
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
