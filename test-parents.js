// Ota-ona hisoblari va e'lonlar testlari
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
 await call(A,'POST','/students',{class_id:c1,rows:[{name:"Aliyev Vali Karim"},{name:"Aliyev Valijon"},{name:"Soliyev Sardor"}]});
 await call(A,'POST','/students',{class_id:c2,rows:[{name:'Boshqa Sinf'}]});
 const S=(await call(A,'GET','/students',null,{class_id:String(c1)})).j,S2=(await call(A,'GET','/students',null,{class_id:String(c2)})).j[0];
 await call(A,'PUT','/grades',{student_id:S[0].id,class_id:c1,subject_id:sub,date:'2026-11-23',type:'joriy',value:5,max:5});
 ok("boshqa o'qituvchi ota-ona logini bera olmaydi",(await call(OT,'POST','/students/'+S[0].id+'/parent',{})).s==403);
 ok("boshqa sinf rahbari emas",(await call(HR,'POST','/students/'+S2.id+'/parent',{})).s==403);
 const p1=await call(HR,'POST','/students/'+S[0].id+'/parent',{});ok('sinf rahbari berdi: '+p1.j.login,p1.s==200&&p1.j.login.startsWith('ota.')&&p1.j.password.length==8);
 const s1=await call(A,'POST','/students/'+S[0].id+'/account',{});ok("o'quvchi logini alohida, to'qnashmaydi",s1.s==200&&s1.j.login!=p1.j.login);
 const p2=await call(A,'POST','/students/'+S[1].id+'/parent',{});ok('ikkinchi ota-ona logini takrorlanmadi: '+p2.j.login,p2.s==200&&p2.j.login!=p1.j.login);
 ok("ota-ona logini o'quvchi logini bilan to'qnashsa rad",(await call(A,'POST','/students/'+S[2].id+'/parent',{login:s1.j.login})).s==409);
 ok("xodim logini bilan to'qnashsa rad",(await call(A,'POST','/students/'+S[2].id+'/parent',{login:'rahbar1'})).s==409);
 ok("yangi xodim logini ota-ona logini bilan to'qnashsa rad",(await call(A,'POST','/users',{login:p1.j.login,first_name:'Xasan',last_name:'Yusupov',password:'Teacher123',role:'teacher'})).s==409);
 // kirish
 const L=await call('','POST','/login',{login:p1.j.login,password:p1.j.password});ok('ota-ona kirdi, role=parent',L.s==200&&L.j.role=='parent');const PT=L.ck;
 ok("noto'g'ri parol",(await call('','POST','/login',{login:p1.j.login,password:'xxxxxxxx'})).s==401);
 ok('/me role',(await call(PT,'GET','/me')).j.role=='parent');
 const ov=(await call(PT,'GET','/student/overview')).j;ok("faqat farzandining ma'lumoti",ov.role=='parent'&&ov.student.id==S[0].id&&ov.grades.length==1);
 for(const [m,p,q] of [['GET','/students',{class_id:String(c1)}],['GET','/users'],['GET','/backup'],['GET','/classes'],['PUT','/grades'],['POST','/students/'+S[1].id+'/parent'],['POST','/announcements'],['DELETE','/students/'+S[0].id],['GET','/reports/class',{class_id:String(c1)}]])
   ok(`ota-ona ${m} ${p} ga kira olmaydi`,(await call(PT,m,p,{title:'a',body:'b'},q)).s==403);
 // ro'yxat
 const l1=(await call(HR,'GET','/students',null,{class_id:String(c1)})).j,raw=JSON.stringify(l1);
 ok("ro'yxatda hash/parol yo'q",!/scrypt|password/i.test(raw));ok("has_parent va par_login",l1.find(x=>x.id==S[0].id).has_parent==1&&l1.find(x=>x.id==S[0].id).par_login==p1.j.login&&l1.find(x=>x.id==S[2].id).has_parent==0);
 await call(A,'POST','/assignments',{class_id:c1,subject_id:sub,teacher_id:other});
 ok("fan o'qituvchisi par_login ko'rmaydi",(await call(OT,'GET','/students',null,{class_id:String(c1)})).j.every(x=>x.par_login===undefined));
 // parol
 const pw=await call(PT,'POST','/student/password',{old:p1.j.password,new:'OtaParol2026'});ok('parol almashdi (parent jadvalida)',pw.s==200&&(await call(pw.ck,'GET','/me')).j.role=='parent');
 ok("eski sessiya bekor",(await call(PT,'GET','/me')).s==401);
 ok("o'quvchi paroli ta'sirlanmadi",(await call('','POST','/login',{login:s1.j.login,password:s1.j.password})).j.role=='student');
 // reset/block
 const NS=(await call('','POST','/login',{login:p1.j.login,password:'OtaParol2026'})).ck;
 const rs=await call(HR,'POST','/students/'+S[0].id+'/parent',{});ok('qayta berish',rs.j.reset&&rs.j.login==p1.j.login);ok("eski sessiya o'chdi",(await call(NS,'GET','/me')).s==401);
 const NS2=(await call('','POST','/login',{login:p1.j.login,password:rs.j.password})).ck;
 await call(HR,'PATCH','/students/'+S[0].id+'/parent',{is_active:false});ok('bloklash',(await call(NS2,'GET','/me')).s==401&&(await call('','POST','/login',{login:p1.j.login,password:rs.j.password})).s==401);
 await call(HR,'PATCH','/students/'+S[0].id+'/parent',{is_active:true});
 // ommaviy
 const bk=await call(HR,'POST','/classes/'+c1+'/parents',{});ok("ommaviy: qolgan 1 ta ota-ona uchun yaratildi",bk.s==200&&bk.j.created.length==1&&bk.j.already==2);
 ok("ommaviy: boshqa sinfga ruxsat yo'q",(await call(HR,'POST','/classes/'+c2+'/parents',{})).s==403);
 // arxiv
 await call(A,'PATCH','/students/'+S[0].id,{status:'arxiv'});ok("arxivdagi farzand ota-onasi kira olmaydi",(await call('','POST','/login',{login:p1.j.login,password:rs.j.password})).s==401);
 await call(A,'PATCH','/students/'+S[0].id,{status:'faol'});
 // o'chirish
 ok("ota-ona hisobini o'chirish",(await call(HR,'DELETE','/students/'+S[0].id+'/parent')).s==200&&(await call('','POST','/login',{login:p1.j.login,password:rs.j.password})).s==401);
 // e'lonlar
 ok("o'qituvchi e'lon yoza olmaydi",(await call(HR,'POST','/announcements',{title:'T',body:'B'})).s==403);
 ok("bo'sh sarlavha rad",(await call(A,'POST','/announcements',{title:' ',body:'B'})).s==400);
 ok("noto'g'ri auditoriya rad",(await call(A,'POST','/announcements',{title:'T',body:'B',audience:'x'})).s==400);
 const n1=(await call(A,'POST','/announcements',{title:'Hamma uchun',body:'Salom',audience:'all',pinned:true})).j.id;
 await call(A,'POST','/announcements',{title:'Xodimlar',body:'Yig‘ilish',audience:'staff'});
 await call(A,'POST','/announcements',{title:'Ota-onalar',body:'Yig‘ilish',audience:'parents'});
 await call(A,'POST','/announcements',{title:'Oquvchilar',body:'Olimpiada',audience:'students'});
 const ST=(await call('','POST','/login',{login:s1.j.login,password:s1.j.password})).ck,PT2=(await call('','POST','/login',{login:p2.j.login,password:p2.j.password})).ck;
 const t=async(ck,u)=>(await call(ck,'GET',u)).j.map(x=>x.title).sort().join('|');
 ok("o'quvchi: all+students",(await t(ST,'/student/news'))=='Hamma uchun|Oquvchilar');
 ok("ota-ona: all+parents",(await t(PT2,'/student/news'))=='Hamma uchun|Ota-onalar');
 ok("o'qituvchi: all+staff",(await t(HR,'/announcements'))=='Hamma uchun|Xodimlar');
 ok("admin hammasini ko'radi",(await call(A,'GET','/announcements')).j.length==4);
 ok("pinned birinchi",(await call(A,'GET','/announcements')).j[0].id==n1);
 ok("o'quvchi /announcements ga kira olmaydi",(await call(ST,'GET','/announcements')).s==403);
 ok("tahrirlash",(await call(A,'PUT','/announcements/'+n1,{title:'Yangi',body:'Matn',audience:'all'})).s==200&&(await call(A,'GET','/announcements')).j.some(x=>x.title=='Yangi'));
 ok("o'chirish",(await call(A,'DELETE','/announcements/'+n1)).s==200&&(await call(A,'GET','/announcements')).j.length==3);
 ok("zaxirada parol yo'q",!/scrypt/.test(JSON.stringify((await call(A,'GET','/backup')).j).replace(/"pass":"[^"]*"/g,'')) );
 console.log('\nOTA-ONA VA E\'LONLAR TESTLARI O\'TDI');
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
