// Xodim paroli, chorak/yillik baholar, qaydnoma, bugungi darslar testlari
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||''},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const mk=async(l,f,s)=>(await call(A,'POST','/users',{login:l,first_name:f,last_name:s,password:'Teacher123',role:'teacher'})).j.id;
 const t1=await mk('fizik1','Adxamjon','Odilov'),t2=await mk('mat1','Dilnoza','Karimova');
 const L=async(l,p)=>(await call('','POST','/login',{login:l,password:p||'Teacher123'})).ck;let T1=await L('fizik1');const T2=await L('mat1');

 // ---- xodim parolini almashtirish
 ok("noto'g'ri joriy parol rad",(await call(T1,'POST','/me/password',{old:'xato',new:'Yangi12345'})).s==400);
 ok('qisqa yangi parol rad',(await call(T1,'POST','/me/password',{old:'Teacher123',new:'qisqa'})).s==400);
 ok('eski bilan bir xil rad',(await call(T1,'POST','/me/password',{old:'Teacher123',new:'Teacher123'})).s==400);
 ok('kirishsiz rad',(await call('','POST','/me/password',{old:'a',new:'b'})).s==401);
 const OLD=T1,pw=await call(T1,'POST','/me/password',{old:'Teacher123',new:'Yangi12345'});
 ok('parol almashdi, yangi sessiya beriladi',pw.s==200&&pw.ck.startsWith('sid='));
 ok('yangi sessiya ishlaydi',(await call(pw.ck,'GET','/me')).s==200);
 ok('eski sessiya bekor bo\'ldi',(await call(OLD,'GET','/me')).s==401);
 ok('eski parol bilan kirib bo\'lmaydi',(await call('','POST','/login',{login:'fizik1',password:'Teacher123'})).s==401);
 T1=await L('fizik1','Yangi12345');ok('yangi parol bilan kirish',(await call(T1,'GET','/me')).s==200);
 const T2old=T2;await call(A,'PATCH','/users/'+t2,{password:'Boshqa12345'});
 ok('admin parolni almashtirsa sessiya bekor',(await call(T2old,'GET','/me')).s==401);

 // ---- chorak/yillik baholar
 for(const n of['Fizika','Matematika'])await call(A,'POST','/subjects',{name:n});const sb=(await call(A,'GET','/subjects')).j,F=sb.find(x=>x.name=='Fizika').id,M=sb.find(x=>x.name=='Matematika').id;
 await call(A,'POST','/academic_years',{name:'2026-2027',start_date:'2026-09-01',end_date:'2027-05-31',is_current:1});
 const yid=(await call(A,'GET','/academic_years')).j.years[0].id;
 const t1id=(await call(A,'POST','/terms',{year_id:yid,name:'1-chorak',start_date:'2026-09-01',end_date:'2026-10-31'}),(await call(A,'GET','/academic_years')).j.terms.find(t=>t.name=='1-chorak').id);
 await call(A,'POST','/terms',{year_id:yid,name:'2-chorak',start_date:'2026-11-01',end_date:'2026-12-28'});
 const terms=(await call(A,'GET','/academic_years')).j.terms,q2=terms.find(t=>t.name=='2-chorak').id;
 const c=(await call(A,'POST','/classes',{name:'8-A',year:'2026-2027',homeroom_id:t1})).j.id;
 await call(A,'POST','/assignments',{class_id:c,subject_id:F,teacher_id:t1});await call(A,'POST','/assignments',{class_id:c,subject_id:M,teacher_id:t2});
 await call(A,'POST','/students',{class_id:c,rows:[{name:'Aliyev Vali'},{name:'Boboyev Sami'},{name:'Karimov Jasur'}]});
 const S=(await call(A,'GET','/students',null,{class_id:String(c)})).j,[a,b,d]=S;
 const gr=(s,date,v,type,max)=>call(T1,'PUT','/grades',{student_id:s.id,class_id:c,subject_id:F,date,type:type||'joriy',value:v,max:max||5});
 // a: 5,4 (joriy) + nazorat 4 (vazn 2) -> (5+4+8)/4 = 4.25 -> 4
 await gr(a,'2026-09-10',5);await gr(a,'2026-09-12',4);await gr(a,'2026-09-20',4,'nazorat');
 // b: 4.5 o'rtacha (5 va 4) -> 5 (yarim yuqoriga); d: baholanmagan; ikkinchi chorakda a: 10/10 -> 5
 await gr(b,'2026-09-10',5);await gr(b,'2026-09-12',4);await gr(a,'2026-11-05',10,'joriy',10);
 let pg=(await call(T1,'GET','/period_grades',null,{class_id:String(c),subject_id:String(F)})).j;
 const ra=pg.students.find(x=>x.id==a.id),rb=pg.students.find(x=>x.id==b.id),rd=pg.students.find(x=>x.id==d.id);
 ok("o'qituvchi ko'radi, tahrirlay oladi, 2 chorak",pg.can_edit&&pg.terms.length==2&&pg.year.name=='2026-2027');
 ok('vaznli o\'rtacha 4.25 -> 4',ra.terms[t1id].avg==4.25&&ra.terms[t1id].auto==4&&ra.terms[t1id].n==3);
 ok("4.5 -> 5 (yuqoriga yaxlitlash)",rb.terms[t1id].auto==5);
 ok("baholanmagan o'quvchida avto yo'q",rd.terms[t1id].auto==null&&rd.year.auto==null);
 ok("10/10 -> 5 ballik shkalaga keltirildi",ra.terms[q2].auto==5);
 ok('yillik avto: choraklar o\'rtachasi (4,5 -> 5)',ra.year.auto==5);
 const put=(s,k,t,v,ck)=>call(ck||T1,'PUT','/period_grades',{student_id:s.id,class_id:c,subject_id:F,kind:k,term_id:t,value:v});
 ok("boshqa fan o'qituvchisi yoza olmaydi",(await put(a,'term',t1id,4,(await L('mat1','Boshqa12345')))).s==403);
 ok('1 yoki 6 rad',(await put(a,'term',t1id,1)).s==400&&(await put(a,'term',t1id,6)).s==400&&(await put(a,'term',t1id,3.5)).s==400);
 ok("begona chorak rad",(await put(a,'term',99999,4)).s==400);
 ok('chorak bahosi qo\'yildi',(await put(a,'term',t1id,3)).s==200);
 pg=(await call(T1,'GET','/period_grades',null,{class_id:String(c),subject_id:String(F)})).j;
 ok('qo\'lda baho saqlandi (avto o\'zgarmadi)',pg.students.find(x=>x.id==a.id).terms[t1id].value==3&&pg.students.find(x=>x.id==a.id).terms[t1id].auto==4);
 let f=(await call(T1,'POST','/period_grades/fill',{class_id:c,subject_id:F,kind:'term',term_id:t1id})).j;
 ok("avto to'ldirish: tasdiqlangan 3 saqlanadi, bo'shi to'ldiriladi (faqat b)",f.filled==1);
 f=(await call(T1,'POST','/period_grades/fill',{class_id:c,subject_id:F,kind:'term',term_id:t1id,overwrite:true})).j;
 ok('overwrite: a va b qayta hisoblandi',f.filled==2);
 pg=(await call(T1,'GET','/period_grades',null,{class_id:String(c),subject_id:String(F)})).j;
 ok('a 1-chorak 3 dan avtoga (4) qaytdi',pg.students.find(x=>x.id==a.id).terms[t1id].value==4);
 await call(T1,'POST','/period_grades/fill',{class_id:c,subject_id:F,kind:'term',term_id:q2});
 await call(T1,'POST','/period_grades/fill',{class_id:c,subject_id:F,kind:'year',term_id:0});
 pg=(await call(T1,'GET','/period_grades',null,{class_id:String(c),subject_id:String(F)})).j;
 ok("yillik baho: tasdiqlangan choraklar (4 va 5 -> 5)",pg.students.find(x=>x.id==a.id).year.value==5);
 ok("o'chirish (null)",(await put(a,'year',0,null)).s==200&&(await call(T1,'GET','/period_grades',null,{class_id:String(c),subject_id:String(F)})).j.students.find(x=>x.id==a.id).year.value==null);
 ok("jurnal: mat o'qituvchisi faqat ko'ra oladi",!(await call(await L('mat1','Boshqa12345'),'GET','/period_grades',null,{class_id:String(c),subject_id:String(F)})).j.can_edit);

 // ---- qaydnoma
 const qy=(await call(A,'GET','/reports/qaydnoma',null,{class_id:String(c)})).j;
 ok('qaydnoma: 2 fan, 3 o\'quvchi, tasdiqlangan baholar',qy.subjects.length==2&&qy.students.length==3&&qy.students.find(x=>x.id==a.id).cells[F].terms[t1id]==4&&qy.students.find(x=>x.id==d.id).cells[F].terms[t1id]==null);
 const qm=(await call(await L('mat1','Boshqa12345'),'GET','/reports/qaydnoma',null,{class_id:String(c)})).j;
 ok("qaydnoma: boshqa fan o'qituvchisi faqat o'z fanini ko'radi",qm.subjects.length==1&&qm.subjects[0].id==M);
 ok("qaydnoma: kirishsiz rad",(await call('','GET','/reports/qaydnoma',null,{class_id:String(c)})).s==401);

 // ---- o'quvchi kabineti
 const acc=(await call(A,'POST','/students/'+a.id+'/account',{})).j,SC=(await call('','POST','/login',{login:acc.login,password:acc.password})).ck;
 const ov=(await call(SC,'GET','/student/overview')).j;
 ok("o'quvchi o'zining chorak baholarini ko'radi",ov.finals.some(x=>x.subject=='Fizika'&&x.kind=='term'&&x.value==4)&&ov.finals.every(x=>x.value>=2));
 ok("o'quvchi staff parol yo'lini ishlata olmaydi",(await call(SC,'POST','/me/password',{old:acc.password,new:'Yangi12345'})).s==403);

 // ---- zaxira/tiklash chorak baholarni saqlaydi; o'quvchi o'chirilsa baholari ham
 const bk=(await call(A,'GET','/backup')).j;ok('zaxirada period_grades bor',bk.period_grades.length>=3);
 ok('tiklash o\'tdi',(await call(A,'POST','/restore',{confirm:'TIKLASH',data:bk})).s==200);
 ok('tiklashdan keyin baholar joyida',(await call(T1,'GET','/period_grades',null,{class_id:String(c),subject_id:String(F)})).j.students.find(x=>x.id==b.id).terms[t1id].value==5);
 await call(A,'DELETE','/students/'+b.id);
 ok("o'quvchi o'chirilsa chorak baholari ham o'chadi",(await call(A,'GET','/backup')).j.period_grades.every(x=>x.student_id!=b.id));

 // ---- shaxsiy havola
 const c2=(await call(A,'POST','/classes',{name:'9-B',year:'2026-2027',homeroom_id:t2})).j.id;await call(A,'POST','/students',{class_id:c2,rows:[{name:'Rahimov Aziz'}]});
 const o2=(await call(A,'GET','/students',null,{class_id:String(c2)})).j[0];
 ok("sinf rahbari bo'lmagan o'qituvchi havola yarata olmaydi",(await call(T1,'POST','/students/'+o2.id+'/link',{})).s==403);
 const lk=(await call(A,'POST','/students/'+d.id+'/link',{kind:'student'})).j;ok('havola yaratildi (token uzun)',lk.token&&lk.token.length>=30);
 const li=await call('','POST','/link-login',{token:lk.token});ok("havola bilan o'quvchi kabinetiga kirildi",li.s==200&&li.j.role=='student'&&(await call(li.ck,'GET','/student/overview')).s==200);
 ok("havola bilan xodim yo'llari yopiq",(await call(li.ck,'GET','/users')).s==403);
 ok("noto'g'ri token rad",(await call('','POST','/link-login',{token:'x'.repeat(32)})).s==401&&(await call('','POST','/link-login',{token:'qisqa'})).s==401);
 const lp=(await call(A,'POST','/students/'+d.id+'/link',{kind:'parent'})).j,lpi=await call('','POST','/link-login',{token:lp.token});ok("ota-ona havolasi ota-ona sifatida kiritadi",lpi.j.role=='parent');
 ok("studentlar ro'yxatida has_link belgisi",(await call(A,'GET','/students',null,{class_id:String(c)})).j.find(x=>x.id==d.id).has_link==1);
 const lk2=(await call(A,'POST','/students/'+d.id+'/link',{kind:'student'})).j;
 ok("yangilanganda eski havola ishlamaydi",(await call('','POST','/link-login',{token:lk.token})).s==401&&(await call('','POST','/link-login',{token:lk2.token})).s==200);
 await call(A,'PATCH','/students/'+d.id+'/account',{is_active:0});ok("hisob bloklansa havola ishlamaydi",(await call('','POST','/link-login',{token:lk2.token})).s==401);
 await call(A,'PATCH','/students/'+d.id+'/account',{is_active:1});
 await call(A,'DELETE','/students/'+d.id+'/link',null,{kind:'student'});ok('bekor qilingan havola ishlamaydi',(await call('','POST','/link-login',{token:lk2.token})).s==401);
 const bl=(await call(A,'POST','/classes/'+c+'/links',{kind:'student'})).j;ok("sinf uchun ommaviy havola (faol o'quvchilar)",bl.links.length>=2&&bl.links.every(x=>x.token));
 ok("ikkinchi marta: yangi yaratilmaydi",(await call(A,'POST','/classes/'+c+'/links',{kind:'student'})).j.links.length==0&&(await call(A,'POST','/classes/'+c+'/links',{kind:'student',regen:true})).j.links.length>=2);

 // ---- bugungi darslar
 const dash=(await call(T1,'GET','/dashboard')).j;ok('dashboard ishlaydi (marked/topic maydonlari)',Array.isArray(dash.lessons_today));
 console.log('\nHAMMASI O\'TDI');
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
