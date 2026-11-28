// Yangi o'quv yiliga o'tkazish: tarix saqlanadi, sinflar arxivga, bitiruvchilar arxiv holatida
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||''},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
const td=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tashkent'});
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const t1=(await call(A,'POST','/users',{login:'ustoz1',first_name:'Ali',last_name:'Valiyev',password:'Teacher123',role:'teacher'})).j.id;
 const T1=(await call('','POST','/login',{login:'ustoz1',password:'Teacher123'})).ck;
 await call(A,'POST','/subjects',{name:'Fizika'});const sub=(await call(A,'GET','/subjects')).j[0].id;
 await call(A,'PUT','/bell_slots',{slots:[{start:'08:00',end:'08:45'},{start:'08:55',end:'09:40'}]});
 const c5=(await call(A,'POST','/classes',{name:'5-A',year:'2026-2027',homeroom_id:t1})).j.id,c11=(await call(A,'POST','/classes',{name:'11-A',year:'2026-2027'})).j.id;
 await call(A,'POST','/students',{class_id:c5,rows:[{name:'Aliyev Vali'},{name:'Karimov Jasur'}]});await call(A,'POST','/students',{class_id:c11,rows:[{name:'Bitiruvchi Sami'}]});
 const S5=(await call(A,'GET','/students',null,{class_id:String(c5)})).j,S11=(await call(A,'GET','/students',null,{class_id:String(c11)})).j;
 await call(A,'POST','/assignments',{class_id:c5,subject_id:sub,teacher_id:t1});await call(A,'POST','/timetable',{class_id:c5,subject_id:sub,teacher_id:t1,weekday:1,slot:1});
 await call(T1,'PUT','/grades',{student_id:S5[0].id,class_id:c5,subject_id:sub,date:td,type:'joriy',value:5,max:5});await call(T1,'PUT','/attendance',{student_id:S5[0].id,class_id:c5,subject_id:sub,date:td,slot:1,status:'kelmadi'});
 await call(A,'PUT','/fin/tariffs/class',{class_id:c5,monthly:1000000});await call(A,'POST','/fin/charges/generate',{period:td.slice(0,7)});
 const acc=(await call(A,'POST','/students/'+S11[0].id+'/account',{})).j;
 // ko'rik
 const pv=(await call(A,'GET','/year/preview')).j;ok("ko'rik: yangi yil va taklif qilingan sinflar",pv.new_year=='2027-2028'&&pv.classes.find(c=>c.name=='5-A').to=='6-A'&&pv.classes.find(c=>c.name=='11-A').grad===true&&pv.classes.find(c=>c.name=='5-A').debt==2000000);
 ok("faqat admin",(await call(T1,'GET','/year/preview')).s==403&&(await call(T1,'POST','/year/promote',{})).s==403);
 const body=(o={})=>({confirm:'OTKAZISH',new_year:'2027-2028',last_day:td,copy_fee:true,plan:[{class_id:c5,to:'6-A'},{class_id:c11,to:null}],...o});
 ok("tasdiqsiz rad",(await call(A,'POST','/year/promote',body({confirm:'x'}))).s==400);
 ok("noto'g'ri yil formati rad",(await call(A,'POST','/year/promote',body({new_year:'2027'}))).s==400);
 ok("bo'sh reja rad",(await call(A,'POST','/year/promote',body({plan:[]}))).s==400);
 ok("sinf ikki marta rad",(await call(A,'POST','/year/promote',body({plan:[{class_id:c5,to:'6-A'},{class_id:c5,to:'6-B'}]}))).s==400);
 ok("o'zi bilan bir xil sinf rad",(await call(A,'POST','/year/promote',body({new_year:'2026-2027',plan:[{class_id:c5,to:'5-A'}]}))).s==400);
 ok("hech narsa o'zgarmagan (rad etilganlar)",(await call(A,'GET','/classes')).j.length==2);
 const r=await call(A,'POST','/year/promote',body());ok("o'tkazish bajarildi: 2 ko'chdi, 1 bitirdi",r.s==200&&r.j.moved==2&&r.j.graduated==1);
 const cl=(await call(A,'GET','/classes')).j;ok("joriy sinflar: faqat yangi 6-A",cl.length==1&&cl[0].name=='6-A'&&cl[0].year=='2027-2028');
 const ar=(await call(A,'GET','/classes',null,{archived:'only'})).j;ok("arxiv sinflar: 5-A va 11-A",ar.length==2&&ar.every(c=>c.archived==1));
 const n6=(await call(A,'GET','/students',null,{class_id:String(cl[0].id)})).j;ok("o'quvchilar yangi sinfda",n6.length==2&&n6.some(x=>x.name=='Aliyev Vali'));
 const s11=(await call(A,'GET','/students',null,{class_id:String(c11)})).j;ok("bitiruvchi: arxiv holati",s11.every(x=>x.status=='arxiv')||s11.length==0);
 ok("bitiruvchi hisobi bilan kirish bloklangan",(await call('','POST','/login',{login:acc.login,password:acc.password})).s!=200);
 const jr=(await call(A,'GET','/journal',null,{class_id:String(c5),subject_id:String(sub)})).j;ok("eski sinf jurnali: ko'chgan o'quvchi bahosi va davomati saqlangan",jr.students.length==1&&jr.students[0].moved==1&&jr.grades.length==1&&jr.attendance.length==1);
 const jn=(await call(A,'GET','/journal',null,{class_id:String(cl[0].id),subject_id:String(sub)})).j;ok("yangi sinf jurnali toza",jn.students.length==2&&jn.grades.length==0);
 const ttOld=(await call(A,'GET','/timetable',null,{all:'1'})).j.find(x=>x.class_id==c5);ok("eski sinf jadvali last_day da tugadi",ttOld.valid_to==td);
 const fee=(await call(A,'GET','/fin/tariffs',null,{class_id:String(cl[0].id)})).j;ok("sinf tarifi nusxalandi",fee.monthly==1000000);
 ok("o'qituvchi: arxiv va joriy ro'yxati (assignment 5-A bo'yicha)",(await call(T1,'GET','/classes')).j.length==0&&(await call(T1,'GET','/classes',null,{archived:'only'})).j.some(c=>c.name=='5-A'));
 ok("arxivdagi sinfni qayta o'tkazib bo'lmaydi",(await call(A,'POST','/year/promote',body({plan:[{class_id:c5,to:'7-A'}]}))).s==400);
 ok("ochiq sahifa faqat joriy sinflarni sanaydi",(await call('','GET','/public/home')).j.stats.classes==1);
 // o'quvchining o'z tarixi (baholari) saqlangan
 const acc5=(await call(A,'POST','/students/'+S5[0].id+'/account',{})).j,SC=(await call('','POST','/login',{login:acc5.login,password:acc5.password})).ck;
 const ov=(await call(SC,'GET','/student/overview')).j;ok("o'quvchi kabinetida eski baho ko'rinadi",(ov.grades||[]).length==1);
 // ikki sinfni birlashtirish (to'qnashmaydi)
 const cx=(await call(A,'POST','/classes',{name:'7-A',year:'2027-2028'})).j.id,cy=(await call(A,'POST','/classes',{name:'7-B',year:'2027-2028'})).j.id;
 await call(A,'POST','/students',{class_id:cx,rows:[{name:'Bir'}]});await call(A,'POST','/students',{class_id:cy,rows:[{name:'Ikki'}]});
 const mg=await call(A,'POST','/year/promote',body({new_year:'2028-2029',plan:[{class_id:cx,to:'8-A'},{class_id:cy,to:'8-A'},{class_id:cl[0].id,to:'7-A'}]}));ok("ikki sinf bitta sinfga birlashadi",mg.s==200&&(await call(A,'GET','/classes')).j.filter(c=>c.name=='8-A').length==1&&(await call(A,'GET','/students',null,{class_id:String((await call(A,'GET','/classes')).j.find(c=>c.name=='8-A').id)})).j.length==2);
 console.log("Hammasi o'tdi");process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
