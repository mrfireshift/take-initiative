import{I as oe}from"./constants-Cz421rMH.js";import"./popoverDrag-BShgVb6O.js";import{O as P}from"./index-C7oC19nY.js";import{m as ie,n as j,C as E,D as ve}from"./customAuraCore-DL674Egq.js";import{g as $e,u as se,c as ye,a as O,d as he,b as Se,e as de}from"./customAuraPresetStore-iTcVSoYI.js";import{c as we}from"./sceneLifecycle-28TsGb8f.js";import"./aoeStyle-CUzjg6Rv.js";import"./aoeGeometryCore-Ci4uQNGU.js";const I=`${oe}/meta`,xe=`${oe}/custom-aura-modal`,H=[...new Set(new URLSearchParams(window.location.search).getAll("tokenId").map(e=>String(e||"").trim()).filter(Boolean))],L=document.querySelector("#list"),q=document.querySelector("#status"),U=document.querySelector("#token-name"),Y=document.querySelector("#modal-title"),_=document.querySelector("#save"),V=document.querySelector("#presets-btn"),G=document.querySelector("#add"),K=document.querySelector("#cancel-btn"),le=document.querySelector("#close"),p=we({obr:P}),w=$e();let $=[],r=[],S=!1,D=null,N=null,z=null,J=!1,B=null,v=null,f=null,x=!1,ae=null,R=null;const A=new Set,k=new Set,T=new URLSearchParams(window.location.search).get("mode")==="apply-preset";function m(e,{isError:t=!1,timeout:a=2500}={}){N&&(window.clearTimeout(N),N=null),q&&(t?q.classList.add("error"):q.classList.remove("error"),q.textContent=e||"",a>0&&e&&(N=window.setTimeout(()=>{N=null,q&&q.textContent===e&&(q.textContent="",q.classList.remove("error"))},a)))}function ce(){return{id:ie("aura"),enabled:!0,name:"Aura personalizzata",radiusMeters:3,style:{...ve},targeting:{filter:"all",includeSource:!1},pills:[],reminders:[]}}function c(e){return String(e??"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function W(e){return e===!0?" checked":""}function u(e){return e?" disabled":""}function b(e,t,a){return`<option value="${e}"${t===e?" selected":""}>${a}</option>`}function Ae(e){const t=[`${e.radiusMeters} m`],a=e.pills?.length||0,n=e.reminders?.length||0;if(a>0&&t.push(`${a} ${a===1?"etichetta":"etichette"}`),n>0&&t.push(`${n} promemoria`),e.presetRef?.presetId){const l=w.getPreset(e.presetRef.presetId)?.name||"Preset collegato";t.push(`Preset: ${l}`)}return t.join(" · ")}function ke(e,t,a=!1){const n=A.has(t),s=e.label||"Nuova etichetta",l=e.kind==="debuff"?"Penalità":"Beneficio",i=e.kind==="debuff"?"badge-debuff":"badge-buff";return`
    <div class="sub-card${n?" is-open":""}" data-pill-index="${t}">
      <div class="sub-card-head" data-toggle-pill="${t}">
        <label class="toggle toggle-sm" title="Attiva/disattiva etichetta" onclick="event.stopPropagation()">
          <input type="checkbox" data-field="pills.${t}.enabled"${W(e.enabled)}${u(a)}>
          Attiva
        </label>
        <div class="sub-card-summary">
          <span class="sub-card-title">${c(s)}</span>
          <span class="badge ${i}">${l}</span>
        </div>
        <span class="chevron ${n?"open":""}">▾</span>
        <button class="button-sm danger" type="button" data-action="delete-pill" style="margin-left:4px;"${u(a)}>Rimuovi</button>
      </div>
      ${n?`
        <div class="sub-card-body">
          <div class="grid">
            <label class="field">Etichetta
              <input type="text" maxlength="100" data-field="pills.${t}.label" value="${c(e.label)}"${u(a)}>
            </label>
            <label class="field">Tipo
              <select data-field="pills.${t}.kind"${u(a)}>
                ${b("buff",e.kind,"Beneficio (Buff)")}
                ${b("debuff",e.kind,"Penalità (Debuff)")}
              </select>
            </label>
          </div>
          <label class="field">Descrizione
            <textarea maxlength="320" data-field="pills.${t}.detail"${u(a)}>${c(e.detail)}</textarea>
          </label>
        </div>
      `:""}
    </div>
  `}function Ee(e){const a={"turn-start":"Inizio turno","turn-end":"Fine turno",enter:"Entrata nell'aura",leave:"Uscita dall'aura"}[e.event]||"Inizio turno";let n="Avviso";if(e.resolution==="manual-save"){const l={dex:"Des",con:"Cos",wis:"Sag",str:"For",int:"Int",cha:"Car"}[e.ability]||"Des",i=e.dcMode==="fixed"?`CD ${e.dc??15}`:"CD token",o=e.damage?.dice?` · ${e.damage.dice}${e.damage?.type?" "+e.damage.type:""}`:"";n=`TS ${l} ${i}${o}`}else e.resolution==="manual-damage"?n=`Danno ${[e.damage?.dice,e.damage?.type].filter(Boolean).join(" ")||"diretto"}`:e.resolution==="concentration-save"&&(n=`TS concentrazione CD ${e.dc??10}`);return`${a} · ${n}`}function Ce(e,t,a=!1){const n=k.has(t),s=e.resolution==="manual-save",l=e.resolution==="manual-damage",i=e.resolution==="concentration-save",o=e.dcMode==="fixed",d=e.damage?.dice||"",g=e.damage?.type||"",M=e.damage?.onSave||"half",F=e.failureCondition?.condition||"",be=Ee(e);return`
    <div class="sub-card${n?" is-open":""}" data-rem-index="${t}">
      <div class="sub-card-head" data-toggle-rem="${t}">
        <label class="toggle toggle-sm" title="Attiva/disattiva promemoria" onclick="event.stopPropagation()">
          <input type="checkbox" data-field="reminders.${t}.enabled"${W(e.enabled)}${u(a)}>
          Attivo
        </label>
        <div class="sub-card-summary">
          <span class="sub-card-title">${c(be)}</span>
        </div>
        <span class="chevron ${n?"open":""}">▾</span>
        <button class="button-sm danger" type="button" data-action="delete-reminder" style="margin-left:4px;"${u(a)}>Rimuovi</button>
      </div>
      ${n?`
        <div class="sub-card-body">
          <div class="grid">
            <label class="field">Evento
              <select data-field="reminders.${t}.event"${u(a)}>
                ${b("turn-start",e.event,"Inizio turno")}
                ${b("turn-end",e.event,"Fine turno")}
                ${b("enter",e.event,"Entrata nell'aura")}
                ${b("leave",e.event,"Uscita dall'aura")}
              </select>
            </label>
            <label class="field">Tipo
              <select data-field="reminders.${t}.resolution" data-rerender="true"${u(a)}>
                ${b("informational",e.resolution,"Avviso informativo")}
                ${b("manual-save",e.resolution,"Tiro salvezza (TS)")}
                ${b("manual-damage",e.resolution,"Danno diretto (senza TS)")}
                ${b("concentration-save",e.resolution,"TS concentrazione (solo chi si concentra)")}
              </select>
            </label>
          </div>
          <label class="field">Messaggio
            <input type="text" maxlength="240" data-field="reminders.${t}.label" value="${c(e.label)}"${u(a)}>
          </label>
          ${s?`
            <div class="grid three">
              <label class="field">Caratteristica TS
                <select data-field="reminders.${t}.ability"${u(a)}>
                  ${b("dex",e.ability,"Destrezza")}
                  ${b("con",e.ability,"Costituzione")}
                  ${b("wis",e.ability,"Saggezza")}
                  ${b("str",e.ability,"Forza")}
                  ${b("int",e.ability,"Intelligenza")}
                  ${b("cha",e.ability,"Carisma")}
                </select>
              </label>
              <label class="field">Modalità CD
                <select data-field="reminders.${t}.dcMode" data-rerender="true"${u(a)}>
                  ${b("caster",e.dcMode,"CD incantesimi del token")}
                  ${b("fixed",e.dcMode,"CD fissa")}
                </select>
              </label>
              ${o?`
                <label class="field">Valore CD
                  <input type="number" min="1" max="99" data-field="reminders.${t}.dc" value="${c(e.dc??15)}"${u(a)}>
                </label>
              `:"<div></div>"}
            </div>
            <div class="grid three">
              <label class="field">Formula danno (es. 2d6)
                <input type="text" maxlength="40" data-field="reminders.${t}.damage.dice" value="${c(d)}" placeholder="opzionale"${u(a)}>
              </label>
              <label class="field">Tipo danno
                <input type="text" maxlength="40" data-field="reminders.${t}.damage.type" value="${c(g)}" placeholder="es. fuoco"${u(a)}>
              </label>
              <label class="field">Danno su TS superato
                <select data-field="reminders.${t}.damage.onSave"${u(a)}>
                  ${b("half",M,"Metà danno")}
                  ${b("zero",M,"Nessun danno")}
                </select>
              </label>
            </div>
            <label class="field">Condizione su fallimento TS (opzionale)
              <input type="text" maxlength="100" data-field="reminders.${t}.failureCondition.condition" value="${c(F)}" placeholder="es. Prono"${u(a)}>
            </label>
          `:""}
          ${i?`
            <div class="grid">
              <label class="field">Valore CD
                <input type="number" min="1" max="99" data-field="reminders.${t}.dc" value="${c(e.dc??10)}"${u(a)}>
              </label>
              <div class="sub-empty">Compare solo a chi mantiene la concentrazione; se il TS fallisce la concentrazione si interrompe.</div>
            </div>
          `:""}
          ${l?`
            <div class="grid">
              <label class="field">Formula danno (es. 2d8)
                <input type="text" maxlength="40" data-field="reminders.${t}.damage.dice" value="${c(d)}"${u(a)}>
              </label>
              <label class="field">Tipo danno
                <input type="text" maxlength="40" data-field="reminders.${t}.damage.type" value="${c(g)}" placeholder="es. radioso"${u(a)}>
              </label>
            </div>
          `:""}
        </div>
      `:""}
    </div>
  `}function Pe(e,t){const a=x&&f===t,n=Number.isInteger(f),s=a||n,l=Ae(e);return`
    <article class="aura-summary-card${e.enabled?"":" is-disabled"}${a?" draft":""}" data-index="${t}" data-existing-summary>
      <div class="aura-summary-main">
        <div class="aura-summary-title-row">
          <span class="aura-summary-name">${c(e.name)}</span>
          <input type="hidden" data-existing-rename value="${c(e.name)}">
        </div>
        <div class="aura-summary-meta">
          ${c(l)}
        </div>
      </div>
      <div class="aura-summary-actions">
        <label class="toggle" title="Attiva/disattiva questa aura">
          <input type="checkbox" data-existing-toggle${W(e.enabled)}${u(s)}>
          Attiva
        </label>
        <button type="button" class="button-sm primary" data-action="edit-details" data-index="${t}"${u(s)}>Modifica</button>
        <button type="button" class="button-sm danger" data-action="delete-existing" data-index="${t}"${u(s)}>Elimina</button>
      </div>
    </article>
  `}function Te(e,t,{isNew:a=!1}={}){const n=Array.isArray(e.pills)?e.pills:[],s=Array.isArray(e.reminders)?e.reminders:[],l=!!e.presetRef?.presetId,i=v===t,o=l&&!i,g=(l?w.getPreset(e.presetRef.presetId):null)?.name||(l?"Preset collegato":"");return`
    <section class="aura-card aura-detail-card" data-index="${t}">
      <div class="aura-editor-head">
        <label class="field">Nome aura
          <input class="name" type="text" maxlength="100" data-field="name" value="${c(e.name)}" aria-label="Nome aura"${u(o)}>
        </label>
        <label class="toggle toggle-editor">
          <input type="checkbox" data-field="enabled"${W(e.enabled)}>
          Attiva
        </label>
      </div>

      ${l?`
        <div class="preset-banner">
          <div class="preset-banner-info">
            <span class="preset-badge">Preset: ${c(g)}</span>
            ${i?'<span class="preset-editing-tag">Modifica preset globale</span>':""}
          </div>
          <div class="preset-banner-actions">
            ${i?'<button type="button" class="button-sm" data-action="cancel-preset-edit">Annulla modifica preset</button>':'<button type="button" class="button-sm" data-action="update-preset">Modifica preset</button>'}
            <button type="button" class="button-sm" data-action="detach-preset">Scollega</button>
          </div>
        </div>
      `:`
        <div class="preset-action-row">
          <button type="button" class="preset-link-action" data-action="save-as-preset">Salva come preset…</button>
        </div>
      `}

      <div class="section">
        <div class="section-title">Dimensione e bersagli</div>
        <div class="grid-radius-targeting">
          <label class="field">Raggio in metri
            <input type="number" min="0" max="300" step="1.5" data-field="radiusMeters" value="${c(e.radiusMeters)}"${u(o)}>
          </label>
          <div class="targeting-group">
            <label class="field">Token interessati
              <select data-field="targeting.filter"${u(o)}>
                ${b("all",e.targeting?.filter,"Tutti")}
                ${b("friendly",e.targeting?.filter,"Alleati")}
                ${b("hostile",e.targeting?.filter,"Ostili")}
                ${b("pc",e.targeting?.filter,"Personaggi (PG)")}
              </select>
            </label>
            <label class="inline targeting-include-source"><input type="checkbox" data-field="targeting.includeSource"${W(e.targeting?.includeSource)}${u(o)}> Includi anche il token sorgente</label>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Aspetto sulla mappa</div>
        <div class="style-compact-grid">
          <div class="style-composite-row">
            <label class="field style-color-field">Riempimento
              <input type="color" data-field="style.fillColor" value="${c(e.style?.fillColor)}"${u(o)}>
            </label>
            <label class="field style-slider-field">Opacità
              <input type="range" min="0.05" max="0.45" step="0.01" data-field="style.fillOpacity" value="${c(e.style?.fillOpacity)}"${u(o)}>
            </label>
          </div>
          <div class="style-composite-row">
            <label class="field style-color-field">Bordo
              <input type="color" data-field="style.strokeColor" value="${c(e.style?.strokeColor)}"${u(o)}>
            </label>
            <label class="field style-slider-field">Spessore
              <input type="range" min="0.4" max="3" step="0.1" data-field="style.strokeWidth" value="${c(e.style?.strokeWidth)}"${u(o)}>
            </label>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Etichette (${n.length})</div>
          <button type="button" class="button-sm" data-action="add-pill"${u(o)}>+ Aggiungi etichetta</button>
        </div>
        ${n.length?`<div class="sub-list">${n.map((M,F)=>ke(M,F,o)).join("")}</div>`:'<div class="sub-empty">Nessuna etichetta configurata.</div>'}
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Promemoria (${s.length})</div>
          <button type="button" class="button-sm" data-action="add-reminder"${u(o)}>+ Aggiungi promemoria</button>
        </div>
        ${s.length?`<div class="sub-list">${s.map((M,F)=>Ce(M,F,o)).join("")}</div>`:'<div class="sub-empty">Nessun promemoria configurato.</div>'}
      </div>
    </section>
  `}function Ie(e){const t=e.definition||{},a=[`${t.radiusMeters||3} m`],n=t.pills?.length||0,s=t.reminders?.length||0;return n>0&&a.push(`${n} ${n===1?"etichetta":"etichette"}`),s>0&&a.push(`${s} promemoria`),a.join(" · ")}function C(){J=!0;const e=w.getActivePresets();L.innerHTML=`
    <div class="preset-dialog">
      ${e.length?e.map(t=>B===t.id?`
                <div class="preset-item" data-preset-id="${c(t.id)}">
                  <div class="preset-rename-box">
                    <input type="text" class="name preset-rename-input" data-preset-rename-id="${c(t.id)}" value="${c(t.name)}" maxlength="100" autofocus>
                    <button type="button" class="button-sm primary" data-preset-action="save-rename" data-preset-id="${c(t.id)}">Salva</button>
                    <button type="button" class="button-sm" data-preset-action="cancel-rename">Annulla</button>
                  </div>
                </div>
              `:`
              <div class="preset-item" data-preset-id="${c(t.id)}">
                <div class="preset-item-info">
                  <div class="preset-item-name">${c(t.name)}</div>
                  <div class="preset-item-meta">${c(Ie(t))}</div>
                </div>
                <div class="preset-item-actions">
                  <button type="button" class="button-sm primary" data-preset-action="apply" data-preset-id="${c(t.id)}">${T?"Applica":"Usa"}</button>
                  <button type="button" class="button-sm" data-preset-action="start-rename" data-preset-id="${c(t.id)}">Rinomina</button>
                  <button type="button" class="button-sm" data-preset-action="duplicate" data-preset-id="${c(t.id)}">Duplica</button>
                  <button type="button" class="button-sm danger" data-preset-action="delete" data-preset-id="${c(t.id)}">Elimina</button>
                </div>
              </div>
            `).join(""):`<div class="empty-state">
            <p class="empty-text">Nessun preset salvato.</p>
            <p class="empty-hint">Salva un’aura come preset dall’editor per riutilizzarla rapidamente su qualsiasi token.</p>
          </div>`}
    </div>
  `,h()}function Q(){z=void 0,J=!1,B=null,y()}function y(){if(J||T){C();return}if(Number.isInteger(f)&&r[f]){L.innerHTML=Te(r[f],f,{isNew:x}),h();return}r.length?L.innerHTML=`
      <div class="aura-list">
        ${r.map((t,a)=>Pe(t,a)).join("")}
      </div>
    `:L.innerHTML=`
      <div class="empty-state">
        <p class="empty-text">Nessuna aura configurata per questo token.</p>
        <div class="empty-actions">
          <button type="button" class="button primary" data-action="create-aura">+ Nuova aura</button>
          <button type="button" class="button" data-action="open-presets">Libreria preset</button>
        </div>
      </div>
    `,h()}function ne(){const e=$[0];if(U){if(!e){U.textContent="Nessun token selezionato";return}U.textContent=$.length===1?e.name||"Token":`${$.length} token selezionati`}}function h(){const e=Number.isInteger(f),t=J||T;if(Y&&(t?Y.textContent=T?"Applica preset aura":"Libreria preset":e?Y.textContent=x?"Nuova aura":"Modifica aura":Y.textContent="Aure personalizzate"),U)if(t&&!T)U.textContent="Preset globali";else if(e)U.textContent=r[f]?.name||"Aura personalizzata";else{const a=$[0];U.textContent=a?$.length===1?a.name||"Token":`${$.length} token selezionati`:"Nessun token selezionato"}_&&(_.hidden=!e,_.disabled=S||!$.length||!p.isReady()||!e),K&&(K.hidden=!e,K.disabled=S),V&&(V.hidden=e||t,V.disabled=S),G&&(G.hidden=e||t,G.disabled=S)}async function re(e,t,a){if(S||Number.isInteger(f)||$.length!==1)return;const n=String(r[e]?.id||"").trim();if(!n||!$.length||!p.isReady())return;const s=p.capture({operationId:`custom-aura-existing:${Date.now().toString(36)}`});if(p.isCurrent(s)){S=!0,h(),m("Salvataggio…",{timeout:0});try{if(await P.scene.items.updateItems([$[0].id],l=>{for(const i of l){if(!i)continue;const o={...i.metadata?.[I]||{}},d=j(o[E]),g=d.findIndex(F=>F.id===n);if(g<0)continue;const M=t(d[g],i);M===null?d.splice(g,1):d[g]=M,d.length?o[E]=d:delete o[E],i.metadata={...i.metadata||{},[I]:o}}}),!p.isCurrent(s)||(await te(),!p.isCurrent(s)))return;fe(),y(),a&&m(a,{timeout:2200})}catch(l){if(!p.isCurrent(s)){m("Scena cambiata: riapri l’editor delle aure.",{isError:!0,timeout:3500});return}m(`Errore: ${String(l?.message||l)}`,{isError:!0,timeout:4e3})}finally{S=!1,h()}}}function ue(e){const t=Number(e?.closest("[data-existing-summary]")?.dataset.index);return Number.isInteger(t)?t:-1}function Ne(e){const t=ue(e);t<0||re(t,a=>({...a,enabled:e.checked}),e.checked?"Aura attivata":"Aura disattivata")}function ze(e){const t=ue(e);if(t<0)return;const a=String(e.value||"").trim();if(!a){m("Il nome dell’aura non può essere vuoto.",{isError:!0,timeout:3e3}),y();return}re(t,n=>({...n,name:a}),`Aura rinominata in “${a}”`)}function De(e,t,a){const n=String(t||"").split(".").filter(Boolean);let s=e;for(let l=0;l<n.length-1;l++){const i=n[l],o=n[l+1];(s[i]===void 0||s[i]===null)&&(s[i]=/^\d+$/.test(o)?[]:{}),s=s[i]}n.length&&(s[n.at(-1)]=a)}function Le(e){return e.type==="checkbox"?e.checked:e.type==="number"||e.type==="range"?e.value===""?"":Number(e.value):e.value}function me(e){if(!p.isReady())return;const t=e.closest("[data-index]"),a=Number(t?.dataset.index);!Number.isInteger(a)||!r[a]||!e.dataset.field||r[a].presetRef?.presetId&&v!==a&&e.dataset.field!=="enabled"||(De(r[a],e.dataset.field,Le(e)),e.dataset.rerender==="true"&&y())}function pe(){return!Number.isInteger(f)||!r[f]||!R?!1:JSON.stringify(r[f])!==R}function Re(){return Number.isInteger(f)}function X(){return Re()?(m("Salva o annulla la bozza corrente prima di aprire un altro flusso.",{isError:!0,timeout:3e3}),!0):!1}async function ee({discard:e=!1}={}){if(!(!e&&pe()&&!S&&!window.confirm("La bozza non salvata verrà scartata. Continuare?"))){if(J&&!T){Q();return}await P.popover.close(xe).catch(()=>{})}}async function te(){if(!p.isReady()||!H.length)return;const e=new Set(H),t=await P.scene.items.getItems(a=>e.has(a.id));$=H.map(a=>t.find(n=>n.id===a)).filter(Boolean),ne(),h()}function fe(){r=j($[0]?.metadata?.[I]?.[E])}async function Z(){pe()&&!window.confirm("Le modifiche non salvate verranno scartate. Continuare?")||(x&&Number.isInteger(f)&&r.splice(f,1),f=null,x=!1,v=null,R=null,A.clear(),k.clear(),await te(),fe(),y(),m("Modifiche annullate.",{timeout:2e3}))}async function Me(e){if(S||!p.isReady()||!$.length)return;const t=p.capture({operationId:`custom-aura-quick-apply:${Date.now().toString(36)}`});if(p.isCurrent(t)){S=!0,h(),m("Applicazione preset…",{timeout:0});try{if(await P.scene.items.updateItems($.map(a=>a.id),a=>{for(const n of a){if(!n)continue;const s={...n.metadata?.[I]||{}},l=j(s[E]);s[E]=de(l,e),n.metadata={...n.metadata||{},[I]:s}}}),!p.isCurrent(t))return;m(`Preset "${e.name}" applicato.`,{timeout:2e3}),D&&window.clearTimeout(D),D=window.setTimeout(()=>{D=null,p.isCurrent(t)&&ee({discard:!0})},220)}catch(a){if(!p.isCurrent(t))return;m(`Errore: ${String(a?.message||a)}`,{isError:!0,timeout:3500})}finally{S=!1,h()}}}async function ge(){if(!Number.isInteger(f))return;const e=p.capture({operationId:`custom-aura-save:${Date.now().toString(36)}`});if(p.isCurrent(e)){try{if(await te(),!p.isCurrent(e))return}catch(t){m(`Errore: ${String(t?.message||t)}`,{isError:!0,timeout:3500});return}if(!$.length){m("Token non disponibili sulla battlemap",{isError:!0,timeout:3e3});return}if(!T&&$.length!==1){m("L’editor dettagliato richiede un solo token.",{isError:!0,timeout:3e3});return}S=!0,h(),m("Salvataggio in corso…",{timeout:0});try{let t=j(r);if(!p.isCurrent(e)){S=!1,h();return}if(ae){const a=w.getPreset(ae);if(!a||a.deleted){m("Preset non disponibile: nessuna istanza è stata modificata.",{isError:!0,timeout:3500}),S=!1,h();return}await P.scene.items.updateItems($.map(s=>s.id),s=>{for(const l of s){if(!l)continue;const i={...l.metadata?.[I]||{}},o=j(i[E]);i[E]=de(o,a),l.metadata={...l.metadata||{},[I]:i}}});const[n]=await P.scene.items.getItems([$[0].id]);t=j(n?.metadata?.[I]?.[E]),ae=null}else{if(Number.isInteger(v)){const a=t[v],n=w.getPreset(a?.presetRef?.presetId);if(!n||n.deleted){m("Preset collegato non trovato: l’istanza resta invariata.",{isError:!0,timeout:3500}),S=!1,h();return}const s=se(n,{name:a.name,definition:a}),l=w.savePreset(s);t[v]=O(l,{existingAura:a}),v=null}await P.scene.items.updateItems([$[0].id],a=>{for(const n of a){if(!n)continue;const s={...n.metadata?.[I]||{}};t.length?s[E]=t:delete s[E],n.metadata={...n.metadata||{},[I]:s}}})}if(!p.isCurrent(e)){m("Scena cambiata: riapri l’editor delle aure.",{isError:!0,timeout:3500}),S=!1,h();return}r=t,f=null,x=!1,v=null,R=null,A.clear(),k.clear(),S=!1,y(),h(),m(T?"Preset applicato":"Aura salvata.",{timeout:2e3})}catch(t){if(!p.isCurrent(e)){m("Scena cambiata: riapri l’editor delle aure.",{isError:!0,timeout:3500}),S=!1,h();return}m(`Errore: ${String(t?.message||t)}`,{isError:!0,timeout:3500}),S=!1,h()}}}L.addEventListener("input",e=>me(e.target));L.addEventListener("change",e=>{const t=e.target;if(t.matches("[data-existing-toggle]")){Ne(t);return}if(t.matches("[data-existing-rename]")){ze(t);return}me(t)});L.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("[data-preset-rename-id]")){e.preventDefault();const t=e.target.dataset.presetRenameId,a=w.getPreset(t),n=String(e.target.value||"").trim();if(a&&n){const s=se(a,{name:n});w.savePreset(s),B=null,C(),m(`Preset rinominato in "${n}".`,{timeout:2e3})}return}if(e.key==="Escape"&&B){B=null,C();return}e.key==="Enter"&&e.target.matches("[data-existing-rename]")&&(e.preventDefault(),e.target.blur())});L.addEventListener("click",e=>{const t=e.target.closest("button[data-action]"),a=t?null:e.target.closest("[data-toggle-pill]");if(a){const d=Number(a.dataset.togglePill);if(Number.isInteger(d)){A.has(d)?A.delete(d):A.add(d),y();return}}const n=t?null:e.target.closest("[data-toggle-rem]");if(n){const d=Number(n.dataset.toggleRem);if(Number.isInteger(d)){k.has(d)?k.delete(d):k.add(d),y();return}}const s=e.target.closest("[data-action]");if(s){const d=s.dataset.action;if(d==="create-aura"){if(X())return;const g=ce();r.push(g),f=r.length-1,x=!0,v=null,R=JSON.stringify(g),A.clear(),k.clear(),y();return}if(d==="open-presets"){if(X())return;z=null,C();return}}if(!t)return;const l=t.closest("[data-index]"),i=Number(l?.dataset.index);if(!Number.isInteger(i)||!r[i])return;const o=t.dataset.action;if(o==="edit-details"){f=i,x=!1,v=r[i].presetRef?.presetId?i:null,R=JSON.stringify(r[i]),A.clear(),k.clear(),y();return}if(o==="close-details"){Z();return}if(o==="delete-existing"){if(!window.confirm(`Eliminare l’aura “${r[i].name}”?`))return;re(i,()=>null,`Aura “${r[i].name}” eliminata`);return}if(o==="cancel-new"){Z();return}if(o==="delete"){v===i&&(v=null),r.splice(i,1),y();return}if(o==="add-pill"){if(r[i].presetRef?.presetId&&v!==i)return;r[i].pills||=[];const d=r[i].pills.length;r[i].pills.push({id:ie("pill"),enabled:!0,label:r[i].name||"Etichetta",detail:"",kind:"buff"}),A.add(d),y();return}if(o==="delete-pill"){if(r[i].presetRef?.presetId&&v!==i)return;const d=t.closest("[data-pill-index]"),g=Number(d?.dataset.pillIndex);Number.isInteger(g)&&Array.isArray(r[i].pills)&&(r[i].pills.splice(g,1),A.delete(g),y());return}if(o==="add-reminder"){if(r[i].presetRef?.presetId&&v!==i)return;r[i].reminders||=[];const d=r[i].reminders.length;r[i].reminders.push({id:ie("reminder"),enabled:!0,event:"turn-start",label:`Inizia il turno nell'aura ${r[i].name}.`,resolution:"informational"}),k.add(d),y();return}if(o==="delete-reminder"){if(r[i].presetRef?.presetId&&v!==i)return;const d=t.closest("[data-rem-index]"),g=Number(d?.dataset.remIndex);Number.isInteger(g)&&Array.isArray(r[i].reminders)&&(r[i].reminders.splice(g,1),k.delete(g),y());return}if(o==="save-as-preset"){const d=window.prompt("Nome del nuovo preset:",r[i].name||"Preset aura");if(!d)return;const g=ye(r[i],{name:d});w.savePreset(g),r[i]=O(g,{existingAura:r[i]}),y(),m(`Preset "${d}" creato e collegato.`,{timeout:2500});return}if(o==="update-preset"){const d=r[i].presetRef?.presetId,g=w.getPreset(d);if(!g){m("Preset collegato non trovato nella libreria.",{isError:!0,timeout:3e3});return}v=i,f=i,x=!1,y(),m(`Modifica in corso del preset "${g.name}".`,{timeout:2500});return}if(o==="cancel-preset-edit"){v=null,y();return}if(o==="detach-preset"){v===i&&(v=null),r[i]=he(r[i]),y(),m("Aura scollegata dal preset (modifica locale).",{timeout:2500});return}if(o==="apply-preset"){z=i,C();return}});document.body.addEventListener("click",e=>{const t=e.target.closest("[data-preset-action]");if(!t)return;const a=t.dataset.presetAction;if(a==="close-dialog"){Q();return}const n=t.closest("[data-preset-id]"),s=n?.dataset.presetId,l=s?w.getPreset(s):null;if(!(!l&&a!=="cancel-rename")){if(a==="apply"){if(T){Me(l);return}if(z!==null&&Number.isInteger(z)&&r[z])r[z]=O(l,{existingAura:r[z]}),m(`Preset "${l.name}" applicato all’aura esistente.`,{timeout:2500});else{const i=O(l);r.push(i),f=r.length-1,x=!0,v=null,R=JSON.stringify(i),A.clear(),k.clear(),m(`Aura creata dal preset "${l.name}".`,{timeout:2500})}Q(),y();return}if(a==="start-rename"){B=l.id,C();return}if(a==="save-rename"){const i=n?.querySelector(`input[data-preset-rename-id="${c(l.id)}"]`),o=String(i?.value||"").trim();if(o){const d=se(l,{name:o});w.savePreset(d),B=null,C(),m(`Preset rinominato in "${o}".`,{timeout:2e3})}return}if(a==="cancel-rename"){B=null,C();return}if(a==="duplicate"){const i=Se(l);w.savePreset(i),C(),m(`Preset duplicato in "${i.name}".`,{timeout:2e3});return}if(a==="delete"){window.confirm(`Eliminare il preset "${l.name}"?`)&&(w.deletePreset(l.id),C(),m("Preset eliminato.",{timeout:2e3}));return}}});G&&G.addEventListener("click",()=>{if(X())return;const e=ce();r.push(e),f=r.length-1,x=!0,v=null,R=JSON.stringify(e),A.clear(),k.clear(),h(),y()});V&&V.addEventListener("click",()=>{X()||(z=null,C())});K&&K.addEventListener("click",()=>void Z());_&&_.addEventListener("click",()=>void ge());le&&le.addEventListener("click",()=>void ee());document.addEventListener("keydown",e=>{e.key==="Escape"&&(J&&!T?Q():Number.isInteger(f)?Z():ee()),(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"&&(e.preventDefault(),Number.isInteger(f)&&ge())});P.onReady(async()=>{p.subscribe(e=>{e.phase==="unavailable"?($=[],r=[],f=null,x=!1,v=null,R=null,L.replaceChildren(),m("Scena non disponibile: riapri l’editor delle aure.",{isError:!0,timeout:0}),ne(),h()):e.phase==="ready"&&e.reason!=="scene-bootstrap-ready"&&(m("Scena pronta.",{timeout:2e3}),h(),te())}),p.registerSceneCleanup(()=>{D&&window.clearTimeout(D),D=null,N&&window.clearTimeout(N),N=null}),await p.mount();try{if(!p.isReady())throw new Error("Scena non disponibile: riapri l’editor delle aure.");const e=await P.player.getRole().catch(()=>"PLAYER");if(!p.isReady())throw new Error("Scena cambiata: riapri l’editor delle aure.");if(e!=="GM")throw new Error("Solo il GM può gestire le aure.");if(!H.length)throw new Error("Token non specificato.");const t=new Set(H),a=await P.scene.items.getItems(s=>t.has(s.id));if(!p.isReady())throw new Error("Scena cambiata: riapri l’editor delle aure.");if($=H.map(s=>a.find(l=>l.id===s)).filter(Boolean),!$.length)throw new Error("Token non trovato nella scena.");if(!T&&$.length!==1){await P.notification.show("Gestisci aure personalizzate richiede un solo token. Per più token usa Applica preset aura…","INFO").catch(()=>{}),await ee({discard:!0});return}const n=$[0];f=null,x=!1,v=null,R=null,ne(),r=j(n?.metadata?.[I]?.[E]),T?(z=null,C()):y(),h()}catch(e){m(String(e?.message||e),{isError:!0,timeout:0}),_&&(_.disabled=!0),L.innerHTML='<div class="empty-state"><p class="empty-text">Editor non disponibile.</p></div>'}});window.addEventListener("pagehide",()=>{D&&window.clearTimeout(D),D=null,N&&window.clearTimeout(N),N=null,p.dispose()});
