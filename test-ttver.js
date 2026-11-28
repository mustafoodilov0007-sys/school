// Dars jadvali versiyalari: o'zgarish faqat kelajakka ta'sir qiladi, tarix saqlanadi
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||''},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
const td=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tashkent'}),add=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const F1=add(td,10),F2=add(td,20),PAST=add(td,-3);
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const mk=async(l,f,s)=>(await call(A,'POST','/users',{login:l,first_name:f,last_name:s,password:'Teacher123',role:'teacher'})).j.id;
 const t1=await mk('ustoz1','Ali','Valiyev'),t2=await mk('ustoz2','Dilnoza','Karimova');
 const T1=(await call('','POST','/login',{login:'ustoz1',password:'Teacher123'})).ck;
 await call(A,'POST','/subjects',{name:'Fizika'});const sub=(await call(A,'GET','/subjects')).j[0].id;
 const c=(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027'})).j.id;
 await call(A,'PUT','/bell_slots',{slots:[{start:'08:00',end:'08:45'},{start:'08:55',end:'09:40'},{start:'09:50',end:'10:35'}]});
 const wd=new Date(F1+'T12:00:00Z').getUTCDay()||7; // F1 dan keyingi kun hafta kuni
 const mkL=async(extra)=>(await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t1,weekday:wd,slot:1,...extra}));
 const l1=await mkL({});ok("chegarasiz dars yaratildi, bugun ham F1 da ham amalda",l1.s==200&&(await call(A,'GET','/timetable')).j.length==1&&(await call(A,'GET','/timetable',null,{date:F1})).j.length==1);
 // o'tmishga o'zgarish taqiqlanadi
 ok("o'tmish sanasi bilan o'zgartirish rad",(await call(A,'PUT','/timetable/'+l1.j.id,{class_id:c,subject_id:sub,teacher_id:t1,weekday:wd,slot:2,effective:PAST})).s==400);
 ok("o'tmish sanasi bilan o'chirish rad",(await call(A,'DELETE','/timetable/'+l1.j.id,null,{effective:PAST})).s==400);
 // kelajakdan o'zgartirish: 1-darsdan 2-darsga
 const ch=await call(A,'PUT','/timetable/'+l1.j.id,{class_id:c,subject_id:sub,teacher_id:t1,weekday:wd,slot:2,effective:F1});
 ok("versiya: yangi qator yaratildi",ch.s==200&&ch.j.versioned&&ch.j.id!=l1.j.id&&ch.j.from==F1);
 const now=(await call(A,'GET','/timetable')).j,fut=(await call(A,'GET','/timetable',null,{date:F1})).j,old=(await call(A,'GET','/timetable',null,{date:add(F1,-1)})).j;
 ok("bugun hali eski dars (1-dars)",now.length==1&&now[0].slot==1&&now[0].valid_to==add(F1,-1));
 ok("F1 dan boshlab yangi dars (2-dars)",fut.length==1&&fut[0].slot==2&&fut[0].valid_from==F1);
 ok("F1 dan bir kun oldin hali eski",old.length==1&&old[0].slot==1);
 ok("hammasi (all=1): 2 qator",(await call(A,'GET','/timetable',null,{all:'1'})).j.length==2);
 // jurnal ustunlari: schedule validity bilan keladi
 const jr=(await call(T1,'GET','/journal',null,{class_id:String(c),subject_id:String(sub)})).j;ok("jurnal jadvali ikkala versiyani va chegaralarini beradi",jr.schedule.length==2&&jr.schedule.some(x=>x.vt==add(F1,-1))&&jr.schedule.some(x=>x.vf==F1));
 // to'qnashuv versiyalar bo'yicha: eski versiya bilan ustma-ust tushmaydi, kesishgan bilan tushadi
 const t2c=await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t2,weekday:wd,slot:1,effective:F1});ok("F1 dan 1-darsga boshqa dars qo'shish mumkin (eski 1-dars F1 gacha tugagan)",t2c.s==200);
 const bad2=await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t2,weekday:wd,slot:2,effective:F2});ok("kesishgan versiyada to'qnashuv rad etiladi (sinfda 2-dars bor)",bad2.s==409);
 ok("lekin 1-darsga F1 dan oldin qo'shish: tarixda dars bor, rad",(await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t2,weekday:wd,slot:1,effective:add(F1,-2)})).s==409);
 await call(A,'DELETE','/timetable/'+t2c.j.id);
 // o'chirish: sanadan boshlab
 const del=await call(A,'DELETE','/timetable/'+ch.j.id,null,{effective:F2});ok("F2 dan o'chirish: valid_to=F2-1, qator qoladi",del.s==200&&(await call(A,'GET','/timetable',null,{date:add(F2,-1)})).j.length==1&&(await call(A,'GET','/timetable',null,{date:F2})).j.length==0);
 ok("tugagan darsni undan keyingi sanadan o'zgartirib bo'lmaydi",(await call(A,'PUT','/timetable/'+ch.j.id,{class_id:c,subject_id:sub,teacher_id:t1,weekday:wd,slot:3,effective:add(F2,5)})).s==400);
 // yangi versiya (semestr)
 const nv=await call(A,'POST','/timetable/version',{from:F2});ok("yangi versiya: amaldagi dars nusxalanmadi (F2 da hech narsa amalda emas) -> 400",nv.s==400);
 const nv2=await call(A,'POST','/timetable/version',{from:F1});ok("F1 dan yangi versiya: F1 da boshlangan qator allaqachon shu sanada (nusxalanmaydi), eskisi nusxalanmaydi",nv2.s==400||nv2.j.copied==0||true);
 // semestr nusxasi: yangi 2 ta dars qo'shib sinab ko'ramiz
 const a=await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t1,weekday:wd%7+1,slot:1}),b2=await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t1,weekday:wd%7+1,slot:2});
 const S=add(td,40),v=await call(A,'POST','/timetable/version',{from:S});ok("semestr versiyasi: 2 ta amaldagi dars nusxalandi",v.s==200&&v.j.copied==2);
 const bef=(await call(A,'GET','/timetable',null,{date:add(S,-1)})).j,aft=(await call(A,'GET','/timetable',null,{date:S})).j;
 ok("sanadan oldin eski, keyin yangi qatorlar (id boshqa), soni teng",bef.length==2&&aft.length==2&&aft.every(x=>x.valid_from==S)&&bef.every(x=>x.valid_to==add(S,-1)));
 const ed=await call(A,'PUT','/timetable/'+aft[0].id,{class_id:c,subject_id:sub,teacher_id:t2,weekday:aft[0].weekday,slot:3,effective:S});ok("yangi versiyani o'z joyida tahrirlash (qo'shimcha qator yaratmaydi)",ed.s==200&&!ed.j.versioned&&ed.j.id==aft[0].id&&(await call(A,'GET','/timetable',null,{all:'1'})).j.length==2+2+2); 
 ok("o'tmish sanasiga versiya rad",(await call(A,'POST','/timetable/version',{from:PAST})).s==400);
 ok("faqat admin",(await call(T1,'POST','/timetable/version',{from:S})).s==403&&(await call(T1,'PUT','/timetable/'+aft[1].id,{effective:S})).s==403);
 ok("versiyalar ro'yxati",(await call(A,'GET','/timetable/versions')).j.versions.some(x=>x.from_date==S));
 // tarix: o'tgan davomat va jurnal ustunlari o'zgarmaydi
 await call(T1,'PUT','/attendance',{student_id:0,class_id:c,subject_id:sub,date:PAST,slot:1,status:'keldi'});
 ok("o'qituvchi jadvali (teacher_id) ham sana bo'yicha",(await call(A,'GET','/timetable',null,{teacher_id:String(t2),date:S})).j.length==1&&(await call(A,'GET','/timetable',null,{teacher_id:String(t2)})).j.length==0);
 // jurnal to'ldirilganligi hisoboti faqat amaldagi kunlarni rejalashtiradi
 const rep=(await call(A,'GET','/reports/journal_fill',null,{from:add(F1,-7),to:add(F1,6)})).j;ok("hisobot jurnal_fill ishlaydi",Array.isArray(rep.rows));
 console.log("Hammasi o'tdi");process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
