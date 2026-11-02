import React from 'react';
import type {Style} from '../../styles';
import {mixHexRaw} from '../../styles';
import {legible} from '../kit';
import type {WorldViewProps} from '../types';
import {networkLayout, phaseMs, PHASE_LABELS, PHASES, requestNote, requestStatus, requestTime, type NetworkState} from './model';

export const networkColors = (st: Style) => {
 const t = st.tokens; const bg = t.card; const selectedBg = mixHexRaw(bg,t.accent,0.12);
 return {bg, fg: legible(t.ink,bg), muted: legible(t.muted,bg), err: legible(t.like,bg), ok: legible(t.ok,bg),
 selectedBg, selectedFg: legible(t.ink,selectedBg), selectedErr: legible(t.like,selectedBg), selectedOk: legible(t.ok,selectedBg),
 rule: t.faint, accent: legible(t.accent,bg), phases: [t.muted,t.accent,t.tags[0] || t.accent,t.termPrompt,t.ok].map(c=>legible(c,bg))};
};
export const BrowserNetworkView: React.FC<WorldViewProps<NetworkState>> = ({state:s, rect, frame, style:st, dim}) => {
 if (!s.visible) return null;
 const c = networkColors(st); const l = networkLayout(s,rect);
 const mono = {...st.font.mono, fontVariantLigatures: 'none' as const};
 const selected = l.selected;
 const label = (text:string, x:number, y:number, color=c.fg, size=16) => <div data-code style={{position:'absolute',left:x,top:y,...mono,fontSize:size,lineHeight:'22px',whiteSpace:'pre',color}}>{text}</div>;
 return <div data-shell data-world="browser.network" style={{position:'absolute',left:rect.x,top:rect.y,width:rect.w,height:rect.h,background:c.bg,color:c.fg,borderRadius:st.skin.panel.radius,border:`1px solid ${c.rule}`,boxSizing:'border-box',overflow:'hidden',opacity:dim?0.42:1}}>
  <div style={{position:'absolute',left:12,right:12,top:12,height:30,border:`1px solid ${c.rule}`,borderRadius:st.skin.term.radius}}>{[c.err,c.accent,c.ok].map((col,i)=><div key={i} style={{position:'absolute',left:10+i*18,top:9,width:11,height:11,borderRadius:6,background:col,opacity:0.85}}/>)}{label(s.url,72,3,c.muted)}</div>
  <div data-label style={{position:'absolute',left:16,top:52,...st.font.ui,fontSize:24,color:c.accent,borderBottom:`3px solid ${c.accent}`,paddingBottom:5}}>Network</div>
  {label('Name',16,86,c.muted)}{label('Status',224,86,c.muted)}{label('Waterfall',l.waterfallX,86,c.muted)}
  {l.rows.map((r,i)=> {
   const chosen = r.key === s.selected; const rowFg = chosen?c.selectedFg:c.fg;
   const statusFg = r.error?(chosen?c.selectedErr:c.err):r.done?(chosen?c.selectedOk:c.ok):rowFg;
   let offset = r.startMs;
   return <div key={r.key} style={{position:'absolute',left:1,right:1,top:110+i*52,height:52,background:chosen?c.selectedBg:c.bg,borderTop:`1px solid ${c.rule}`}}>
    {chosen && <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:c.accent}}/>}
    {label(r.name,15,2,rowFg)}{label(requestStatus(r),223,2,statusFg)}
    {label(requestNote(r),15,26,r.error?statusFg:rowFg,16)}{requestTime(r) && label(requestTime(r),223,26,chosen?c.selectedFg:c.muted)}
    <div style={{position:'absolute',left:l.waterfallX,top:5,width:l.waterfallW,height:20,borderLeft:`1px solid ${c.rule}`,borderRight:`1px solid ${c.rule}`}}>
     {PHASES.map((k,j)=> {const before=offset-r.startMs; const width=Math.min(r.timing[k],Math.max(0,r.elapsedMs-before))/l.scaleMs*l.waterfallW; const faded=chosen&&s.focus&&s.focus!==k; const left=offset/l.scaleMs*l.waterfallW; offset+=r.timing[k];
      return <div key={k} data-phase={k} style={{position:'absolute',left,top:3,width,height:14,background:r.error?c.err:c.phases[j],borderRadius:1,opacity:faded?0.28:1,outline:chosen&&s.focus===k?`2px solid ${c.accent}`:undefined}}/>;
     })}
     {r.done && r.totalMs===0 && <div data-phase="cache" style={{position:'absolute',left:r.startMs/l.scaleMs*l.waterfallW,top:3,width:5,height:14,background:c.ok,borderRadius:1}}/>}
     {!r.done && <div style={{position:'absolute',left:(r.startMs+r.elapsedMs)/l.scaleMs*l.waterfallW,top:0,height:20,width:2,background:c.accent,opacity:r.pending&&r.progress===1&&Math.floor(frame/10)%2?0.25:1}}/>}
    </div>
   </div>;
  })}
  {selected && <div style={{position:'absolute',left:0,right:0,top:l.detailY,bottom:30,borderTop:`2px solid ${c.accent}`}}>
   {label(`${selected.method} ${selected.name}`,16,6,c.accent,18)}
   {label('Timing',16,34,c.muted)}
   {PHASES.map((k,i)=> {
    const elapsed=phaseMs(selected,i);
    const on = s.focus===k; const faded = s.focus && !on;
    return <React.Fragment key={k}>
     {on && <div style={{position:'absolute',left:0,top:58+i*26,width:4,height:22,background:c.accent}}/>}
     {label(`${PHASE_LABELS[i]} ${elapsed} ms`,16,58+i*26,on?c.accent:c.fg)}
     <div style={{position:'absolute',left:230,top:65+i*26,width:(rect.w-250)*elapsed/Math.max(1,selected.totalMs),height:10,background:c.phases[i],borderRadius:2,opacity:faded?0.28:1}}/>
    </React.Fragment>;
   })}
   {label(selected.done?'Headers':selected.pending&&selected.progress===1?'Still waiting for response':'Waiting for response',16,192,c.muted)}
   {selected.done && selected.headers.map((h,i)=><React.Fragment key={`${h.name}-${i}`}>
    {label(h.dir,16,220+i*40,h.dir==='req'?c.ok:c.muted)}{label(h.name,60,220+i*40,c.accent)}{label(h.value,60,238+i*40)}
   </React.Fragment>)}
   {selected.done && !selected.headers.length && label(selected.error?'Response unavailable to JavaScript':'No headers shown',16,220,c.muted)}
  </div>}
  <div style={{position:'absolute',left:0,right:0,bottom:0,height:29,borderTop:`1px solid ${c.rule}`,background:c.bg}}>{label(`${s.requests.length} requests`,16,3,c.muted)}</div>
 </div>;
};
