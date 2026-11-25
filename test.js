process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||''},body:b?JSON.stringify(b):null,queryStringParameters:qs});
 return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
(async()=>{
 let a=await call('','POST','/login',{login:'admin',password:'Admin12345'});ok('admin login',a.s==200);const A=a.ck;
 ok('noto\'g\'ri parol',(await call('','POST','/login',{login:'admin',password:'x'})).s==401);
 ok('login yo\'q -> 401',(await call('','GET','/classes')).s==401);
 const t1=(await call(A,'POST','/users',{login:'teach1',first_name:'Fizika',last_name:'Oqituvchi',password:'Teacher123',role:'teacher'})).j.id;
 const t2=(await call(A,'POST','/users',{login:'teach2',first_name:'Boshqa',last_name:'Ustoz',password:'Teacher123',role:'teacher'})).j.id;
 const T1=(await call('','POST','/login',{login:'teach1',password:'Teacher123'})).ck,T2=(await call('','POST','/login',{login:'teach2',password:'Teacher123'})).ck;
 await call(A,'POST','/subjects',{name:'Fizika'});const sub=(await call(A,'GET','/subjects')).j[0].id;
 const c7=(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027',homeroom_id:t2})).j.id,c8=(await call(A,'POST','/classes',{name:'8-A',year:'2026-2027'})).j.id;
 ok('takror sinf rad',(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027'})).s==409);
 await call(A,'POST','/assignments',{class_id:c7,subject_id:sub,teacher_id:t1});
 let im=await call(A,'POST','/students',{class_id:c7,rows:[{name:'Ali Valiyev',code:'S1'},{name:'Vali Aliyev',code:'S2'},{name:'Ali Valiyev'},{name:'X'}]});
 ok('import: 2 qo\'shildi, 2 takror/xato',im.j.added==2&&im.j.skipped.length==2);
 const st=(await call(A,'GET','/students',null,{class_id:c7})).j[0].id;
 const tt={class_id:c7,subject_id:sub,teacher_id:t1,weekday:1,start:'08:00',end:'08:45',room:'12'};
 ok('jadval qo\'shildi',(await call(A,'POST','/timetable',tt)).s==200);
 const x=await call(A,'POST','/timetable',{...tt,class_id:c8,start:'08:30',end:'09:15',room:'14'});ok('o\'qituvchi to\'qnashuvi: '+x.j.error,x.s==409);
 ok('xona to\'qnashuvi',(await call(A,'POST','/timetable',{...tt,class_id:c8,teacher_id:t2,room:'12'})).s==409);
 ok('o\'qituvchi jadval qo\'sha olmaydi',(await call(T1,'POST','/timetable',tt)).s==403);
 const g={student_id:st,class_id:c7,subject_id:sub,date:'2026-09-10',type:'joriy',value:4,max:5};
 ok('baho qo\'yildi',(await call(T1,'PUT','/grades',g)).s==200);
 await call(T1,'PUT','/grades',{...g,value:5});
 ok('boshqa o\'qituvchi baho qo\'ya olmaydi',(await call(T2,'PUT','/grades',g)).s==403);
 ok('boshqa o\'qituvchi jurnalni ko\'ra olmaydi (c8)',(await call(T1,'GET','/journal',null,{class_id:c8,subject_id:sub})).s==403);
 ok('baho 6/5 rad',(await call(T1,'PUT','/grades',{...g,type:'nazorat',value:6})).s==400);
 ok('davomat',(await call(T1,'PUT','/attendance',{student_id:st,class_id:c7,subject_id:sub,date:'2026-09-10',status:'kechikdi'})).s==200);
 await call(T1,'PUT','/attendance',{student_id:st,class_id:c7,subject_id:sub,date:'2026-09-10',status:'kelmadi'});
 const j=(await call(T1,'GET','/journal',null,{class_id:c7,subject_id:sub})).j;
 ok('qayta ochilganda saqlangan, takror yo\'q',j.grades.length==1&&j.grades[0].value==5&&j.attendance.length==1&&j.attendance[0].status=='kelmadi');
 ok('sinf rahbari davomat yoza olmaydi (fan o\'qituvchisi emas)',(await call(T2,'PUT','/attendance',{student_id:st,class_id:c7,subject_id:sub,date:'2026-09-11',status:'keldi'})).s==403);
 ok('sinf rahbari sinfni ko\'radi',(await call(T2,'GET','/reports/class',null,{class_id:c7})).s==200);
 await call(A,'PATCH','/students/'+st,{status:'arxiv'});
 ok('arxivlangach tarix saqlangan',(await call(A,'GET','/reports/class',null,{class_id:c7})).j.grades.length==1);
 const au=(await call(A,'GET','/audit')).j;ok('audit jurnali (o\'zgarishlar yozilgan)',au.some(r=>r.entity=='grade'&&r.action=='update'&&JSON.parse(r.old).value==4));
 await call(A,'PATCH','/users/'+t1,{is_active:0});ok('faolsizlantirilgan kira olmaydi',(await call('','POST','/login',{login:'teach1',password:'Teacher123'})).s==401);
 ok('eski sessiya ham bekor',(await call(T1,'GET','/me')).s==401);
 const bk=(await call(A,'GET','/backup')).j;ok('zaxira nusxa (parolsiz)',bk.grades.length==1&&!bk.users[0].pass);

 await call(A,'POST','/subjects',{name:'Matematika'});const sub2=(await call(A,'GET','/subjects')).j.find(x=>x.name=='Matematika').id;
 const full={first_name:'Dilnoza',last_name:'Karimova',middle_name:'Akmal qizi',phone:'+998 90 123 45 67',email:'d@mail.uz',birth_date:'1990-05-12',gender:'ayol',hire_date:'2020-09-01',experience_years:8,education:'Oliy',category:'1-toifa',bio:'x',photo:'data:image/jpeg;base64,/9j/4AAQ',login:'dkarimova',password:'Strong1234',role:'teacher',subject_ids:[sub,sub2]};
 const nt=await call(A,'POST','/users',full);ok("to'liq profilli o'qituvchi yaratildi",nt.s==200);
 const ls=(await call(A,'GET','/users')).j.find(x=>x.login=='dkarimova');ok('profil va 2 ta fan saqlandi, parol qaytmaydi',ls.name=='Karimova Dilnoza Akmal qizi'&&ls.experience_years==8&&ls.subjects.length==2&&!('pass' in ls));
 ok('login takror rad',(await call(A,'POST','/users',full)).s==409);
 ok('qisqa parol rad',(await call(A,'POST','/users',{...full,login:'zz1',password:'123'})).s==400);
 ok("noto'g'ri login rad",(await call(A,'POST','/users',{...full,login:'a b'})).s==400);
 ok("noto'g'ri telefon rad",(await call(A,'POST','/users',{...full,login:'zz2',phone:'abc'})).s==400);
 ok('staj 80 rad',(await call(A,'POST','/users',{...full,login:'zz3',experience_years:80})).s==400);
 ok('rasm bo\'lmagan qiymat rad',(await call(A,'POST','/users',{...full,login:'zz4',photo:'http://x'})).s==400);
 ok("mavjud bo'lmagan fan rad",(await call(A,'POST','/users',{...full,login:'zz5',subject_ids:[999]})).s==400);
 ok("rad etilgan so'rovlar foydalanuvchi qoldirmadi",(await call(A,'GET','/users')).j.filter(x=>x.login.startsWith('zz')).length==0);
 await call(A,'PATCH','/users/'+nt.j.id,{subject_ids:[sub],experience_years:9});
 const l2=(await call(A,'GET','/users')).j.find(x=>x.login=='dkarimova');ok('tahrir: fan va staj yangilandi, qolgani saqlandi',l2.subjects.length==1&&l2.experience_years==9&&l2.last_name=='Karimova'&&l2.photo);
 ok("yangi o'qituvchi parol bilan kira oladi",(await call('','POST','/login',{login:'dkarimova',password:'Strong1234'})).s==200);
 ok("o'qituvchi xodimlar ro'yxatini ko'ra olmaydi",(await call(T2,'GET','/users')).s==403);
 ok("o'qituvchi xodim yarata olmaydi",(await call(T2,'POST','/users',{...full,login:'zz9'})).s==403);

 ok("noto'g'ri rang rad",(await call(A,'PUT','/settings',{brand:'red'})).s==400);
 ok("noto'g'ri logo rad",(await call(A,'PUT','/settings',{logo:'http://x/y.png'})).s==400);
 await call(A,'PUT','/settings',{school_name:'Deutsch School MCHJ',brand:'#0265FE',logo:'data:image/png;base64,iVBOR'});
 const pb=(await call('','GET','/public')).j;ok('nom, logo, rang ommaviy sahifaga keladi',pb.brand=='#0265FE'&&pb.logo.startsWith('data:image/png'));
 ok("o'qituvchi sozlamani o'zgartira olmaydi",(await call(T2,'PUT','/settings',{brand:'#000000'})).s==403);
 // ===== 2-bosqich: yangi modullar =====
 const ay={name:'2026-2027',start_date:'2026-09-01',end_date:'2027-05-31',is_current:1};
 ok("o'quv yili yaratildi",(await call(A,'POST','/academic_years',ay)).s==200);
 ok('takror o\'quv yili rad',(await call(A,'POST','/academic_years',ay)).s==409);
 ok("noto'g'ri sana rad",(await call(A,'POST','/academic_years',{...ay,name:'x',start_date:'2027-06-01'})).s==400);
 const yid=(await call(A,'GET','/academic_years')).j.years[0].id;
 ok('chorak yaratildi',(await call(A,'POST','/terms',{year_id:yid,name:'1-chorak',start_date:'2026-09-01',end_date:'2026-10-31'})).s==200);
 ok('kesishuvchi chorak rad',(await call(A,'POST','/terms',{year_id:yid,name:'2-chorak',start_date:'2026-10-15',end_date:'2026-12-20'})).s==409);
 ok("yil tashqarisidagi chorak rad",(await call(A,'POST','/terms',{year_id:yid,name:'9',start_date:'2028-01-01',end_date:'2028-02-01'})).s==400);
 ok("o'qituvchi yil qo'sha olmaydi",(await call(T2,'POST','/academic_years',{...ay,name:'y2'})).s==403);
 ok('dars vaqtlari saqlandi',(await call(A,'PUT','/bell_slots',{slots:[{start:'08:00',end:'08:45'},{start:'08:55',end:'09:40'}]})).s==200&&(await call(A,'GET','/bell_slots')).j.length==2);
 ok('kesishuvchi dars vaqti rad',(await call(A,'PUT','/bell_slots',{slots:[{start:'08:00',end:'08:45'},{start:'08:30',end:'09:00'}]})).s==400);
 ok("rad etilgach eski vaqtlar saqlangan",(await call(A,'GET','/bell_slots')).j.length==2);
 ok('baholash turlari (standart 3 ta)',(await call(A,'GET','/grade_types')).j.length>=3);
 ok('yangi baholash turi',(await call(A,'POST','/grade_types',{name:'Test',max:100,weight:2})).s==200);
 ok("noto'g'ri maks rad",(await call(A,'POST','/grade_types',{name:'bad',max:0})).s==400);
 // o'quvchini tahrirlash va individual sahifa (st arxivlangan, qayta faollashtiramiz)
 ok("o'quvchi tahrirlandi",(await call(A,'PATCH','/students/'+st,{status:'faol',code:'S9',parent_contact:'+998 90 000 00 00'})).s==200);
 ok('kod takrori rad',(await call(A,'PATCH','/students/'+st,{code:'S2'})).s==409);
 ok("noto'g'ri holat rad",(await call(A,'PATCH','/students/'+st,{status:'x'})).s==400);
 const sp=await call(A,'GET','/students/'+st);ok("o'quvchi sahifasi: baho va davomat tarixi",sp.s==200&&sp.j.grades.length==1&&sp.j.attendance.length==1&&sp.j.student.code=='S9');
 ok("sinf rahbari o'quvchi sahifasini ko'radi",(await call(T2,'GET','/students/'+st)).s==200);
 const T3=(await call('','POST','/login',{login:'dkarimova',password:'Strong1234'})).ck;
 ok("begona o'qituvchi (URL orqali) o'quvchi sahifasini ko'ra olmaydi",(await call(T3,'GET','/students/'+st)).s==403);
 // zaxira -> tiklash (tarix o'zgarishsiz)
 const bk2=(await call(A,'GET','/backup')).j;
 await call(A,'PUT','/grades',{student_id:st,class_id:c7,subject_id:sub,date:'2026-09-12',type:'joriy',value:3,max:5}); // zaxiradan keyingi o'zgarish
 ok("tiklashsiz tasdiq rad",(await call(A,'POST','/restore',{data:bk2})).s==400);
 ok("o'qituvchi tiklay olmaydi",(await call(T2,'POST','/restore',{data:bk2,confirm:'TIKLASH'})).s==403);
 ok("buzuq zaxira rad, baza o'zgarmadi",(await call(A,'POST','/restore',{data:{classes:1},confirm:'TIKLASH'})).s==400);
 ok("o'z zaxirasi bo'lmagan bo'sh fayl rad (baza tozalanmadi)",(await call(A,'POST','/restore',{data:{classes:[],students:[],users:[]},confirm:'TIKLASH'})).s==400&&(await call(A,'GET','/classes')).j.length>0);
 const rs=await call(A,'POST','/restore',{data:bk2,confirm:'TIKLASH'});ok('tiklash bajarildi',rs.s==200);
 const bk3=(await call(A,'GET','/backup')).j;
 ok("tiklashdan keyin ma'lumot zaxiradagiday (baho, davomat, o'quvchi, jadval)",['grades','attendance','students','timetable','classes','assignments','teacher_subjects'].every(t=>bk3[t].length==bk2[t].length)&&bk3.users.length==bk2.users.length);

 // ===== 3-bosqich: davomat slot, hisobotlar, panel, xlsx =====
 await call(A,'PATCH','/users/'+t1,{is_active:1});
 const at={student_id:st,class_id:c7,subject_id:sub,date:'2026-09-15'};
 ok('davomat 1-dars',(await call(T1,'PUT','/attendance',{...at,slot:1,status:'keldi'})).s==200);
 ok('davomat 2-dars (bir kunda ikki dars)',(await call(T1,'PUT','/attendance',{...at,slot:2,status:'kechikdi',note:'avtobus'})).s==200);
 await call(T1,'PUT','/attendance',{...at,slot:2,status:'kelmadi'});
 const jj=(await call(T1,'GET','/journal',null,{class_id:c7,subject_id:sub})).j.attendance.filter(x=>x.date=='2026-09-15');
 ok('slot bo\'yicha takror yo\'q, tuzatish saqlangan',jj.length==2&&jj.find(x=>x.slot==2).status=='kelmadi');
 ok("noto'g'ri slot rad",(await call(T1,'PUT','/attendance',{...at,slot:99,status:'keldi'})).s==400);
 ok('davomat tuzatishi auditda (eski holat bilan)',(await call(A,'GET','/audit')).j.some(r=>r.entity=='attendance'&&r.action=='update'&&JSON.parse(r.old).status=='kechikdi'));
 const ra=await call(A,'GET','/reports/attendance',null,{class_id:c7,from:'2026-09-01',to:'2026-09-30'});
 const rs1=ra.j.students.find(x=>x.id==st);
 ok('oylik davomat hisoboti: sanaladi, belgilanmagan "keldi" emas',ra.s==200&&rs1.keldi==1&&rs1.kelmadi==2&&rs1.jami==3);
 ok('davr tashqarisi hisobga olinmaydi',(await call(A,'GET','/reports/attendance',null,{class_id:c7,from:'2026-10-01',to:'2026-10-31'})).j.total.kelmadi==0);
 ok("noto'g'ri davr rad",(await call(A,'GET','/reports/attendance',null,{class_id:c7,from:'2026-10-31',to:'2026-10-01'})).s==400);
 ok("begona o'qituvchi davomat hisobotini ko'ra olmaydi",(await call(T3,'GET','/reports/attendance',null,{class_id:c7,from:'2026-09-01',to:'2026-09-30'})).s==403);
 // jurnal to'ldirish: t1 faolsizlantirilgan, shuning uchun yangi o'qituvchi bilan
 const t4=(await call(A,'POST','/users',{login:'teach4',first_name:'Jurnal',last_name:'Tekshiruv',password:'Teacher123',role:'teacher'})).j.id;
 const T4=(await call('','POST','/login',{login:'teach4',password:'Teacher123'})).ck;
 const c9=(await call(A,'POST','/classes',{name:'9-A',year:'2026-2027'})).j.id;
 await call(A,'POST','/assignments',{class_id:c9,subject_id:sub,teacher_id:t4});
 await call(A,'POST','/timetable',{class_id:c9,subject_id:sub,teacher_id:t4,weekday:2,start:'10:00',end:'10:45',room:'30'}); // seshanba
 // 2026-09-01 va 2026-09-08 — ikkita seshanba
 await call(T4,'PUT','/lessons',{class_id:c9,subject_id:sub,date:'2026-09-01',topic:'Kinematika'});
 const jf=(await call(T4,'GET','/reports/journal_fill',null,{from:'2026-09-01',to:'2026-09-10'})).j.rows;
 ok("jurnal to'ldirish: 2 ta darsdan 1 tasi (50%)",jf.length==1&&jf[0].planned==2&&jf[0].filled==1&&jf[0].percent==50);
 ok("o'qituvchi faqat o'zini ko'radi",(await call(T4,'GET','/reports/journal_fill',null,{from:'2026-09-01',to:'2026-09-10',teacher_id:t1})).j.rows.every(x=>x.teacher_id==t4));
 const db1=await call(T4,'GET','/dashboard');ok("o'qituvchi paneli: faqat o'ziniki",db1.s==200&&db1.j.classes==1&&db1.j.scope.includes('o\'zingizga'));
 const db2=await call(A,'GET','/dashboard');ok('admin paneli: butun maktab',db2.j.classes>=3&&db2.j.recent_grades.length>0);
 const xl=await call(A,'POST','/export/xlsx',{rows:[['F.I.Sh.','Baho'],['Ali & <Vali>',5]],name:'sinf 7-A',sheet:'7-A'});
 ok('xlsx yaratildi',xl.s==200&&xl.j.name=='sinf_7-A.xlsx');
 require('fs').writeFileSync('/tmp/_t.xlsx',Buffer.from(xl.j.base64,'base64'));
 ok('xlsx kirishsiz rad',(await call('','POST','/export/xlsx',{rows:[[1]]})).s==401);

 console.log('\nHAMMASI O\'TDI');
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
