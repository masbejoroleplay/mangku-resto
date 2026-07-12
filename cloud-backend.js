(function(){
  const API_BASE='';

  const initializeApp=(config={},name='[DEFAULT]')=>firebase.apps.find(a=>a.name===name)||firebase.initializeApp(config,name);
  const getAuth=app=>app.auth();
  const onAuthStateChanged=(a,fn)=>a.onAuthStateChanged(fn);
  const signInWithEmailAndPassword=(a,email,password)=>a.signInWithEmailAndPassword(email,password);
  const signOut=a=>a.signOut();
  const createUserWithEmailAndPassword=(a,email,password)=>a.createUserWithEmailAndPassword(email,password);
  const EmailAuthProvider={credential:(email,password)=>firebase.auth.EmailAuthProvider.credential(email,password)};
  const reauthenticateWithCredential=(u,c)=>u.reauthenticateWithCredential(c);
  const updatePassword=(u,password)=>u.updatePassword(password);
  const getFirestore=()=>({cloud:true});
  const collection=(_db,name)=>({kind:'collection',name});
  const doc=(_db,name,id)=>({kind:'doc',name,id});
  const where=(field,op,value)=>({type:'where',field,op,value});
  const orderBy=(field,dir='asc')=>({type:'orderBy',field,dir});
  const limit=value=>({type:'limit',value});
  const query=(base,...rules)=>({...base,rules});
  const serverTimestamp=()=>new Date().toISOString();

  async function api(path,options={}){
    const current=firebase.auth().currentUser;
    if(!current)throw new Error('Sesi login tidak tersedia.');
    const token=await current.getIdToken();
    const response=await fetch(API_BASE+path,{
      ...options,
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`API error ${response.status}`);
    return data;
  }
  const makeSnap=(name,row)=>({
    id:row?.[name==='users'?'uid':'id'],
    ref:doc(null,name,row?.[name==='users'?'uid':'id']),
    data:()=>structuredClone(row),exists:()=>!!row
  });
  const getDoc=async ref=>{const {row}=await api(`/api/data/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.id)}`);return row?makeSnap(ref.name,row):{id:ref.id,ref,data:()=>undefined,exists:()=>false}};
  const getDocs=async source=>{
    const filters=(source.rules||[]).filter(r=>r.type==='where');
    const order=(source.rules||[]).find(r=>r.type==='orderBy')||null;
    const max=(source.rules||[]).find(r=>r.type==='limit')?.value||500;
    const qs=new URLSearchParams({filters:JSON.stringify(filters),order:JSON.stringify(order),limit:String(max)});
    const {rows}=await api(`/api/data/${encodeURIComponent(source.name)}?${qs}`);
    const docs=rows.map(row=>makeSnap(source.name,row));
    return{docs,empty:!docs.length,size:docs.length,forEach:fn=>docs.forEach(fn)};
  };
  const addDoc=async(ref,data)=>{const result=await api(`/api/data/${encodeURIComponent(ref.name)}`,{method:'POST',body:JSON.stringify(data)});return doc(null,ref.name,result.id)};
  const setDoc=async(ref,data,opt={})=>{await api(`/api/data/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.id)}`,{method:'PUT',body:JSON.stringify({...data,merge:!!opt.merge})})};
  const updateDoc=async(ref,data)=>setDoc(ref,data,{merge:true});
  const deleteDoc=async ref=>{await api(`/api/data/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.id)}`,{method:'DELETE'})};
  const writeBatch=()=>{const ops=[];return{delete:r=>ops.push(()=>deleteDoc(r)),set:(r,d)=>ops.push(()=>setDoc(r,d)),commit:async()=>{for(const op of ops)await op()}}};
  const sendApiWebhook=(target,payload)=>api(`/api/webhooks/${encodeURIComponent(target)}`,{method:'POST',body:JSON.stringify(payload)});
  const apiRequest=(path,options)=>api(path,options);

  Object.assign(window,{initializeApp,getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged,createUserWithEmailAndPassword,updatePassword,EmailAuthProvider,reauthenticateWithCredential,getFirestore,collection,doc,addDoc,setDoc,getDoc,getDocs,query,where,orderBy,updateDoc,deleteDoc,serverTimestamp,limit,writeBatch,sendApiWebhook,apiRequest});
})();
