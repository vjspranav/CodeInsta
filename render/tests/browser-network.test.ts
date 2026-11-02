import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import './helpers';
import type {Action} from '../src/schema';
import {validateStory} from '../src/schema';
import {deriveChecks} from '../verify-lib';
import {contrast, STYLES} from '../src/styles';
import {CONTENT} from '../src/theme';
import type {WorldEvent} from '../src/worlds/types';
import {browserNetwork} from '../src/worlds/browser-network';
import {BrowserNetworkView, networkColors} from '../src/worlds/browser-network/View';
import {phaseMs, networkStateAt, networkTokens, networkTexts, networkProblems, networkLayout, networkTimelineProblems, networkIsSignature, networkSettle, validateNetwork} from '../src/worlds/browser-network/model';
const A=(a:Record<string,unknown>)=>a as unknown as Action;
const ev=(frame:number,a:Record<string,unknown>):WorldEvent=>({frame,beat:0,action:A(a)});
const SET=ev(0,{do:'world.set',world:'browser.network',url:'https://example.com'});
const req={do:'net.request',key:'api',name:'/api/feed',status:200,timing:{dns:20,connect:30,tls:50,ttfb:800,download:100},headers:[{name:'Content-Type',value:'application/json'}]};
const events=[SET,ev(10,req)];

