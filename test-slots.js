// Dars raqami (slot) bo'yicha jadval + o'quvchini o'chirish testlari
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||''},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const t1=(await call(A,'POST','/users',{login:'slot1',first_name:'Ali',last_name:'Valiyev',password:'Teacher123',role:'teacher'})).j.id;
 const t2=(await call(A,'POST','/users',{login:'slot2',first_name:'Vali',last_name:'Aliyev',password:'Teacher123',role:'teacher'})).j.id;
 const T1=(await call('','POST','/login',{login:'slot1',password:'Teacher123'})).ck;
 await call(A,'POST','/subjects',{name:'Fizika'});const sub=(await call(A,'GET','/subjects')).j[0].id;
 const c=(await call(A,'POST','/classes',{name:'5-A',year:'2026-2027',homeroom_id:t2})).j.id;
 ok("qo'ng'iroq sozlanmagan: 1-dars rad etiladi",(await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t1,weekday:1,slot:1})).s==400);
 ok("qo'ng'iroq jadvali saqlandi",(await call(A,'PUT','/bell_slots',{slots:[{start:'08:00',end:'08:45'},{start:'08:55',end:'09:40'},{start:'09:50',end:'10:35'}]})).s==200);
 const x=await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t1,weekday:1,slot:2,room:'12'});ok('2-dars qo\'shildi: '+x.j.error,x.s==200);
 let L=(await call(A,'GET','/timetable',null,{class_id:String(c)})).j;
 ok('vaqt qo\'ng\'iroqdan olindi (08:55–09:40, slot=2)',L.length==1&&L[0].slot==2&&L[0].start=='08:55'&&L[0].end=='09:40');
 const as=(await call(A,'GET','/assignments')).j;ok("o'qituvchi sinf+fanga avtomatik biriktirildi",as.some(z=>z.class_id==c&&z.subject_id==sub&&z.teacher_id==t1));
 ok("bir xil o'rinda ikkinchi dars: to'qnashuv",(await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t2,weekday:1,slot:2})).s==409);
 const y=await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t1,weekday:3,slot:1});ok('1-dars boshqa kunga qo\'shildi',y.s==200);
 ok("o'rnini o'zgartirish: 3-dars, juma",(await call(A,'PUT','/timetable/'+y.j.id,{class_id:c,subject_id:sub,teacher_id:t1,weekday:5,slot:3})).s==200);
 L=(await call(A,'GET','/timetable',null,{class_id:String(c)})).j;const m=L.find(z=>z.id==y.j.id);ok('o\'rni o\'zgardi (juma, 3-dars, 09:50)',m.weekday==5&&m.slot==3&&m.start=='09:50');
 ok("qo'ng'iroq vaqti o'zgarsa jadval vaqti ham o'zgaradi",(await call(A,'PUT','/bell_slots',{slots:[{start:'08:00',end:'08:40'},{start:'08:50',end:'09:30'},{start:'09:40',end:'10:20'}]})).s==200&&(await call(A,'GET','/timetable',null,{class_id:String(c)})).j.find(z=>z.id==y.j.id).start=='09:40');
 ok("o'qituvchi jadvalni o'zgartira olmaydi",(await call(T1,'PUT','/timetable/'+y.j.id,{class_id:c,subject_id:sub,teacher_id:t1,weekday:5,slot:1})).s==403);
 // eski usul (vaqt bilan) ishlashda davom etadi va mos vaqt raqamga bog'lanadi
 const z=await call(A,'POST','/timetable',{class_id:c,subject_id:sub,teacher_id:t1,weekday:2,start:'08:00',end:'08:40'});ok('vaqt bilan qo\'shish ishlaydi',z.s==200&&(await call(A,'GET','/timetable',null,{class_id:String(c)})).j.find(q=>q.id==z.j.id).slot==1);
 // o'quvchini o'chirish
 await call(A,'POST','/students',{class_id:c,rows:[{name:'Test Oquvchi Bir'},{name:'Test Oquvchi Ikki'}]});
 const st=(await call(A,'GET','/students',null,{class_id:String(c)})).j;
 await call(A,'PUT','/grades',{student_id:st[0].id,class_id:c,subject_id:sub,date:'2026-11-23',type:'joriy',value:5,max:5});
 await call(A,'PUT','/attendance',{student_id:st[0].id,class_id:c,subject_id:sub,date:'2026-11-23',slot:0,status:'keldi'});
 ok("o'quvchini o'chirish: o'qituvchi (sinf rahbari emas) rad etiladi",(await call(T1,'DELETE','/students/'+st[0].id)).s==403);
 const d=await call(A,'DELETE','/students/'+st[0].id);ok("o'quvchi o'chirildi (1 baho, 1 davomat bilan)",d.s==200&&d.j.grades==1&&d.j.attendance==1);
 ok("ro'yxatda qolmadi, boshqasi saqlandi",(await call(A,'GET','/students',null,{class_id:String(c)})).j.length==1);
 const au=(await call(A,'GET','/audit')).j;ok("o'chirish auditga yozildi",au.some(a=>a.action=='delete'&&a.entity=='student'));
 console.log('\nJADVAL VA O\'CHIRISH TESTLARI O\'TDI');
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
