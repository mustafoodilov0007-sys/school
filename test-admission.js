// Nazorat imtihoniga ruxsat testlari
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||''},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
const T=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tashkent'});
const ago=n=>new Date(new Date(T+'T12:00:00Z').getTime()-n*864e5).toISOString().slice(0,10);
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const mk=async(l,f,s)=>(await call(A,'POST','/users',{login:l,first_name:f,last_name:s,password:'Teacher123',role:'teacher'})).j.id;
 const t1=await mk('fizik1','Adxamjon','Odilov'),t2=await mk('mat1','Dilnoza','Karimova');
 const L=async l=>(await call('','POST','/login',{login:l,password:'Teacher123'})).ck;const T1=await L('fizik1'),T2=await L('mat1');
 for(const n of['Fizika','Matematika'])await call(A,'POST','/subjects',{name:n});const sb=(await call(A,'GET','/subjects')).j,F=sb.find(x=>x.name=='Fizika').id,M=sb.find(x=>x.name=='Matematika').id;
 const c=(await call(A,'POST','/classes',{name:'8-A',year:'2026-2027',homeroom_id:t2})).j.id;
 await call(A,'POST','/assignments',{class_id:c,subject_id:F,teacher_id:t1});await call(A,'POST','/assignments',{class_id:c,subject_id:M,teacher_id:t2});
 await call(A,'POST','/students',{class_id:c,rows:[{name:'Aliyev Vali'},{name:'Boboyev Sami'},{name:'Karimov Jasur'},{name:'Zokirov Ali'}]});
 const S=(await call(A,'GET','/students',null,{class_id:String(c)})).j,[a,b,cc,d]=S;
 const mark=(ck,s,sj,date,status)=>call(ck,'PUT','/attendance',{student_id:s.id,class_id:c,subject_id:sj,date,status});
 await call(T1,'PUT','/lessons',{class_id:c,subject_id:F,date:ago(10),topic:'Nyuton qonunlari'});await call(T1,'PUT','/lessons',{class_id:c,subject_id:F,date:ago(3),topic:'Impuls'});
 // a: Fizikadan 4 ta uzrsiz (2 hafta ichida) -> ruxsat yo'q
 for(const n of [12,10,3,1])await mark(T1,a,F,ago(n),'kelmadi');
 // b: 3 ta -> ogohlantirish; 1 ta uzrli ham bor (hisobga olinmaydi)
 for(const n of [9,2,1])await mark(T1,b,F,ago(n),'kelmadi');await mark(T1,b,F,ago(5),'uzrli');await mark(T1,b,F,ago(6),'kechikdi');
 // c: 2 ta, ikkalasi shu haftada -> ogohlantirish
 for(const n of [2,1])await mark(T1,cc,F,ago(n),'kelmadi');
 // d: 4 ta, lekin 2 haftadan oldin (20+ kun) -> hech narsa
 for(const n of [30,25,20,18])await mark(T1,d,F,ago(n),'kelmadi');
 // a: Matematikadan 1 ta
 await mark(T2,a,M,ago(2),'kelmadi');
 const R=(await call(A,'GET','/admission',null,{class_id:String(c)})).j;
 ok('sozlama: 4 ta / 14 kun',R.cfg.max==4&&R.cfg.days==14&&R.cfg.week==2);
 const ga=R.items.find(x=>x.student_id==a.id&&x.subject_id==F),gb=R.items.find(x=>x.student_id==b.id),gc=R.items.find(x=>x.student_id==cc.id);
 ok("a: 2 haftada 4 ta uzrsiz -> RUXSAT YO'Q",ga&&ga.blocked&&ga.absences==4);
 ok("a: o'tkazib yuborilgan mavzular ro'yxatda",ga.missed.length==4&&ga.missed.some(m=>m.topic=='Nyuton qonunlari')&&ga.missed.some(m=>m.topic=='Impuls'));
 ok("b: 3 ta uzrsiz (uzrli va kechikkan hisobga olinmaydi) -> ogohlantirish",gb&&!gb.blocked&&gb.warn&&gb.absences==3);
 ok("c: haftada 2 ta -> ogohlantirish",gc&&!gc.blocked&&gc.warn&&gc.week==2);
 ok("d: 2 haftadan oldingi darslar hisobga olinmaydi",!R.items.some(x=>x.student_id==d.id));
 ok("a: matematikadan 1 ta -> bayroq yo'q",!R.items.some(x=>x.student_id==a.id&&x.subject_id==M));
 ok("ruxsat yo'qlar birinchi",R.items[0].blocked&&R.items[0].student_id==a.id);
 // ruxsatlar
 const R1=(await call(T1,'GET','/admission',null,{class_id:String(c)})).j;ok("fan o'qituvchisi o'z fanini ko'radi",R1.items.length==3);
 const R2=(await call(T2,'GET','/admission',null,{class_id:String(c)})).j;ok("sinf rahbari butun sinfni ko'radi",R2.items.length==3);
 const o=await mk('boshqa','Sardor','Valiyev'),T3=await L('boshqa');
 ok("begona o'qituvchiga yopiq",(await call(T3,'GET','/admission',null,{class_id:String(c)})).s==403);
 ok("begona o'qituvchi otrabotkani belgilay olmaydi",(await call(T3,'POST','/admission/clear',{student_id:a.id,subject_id:F})).s==403);
 // o'quvchi / ota-ona ko'radi
 const ac=(await call(A,'POST','/students/'+a.id+'/account',{})).j,pc=(await call(A,'POST','/students/'+a.id+'/parent',{})).j,bc=(await call(A,'POST','/students/'+b.id+'/account',{})).j;
 const SA=(await call('','POST','/login',{login:ac.login,password:ac.password})).ck,PA=(await call('','POST','/login',{login:pc.login,password:pc.password})).ck,SB=(await call('','POST','/login',{login:bc.login,password:bc.password})).ck;
 const so=(await call(SA,'GET','/student/overview')).j;ok("o'quvchi: Fizikadan ruxsat yo'q ko'rinadi",so.admission.items.length==1&&so.admission.items[0].blocked&&so.admission.items[0].subject=='Fizika');
 ok("ota-ona ham ko'radi",(await call(PA,'GET','/student/overview')).j.admission.items[0].blocked);
 const sb2=(await call(SB,'GET','/student/overview')).j;ok("o'quvchi b faqat ogohlantirish",sb2.admission.items.length==1&&sb2.admission.items[0].warn&&!sb2.admission.items[0].blocked);
 ok("o'quvchi /admission ga kira olmaydi",(await call(SA,'GET','/admission')).s==403&&(await call(SA,'POST','/admission/clear',{student_id:a.id,subject_id:F})).s==403);
 // otrabotka
 ok("fan o'qituvchisi otrabotkani belgiladi",(await call(T1,'POST','/admission/clear',{student_id:a.id,subject_id:F,note:'Mavzular qayta topshirildi'})).s==200);
 const R3=(await call(A,'GET','/admission',null,{class_id:String(c)})).j;ok("otrabotkadan keyin ruxsat qaytdi",!R3.items.some(x=>x.student_id==a.id));
 ok("o'quvchi kabinetida ham yo'qoldi",(await call(SA,'GET','/student/overview')).j.admission.items.length==0);
 await mark(T1,a,F,ago(0),'kelmadi');ok("otrabotkadan keyingi 1 ta yangi uzrsiz hisoblanadi, hali ruxsat bor",(await call(A,'GET','/admission',null,{class_id:String(c)})).j.items.every(x=>x.student_id!=a.id||!x.blocked));
 // sozlama
 ok("faqat admin sozlamani o'zgartiradi",(await call(T1,'PUT','/settings',{adm_max:3})).s==403);
 ok("noto'g'ri qiymat rad",(await call(A,'PUT','/settings',{adm_max:0})).s==400);
 ok("sozlama o'zgardi: 3 ta",(await call(A,'PUT','/settings',{adm_max:3})).s==200&&(await call('','GET','/public')).j.adm.max==3);
 const R4=(await call(A,'GET','/admission',null,{class_id:String(c)})).j;ok("chegara 3 bo'lganda b ham bloklandi",R4.items.find(x=>x.student_id==b.id).blocked);
 ok("o'quvchi o'chirilsa otrabotka yozuvi ham o'chadi",(await call(A,'DELETE','/students/'+a.id)).s==200);
 console.log("\nNAZORATGA RUXSAT TESTLARI O'TDI");
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
