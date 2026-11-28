// To'lov moduli: tarif, hisoblash, qoldiq, hisobotlar, kabinet, Payme va Click webhooklari
process.env.SESSION_SECRET='test-secret-test-secret';process.env.ADMIN_PASSWORD='Admin12345';
const crypto=require('crypto');const {handler}=require('./netlify/functions/api');const assert=require('assert');
const call=async(ck,m,p,b,qs,h={},form)=>{const r=await handler({httpMethod:m,path:'/api'+p,headers:{cookie:ck||'',...h,...(form?{'content-type':'application/x-www-form-urlencoded'}:{})},body:b?(form?new URLSearchParams(b).toString():JSON.stringify(b)):null,queryStringParameters:qs});return{s:r.statusCode,j:JSON.parse(r.body),ck:(r.headers['set-cookie']||'').split(';')[0]}};
const ok=(n,c)=>{assert(c,n);console.log('OK  ',n)};
(async()=>{
 const A=(await call('','POST','/login',{login:'admin',password:'Admin12345'})).ck;
 const tid=(await call(A,'POST','/users',{login:'ustoz1',first_name:'Ali',last_name:'Valiyev',password:'Teacher123',role:'teacher'})).j.id;
 const bid=(await call(A,'POST','/users',{login:'buxgalter',first_name:'Bahodir',last_name:'Soliyev',password:'Teacher123',role:'teacher'})).j.id;
 const L=async(l)=>(await call('','POST','/login',{login:l,password:'Teacher123'})).ck;let T=await L('ustoz1'),B=await L('buxgalter');
 const c1=(await call(A,'POST','/classes',{name:'5-A',year:'2026-2027',homeroom_id:tid})).j.id,c2=(await call(A,'POST','/classes',{name:'6-B',year:'2026-2027'})).j.id;
 await call(A,'POST','/students',{class_id:c1,rows:[{name:'Aliyev Vali'},{name:'Boboyev Sami'},{name:'Karimov Jasur'}]});await call(A,'POST','/students',{class_id:c2,rows:[{name:'Rahimov Aziz'}]});
 const [a,b,d]=(await call(A,'GET','/students',null,{class_id:String(c1)})).j,[z]=(await call(A,'GET','/students',null,{class_id:String(c2)})).j;

 // ruxsat
 ok("oddiy o'qituvchi to'lovlarni ko'ra olmaydi",(await call(T,'GET','/fin/summary')).s==403&&(await call(T,'POST','/fin/payments',{student_id:a.id,amount:1000})).s==403);
 ok("kirishsiz rad",(await call('','GET','/fin/summary')).s==401);
 ok("admin buxgalter tayinlaydi",(await call(A,'PUT','/fin/config',{fin_users:[bid,tid,999]})).s==200&&(await call(A,'GET','/fin/config')).j.fin_users.length==2);
 await call(A,'PUT','/fin/config',{fin_users:[bid]});B=await L('buxgalter');T=await L('ustoz1');
 ok("buxgalter to'lovlar bilan ishlay oladi, boshqa o'qituvchi yo'q",(await call(B,'GET','/fin/summary')).s==200&&(await call(T,'GET','/fin/summary')).s==403);
 ok("/me da fin belgisi",(await call(B,'GET','/me')).j.fin===true&&(await call(T,'GET','/me')).j.fin===false);
 ok("buxgalter sozlamani (sir) o'zgartira olmaydi",(await call(B,'PUT','/fin/config',{click_secret:'x'})).s==403);
 ok("INN tekshiruvi",(await call(A,'PUT','/fin/config',{org_inn:'12ab'})).s==400&&(await call(A,'PUT','/fin/config',{org_inn:'123456789',org_name:'Deutsch School MCHJ',org_account:'2020 8000 1234'})).s==200);

 // tarif va hisoblash
 ok("sinf tarifi",(await call(B,'PUT','/fin/tariffs/class',{class_id:c1,monthly:1000000})).s==200&&(await call(B,'PUT','/fin/tariffs/class',{class_id:c2,monthly:-5})).s==400);
 await call(B,'PUT','/fin/tariffs/student',{student_id:b.id,discount_pct:50});await call(B,'PUT','/fin/tariffs/student',{student_id:d.id,monthly:800000,discount_pct:25,note:'aka-uka'});
 const tf=(await call(B,'GET','/fin/tariffs',null,{class_id:String(c1)})).j;
 ok("samarali tarif: sinf / 50% chegirma / o'ziga xos+chegirma",tf.students.find(x=>x.id==a.id).effective==1000000&&tf.students.find(x=>x.id==b.id).effective==500000&&tf.students.find(x=>x.id==d.id).effective==600000);
 ok("chegirma 101% rad",(await call(B,'PUT','/fin/tariffs/student',{student_id:a.id,discount_pct:101})).s==400);
 let g=(await call(B,'POST','/fin/charges/generate',{period:'2026-09'})).j;ok("sentyabr hisoblandi: 3 ta (6-B tarifsiz)",g.created==3&&g.no_tariff==1);
 g=(await call(B,'POST','/fin/charges/generate',{period:'2026-09'})).j;ok("qayta hisoblasa dublikat yo'q",g.created==0&&g.already==3);
 await call(B,'POST','/fin/charges/generate',{period:'2026-10'});await call(B,'POST','/fin/charges/generate',{period:'2026-11'});
 ok("noto'g'ri oy rad",(await call(B,'POST','/fin/charges/generate',{period:'2026-13'})).s==400);
 ok("qo'shimcha hisob izohsiz rad",(await call(B,'POST','/fin/charges',{student_id:a.id,amount:100000})).s==400);
 const ex=(await call(B,'POST','/fin/charges',{student_id:a.id,amount:150000,period:'2026-11',note:'Daftar, kitob'})).j.id;ok("qo'shimcha hisob",ex>0);

 // to'lovlar
 ok("0 va manfiy to'lov rad, noto'g'ri tur rad, kelajak sana rad",(await call(B,'POST','/fin/payments',{student_id:a.id,amount:0})).s==400&&(await call(B,'POST','/fin/payments',{student_id:a.id,amount:-5})).s==400&&(await call(B,'POST','/fin/payments',{student_id:a.id,amount:1000,method:'click'})).s==400&&(await call(B,'POST','/fin/payments',{student_id:a.id,amount:1000,paid_on:'2099-01-01'})).s==400);
 const p1=(await call(B,'POST','/fin/payments',{student_id:a.id,amount:1000000,method:'naqd',paid_on:'2026-09-05'})).j.id;await call(B,'POST','/fin/payments',{student_id:a.id,amount:500000,method:'bank',paid_on:'2026-10-10'});
 await call(B,'POST','/fin/payments',{student_id:b.id,amount:1500000,method:'plastik',paid_on:'2026-10-12'});
 let sm=(await call(B,'GET','/fin/summary',null,{class_id:String(c1),from:'2026-09',to:'2026-11'})).j;const R=id=>sm.rows.find(x=>x.id==id);
 ok("Aliyev: hisoblangan 3 000 000 + 150 000, to'langan 1 500 000, qoldiq 1 650 000",R(a.id).charged==3150000&&R(a.id).paid==1500000&&R(a.id).balance==1650000);
 ok("Boboyev: 3 oy x 500 000 = to'liq to'langan, qoldiq 0",R(b.id).charged==1500000&&R(b.id).balance==0);
 ok("Karimov: 3 x 600 000, to'lovsiz -> qarz 1 800 000",R(d.id).balance==1800000&&R(d.id).paid==0);
 ok("jami qoldiq",sm.totals.balance==1650000+0+1800000);
 sm=(await call(B,'GET','/fin/summary',null,{class_id:String(c1),from:'2026-11',to:'2026-11'})).j;
 ok("oraliq: boshlang'ich qoldiq (noyabrgacha) hisobga olinadi",sm.rows.find(x=>x.id==a.id).opening==(2000000-1500000)&&sm.rows.find(x=>x.id==a.id).balance==1650000);
 ok("to'lovni bekor qilish qoldiqni qaytaradi",(await call(B,'DELETE','/fin/payments/'+p1)).s==200&&(await call(B,'GET','/fin/summary',null,{class_id:String(c1),from:'2026-09',to:'2026-11'})).j.rows.find(x=>x.id==a.id).balance==2650000);
 await call(B,'POST','/fin/payments',{student_id:a.id,amount:1000000,method:'naqd',paid_on:'2026-09-05'});
 ok("hisobni o'chirish",(await call(B,'DELETE','/fin/charges/'+ex)).s==200&&(await call(B,'GET','/fin/summary',null,{class_id:String(c1),from:'2026-09',to:'2026-11'})).j.rows.find(x=>x.id==a.id).balance==1500000);
 const st=(await call(B,'GET','/fin/student/'+a.id)).j;ok("ko'chirma: yurib boruvchi qoldiq oxirida yig'indiga teng",st.events.length>=6&&st.events[st.events.length-1].balance==st.balance);

 // hisobot
 const rp=(await call(B,'GET','/fin/report',null,{from:'2026-09',to:'2026-11'})).j;
 ok("hisobot: jami, sinflar, usullar, oylar",rp.totals.charged==3000000+1500000+1800000&&rp.totals.paid==1500000+1500000&&rp.by_class.length==2&&rp.by_method.length==3&&rp.monthly.length==3&&rp.totals.debtors==2);
 ok("hisobot: sinf kesimi (5-A)",rp.by_class.find(x=>x.class=='5-A').charged==6300000&&rp.by_class.find(x=>x.class=='5-A').students==3);
 ok("noto'g'ri oraliq rad",(await call(B,'GET','/fin/report',null,{from:'2026-11',to:'2026-09'})).s==400);

 // o'quvchi / ota-ona kabineti
 const acc=(await call(A,'POST','/students/'+a.id+'/account',{})).j,S=(await call('','POST','/login',{login:acc.login,password:acc.password})).ck;
 const bl=(await call(S,'GET','/student/billing')).j;ok("o'quvchi o'z qoldig'ini ko'radi",bl.balance==1500000&&bl.has_billing&&bl.org.org_name=='Deutsch School MCHJ'&&!bl.online.click&&!bl.online.payme);
 ok("o'quvchi boshqalarni to'lov yo'llaridan ko'ra olmaydi",(await call(S,'GET','/fin/summary')).s==403&&(await call(S,'POST','/fin/payments',{student_id:a.id,amount:5000})).s==403);
 ok("onlayn yoqilmagan: to'lov havolasi yo'q",(await call(S,'POST','/student/pay-link',{provider:'click',amount:100000})).s==400);

 // Payme
 const KEY='payme-secret-key',AUTH={authorization:'Basic '+Buffer.from('Paycom:'+KEY).toString('base64')};
 await call(A,'PUT','/fin/config',{payme_merchant_id:'MERCH123',payme_key:KEY,click_service_id:'777',click_merchant_id:'555',click_user_id:'9',click_secret:'CLICKSECRET',min_online:1000});
 const pl=(await call(S,'POST','/student/pay-link',{provider:'payme',amount:200000})).j.url;
 ok("Payme havolasi: base64(m=...;ac.student_id=...;a=tiyin)",Buffer.from(pl.split('/').pop(),'base64').toString()==`m=MERCH123;ac.student_id=${a.id};a=20000000`);
 ok("Click havolasi",(await call(S,'POST','/student/pay-link',{provider:'click',amount:200000})).j.url.includes('service_id=777')&&(await call(S,'POST','/student/pay-link',{provider:'click',amount:500})).s==400);
 ok("sir kalit konfigda ko'rinmaydi",!JSON.stringify((await call(A,'GET','/fin/config')).j).includes('CLICKSECRET')&&!JSON.stringify((await call(A,'GET','/fin/config')).j).includes(KEY));
 const pm=(method,params,id=1,h=AUTH)=>call('','POST','/pay/payme',{jsonrpc:'2.0',id,method,params},null,h);
 ok("Payme: noto'g'ri avtorizatsiya -32504",(await pm('CheckPerformTransaction',{},1,{authorization:'Basic xxx'})).j.error.code==-32504&&(await pm('CheckPerformTransaction',{},1,{})).j.error.code==-32504);
 ok("Payme Check: ruxsat",(await pm('CheckPerformTransaction',{amount:20000000,account:{student_id:String(a.id)}})).j.result.allow===true);
 ok("Payme Check: hisob topilmadi -31050",(await pm('CheckPerformTransaction',{amount:20000000,account:{student_id:'99999'}})).j.error.code==-31050);
 ok("Payme Check: noto'g'ri summa -31001 (tiyin 100 ga bo'linmaydi / minimaldan kam)",(await pm('CheckPerformTransaction',{amount:20050,account:{student_id:String(a.id)}})).j.error.code==-31001&&(await pm('CheckPerformTransaction',{amount:5000,account:{student_id:String(a.id)}})).j.error.code==-31001);
 let cr=(await pm('CreateTransaction',{id:'tx-1',time:Date.now(),amount:20000000,account:{student_id:String(a.id)}})).j.result;ok("Payme Create: state 1",cr.state==1&&cr.transaction);
 ok("Payme Create: qayta chaqirish idempotent",(await pm('CreateTransaction',{id:'tx-1',time:Date.now(),amount:20000000,account:{student_id:String(a.id)}})).j.result.transaction==cr.transaction);
 ok("Payme Check tranzaksiya",(await pm('CheckTransaction',{id:'tx-1'})).j.result.state==1&&(await pm('CheckTransaction',{id:'nope'})).j.error.code==-31003);
 ok("to'lanmagan tranzaksiya qoldiqni o'zgartirmaydi",(await call(S,'GET','/student/billing')).j.balance==1500000);
 let pf=(await pm('PerformTransaction',{id:'tx-1'})).j.result;ok("Payme Perform: state 2, qoldiq 200 000 ga kamaydi",pf.state==2&&(await call(S,'GET','/student/billing')).j.balance==1300000);
 ok("Payme Perform: takroriy chaqiruv to'lovni ikkilantirmaydi",(await pm('PerformTransaction',{id:'tx-1'})).j.result.state==2&&(await call(S,'GET','/student/billing')).j.balance==1300000);
 ok("Payme Create: bajarilgan tranzaksiya qayta yaratilmaydi -31008",(await pm('CreateTransaction',{id:'tx-1',time:Date.now(),amount:20000000,account:{student_id:String(a.id)}})).j.error.code==-31008);
 await pm('CreateTransaction',{id:'tx-2',time:Date.now(),amount:10000000,account:{student_id:String(a.id)}});
 ok("Payme Cancel (bajarilmagan): state -1",(await pm('CancelTransaction',{id:'tx-2',reason:3})).j.result.state==-1&&(await pm('PerformTransaction',{id:'tx-2'})).j.error.code==-31008);
 ok("Payme Cancel (bajarilgan): state -2, to'lov bekor, qoldiq qaytdi",(await pm('CancelTransaction',{id:'tx-1',reason:5})).j.result.state==-2&&(await call(S,'GET','/student/billing')).j.balance==1500000);
 const stm=(await pm('GetStatement',{from:0,to:Date.now()+1000})).j.result.transactions;ok("Payme Statement",stm.length==2&&stm[0].amount==20000000&&stm[0].account.student_id==String(a.id));
 ok("Payme: noma'lum usul -32601",(await pm('Nothing',{})).j.error.code==-32601);

 // Click
 const SEC='CLICKSECRET',sign=(p,complete)=>md5(p.click_trans_id+p.service_id+SEC+p.merchant_trans_id+(complete?p.merchant_prepare_id:'')+p.amount+p.action+p.sign_time);
 function md5(x){return crypto.createHash('md5').update(x).digest('hex')}
 const mk=(over,complete)=>{const p={click_trans_id:'900001',service_id:'777',click_paydoc_id:'1',merchant_trans_id:String(a.id),amount:'300000',action:complete?'1':'0',error:'0',error_note:'Success',sign_time:'2026-11-27 10:00:00',...over};if(complete&&p.merchant_prepare_id===undefined)p.merchant_prepare_id='0';p.sign_string=sign(p,complete);return p};
 const clk=(p,path)=>call('','POST','/pay/click/'+path,p,null,{},true);
 ok("Click prepare: noto'g'ri imzo -1",(await clk({...mk({}),sign_string:'bad'},'prepare')).j.error==-1);
 ok("Click prepare: foydalanuvchi yo'q -5",(await clk(mk({merchant_trans_id:'99999'}),'prepare')).j.error==-5);
 ok("Click prepare: kichik summa -2",(await clk(mk({amount:'500'}),'prepare')).j.error==-2);
 const pr=(await clk(mk({}),'prepare')).j;ok("Click prepare: muvaffaqiyat (form-urlencoded)",pr.error==0&&pr.merchant_prepare_id>0);
 ok("Click prepare tayyorlanganda qoldiq o'zgarmaydi",(await call(S,'GET','/student/billing')).j.balance==1500000);
 ok("Click complete: noto'g'ri tayyorlov raqami -6",(await clk(mk({merchant_prepare_id:'999'},true),'complete')).j.error==-6);
 ok("Click complete: summa mos emas -2",(await clk(mk({merchant_prepare_id:String(pr.merchant_prepare_id),amount:'310000'},true),'complete')).j.error==-2);
 const cp=(await clk(mk({merchant_prepare_id:String(pr.merchant_prepare_id)},true),'complete')).j;ok("Click complete: muvaffaqiyat, qoldiq 300 000 ga kamaydi",cp.error==0&&cp.merchant_confirm_id>0&&(await call(S,'GET','/student/billing')).j.balance==1200000);
 ok("Click complete: takroriy -4, ikkilanmaydi",(await clk(mk({merchant_prepare_id:String(pr.merchant_prepare_id)},true),'complete')).j.error==-4&&(await call(S,'GET','/student/billing')).j.balance==1200000);
 const pr2=(await clk(mk({click_trans_id:'900002'}),'prepare')).j,cc=(await clk(mk({click_trans_id:'900002',merchant_prepare_id:String(pr2.merchant_prepare_id),error:'-5017'},true),'complete')).j;
 ok("Click: Click xato yuborsa tranzaksiya bekor -9",cc.error==-9&&(await call(S,'GET','/student/billing')).j.balance==1200000);
 const evs=(await call(B,'GET','/fin/student/'+a.id)).j.events.filter(e=>e.type=='payment'&&e.status=='ok');ok("ko'chirmada onlayn to'lov usuli ko'rinadi",evs.some(e=>e.method=='click'));
 const rp2=(await call(B,'GET','/fin/report',null,{from:'2026-09',to:'2026-11'})).j;ok("hisobotda click usuli",rp2.by_method.some(m=>m.method=='click'&&m.s==300000));

 // zaxira / o'chirish
 const bk=(await call(A,'GET','/backup')).j;ok("zaxirada to'lovlar bor, sirlar yo'q",bk.payments.length>=5&&bk.charges.length>=9&&!JSON.stringify(bk).includes('CLICKSECRET')&&!JSON.stringify(bk).includes(KEY));
 ok("tiklash va qoldiq saqlanadi",(await call(A,'POST','/restore',{confirm:'TIKLASH',data:bk})).s==200&&(await call(B,'GET','/fin/summary',null,{class_id:String(c1),from:'2026-09',to:'2026-11'})).j.rows.find(x=>x.id==a.id).balance==1200000);
 await call(A,'DELETE','/students/'+d.id);ok("o'quvchi o'chirilsa uning hisob-kitoblari ham o'chadi",(await call(B,'GET','/fin/summary',null,{class_id:String(c1),from:'2026-09',to:'2026-11'})).j.rows.every(x=>x.id!=d.id));
 console.log("\nHAMMASI O'TDI");
})().catch(e=>{console.error('XATO:',e.message);process.exit(1)});
