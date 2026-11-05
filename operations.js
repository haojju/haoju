/* v1.96.1 Account verification and company contract controls. */
(function(){
 'use strict';
 function start(api){
  const {db,getUser,esc,toast,refresh}=api,app=document.querySelector('#app');if(!app)return;
  const unwrap=async p=>{const r=await p;if(r.error)throw r.error;return r.data};
  const labels={authorization:'委託合約',lease:'租賃已簽約',sale:'買賣已簽約',external_deal:'已核實他方成交'};
  const errorText=e=>{const m=e?.message||'';if(/schema cache|does not exist|Could not find/i.test(m))return '此功能尚未啟用，請聯絡平台管理者。';if(/token.*expired|otp.*expired|invalid.*otp/i.test(m))return '驗證碼不正確或已過期，請重新確認。';return m||'操作失敗，請重試。'};
  function contractDialog(listing,listings,companyId){
   const d=document.createElement('dialog');d.className='case-contract-dialog';const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
   d.innerHTML=`<form><h2>登記已簽訂合約</h2><p>${esc(listing.title)}</p><label class="modal-label">紀錄類型<select name="kind">${Object.entries(labels).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label><label class="modal-label">合約編號／查證依據<input name="reference" required minlength="2" maxlength="200" placeholder="不需填寫客戶身分證字號"></label><label class="modal-label">實際簽約日期<input type="date" name="start" required max="${date}" value="${date}"></label><label class="modal-label">合約到期日<input type="date" name="end" required></label><details><summary>同一物件的其他本公司廣告（請逐筆確認）</summary><p>僅勾選同一戶／同一出租範圍，避免誤下架同社區其他戶。</p>${listings.filter(x=>x.id!==listing.id).map(x=>`<label class="contract-related"><input type="checkbox" name="related" value="${x.id}"> ${esc(x.title)} · ${esc(x.city||'')}${esc(x.district||'')}</label>`).join('')}</details><label class="contract-related"><input type="checkbox" required> 我已核對實際簽約事實與關聯案件；洽談或口頭意願不算簽約。</label><p>已核實他方成交也會通知本公司；不會讀取或更改其他公司的私人案件。外部網站廣告仍須至原平台下架。</p><p data-contract-error role="status"></p><div class="form-actions"><button type="button" data-close class="button">取消</button><button class="button primary">確認登記並通知公司</button></div></form>`;
   document.body.append(d);d.showModal();d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>d.remove();d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,get=n=>f.querySelector(`[name="${n}"]`).value,b=f.querySelector('button.primary');b.disabled=true;try{await unwrap(db.rpc('haoju_register_case_contract',{p_listing_id:listing.id,p_contract_type:get('kind'),p_reference:get('reference').trim(),p_starts_on:get('start'),p_expires_on:get('end'),p_related_listing_ids:[...f.querySelectorAll('[name="related"]:checked')].map(x=>x.value)}));d.close();toast('簽約紀錄已儲存，公司成員會收到站內通知。');await refresh()}catch(err){f.querySelector('[data-contract-error]').textContent=errorText(err);b.disabled=false}};
  }
  async function allRows(makeQuery){const out=[];for(let page=0;;page++){const rows=await unwrap(makeQuery().range(page*500,page*500+499));out.push(...rows);if(rows.length<500)return out}}
  async function companyPanel(host){
   const panel=document.createElement('section');panel.className='form-section company-contract-panel';panel.dataset.companyContracts='true';panel.innerHTML='<h2>刊登紀錄與合約管理</h2><p role="status">正在讀取公司案件…</p>';host.before(panel);
   try{
    const uid=getUser()?.id;if(!uid)return;
    const member=await unwrap(db.from('haoju_company_members').select('company_id,role').eq('user_id',uid).eq('is_active',true).maybeSingle());if(!member){panel.remove();return}
    const listings=[];let page=0;
    while(true){const rows=await unwrap(db.from('listings').select('id,title,city,district,status,developer_id').eq('company_id',member.company_id).order('id',{ascending:true}).range(page*500,page*500+499));listings.push(...rows);if(rows.length<500)break;page++}
    const [history,contracts,links]=await Promise.all([unwrap(db.rpc('haoju_company_publication_summary',{p_company_id:member.company_id})),allRows(()=>db.from('haoju_case_contracts').select('*').eq('company_id',member.company_id).eq('status','active').order('id',{ascending:true})),allRows(()=>db.from('haoju_case_contract_listings').select('contract_id,listing_id').order('contract_id',{ascending:true}).order('listing_id',{ascending:true}))]);
    if(!panel.isConnected)return;
    panel.innerHTML=`<h2>刊登紀錄與合約管理</h2><p>記錄本平台曾刊登的公司仲介。簽約後可一鍵下架勾選的本公司廣告；委託合約只提醒到期。通知在右上方通知中心查看。</p>${listings.map(l=>{const hs=(history||[]).filter(h=>h.listing_id===l.id),cs=(contracts||[]).filter(c=>(links||[]).some(x=>x.contract_id===c.id&&x.listing_id===l.id)),canEdit=member.role==='owner'||l.developer_id===uid;return `<article class="contract-case"><h3>${esc(l.title)}</h3><p>${l.status==='published'?'本平台刊登中':'目前未公開'}</p><details><summary>曾刊登仲介（${hs.filter(h=>Number(h.publish_count)>0).length} 位）</summary>${hs.length?hs.map(h=>`<p>${esc(h.publisher_name)} · 上架 ${Number(h.publish_count)} 次 · 最近上架 ${h.last_published_at?esc(new Date(h.last_published_at).toLocaleString('zh-TW')):'無紀錄'} · 最後操作：${h.last_action==='published'?'上架':'下架'}</p>`).join(''):'<p>尚無可追溯紀錄；舊資料不推測刊登者。</p>'}</details>${cs.map(c=>`<div class="contract-notice"><strong>${labels[c.contract_type]} · 到期日 ${esc(c.expires_on)}</strong><p>${esc(c.reference)}</p>${c.contract_type!=='authorization'?`<button class="button primary" data-takedown="${c.id}">一鍵下架關聯廣告</button>`:''}${canEdit&&c.listing_id===l.id?`<button class="button" data-cancel-contract="${c.id}">取消此紀錄</button>`:''}</div>`).join('')}${canEdit?`<button class="button" data-new-contract="${l.id}">登記已簽訂合約／他方成交</button>`:''}</article>`}).join('')||'<p>公司目前沒有案件。</p>'}`;
    panel.querySelectorAll('[data-new-contract]').forEach(b=>b.onclick=()=>contractDialog(listings.find(l=>l.id===b.dataset.newContract),listings,member.company_id));
    panel.querySelectorAll('[data-takedown]').forEach(b=>b.onclick=async()=>{if(!confirm('將下架這筆簽約紀錄所關聯的所有本公司平台廣告。外部網站廣告需另行處理。確定下架？'))return;b.disabled=true;try{const n=await unwrap(db.rpc('haoju_takedown_contract_ads',{p_contract_id:b.dataset.takedown}));toast(`已下架 ${n} 筆本平台廣告。`);await refresh()}catch(e){toast(errorText(e));b.disabled=false}});
    panel.querySelectorAll('[data-cancel-contract]').forEach(b=>b.onclick=async()=>{if(!confirm('確定取消這筆簽約紀錄？已下架廣告不會自動重新上架。'))return;b.disabled=true;try{await unwrap(db.rpc('haoju_cancel_case_contract',{p_contract_id:b.dataset.cancelContract}));await refresh()}catch(e){toast(errorText(e));b.disabled=false}});
   }catch(e){panel.innerHTML='<h2>刊登紀錄與合約管理</h2><p role="alert">'+esc(errorText(e))+'</p>'}
  }
  function mount(){
   const company=app.querySelector('.company-workspace-grid');if(company&&!app.querySelector('[data-company-contracts]'))companyPanel(company);
  }
  new MutationObserver(mount).observe(app,{childList:true,subtree:true});mount();
 }
 window.HaojuOperations={start};
})();
