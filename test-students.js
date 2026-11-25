// O'quvchi login/parol va o'quvchi kabineti testlari
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||''},body:b?JSON.stringify(b):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const mk=async(l,f,s)=>(await call(A,'POST','/users',{login:l,first_name:f,last_name:s,password:'Teacher123',role:'teacher'})).j.id;
 const hr=await mk('rahbar1','Dilnoza','Karimova'),other=await mk('boshqa1','Ali','Valiyev');
 const HR=(await call('','POST','/login',{login:'rahbar1',password:'Teacher123'})).ck,OT=(await call('','POST','/login',{login:'boshqa1',password:'Teacher123'})).ck;
 await call(A,'POST','/subjects',{name:'Fizika'});const sub=(await call(A,'GET','/subjects')).j[0].id;
 const c1=(await call(A,'POST','/classes',{name:'7-A',year:'2026-2027',homeroom_id:hr})).j.id,c2=(await call(A,'POST','/classes',{name:'7-B',year:'2026-2027'})).j.id;
 await call(A,'POST','/students',{class_id:c1,rows:[{name:"Aliyev Vali Karim"},{name:"Aliyev Valijon"},{name:"Oʻrinboyev Sardor"}]});
 await call(A,'POST','/students',{class_id:c2,rows:[{name:'Boshqa Sinf Oquvchisi'}]});
 const S=(await call(A,'GET','/students',null,{class_id:String(c1)})).j,S2=(await call(A,'GET','/students',null,{class_id:String(c2)})).j[0];
 await call(A,'PUT','/grades',{student_id:S[0].id,class_id:c1,subject_id:sub,date:'2026-11-23',type:'joriy',value:5,max:5});
 await call(A,'PUT','/grades',{student_id:S[1].id,class_id:c1,subject_id:sub,date:'2026-11-23',type:'joriy',value:2,max:5});
 // ruxsat
 ok("boshqa o'qituvchi login bera olmaydi",(await call(OT,'POST','/students/'+S[0].id+'/account',{})).s==403);
 ok("sinf rahbari boshqa sinf o'quvchisiga bera olmaydi",(await call(HR,'POST','/students/'+S2.id+'/account',{})).s==403);
 const a1=await call(HR,'POST','/students/'+S[0].id+'/account',{});ok('sinf rahbari login-parol berdi',a1.s==200&&a1.j.password.length==8&&/^[a-z0-9._-]{3,30}$/.test(a1.j.login));
 ok('login familiya.ism bosh harfi: '+a1.j.login,a1.j.login=='aliyev.v');
 const a2=await call(A,'POST','/students/'+S[1].id+'/account',{});ok('admin ham berdi, login takrorlanmadi: '+a2.j.login,a2.s==200&&a2.j.login!=a1.j.login);
 ok("qisqa parol rad etiladi",(await call(A,'POST','/students/'+S[2].id+'/account',{password:'123'})).s==400);
 ok("xodim logini bilan to'qnashuv rad etiladi",(await call(A,'POST','/students/'+S[2].id+'/account',{login:'rahbar1'})).s==409);
 ok("login band: boshqa hisobniki",(await call(A,'POST','/students/'+S[2].id+'/account',{login:a1.j.login})).s==409);
 // o'quvchi kirishi
 ok("noto'g'ri parol",(await call('','POST','/login',{login:a1.j.login,password:'xxxxxxxx'})).s==401);
 const L=await call('','POST','/login',{login:a1.j.login.toUpperCase(),password:a1.j.password});ok("o'quvchi kirdi (katta-kichik harf farqsiz)",L.s==200&&L.j.role=='student');const ST=L.ck;
 ok('/me: role=student',(await call(ST,'GET','/me')).j.role=='student');
 const ov=(await call(ST,'GET','/student/overview')).j;ok("kabinet: faqat o'z baholari (1 ta, 5/5)",ov.grades.length==1&&ov.grades[0].value==5&&ov.student.class_name=='7-A');
 // taqiqlangan yo'llar
 for(const [m,p,q] of [['GET','/students',{class_id:String(c1)}],['GET','/users'],['GET','/classes'],['GET','/backup'],['GET','/audit'],['GET','/leaders'],['GET','/dashboard'],['GET','/timetable'],['GET','/students/'+S[1].id],['POST','/students/'+S[1].id+'/account'],['PUT','/grades'],['PUT','/attendance'],['DELETE','/students/'+S[0].id],['GET','/reports/class',{class_id:String(c1)}],['POST','/restore'],['PUT','/settings']])
   ok(`o'quvchi ${m} ${p} ga kira olmaydi`,(await call(ST,m,p,{},q)).s==403);
 ok("xodim /student/overview ga kira olmaydi",(await call(HR,'GET','/student/overview')).s==403);
 ok("sessiyasiz /student/overview",(await call('','GET','/student/overview')).s==401);
 // ro'yxatda parol/hash sizmaydi; login faqat boshqaruvchiga
 const l1=(await call(HR,'GET','/students',null,{class_id:String(c1)})).j,raw=JSON.stringify(l1);ok("ro'yxatda hash/parol yo'q",!/pass|scrypt|password/i.test(raw));
 ok("sinf rahbari loginni ko'radi, has_account=1",l1.find(x=>x.id==S[0].id).login==a1.j.login&&l1.find(x=>x.id==S[0].id).has_account==1);
 await call(A,'POST','/assignments',{class_id:c1,subject_id:sub,teacher_id:other});
 const l2=(await call(OT,'GET','/students',null,{class_id:String(c1)})).j;ok("fan o'qituvchisi loginni ko'rmaydi",l2.every(x=>x.login===undefined));
 // parol o'zgartirish
 ok("eski parol xato",(await call(ST,'POST','/student/password',{old:'xxxxxxxx',new:'YangiParol77'})).s==400);
 const pw=await call(ST,'POST','/student/password',{old:a1.j.password,new:'YangiParol77'});ok("o'quvchi parolini almashtirdi, sessiya saqlandi",pw.s==200&&(await call(pw.ck,'GET','/me')).s==200);
 ok("eski sessiya bekor bo'ldi",(await call(ST,'GET','/me')).s==401);
 ok("eski parol ishlamaydi",(await call('','POST','/login',{login:a1.j.login,password:a1.j.password})).s==401);
 // qayta berish sessiyani o'chiradi
 const NS=(await call('','POST','/login',{login:a1.j.login,password:'YangiParol77'})).ck;
 const rs=await call(HR,'POST','/students/'+S[0].id+'/account',{});ok("qayta berish: login o'zgarmadi, yangi parol",rs.j.login==a1.j.login&&rs.j.reset&&rs.j.password!='YangiParol77');
 ok("qayta berilgach eski sessiya o'chdi",(await call(NS,'GET','/me')).s==401);
 // bloklash
 const NS2=(await call('','POST','/login',{login:a1.j.login,password:rs.j.password})).ck;
 ok("bloklash",(await call(HR,'PATCH','/students/'+S[0].id+'/account',{is_active:false})).s==200);
 ok("bloklangan: sessiya va kirish yopiq",(await call(NS2,'GET','/me')).s==401&&(await call('','POST','/login',{login:a1.j.login,password:rs.j.password})).s==401);
 await call(HR,'PATCH','/students/'+S[0].id+'/account',{is_active:true});
 ok("ochilgach kirish tiklandi",(await call('','POST','/login',{login:a1.j.login,password:rs.j.password})).s==200);
 // arxivlash
 await call(A,'PATCH','/students/'+S[0].id,{status:'arxiv'});ok("arxivdagi o'quvchi kira olmaydi",(await call('','POST','/login',{login:a1.j.login,password:rs.j.password})).s==401);
 await call(A,'PATCH','/students/'+S[0].id,{status:'faol'});
 // ommaviy
 const bulk=await call(HR,'POST','/classes/'+c1+'/accounts');ok("sinfga ommaviy: 1 ta yangi (3 tadan 2 tasi bor edi), hammasi parol bilan",bulk.s==200&&bulk.j.created.length==1&&bulk.j.already==2&&bulk.j.created[0].password.length==8);
 ok("o'quvchi ismidagi ʻ belgisi loginda tozalandi: "+bulk.j.created[0].login,bulk.j.created[0].login=='orinboyev.s');
 ok("ommaviy: ruxsatsiz sinf rad etiladi",(await call(HR,'POST','/classes/'+c2+'/accounts')).s==403);
 // o'chirish
 ok("hisobni o'chirish",(await call(HR,'DELETE','/students/'+S[1].id+'/account')).s==200&&(await call('','POST','/login',{login:a2.j.login,password:a2.j.password})).s==401);
 const dl=await call(A,'DELETE','/students/'+S[2].id);ok("o'quvchi o'chirilsa hisobi ham o'chadi",dl.s==200&&(await call('','POST','/login',{login:bulk.j.created[0].login,password:bulk.j.created[0].password})).s==401);
 // audit: parol yo'q
 const au=JSON.stringify((await call(A,'GET','/audit')).j);ok("auditda parol yo'q, hisob amallari bor",!au.includes(a1.j.password)&&!au.includes(rs.j.password)&&au.includes('student_account'));
 // zaxira nusxada hisoblar yo'q
 ok("zaxira nusxada parol/hisob yo'q",!/student_accounts|scrypt/.test(JSON.stringify((await call(A,'GET','/backup')).j)));
 console.log("\nO'QUVCHI HISOBLARI TESTLARI O'TDI");
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