describe('browser.network validation',()=>{
 it('accepts all actions and real response metadata',()=>{
  for(const a of [SET.action,req,{...req,status:304,cache:'revalidated'},{...req,status:undefined,error:'CORS blocked',headers:[]},{do:'net.select',key:'api'},{do:'net.clear'},{do:'net.focus',phase:'tls'},{do:'net.focus',off:true},{...req,status:undefined,headers:undefined,pending:true},{...req,headers:[{name:'If-None-Match',value:'"v1"',dir:'req'}]}]) expect(validateNetwork(A(a))).toEqual([]);
 });
 it('rejects malformed requests, timings, headers and impossible response combinations',()=>{
  for(const a of [{do:'net.request'}, {...req,name:'x'.repeat(21)}, {...req,timing:null}, {...req,timing:{dns:0}}, {...req,timing:{...req.timing,ttfb:NaN}}, {...req,timing:{...req.timing,tls:-1}}, {...req,status:99}, {...req,status:200.5}, {...req,cache:'revalidated'}, {...req,error:'CORS blocked'}, {...req,headers:[null]}, {...req,headers:[{name:'bad name',value:'x'}]}, {...req,headers:[{name:'X',value:'x'.repeat(49)}]}, {...req,duration_ms:0}, {...req,start_ms:Infinity}, {do:'net.select'},{do:'net.focus'},{do:'net.focus',phase:'paint'},{do:'net.focus',phase:'tls',off:true},{...req,pending:true},{...req,pending:'yes'},{...req,headers:[{name:'X',value:'v',dir:'both'}]}]) expect(validateNetwork(A(a)),JSON.stringify(a)).not.toEqual([]);
 });
});
describe('browser.network state',()=>{
 it('grows the waterfall before revealing response status and headers',()=>{
  expect(networkStateAt(events,-1).visible).toBe(false);
  expect(networkStateAt(events,9).requests).toEqual([]);
  const start=networkStateAt(events,10).requests[0]; expect(start.elapsedMs).toBe(0); expect(start.status).toBeNull(); expect(start.headers).toEqual([]);
  const half=networkStateAt(events,28).requests[0]; expect(half.elapsedMs).toBe(500); expect(half.progress).toBe(0.5); expect(half.done).toBe(false);
  const done=networkStateAt(events,46).requests[0]; expect(done.status).toBe(200); expect(done.elapsedMs).toBe(1000); expect(done.headers).toEqual(req.headers.map(h=>({...h,dir:'res'})));
 });
 it('only turns failed requests red and cached requests into cache hits when complete',()=>{
  const e=[SET,ev(0,{...req,status:304,cache:'revalidated'}),ev(50,{...req,key:'cors',status:undefined,error:'CORS blocked'})];
  expect(networkStateAt(e,35).requests[0].cache).toBe('');
  expect(networkStateAt(e,36).requests[0].cache).toBe('revalidated');
  expect(networkStateAt(e,85).requests[1].error).toBe('');
  expect(networkStateAt(e,86).requests[1].error).toBe('CORS blocked');
  expect(networkStateAt(e,86).requests[1].status).toBeNull();
 });
 it('selects earlier headers, clears rows and preserves state across world reentry',()=>{
  const e=[...events,ev(60,{...req,key:'css',name:'app.css'}),ev(100,{do:'net.select',key:'api'}),ev(120,{do:'world.set',world:'browser.network'}),ev(150,{do:'net.clear'})];
  expect(networkStateAt(e,101).selected).toBe('api'); expect(networkLayout(networkStateAt(e,121),CONTENT).selected?.headers).toEqual(req.headers.map(h=>({...h,dir:'res'})));
  expect(networkStateAt(e,150).requests).toEqual([]); expect(networkStateAt(e,150).selected).toBeNull();
 });
 it('is pure, deterministic and does not leak future events',()=>{
  const e=[...events,ev(100,{...req,key:'next'}),ev(200,{do:'net.clear'})];
  for(const frame of [0,10,28,46,99]) {expect(networkStateAt(e,frame)).toEqual(networkStateAt(events,frame)); expect(networkStateAt(structuredClone(e),frame)).toEqual(networkStateAt(e,frame));}
 });
 it('tokens match the exact appearance of names, errors, cache and status',()=>{
  for(const a of [req,{...req,status:304,cache:'revalidated'},{...req,status:undefined,error:'CORS blocked'}]) {
   const e=[SET,ev(10,a)];
   for(const token of networkTokens(A(a))) {
    expect(networkTexts(networkStateAt(e,10+token.off),CONTENT)).toContain(token.text);
    if(token.off>0) expect(networkTexts(networkStateAt(e,10+token.off-1),CONTENT)).not.toContain(token.text);
   }
  }
  expect(networkSettle(A(req))).toBe(38);
 });
 it('reports duplicate keys and missing selections but permits reuse after clear',()=>{
  expect(networkTimelineProblems([...events,ev(60,req)]).join()).toMatch(/duplicate/);
  expect(networkTimelineProblems([SET,ev(0,{do:'net.select',key:'absent'})]).join()).toMatch(/missing/);
  expect(networkTimelineProblems([...events,ev(60,{do:'net.clear'}),ev(70,req)])).toEqual([]);
 });
 it('counts a growing waterfall, failure and request selection as signature interactions',()=>{
  expect(networkIsSignature(A(req))).toBe(true); expect(networkIsSignature(A({do:'net.select',key:'api'}))).toBe(true);
  expect(networkIsSignature(A({do:'net.clear'}))).toBe(false);
  expect(networkIsSignature(A({...req,duration_ms:300,timing:{dns:0,connect:0,tls:0,ttfb:0,download:0}}))).toBe(false);
  expect(browserNetwork.signature).toContain('net.request');
 });
});
describe('browser.network focus, pending and header direction',()=>{
 it('focuses one phase until another request or a clear, and ignores unknown phases',()=>{
  const e=[...events,ev(60,{do:'net.focus',phase:'ttfb'}),ev(70,{do:'net.focus',phase:'bogus'}),ev(80,{do:'net.focus',off:true}),ev(90,{do:'net.focus',phase:'tls'}),ev(100,{...req,key:'next'})];
  expect(networkStateAt(e,59).focus).toBeNull(); expect(networkStateAt(e,60).focus).toBe('ttfb'); expect(networkStateAt(e,70).focus).toBe('ttfb');
  expect(networkStateAt(e,80).focus).toBeNull(); expect(networkStateAt(e,95).focus).toBe('tls'); expect(networkStateAt(e,100).focus).toBeNull();
  expect(networkIsSignature(A({do:'net.focus',phase:'tls'}))).toBe(true); expect(networkIsSignature(A({do:'net.focus',off:true}))).toBe(false);
 });
 it('a pending request grows its waterfall, then waits with no status or headers', ()=>{
  const p={...req,key:'hang',status:undefined,headers:undefined,pending:true,duration_ms:600,timing:{dns:0,connect:0,tls:0,ttfb:400,download:0}};
  const e=[SET,ev(0,p)];
  const mid=networkStateAt(e,9).requests[0]; expect(mid.done).toBe(false); expect(mid.elapsedMs).toBe(200);
  const late=networkStateAt(e,900).requests[0]; expect(late.done).toBe(false); expect(late.elapsedMs).toBe(400); expect(late.status).toBeNull(); expect(late.headers).toEqual([]);
  const texts=networkTexts(networkStateAt(e,900),CONTENT); expect(texts).toContain('pending'); expect(texts).toContain('Still waiting for response');
  expect(networkTokens(A(p)).map(t=>t.text)).toEqual(['/api/feed','pending']);
 });
 it('request headers keep their direction and complete requests show their total time',()=>{
  const e=[SET,ev(0,{...req,headers:[{name:'If-None-Match',value:'"v1"',dir:'req'},{name:'ETag',value:'"v1"'}]})];
  const s=networkStateAt(e,100); expect(s.requests[0].headers.map(h=>h.dir)).toEqual(['req','res']);
  const t=networkTexts(s,CONTENT); expect(t).toContain('1000 ms'); expect(t).toContain('req'); expect(t).toContain('res');
  expect(phaseMs(s.requests[0],3)).toBe(800);
 });
 it('focus and pending states render in every style with their text present',()=>{
  const p={...req,key:'hang',status:undefined,headers:undefined,pending:true};
  const e=[SET,ev(0,req),ev(50,{do:'net.focus',phase:'ttfb'}),ev(60,p)];
  for(const st of STYLES) for(const frame of [55,300]) {
   const state=networkStateAt(e,frame);
   const html=renderToStaticMarkup(React.createElement(BrowserNetworkView,{state,rect:CONTENT,frame,start:0,style:st}));
   const text=html.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"');
   for(const t of networkTexts(state,CONTENT)) expect(text,`${st.id} frame ${frame}`).toContain(t);
  }
 });
});
describe('browser.network layout and styles',()=>{
 it('scrolls selected rows into view and diagnoses small slots or missing requests',()=>{
  const e=[SET,...Array.from({length:8},(_,i)=>ev(i*50,{...req,key:String(i)})),ev(500,{do:'net.select',key:'0'})];
  const s=networkStateAt(e,510); const l=networkLayout(s,CONTENT);
  expect(l.rows).toHaveLength(4); expect(l.rows[0].key).toBe('0'); expect(networkProblems(s,CONTENT)).toEqual([]);
  expect(networkProblems(s,{...CONTENT,w:300,h:400}).join()).toMatch(/too small/);
  expect(networkProblems({...s,selected:'absent'},CONTENT).join()).toMatch(/missing/);
 });
 it('all six themes have legible semantic text on normal and selected backgrounds',()=>{
  for(const st of STYLES) {const c=networkColors(st);
   for(const fg of [c.fg,c.muted,c.err,c.ok,c.accent,...c.phases]) expect(contrast(fg,c.bg),st.id).toBeGreaterThanOrEqual(4.5);
   for(const fg of [c.selectedFg,c.selectedErr,c.selectedOk]) expect(contrast(fg,c.selectedBg),st.id).toBeGreaterThanOrEqual(4.5);
  }
 });
 it('texts agree with the rendered DOM at start, during animation and completion in all styles',()=>{
  for(const st of STYLES) for(const frame of [0,10,28,46]) {
   const state=networkStateAt(events,frame);
   const html=renderToStaticMarkup(React.createElement(BrowserNetworkView,{state,rect:CONTENT,frame,start:0,style:st}));
   expect(html).toContain('data-world="browser.network"');
   const text=html.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"');
   for(const t of networkTexts(state,CONTENT)) expect(text,`${st.id} frame ${frame}`).toContain(t);
  }
 });
});
describe('browser.network demo',()=>{
 it('passes every pure check of the gate (world, sync, variety) and runs 60-75 s',()=>{
  const v=validateStory(JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','content','lab-v3','worlds','browser-network.json'),'utf8')));
  if(!v.ok) throw new Error(v.errors.join('; '));
  const s=v.story;
  const audio={lines:s.beats.map((b,i)=>({beat_index:i,speaker:b.speaker,src:`b${i}.wav`,duration_ms:Math.max(1400,Math.round((b.say??b.text).length*62))}))};
  const {checks,tl}=deriveChecks(s,audio);
  expect(checks.map(c=>[c.group,c.pure()] as const).filter(([,r])=>r)).toEqual([]);
  expect(checks.some(c=>c.group==='world.browser.network')).toBe(true);
  const secs=tl.endCard.start/30; expect(secs).toBeGreaterThanOrEqual(60); expect(secs).toBeLessThanOrEqual(75);
 },30000);
});
