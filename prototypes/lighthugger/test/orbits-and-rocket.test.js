'use strict';
(async function registerTests() {
const {default:test}=await import('node:test');
const {default:assert}=await import('node:assert/strict');
const orbitsModule=await import('../lighthugger-orbits.js');
const genomeModule=await import('../lighthugger-genome.js');
const galaxyModule=await import('../lighthugger-galaxy.js');
const O=orbitsModule.default||globalThis.LighthuggerOrbits;
const G=genomeModule.default||globalThis.LighthuggerGenome;
const galaxy=galaxyModule.default||globalThis.LighthuggerGalaxy;
const mu = 398600.4418, R = 7000, v0 = Math.sqrt(mu/R);
const near = (x,y,tol) => assert.ok(Math.abs(x-y)<=tol, x+' vs '+y);
const norm = x => Math.hypot(...x);
for (const e of [0,1e-8,0.6,1.5]) {
  test('Cartesian round trip, eccentricity '+e,()=>{
    for (const iRad of [0,1e-8,1.2,Math.PI]) {
      const start=O.elementsToState({rp:R,e,iRad,nuRad:1.3,argPeriRad:0.4,omegaAscRad:0.9},mu);
      const el=O.stateToElements(start.rKm,start.vKmS,mu);
      const restored=O.elementsToState(el,mu);
      for (let j=0;j<3;j++) {
        near(start.rKm[j],restored.rKm[j],1e-7);
        near(start.vKmS[j],restored.vKmS[j],1e-9);
      }
      near(el.rp,R,1e-7);
      const arc=O.sampleOrbitPoints(el,mu,65);
      near(norm(arc.periapsis),R,1e-6);
      assert.equal(arc.points.length,65);
      assert.ok(arc.points.flat().every(Number.isFinite));
      if(e<1) near(norm(arc.apoapsis),el.ra,1e-6);
    }
  });
}
test('eccentric Verlet energy and angular momentum over repeated orbits',()=>{
  let state=O.elementsToState({rp:R,e:0.52,iRad:1.2,nuRad:2},mu);
  const el=O.stateToElements(state.rKm,state.vKmS,mu);
  for(let j=0;j<60;j++) {
    state=O.stepOrbitalState(state.rKm,state.vKmS,[0,0,0],el.periodS*0.37,mu);
    const now=O.stateToElements(state.rKm,state.vKmS,mu);
    near(now.energy/el.energy,1,0.0004);
    near(now.h/el.h,1,1e-11);
  }
});
test('Hohmann impulses and half-period',()=>{
  const r2=42000,a=(R+r2)/2;
  const plan=O.planHohmannTransfer([R,0,0],[0,v0,0],mu,{radiusKm:r2});
  near(plan.dv1KmS,Math.sqrt(mu*(2/R-1/a))-v0,1e-12);
  near(plan.dv2KmS,Math.sqrt(mu/r2)-Math.sqrt(mu*(2/r2-1/a)),1e-12);
  near(plan.transferTimeS,Math.PI*Math.sqrt(a**3/mu),1e-8);
  near(plan.predictedTransferEl.ra,r2,1e-8);
});
test('inclined eccentric initial state converges to circular target under bounded thrust',()=>{
  let r=[8100,1200,400],v=[-0.4,6.8,0.7],match;
  for(let j=0;j<22000;j++) {
    match=O.computeGuidedOrbitMatch(r,v,mu,{radiusKm:R,incRad:0.24,lanRad:0},0.014);
    assert.ok(norm(match.accelVecKmS2)<=0.014000001);
    if(match.converged) break;
    const next=O.stepOrbitalState(r,v,match.accelVecKmS2,2,mu);
    r=next.rKm;v=next.vKmS;
  }
  assert.ok(match.converged);
});
test('phasing rendezvous closes an initial half-orbit separation',()=>{
  let r=[R,0,0],v=[0,v0,0],match;
  const n=v0/R;
  for(let t=0;t<60000;t+=2) {
    const phase=n*t+Math.PI, x=Math.cos(phase),y=Math.sin(phase);
    const target={kind:'station',radiusKm:R,incRad:0,targetPosKm:[R*x,R*y,0],targetVelKmS:[-v0*y,v0*x,0]};
    match=O.computeGuidedOrbitMatch(r,v,mu,target,0.014);
    if (match.converged) break;
    const step=O.stepOrbitalState(r,v,match.accelVecKmS2,2,mu);
    r=step.rKm;v=step.vKmS;
    assert.ok(norm(r)>6378);
  }
  assert.ok(match.converged);
});
test('reactionless burn never exhausts and keeps exact rapidity kinematics',()=>{
  const K=O.KAPPA_PER_G;
  // Legacy positional mass args: a nearly dry hull still burns the full proper interval.
  const step=O.stepRelativisticRocket(0,1,4,false,10,9.999,0.8);
  const eta=K*4;
  near(step.eta,eta,1e-12);
  assert.equal(step.fuelEmpty,false);assert.equal(step.fuelFrac,1);assert.equal(step.reactionless,true);
  near(step.massMt,10,0);near(step.coastYears,0,1e-15);
  near(step.beta,Math.tanh(eta),1e-15);near(step.gamma,Math.cosh(eta),1e-15);
  near(step.dCoordYears,Math.sinh(eta)/K,1e-12);
  near(step.dDistLy,(Math.cosh(eta)-1)/K,1e-12);
  // Long 2 g burn from a moving start: no cap, exact closed forms from eta0.
  const eta0=0.7,run=O.stepRelativisticRocket(eta0,2,30,false,{massMt:5});
  near(run.eta,eta0+2*K*30,1e-12);assert.equal(run.fuelEmpty,false);
  near(run.dCoordYears,(Math.sinh(run.eta)-Math.sinh(eta0))/(2*K),1e-9*Math.sinh(run.eta));
  near(run.dDistLy,(Math.cosh(run.eta)-Math.cosh(eta0))/(2*K),1e-9*Math.cosh(run.eta));
  // Braking stops exactly at zero rapidity, then coasts at rest.
  const brake=O.stepRelativisticRocket(0.1,-1,2,true,10,5,0.8);
  near(brake.eta,0,1e-12);assert.ok(brake.stopped);assert.equal(brake.fuelEmpty,false);
  near(brake.burnYears+brake.coastYears,2,1e-12);
});
test('every preset can reach and stop at distant stars with no reaction mass',()=>{
  for(const genome of G.PRESETS) {
    const s=G.computeRocketSpecs(genome);
    for(const [dist,g,cap] of [[18,1,0.5],[12,2,1]]) {
      const p=O.planRelativisticMission(dist,g,s,genome,{maxBetaCap:cap});
      assert.equal(p.canReachAndStop,true);assert.equal(p.reactionless,true);
      assert.equal(p.fuelFracUsed,0);assert.equal(p.propUsedMt,0);assert.equal(p.fuelRemainingAfterStop,1);
      assert.equal(p.deltaVCapacity,Infinity);
      assert.ok(p.peakBeta<=cap && Number.isFinite(p.coordYears) && p.tauYears<p.coordYears);
      near(2*p.flipDistLy+p.coastDistLy,dist,1e-12);
      assert.ok(!/reaction|propell|fuel/i.test(p.warningText));
      assert.ok(p.thermalPeakPct>=0 && p.thermalPeakPct<=100 && p.radiatorHeadroom>0);
    }
  }
  // Missing specs still plan cleanly.
  const bare=O.planRelativisticMission(12,2,undefined,null);
  assert.ok(bare.canReachAndStop && bare.radiatorHeadroom===1 && Number.isFinite(bare.coordYears));
});
test('ice symmetry automatically selects reversible vs flip-and-burn drive specs and Dune LH3 roundtrips',()=>{
  const fore=G.normalize(G.findPreset('dune-monolith'));
  const bi=G.normalize(fore); bi.P.iceSymmetry='bi-cone';
  const sf=G.computeRocketSpecs(fore), sb=G.computeRocketSpecs(bi);
  assert.equal(sf.reversibleDrive,true);
  assert.equal(sb.reversibleDrive,false);
  assert.ok(sb.maxAccelG>sf.maxAccelG && sb.iceMt>sf.iceMt);
  const dec=G.decodeShareCode(G.encodeShareCode(fore));
  near(dec.P.styleDune,1,0.01);
});
test('thermal forecast follows CoaDE radiator headroom and acceleration',()=>{
  const base=G.normalize(G.PRESETS[0]), coade=G.normalize(base);coade.P.styleCoade=1;
  const sb=G.computeRocketSpecs(base), sc=G.computeRocketSpecs(coade);
  assert.ok(sc.thermalHeadroom>sb.thermalHeadroom);
  const pb=O.planRelativisticMission(4.37,1,sb,base), pc=O.planRelativisticMission(4.37,1,sc,coade);
  assert.ok(pc.thermalPeakPct<pb.thermalPeakPct);
  near(pb.thermalPeakPct,100*Math.min(1,O.THERMAL_EQ*(1/1.5)**1.6/Math.max(0.35,sb.thermalHeadroom)),1e-9);
  assert.ok(O.planRelativisticMission(4.37,1.6,sc,coade).thermalPeakPct>pc.thermalPeakPct);
  const hot=O.planRelativisticMission(4.37,2.6,sb,base);
  assert.equal(hot.warningLevel,'critical');assert.ok(/sustainable/.test(hot.thermalWarning));
});
test('core heat saturates under overdrive, settles below overload when governed, and radiates away',()=>{
  const h=0.95, sus=O.sustainableAccelG(h,2.8);
  near((sus/1.5)**1.6,h,1e-12);
  let heat=0;
  for(let t=0;t<600;t++) heat=O.stepCoreHeat(heat,2.4,h,1).heat;
  assert.ok(heat>=0.96);assert.equal(O.thermalStateOf(heat),'overload');
  for(let t=0;t<600;t++) heat=O.stepCoreHeat(heat,sus*0.95,h,1).heat;
  assert.ok(heat<0.8 && heat>0.5);
  const coolLow=O.stepCoreHeat(0.9,0,0.5,10).heat, coolHigh=O.stepCoreHeat(0.9,0,2,10).heat;
  assert.ok(coolHigh<coolLow && coolLow<0.9);
  near(O.stepCoreHeat(0.4,0,1,1e6).heat,0,1e-12);
});
test('directional exposure increases shield loss and bow-first relativistic cruise is viable',()=>{
  const run=(coverage,cos)=>O.computeIsmAblation(0.9,1/Math.sqrt(0.19),0.5,coverage,cos,1);
  assert.ok(run(1,0).iceLoss>10*run(1,1).iceLoss);
  assert.equal(run(1,1).warningLevel,'nominal');
  assert.equal(run(0.1,0).warningLevel,'critical');
  // Bow-first 0.95c (gamma ~3.2) stays nominal; 0.9988c (gamma ~20) is elevated; ultra-relativistic 0.9998c (gamma ~50) hits critical
  assert.equal(O.computeIsmAblation(0.95,1/Math.sqrt(1-0.95**2),0.5,1,1,1).warningLevel,'nominal');
  assert.equal(O.computeIsmAblation(0.9988,1/Math.sqrt(1-0.9988**2),0.5,1,1,1).warningLevel,'elevated');
  assert.equal(O.computeIsmAblation(0.9998,1/Math.sqrt(1-0.9998**2),0.5,1,1,1).warningLevel,'critical');
  // Long-haul 25 LY Vega 1g voyage stays easily survivable on a standard Lighthugger ice shield
  const lp=G.normalize(G.findPreset('long-patience'));
  const vegaPlan=O.planRelativisticMission(25,1,G.computeRocketSpecs(lp),lp);
  assert.ok(vegaPlan.iceAblationEst>0.01 && vegaPlan.iceAblationEst<0.15,'Vega 25 LY ice loss out of range: '+vegaPlan.iceAblationEst);
  for(const [cov,cos] of [[1,1],[1,0],[0.4,0.3]]) {
    const r=run(cov,cos), gamma=1/Math.sqrt(0.19), intensity=0.9*gamma*(gamma-1);
    const effFlux=intensity/(1+0.12*(gamma-1));
    const exposure=(1+24*(1-cos)**2)/(0.08+0.92*cov);
    near(r.exposure,exposure,1e-12);
    near(r.iceLoss,effFlux*exposure*0.00018/(0.22+0.5),1e-12);
  }
  // Extreme rapidity steps never overflow cosh/sinh to Infinity
  const extreme=O.stepRelativisticRocket(400,2,500,false,{massMt:5});
  assert.ok(Number.isFinite(extreme.eta) && Number.isFinite(extreme.gamma) && Number.isFinite(extreme.dDistLy));
});
test('catalog ephemerides and station velocities in parent frame',()=>{
  assert.equal(galaxy.SYSTEMS.length,28);
  for(const sys of galaxy.SYSTEMS) {
    assert.ok(sys.planets.length>=2 && sys.starRadiusKm>0);
    const p=galaxy.getBodyWorldState(sys,{kind:'planet',planetIdx:0},4712);
    const st=galaxy.getBodyWorldState(sys,{kind:'station'},4712);
    near(norm(st.rKm.map((x,i)=>x-p.rKm[i])),sys.station.orbitRadiusKm,1e-5);
    const targets=galaxy.getSystemTargetOrbits(sys,0,70000,sys.planet.muKm3S2,4712);
    const station=targets.find(x=>x.id==='station');
    near(norm(station.targetVelKmS),Math.sqrt(sys.planet.muKm3S2/station.radiusKm),1e-10);
  }
});
test('Hill radius scales with orbital separation and cube root of mass ratio',()=>{
  near(O.computeHillRadiusKm(384400,4902.8,mu),61524.18,2);
  near(O.computeHillRadiusKm(1000,3,8000),50,1e-12);
});

test('Lagrange equilibria are translated and inclined with the secondary',()=>{
  const primary=[1500,32000,850], separation=384400, moonMu=4902.8;
  const secondary=[primary[0]+separation,primary[1],primary[2]];
  const velocity=[0,0,1];
  const points=O.computeLagrangePoints(primary,secondary,mu,moonMu,velocity);
  assert.deepEqual(points.map(p=>[p.id,p.kind,p.stable]),[
    ['L1','lagrange',false],['L2','lagrange',false],['L3','lagrange',false],
    ['L4','lagrange',true],['L5','lagrange',true]
  ]);
  const q=moonMu/(mu+moonMu), n=Math.sqrt((mu+moonMu)/separation**3);
  for(const p of points.slice(0,2)) {
    const x=(p.rKm[0]-primary[0])/separation;
    near(x-q-(1-q)/x**2-q*Math.sign(x-1)/(x-1)**2,0,1e-13);
    near(p.vKmS[2],x*n*separation,1e-12);
  }
  near(points[2].rKm[0],primary[0]-separation*(1-5*q/12),1e-9);
  for(const [j,sign] of [[3,1],[4,-1]]) {
    const r=points[j].rKm.map((x,i)=>x-primary[i]);
    near(r[0],separation/2,1e-9);
    near(r[1],0,1e-9);
    near(r[2],sign*separation*Math.sqrt(3)/2,1e-9);
    near(norm(r),separation,1e-9);
  }
  const translated=O.sampleLissajousOrbit(points[1],secondary,mu,moonMu);
  const copy=O.sampleLissajousOrbit({...points[1]},secondary,mu,moonMu,{rPrimaryKm:primary});
  assert.deepEqual(translated,copy);
  assert.equal(O.computeLagrangePoints(primary,secondary,mu,mu,velocity)[3].stable,false);
  assert.deepEqual(O.computeLagrangePoints(primary,primary,mu,moonMu),[]);
});

test('closed Lissajous preview crosses in-plane and separates out of plane',()=>{
  const r=[384400,0,0], moonMu=4902.8;
  const points=O.computeLagrangePoints([0,0,0],r,mu,moonMu,[0,0,1]);
  const loop=O.sampleLissajousOrbit(points[0],r,mu,moonMu,{ampKm:800,numPts:65});
  assert.deepEqual(loop.points[0],loop.points.at(-1));
  assert.deepEqual(loop.centerKm,points[0].rKm);
  assert.equal(loop.points.length,65);
  assert.equal(loop.ampKm,800);
  assert.ok(loop.periodS>0 && Number.isFinite(loop.periodS));
  near(loop.points[32][0],loop.points[0][0],1e-9);
  near(loop.points[32][2],loop.points[0][2],1e-9);
  near(loop.points[32][1]-loop.points[0][1],2*800*0.72,1e-9);
  const tadpole=O.sampleLissajousOrbit(points[3],r,mu,moonMu);
  assert.deepEqual(tadpole.points[0],tadpole.points.at(-1));
  assert.ok(tadpole.periodS>loop.periodS);
});

test('maneuver chain propagates coasts and applies impulses in the local PNR frame',()=>{
  const quarter=Math.PI*R/(2*v0);
  const burns=[{id:'depart',label:'Departure',kind:'node',dtS:quarter,dvP:0.42,dvN:0.3,dvR:-0.15},
    {id:'correct',dtS:912,dvP:-0.2,dvN:0.4,dvR:0.1}];
  const chain=O.propagateManeuverChain([R,0,0],[0,v0,0],mu,burns);
  const [first,second]=chain.nodes;
  assert.equal(chain.segments.length,3);
  assert.equal(first.id,'depart');
  assert.equal(second.cumTimeS,quarter+912);
  near(first.rKm[0],0,1e-8);
  near(first.rKm[1],R,1e-8);
  const vectorNear=(a,b,tol)=>a.forEach((x,i)=>near(x,b[i],tol));
  vectorNear(first.proHat,[-1,0,0],1e-12);
  vectorNear(first.nrmHat,[0,0,1],1e-12);
  vectorNear(first.radHat,[0,1,0],1e-12);
  vectorNear(first.dvVecKmS,[-0.42,-0.15,0.3],1e-12);
  near(chain.totalDvKmS,Math.hypot(0.42,0.3,-0.15)+Math.hypot(-0.2,0.4,0.1),1e-12);
  assert.equal(chain.segments[0].burnIndex,0);
  assert.deepEqual(chain.segments[0].points.at(-1),first.rKm);
  assert.deepEqual(chain.segments[1].points[0],first.rKm);
  assert.deepEqual(chain.segments[1].points.at(-1),second.rKm);
  assert.deepEqual(chain.segments[2].points[0],second.rKm);
  near(O.stateToElements(second.rKm,second.vBeforeKmS,mu).energy,chain.segments[1].el.energy,1e-10);
  const changed=O.propagateManeuverChain([R,0,0],[0,v0,0],mu,[{...burns[0],dvP:-0.2},burns[1]]);
  assert.ok(norm(changed.nodes[1].rKm.map((x,i)=>x-second.rKm[i]))>300);
  assert.equal(burns[0].dvP,0.42);
});

test('maneuver coast is continuous across escape speed, with a finite forward preview',()=>{
  const escape=Math.sqrt(2*mu/R);
  for(const factor of [1-1e-12,1,1+1e-12,1.35]) {
    const result=O.propagateManeuverChain([R,0,0],[0,escape*factor,0],mu,[{dtS:1200}]);
    const reference=O.stepOrbitalState([R,0,0],[0,escape*factor,0],[0,0,0],1200,mu);
    result.nodes[0].rKm.forEach((x,i)=>near(x,reference.rKm[i],0.55));
    assert.ok(result.segments.at(-1).points.flat().every(Number.isFinite));
    if(factor>1) assert.equal(result.segments.at(-1).apoapsis,null);
  }
  const empty=O.propagateManeuverChain([R,0,0],[0,v0,0],mu);
  assert.equal(empty.nodes.length,0);
  assert.equal(empty.segments.length,1);
  assert.equal(empty.totalDvKmS,0);
});

test('high-g flip-burn joins 3D endpoint states with two bounded half-time burns',()=>{
  const r0=[R,0,0], vStart=[0,v0,0];
  const radius=12*R, rEnd=[-radius,0,1400], vEnd=[0,-Math.sqrt(mu/radius),0.7];
  const hohmann=O.planHohmannTransfer(r0,vStart,mu,{radiusKm:radius});
  const plans=[0.5,1,2].map(g=>O.planBrachistochroneOrbit(r0,vStart,rEnd,vEnd,mu,g,{samples:65}));
  assert.ok(plans[0].tofS>plans[1].tofS && plans[1].tofS>plans[2].tofS);
  assert.ok(plans[1].tofS<hohmann.transferTimeS);
  for (const plan of plans) {
    assert.equal(plan.isBrachistochrone,true);
    assert.equal(plan.points.length,65);
    assert.ok(plan.points.flat().every(Number.isFinite));
    assert.deepEqual(plan.points[0],r0);
    assert.deepEqual(plan.points.at(-1),rEnd);
    assert.deepEqual(plan.points[32],plan.flipPointKm);
    assert.deepEqual(plan.stateAt(0).vKmS,vStart);
    assert.deepEqual(plan.stateAt(plan.tofS).vKmS,vEnd);
    assert.equal(plan.tFlipS,plan.tofS/2);
    assert.equal(plan.peakBeta,plan.peakSpeedKmS/O.C_KMS);
    const a=plan.accelG*O.G0_KMS2;
    near(Math.max(norm(plan.accelLegKmS2),norm(plan.decelLegKmS2)),a,1e-12);
    assert.equal(plan.dvTotalKmS,a*plan.tofS);
    const before=plan.stateAt(plan.tFlipS), after=plan.stateAt(plan.tFlipS+1e-7);
    before.rKm.forEach((value,i)=>near(value,after.rKm[i],1e-5));
    before.vKmS.forEach((value,i)=>near(value,after.vKmS[i],1e-8));
  }
});

test('high-g flip-burn handles local and interplanetary ephemerides and coincident endpoints',()=>{
  const sol=galaxy.SYSTEMS.find(sys=>sys.id==='sol');
  const get=ref=>galaxy.getBodyWorldState(sol,ref,0);
  const saturn=get({kind:'planet',planetIdx:0});
  const earthIdx=sol.planets.findIndex(p=>p.name==='Earth');
  assert.ok(earthIdx>=0);
  const earth=get({kind:'planet',planetIdx:earthIdx});
  const starPlan=O.planBrachistochroneOrbit(saturn.rKm,saturn.vKmS,earth.rKm,earth.vKmS,sol.muStarKm3S2);
  assert.equal(starPlan.accelG,1);
  assert.ok(starPlan.tofS>0 && starPlan.points.flat().every(Number.isFinite));
  assert.deepEqual(starPlan.points.at(-1),earth.rKm);

  const moonIdx=sol.planets[0].moons.findIndex(moon=>moon.name==='Titan');
  assert.ok(moonIdx>=0);
  const titan=get({kind:'moon',planetIdx:0,moonIdx});
  const localR=titan.rKm.map((x,i)=>x-saturn.rKm[i]);
  const localV=titan.vKmS.map((x,i)=>x-saturn.vKmS[i]);
  const localPlan=O.planBrachistochroneOrbit([8e4,0,0],[0,20,0],localR,localV,sol.planets[0].muKm3S2);
  assert.ok(localPlan.tofS>0 && localPlan.tofS<starPlan.tofS);
  assert.deepEqual(localPlan.points.at(-1),localR);
  const same=O.planBrachistochroneOrbit(localR,localV,localR,localV,sol.planets[0].muKm3S2);
  assert.equal(same.tofS,0);
  assert.deepEqual(same.flipPointKm,localR);
});

async function makeChronoscope() {
  globalThis.LighthuggerOrbits=O;
  globalThis.LighthuggerGalaxy=galaxy;
  await import('../lighthugger-orbit3d.js');
  const events=new Map(), changes=[], focused=[], selected=[], hints=[], custom=[], labels=[];
  const ctx=new Proxy({
    createRadialGradient:()=>({addColorStop(){}}),
    measureText:text=>({width:text.length*6}),
    fillText:(text,x,y)=>labels.push({text,x,y})
  },{get:(target,key)=>target[key]??(()=>{})});
  const canvas={
    style:{}, getContext:()=>ctx,getBoundingClientRect:()=>({left:10,top:20,width:900,height:700}),
    setPointerCapture(id) {
      if (id===31) throw new DOMException('Pointer is not active','NotFoundError');
    },
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)
  };
  const view=globalThis.LighthuggerOrbit3D.create(canvas,{
    onBurnsChange:(burns,index)=>changes.push({burns,index}),
    onFocusBody:(...ref)=>focused.push(ref),
    onSelectTarget:id=>selected.push(id),
    onSelectCustomOrbit:radius=>custom.push(radius),
    onHint:hint=>hints.push(hint)
  });
  function input(name,point,opts={}) {
    events.get(name)({type:name,clientX:point.x+10,clientY:point.y+20,pointerId:1,button:0,preventDefault(){},...opts});
  }
  const sys=galaxy.SYSTEMS[0], saturn=sys.planets[0], radius=sys.station.orbitRadiusKm;
  const mu=saturn.muKm3S2;
  const snap={systemId:sys.id,simTimeS:0,orbit:{focusSoi:'planet',planetIdx:0,muKm3S2:mu,
    rKm:[radius,0,0],vKmS:[0,Math.sqrt(mu/radius),0]}};
  const diag=()=>view.getDiagnostics();
  return {view,diag,input,events,canvas,changes,focused,selected,hints,custom,labels,sys,saturn,snap};
}

test('ship beacon plots an immediate burn, exposes six handles and recenters',async()=>{
  const {view,diag,input,snap,labels}=await makeChronoscope();
  view.update({...snap,shipName:'Wayfarer'});
  const ship=diag().shipScreenPos;
  assert.ok(diag().hasShipHit && Number.isFinite(ship.x) && Number.isFinite(ship.y));
  assert.ok(labels.some(item=>item.text==='YOU // Wayfarer'));
  input('pointerdown',ship); input('pointerup',ship);
  assert.equal(view.getBurns()[0].dtS,0);
  assert.equal(diag().gizmoHandles6.length,6);
  view.addBurnAtShip();
  assert.equal(view.getBurns().length,1);
  view.centerOnShip();
  assert.ok(diag().centeredOnShip);
  near(diag().shipScreenPos.x,450,1e-8);
  near(diag().shipScreenPos.y,350,1e-8);
  view.dispose();
});

test('target selection renders a transfer from the ship until manual plotting begins',async()=>{
  const {view,diag,snap,labels}=await makeChronoscope();
  const {rKm,vKmS,muKm3S2}=snap.orbit;
  const result=O.planHohmannTransfer(rKm,vKmS,muKm3S2,{radiusKm:rKm[0]*1.8});
  const opts={selectedTargetId:'high-orbit'};
  view.update(snap,opts);
  assert.equal(diag().transferPreviewDrawn,true);
  view.update({...snap,orbits:{transfer:{el:result.predictedTransferEl},target:{el:result.targetEl}}},opts);
  assert.equal(diag().transferPreviewDrawn,true);
  for (const text of ['BURN 1','BURN 2']) assert.ok(labels.some(item=>item.text===text));
  view.addBurnAtShip();
  assert.equal(diag().transferPreviewDrawn,false);
  view.dispose();
});

test('chronoscope zoom crosses system and veil scales within the planet frame',async()=>{
  const {view,diag,input,snap,labels}=await makeChronoscope();
  view.sync(snap);
  assert.equal(diag().viewScale,'planet');
  const scales=[diag().viewScale];
  for (let i=0;i<24;i++) {
    const previous=diag().viewRadiusKm;
    input('wheel',{x:450,y:350},{deltaY:350,deltaMode:0});
    const state=diag();
    assert.ok(state.viewRadiusKm>=previous);
    assert.ok(state.viewRadiusKm/previous<=Math.exp(0.49)+1e-12);
    if (scales.at(-1)!==state.viewScale) scales.push(state.viewScale);
  }
  assert.deepEqual(scales,['planet','system','veil']);
  assert.equal(diag().frame,'planet');
  near(diag().viewRadiusKm/O.AU_KM,150,1e-12);
  for (const text of ['SYSTEM VEIL / ICE CLOUD','HELIOPAUSE // INTERSTELLAR BOUNDARY']) {
    assert.ok(labels.some(item=>item.text===text));
  }
  for (let i=0;i<50;i++) input('wheel',{x:450,y:350},{deltaY:-350,deltaMode:0});
  assert.equal(diag().viewScale,'moon');
  assert.equal(diag().viewRadiusKm,1500);
  view.resetView();
  assert.equal(diag().viewScale,'planet');
  view.dispose();
});

test('double-click focuses zoomed-out planets and the star',async()=>{
  const {view,diag,input,snap,focused}=await makeChronoscope();
  view.sync(snap);
  const center={x:450,y:350};
  for (let i=0;i<12;i++) input('wheel',center,{deltaY:600,deltaMode:0});
  const star=diag().hits.find(hit=>hit.kind==='star');
  assert.ok(star);
  const radius=diag().viewRadiusKm;
  input('dblclick',{x:Math.round(star.x),y:Math.round(star.y)});
  assert.deepEqual(focused.at(-1),['star',0,0]);
  assert.ok(diag().viewRadiusKm<radius);
  view.resetView();
  const planet=diag().hits.find(hit=>hit.kind==='planet' && hit.planetIdx!==0);
  assert.ok(planet);
  input('dblclick',planet);
  assert.deepEqual(focused.at(-1),['planet',planet.planetIdx,0]);
  assert.equal(diag().frame,'planet');
  view.dispose();
});

test('chronoscope draws the high-g turnover from either snapshot field',async()=>{
  const {view,diag,snap,labels}=await makeChronoscope();
  const {rKm,vKmS,muKm3S2}=snap.orbit;
  const brach=O.planBrachistochroneOrbit(rKm,vKmS,[rKm[0]*2,2e4,3000],[-3,8,0],muKm3S2);
  for (const field of ['brachistochrone','transfer']) {
    labels.length=0;
    view.sync({...snap,orbits:{[field]:brach}});
    assert.ok(diag().transferPreviewDrawn);
    assert.ok(labels.some(item=>item.text==='FLIP / TURNOVER'));
    assert.ok(labels.some(item=>/^TOF .+ PEAK .+ km\/s$/.test(item.text)));
  }
  view.dispose();
});

test('chronoscope navigation, drag controls and L1 transfer share the burn chain',async()=>{
  const {view,diag,input,events,canvas,changes,focused,selected,hints,custom,sys,saturn,snap}=await makeChronoscope();
  view.update(snap);
  assert.ok(diag().hillCount>=2);
  assert.equal(diag().lagrangeCount,5);
  const openSpace={x:500,y:140};
  input('pointerdown',openSpace,{pointerId:31});
  input('pointerup',openSpace,{pointerId:31});
  assert.equal(custom.length,1);
  assert.ok(custom[0]>saturn.radiusKm);
  const yaw=diag().yaw;
  input('pointerdown',{x:60,y:60});
  input('pointermove',{x:120,y:110});
  input('pointerup',{x:120,y:110});
  assert.notEqual(diag().yaw,yaw);
  input('wheel',{x:450,y:350},{deltaY:-200,deltaMode:0});
  assert.ok(diag().zoom>1);
  view.resetView();
  input('wheel',{x:450,y:350},{deltaY:1000,deltaMode:0});
  const moon=diag().hits.find(hit=>hit.kind==='moon' && hit.moonIdx===0);
  input('dblclick',moon);
  assert.deepEqual(focused,[['moon',0,0]]);
  assert.equal(diag().lagrangeCount,2);
  view.setFrame('synodic',0,0);
  assert.equal(diag().yaw,0);
  assert.equal(diag().lagrangeCount,5);
  view.setShowHill(false);
  assert.equal(diag().hillCount,0);
  view.setShowLagrange(false);
  assert.equal(diag().lagrangeCount,0);
  view.setShowLagrange(true);
  view.setFrame('planet',0,0);
  view.addQuickBurn('node');
  const node=diag().hits.find(hit=>hit.kind==='burn');
  const handle=diag().gizmoHandles.find(hit=>hit.axis==='pro');
  assert.equal(diag().gizmoHandles.length,3);
  input('pointerdown',handle);
  input('pointermove',{x:handle.x+(handle.x-node.x),y:handle.y+(handle.y-node.y)});
  input('pointerup',handle);
  assert.ok(view.getBurns()[0].dvP>0);
  near(diag().totalDvKmS,view.getBurns()[0].dvP,1e-12);
  assert.equal(changes.at(-1).index,0);
  for (const [axis,key] of [['nrm','dvN'],['rad','dvR']]) {
    const h=diag().gizmoHandles.find(hit=>hit.axis===axis);
    input('pointerdown',h);
    input('pointermove',{x:node.x,y:node.y});
    input('pointerup',h);
    assert.ok(view.getBurns()[0][key]<0);
  }
  const timeHandle=diag().hits.find(hit=>hit.kind==='time');
  const dt=view.getBurns()[0].dtS;
  input('pointerdown',timeHandle);
  input('pointermove',{x:timeHandle.x+20,y:timeHandle.y-24});
  input('pointerup',timeHandle);
  assert.notEqual(view.getBurns()[0].dtS,dt);
  view.removeBurn(0);
  assert.equal(diag().burnCount,0);
  const L1=diag().hits.find(hit=>hit.id==='L1');
  input('pointerdown',L1);
  input('pointerup',L1);
  assert.equal(selected.at(-1),'L1');
  assert.equal(diag().burnCount,2,hints.join(', '));
  assert.ok(diag().totalDvKmS>0);
  for (const kind of ['circularize','match','moon-close','L2','L3','L4','L5']) {
    view.setBurns([]);
    view.addQuickBurn(kind);
    assert.equal(diag().burnCount,kind==='circularize'?1:2,kind+': '+hints.join(', '));
    assert.ok(Number.isFinite(diag().totalDvKmS));
  }
  view.setFrame('star',0,0);
  assert.equal(diag().hillCount,0);
  view.setShowHill(true);
  assert.equal(diag().hillCount,sys.planets.length);
  view.setFrame('synodic',0,0);
  assert.equal(diag().lagrangeCount,5);
  view.dispose();
  assert.equal(events.size,0);
  assert.equal(canvas.style.touchAction,undefined);
});

test('clicking the current track plots at the orbital epoch and Shift scales a handle drag',async()=>{
  const {view,diag,input,snap}=await makeChronoscope();
  view.update(snap); view.setTopDown();
  const ship=diag().shipScreenPos;
  const point={x:450,y:350-(ship.x-450)};
  input('pointerdown',point); input('pointerup',point);
  const el=O.stateToElements(snap.orbit.rKm,snap.orbit.vKmS,snap.orbit.muKm3S2);
  near(view.getBurns()[0].dtS/el.periodS,0.25,1e-7);
  function impulse(fine) {
    view.setBurns([]); view.addBurnAtShip();
    const handle=diag().gizmoHandles[0],offset={x:handle.x,y:handle.y-20};
    input('pointerdown',handle,{shiftKey:fine});
    input('pointermove',offset,{shiftKey:fine}); input('pointerup',offset);
    return view.getBurns()[0].dvP;
  }
  const full=impulse(false);
  assert.ok(full>0); near(impulse(true),full*0.2,1e-8);
  view.dispose();
});

test('chronoscope opposite handles subtract along all three maneuver axes',async()=>{
  const {view,diag,input,snap}=await makeChronoscope();
  view.update(snap);
  view.addQuickBurn('node');
  assert.deepEqual(diag().gizmoHandles.map(h=>h.axis),['pro','nrm','rad']);
  assert.equal(diag().gizmoHandles6.length,6);
  const node=diag().hits.find(hit=>hit.kind==='burn');
  for (const [positive,negative,key] of [['pro','ret','dvP'],['nrm','anm','dvN'],['rad','rin','dvR']]) {
    const pos=diag().gizmoHandles6.find(h=>h.axis===positive);
    const neg=diag().gizmoHandles6.find(h=>h.axis===negative);
    near((pos.x+neg.x)/2,node.x,1e-9);
    near((pos.y+neg.y)/2,node.y,1e-9);
    assert.ok(diag().hits.some(h=>h.kind==='gizmo' && h.axis===negative));
    input('pointerdown',neg);
    input('pointermove',{x:2*neg.x-node.x,y:2*neg.y-node.y});
    input('pointerup',neg);
    assert.ok(view.getBurns()[0][key]<0,negative+' must decrease '+key);
  }
  view.dispose();
});

test('finite burn arcs render at ignition and along a delayed coast',async()=>{
  const {view,diag,snap,labels}=await makeChronoscope();
  view.update({...snap,rocketSpecs:{sustainedG:2,maxG:5}});
  const dv=58*2*O.G0_KMS2;
  view.setBurns([{dtS:0,dvP:dv},{dtS:1000,dvN:dv},{dtS:10,dvR:0.005}],-1);
  assert.equal(diag().burnArcCount,2);
  assert.equal(labels.filter(label=>label.text==='BURN 58s').length,2);
  near(view.getBurnContext(0).burnDurationS,58,1e-9);
  view.update({...snap,rocketSpecs:{maxG:20}});
  near(view.getBurnContext(0).burnDurationS,dv/(12*O.G0_KMS2),1e-9);
  view.dispose();
});

function stationState(sys,t) {
  const planetIdx=sys.station.parentPlanetIdx;
  const station=galaxy.getBodyWorldState(sys,{kind:'station',planetIdx},t);
  const parent=galaxy.getBodyWorldState(sys,{kind:'planet',planetIdx},t);
  return {rKm:station.rKm.map((x,i)=>x-parent.rKm[i]),vKmS:station.vKmS.map((x,i)=>x-parent.vKmS[i])};
}

test('target frame subtracts the moving station at every trajectory timestamp',async()=>{
  const {view,diag,snap,sys,labels}=await makeChronoscope();
  const radius=sys.station.orbitRadiusKm;
  const phase=0.1, speed=Math.sqrt(snap.orbit.muKm3S2/radius);
  // The ship leads the station by a constant phase on the same inclined orbit.
  const leading=stationState(sys,phase*radius/speed);
  const coorbit={...snap,orbit:{...snap.orbit,...leading}};
  view.update(coorbit,{frame:'target',selectedTargetId:'station'});
  assert.equal(diag().frame,'target');
  const miss=2*radius*Math.sin(phase/2);
  near(diag().closestApproachKm,miss,1e-4);
  assert.ok(labels.some(label=>label.text==='CA '+miss.toFixed(1)+' km'));
  const station=diag().hits.find(hit=>hit.id==='station');
  near(station.x,450,1e-9);
  near(station.y,350,1e-9);
  const targetOrbits=[{id:'port',focusRef:{kind:'station',planetIdx:sys.station.parentPlanetIdx}}];
  view.update({...coorbit,targetOrbits},{selectedTargetId:'port'});
  near(diag().closestApproachKm,miss,1e-4);
  view.update(coorbit,{selectedTargetId:'custom'});
  near(diag().closestApproachKm,miss,1e-4);
  view.update(coorbit,{selectedTargetId:sys.planets[0].moons[0].id});
  assert.ok(diag().closestApproachKm>miss);
  view.setFrame('planet');
  assert.equal(diag().closestApproachKm,null);
  view.dispose();
});

test('intercept retains closing speed, rendezvous matches velocity, and burn delay replans',async()=>{
  const {view,diag,snap,sys,changes,hints}=await makeChronoscope();
  const {rKm,vKmS,muKm3S2:mu}=snap.orbit;
  view.update(snap,{frame:'target',selectedTargetId:'station'});
  view.addQuickBurn('intercept',snap);
  const intercept=view.getBurns();
  assert.equal(intercept.length,1,hints.join(', '));
  const interceptS=intercept[0].interceptTimeS;
  const interceptChain=O.propagateManeuverChain(rKm,vKmS,mu,intercept);
  const collision=interceptChain.segments.at(-1).stateAt(interceptS);
  const target=stationState(sys,interceptS);
  near(norm(collision.rKm.map((x,i)=>x-target.rKm[i])),0,1e-4);
  assert.ok(norm(collision.vKmS.map((x,i)=>x-target.vKmS[i]))>0.1);
  near(diag().closestApproachKm,0,1e-4);

  view.setBurns([]);
  view.addQuickBurn('rendezvous');
  const rendezvous=view.getBurns();
  assert.equal(rendezvous.length,2,hints.join(', '));
  assert.ok(rendezvous[1].dtS>interceptS);
  const chain=O.propagateManeuverChain(rKm,vKmS,mu,rendezvous);
  const arrival=chain.nodes[1], port=stationState(sys,arrival.cumTimeS);
  near(norm(arrival.rKm.map((x,i)=>x-port.rKm[i])),0,1e-4);
  near(norm(arrival.vAfterKmS.map((x,i)=>x-port.vKmS[i])),0,1e-8);

  const context=view.getBurnContext(0);
  assert.ok(context.maxDtS>=context.periodS);
  assert.ok(context.burnDurationS>0 && context.dvMagKmS>0);
  const oldNode=diag().hits.find(hit=>hit.kind==='burn' && hit.index===0);
  view.setBurnDelay(0,context.periodS/8);
  near(view.getBurnContext(0).dtS,context.periodS/8,1e-9);
  near(changes.at(-1).burns[0].dtS,context.periodS/8,1e-9);
  assert.notEqual(diag().hits.find(hit=>hit.kind==='burn' && hit.index===0).x,oldNode.x);
  view.setBurnDelay(0,-2);
  assert.equal(view.getBurnContext(0).dtS,0);
  assert.equal(view.getBurnContext(8),null);

  for (const selectedTargetId of [sys.planets[0].moons[0].id,'custom']) {
    view.update({...snap,customOrbitKm:sys.station.orbitRadiusKm*1.3},{selectedTargetId});
    for (const [kind,count] of [['intercept',1],['rendezvous',2]]) {
      view.setBurns([]);
      view.addQuickBurn(kind);
      assert.equal(diag().burnCount,count,kind+' '+selectedTargetId+' '+hints.join(', '));
    }
  }
  view.dispose();
});

test('mid-drag lostpointercapture preserves active gizmo drag while buttons remain held',async()=>{
  const {view,diag,input,snap}=await makeChronoscope();
  view.update(snap);
  view.addQuickBurn('node');
  const node=diag().hits.find(hit=>hit.kind==='burn');
  const pro=diag().gizmoHandles6.find(hit=>hit.axis==='pro');
  const dragged={x:pro.x+(pro.x-node.x),y:pro.y+(pro.y-node.y)};
  input('pointerdown',pro,{buttons:1});
  input('lostpointercapture',pro,{buttons:1});
  input('pointermove',dragged,{buttons:1});
  const dvAfterHeldMove=view.getBurns()[0].dvP;
  assert.ok(dvAfterHeldMove>0,'lostpointercapture with buttons=1 must not abort gizmo drag');
  input('lostpointercapture',dragged,{buttons:0});
  input('pointermove',{x:dragged.x+(pro.x-node.x),y:dragged.y+(pro.y-node.y)},{buttons:0});
  near(view.getBurns()[0].dvP,dvAfterHeldMove,1e-12);
  view.dispose();
});

test('segmentSphereHit catches surface impact across a 1500s chord with zero tunneling',()=>{
  const Rsat = 60268;
  // Ship at +90,000 km plunging at -120 km/s for 1500 s ends at -90,000 km (both endpoints outside Saturn!).
  const p0 = [90000, 1200, 0], p1 = [-90000, 1200, 0];
  const hit = O.segmentSphereHit(p0, p1, [0, 0, 0], Rsat);
  assert.equal(hit.hit, true);
  assert.ok(hit.tHit > 0 && hit.tHit < 0.5, 'expected entry before midpoint, got '+hit.tHit);
  near(norm(hit.hitPoint), Rsat, 1e-6);
  near(hit.minDist, 1200, 1e-6);
  // Safe chord passing clear of Saturn must not falsely trigger.
  const clear = O.segmentSphereHit([90000, 75000, 0], [-90000, 75000, 0], [0, 0, 0], Rsat);
  assert.equal(clear.hit, false);
  near(clear.minDist, 75000, 1e-6);
});

test('swept ring-plane crossing and station proximity avoidance helpers respond accurately',()=>{
  const Rsat = 60268;
  const ringHit = O.segmentRingPlaneHit([100000, 0, 4500], [100000, 0, -4500], Rsat*1.26, Rsat*2.27);
  assert.equal(ringHit.hit, true);
  near(ringHit.tHit, 0.5, 1e-12);
  near(ringHit.radiusKm, 100000, 1e-9);
  const ringMiss = O.segmentRingPlaneHit([216000, 0, 4500], [216000, 0, -4500], Rsat*1.26, Rsat*2.27);
  assert.equal(ringMiss.hit, false);

  // High-speed non-docking pass within 0.45 km nudges outside 0.55 km.
  const stR = [216964, 0, 0], stV = [0, 13.2, 0];
  const fastPass = O.checkStationProximity(
    [216964.1, 0.2, 0], [0, 13.8, 0], stR, stV,
    { rShipPrev: [216964.1, -0.3, 0], rStationPrev: stR, docked: false }
  );
  assert.equal(fastPass.triggered, true);
  assert.ok(fastPass.minDistKm < 0.45);
  assert.ok(norm(fastPass.rKm.map((x,i)=>x-stR[i])) >= 0.549);

  // Slow docking approach (relSpeed <= 0.05 km/s) is NOT blocked.
  const slowDock = O.checkStationProximity(
    [216964.1, 0.05, 0], [0, 13.22, 0], stR, stV,
    { rShipPrev: [216964.1, -0.05, 0], rStationPrev: stR, docked: false }
  );
  assert.equal(slowDock.triggered, false);
});

test('planCircularizationBurn works in Saturn and Titan frames and flags alreadyCircular',()=>{
  const saturn = galaxy.SYSTEMS[0].planets[0];
  const titan = saturn.moons[0];
  const rSat = galaxy.SYSTEMS[0].station.orbitRadiusKm;
  const vSat = Math.sqrt(saturn.muKm3S2 / rSat);
  const circAlready = O.planCircularizationBurn([rSat, 0, 0], [0, vSat, 0], saturn.muKm3S2, 'now');
  assert.equal(circAlready.valid, true);
  assert.equal(circAlready.alreadyCircular, true);
  assert.ok(circAlready.dvKmS < 0.002);

  // Eccentric orbit around Titan -> circularize at PE and AP.
  const rTit = titan.radiusKm * 1.4;
  const vTit = Math.sqrt(titan.muKm3S2 / rTit) * 1.18;
  const atNow = O.planCircularizationBurn([rTit, 0, 0], [0, vTit, 0], titan.muKm3S2, 'now');
  assert.equal(atNow.valid, true);
  assert.equal(atNow.alreadyCircular, false);
  const afterNow = O.stateToElements([rTit, 0, 0], [0, vTit, 0].map((x,i)=>x+atNow.dvVecKmS[i]), titan.muKm3S2);
  near(afterNow.e, 0, 1e-9);
  const atAp = O.planCircularizationBurn([rTit, 0, 0], [0, vTit, 0], titan.muKm3S2, 'ap');
  assert.equal(atAp.valid, true);
  assert.ok(atAp.dtS > 0 && atAp.dvKmS > 0);
  const afterAp = O.stateToElements(atAp.rKm, atAp.vKmS.map((x,i)=>x+atAp.dvVecKmS[i]), titan.muKm3S2);
  near(afterAp.e, 0, 1e-6);
});

test('chronoscope orbit, moon-close and circularize honor selected target and moon primary',async()=>{
  const {view,diag,snap,sys,hints}=await makeChronoscope();
  const saturn = sys.planets[0], titan = saturn.moons[0], enceladus = saturn.moons[1];
  // Select Enceladus while moonIdx is still 0 (Titan) -> MOON LOW must target Enceladus!
  view.update(snap, { selectedTargetId: enceladus.id });
  view.addQuickBurn('moon-close');
  const encBurns = view.getBurns();
  assert.equal(encBurns.length, 2, hints.join(', '));
  assert.equal(encBurns[1].targetRef.moonIdx, 1);
  assert.ok(encBurns[1].captureRadiusKm >= enceladus.radiusKm + 350 - 1e-6);

  // One-click ORBIT TITAN plots 2-burn safe capture orbit (~1.35 * R_titan -> ~901 km alt).
  view.setBurns([]);
  view.update(snap, { selectedTargetId: titan.id });
  view.addQuickBurn('orbit');
  const orbBurns = view.getBurns();
  assert.equal(orbBurns.length, 2, hints.join(', '));
  assert.equal(orbBurns[1].targetRef.moonIdx, 0);
  assert.ok(orbBurns[1].captureRadiusKm >= titan.radiusKm * 1.35 - 1);

  // Circularize in Titan moon primary uses Titan gravity and hints when already circular.
  hints.length = 0;
  const rTit = titan.radiusKm * 1.35, vTit = Math.sqrt(titan.muKm3S2 / rTit);
  const titanSnap = {
    systemId: sys.id, simTimeS: 0,
    orbit: { primary: 'moon', focusSoi: 'moon', planetIdx: 0, moonIdx: 0, muKm3S2: titan.muKm3S2,
      rKm: [rTit, 0, 0], vKmS: [0, vTit, 0] }
  };
  view.setBurns([]);
  view.update(titanSnap, { frame: 'moon', planetIdx: 0, moonIdx: 0 });
  view.addQuickBurn('circularize');
  assert.equal(view.getBurns().length, 1);
  assert.ok(hints.some(h => /ALREADY CIRCULAR AROUND TITAN/i.test(h)), 'expected already-circular hint: '+hints.join('; '));
  view.dispose();
});

async function loadAppHarness() {
  if (!globalThis.__LH_APP) {
    globalThis.LighthuggerOrbits = O;
    globalThis.LighthuggerGenome = G;
    globalThis.LighthuggerGalaxy = galaxy;
    globalThis.LighthuggerScreens = { init(){}, setScreen(){}, sync(){}, flash(){}, getDeckClearPx:()=>0 };
    globalThis.document = {
      getElementById: () => null,
      addEventListener() {},
      removeEventListener() {}
    };
    globalThis.window = globalThis;
    globalThis.addEventListener = globalThis.addEventListener || (()=>{});
    globalThis.requestAnimationFrame = () => 0;
    await import('../lighthugger-app.js');
  }
  const app = globalThis.__LH_APP;
  app.resetVoyage();
  app.undock();
  return app;
}

test('full app: Titan SOI capture holds bound for 6 hours and outbound escape hands back to Saturn',async()=>{
  const app = await loadAppHarness();
  const sys = galaxy.SYSTEMS[0], saturn = sys.planets[0], titan = saturn.moons[0];
  // 1. One-click ORBIT TITAN from Saturn spawn -> execute transfer & capture!
  const cap = app.plotOrbitCapture(titan.id);
  assert.equal(cap.valid, true, JSON.stringify(cap));
  assert.ok(cap.captureAltKm >= 900, 'Titan capture alt should be ~901 km, got '+cap.captureAltKm);
  assert.equal(app.executeManeuverChain(), true);
  // Step through full transfer + arrival capture
  const totalStepS = cap.transferTimeS + 120;
  for (let s = 0; s < totalStepS; s += 600) app.step(Math.min(600, totalStepS - s), 0.1);
  const afterArrival = app.getSnapshot();
  assert.equal(afterArrival.orbitPrimary, 'moon');
  assert.equal(afterArrival.orbitPrimaryLabel, 'TITAN');
  assert.ok(afterArrival.orbit.altKm >= 850 && afterArrival.orbit.altKm <= 1000,
    'expected ~901 km safe Titan alt, got '+afterArrival.orbit.altKm);
  assert.equal(afterArrival.lastImpact, null);

  // 2. Unpowered 6-hour (21,600 s) coast around Titan MUST stay tightly bound around Titan!
  for (let h = 0; h < 36; h++) app.step(600, 0.1);
  const after6h = app.getSnapshot();
  assert.equal(after6h.orbitPrimary, 'moon');
  assert.equal(after6h.orbitPrimaryLabel, 'TITAN');
  const distToTitan6h = norm(after6h.orbit.rKm);
  assert.ok(distToTitan6h > titan.radiusKm + 800 && distToTitan6h < titan.radiusKm + 1100,
    'Titan distance drifted over 6h: '+distToTitan6h);
  // Circularize around Titan while already circular reports alreadyCircular: true
  const circTitan = app.circularizeOrbit('now');
  assert.equal(circTitan.valid, true);
  assert.equal(circTitan.alreadyCircular, true);
  assert.equal(circTitan.primaryLabel, 'TITAN');

  // 3. Outbound escape above Titan rHillKm hands cleanly back to Saturn!
  const vEscTitan = Math.sqrt(2 * titan.muKm3S2 / norm(app.orbit.rKm));
  app.manualImpulseDv('prograde', vEscTitan * 0.9);
  for (let i = 0; i < 60; i++) {
    app.step(1200, 0.1);
    if (app.getSnapshot().orbitPrimary === 'planet') break;
  }
  const escaped = app.getSnapshot();
  assert.equal(escaped.orbitPrimary, 'planet');
  assert.equal(escaped.orbitPrimaryLabel, 'SATURN');
  assert.ok(norm(escaped.orbit.rKm) > saturn.radiusKm * 5);

  // 4. Verify circularizeOrbit works around Saturn too (both non-circular and already-circular)
  const circSat = app.circularizeOrbit('now');
  assert.equal(circSat.valid, true);
  assert.equal(circSat.primaryLabel, 'SATURN');
  assert.equal(circSat.alreadyCircular, false);
  assert.ok(circSat.dvKmS > 0.01);
});

test('full app: swept collision prevents 1500s tunneling through Saturn without rubber-ball bounce',async()=>{
  const app = await loadAppHarness();
  const saturn = galaxy.SYSTEMS[0].planets[0];
  // Aim ship straight into Saturn center at 120 km/s and take a single 1500 s warp step!
  app.orbit.rKm = [90000, 500, 0];
  app.orbit.vKmS = [-120, 0, 0];
  app.setTimeWarp(10000);
  app.step(1500, 0.1);
  const snap = app.getSnapshot();
  assert.ok(snap.lastImpact, 'expected lastImpact to be recorded');
  assert.equal(snap.lastImpact.bodyName, 'Saturn');
  assert.equal(snap.lastImpact.kind, 'crush');
  assert.equal(snap.lastImpact.fatal, true);
  assert.equal(snap.destroyed, true);
  assert.equal(snap.hullIntegrity, 0);
  assert.equal(snap.timeWarp, 1);
  assert.ok(norm(snap.orbit.rKm) >= saturn.radiusKm && norm(snap.orbit.rKm) < saturn.radiusKm * 1.15,
    'must arrest at limb with zero tunneling or bounce, got ' + norm(snap.orbit.rKm));
  assert.equal(app.recommissionShip(), true);
  const rec = app.getSnapshot();
  assert.equal(rec.destroyed, false);
  assert.equal(rec.hullIntegrity, 1);
  assert.equal(rec.iceIntegrity, 1);
});

test('full app: flip-burn to Titan captures cleanly, blocks primary intersection, and handles atmo/ring/station contact',async()=>{
  const app = await loadAppHarness();
  const sys = galaxy.SYSTEMS[0], saturn = sys.planets[0], titan = saturn.moons[0];

  // 1. Flip-burn to Titan from spawn captures into safe Titan moon SOI and holds 6 hours.
  const fb = app.plotBrachistochroneOrbit(titan.id, 1);
  assert.equal(fb.valid, true, 'flip-burn to Titan should find a clear approach: '+JSON.stringify({hit:fb.hitBody,surf:fb.surfaceIntercept}));
  assert.equal(app.executeBrachistochroneOrbit(), true);
  const steps = Math.ceil((fb.tofS + 60) / 300);
  for (let i = 0; i < steps; i++) {
    if (!app.getSnapshot().burn.active) break;
    app.step(300, 0.1, false);
  }
  const arr = app.getSnapshot();
  assert.equal(arr.burn.active, false);
  assert.equal(arr.orbitPrimary, 'moon');
  assert.equal(arr.orbitPrimaryLabel, 'TITAN');
  assert.ok(arr.orbit.altKm >= 850, 'expected >= 850 km safe alt above Titan, got '+arr.orbit.altKm);
  assert.equal(arr.lastImpact, null);
  for (let h = 0; h < 36; h++) app.step(600, 0.1);
  assert.equal(app.getSnapshot().orbitPrimary, 'moon');
  assert.ok(norm(app.getSnapshot().orbit.rKm) < titan.radiusKm + 1150);

  // 2. Flip-burn directly behind Saturn bends smoothly via C2 obstacle avoidance with zero impact.
  app.resetVoyage(); app.undock();
  const titanState = galaxy.getBodyWorldState(sys, { kind: 'moon', planetIdx: 0, moonIdx: 0 }, app.getSnapshot().simTimeS);
  const satState = galaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, app.getSnapshot().simTimeS);
  const tRel = titanState.rKm.map((x, i) => x - satState.rKm[i]);
  const tUnit = tRel.map(x => x / norm(tRel));
  // Place ship on exact opposite side of Saturn from Titan!
  app.orbit.rKm = tUnit.map(x => -x * 216000);
  app.orbit.vKmS = [0, 0, Math.sqrt(saturn.muKm3S2 / 216000)];
  const avoided = app.plotBrachistochroneOrbit(titan.id, 1);
  assert.equal(avoided.surfaceIntercept, false);
  assert.equal(avoided.valid, true);
  assert.ok(avoided.points.every(pt => norm(pt) > saturn.radiusKm), 'curved flip-burn must clear Saturn');
  assert.equal(app.executeBrachistochroneOrbit(), true);
  const avSteps = Math.ceil((avoided.tofS + 60) / 300);
  for (let i = 0; i < avSteps; i++) {
    if (!app.getSnapshot().burn.active) break;
    app.step(300, 0.1, false);
  }
  const avArr = app.getSnapshot();
  assert.equal(avArr.burn.active, false);
  assert.equal(avArr.lastImpact, null);
  assert.equal(avArr.orbitPrimary, 'moon');

  // 3. Atmospheric entry into Saturn upper envelope drops warp to 1x, applies drag/ablation without crush.
  app.resetVoyage(); app.undock();
  const rAtmo = saturn.radiusKm + 400; // inside Saturn 904 km atmosphere, above 60268 km surface
  app.orbit.rKm = [rAtmo, 0, 0];
  app.orbit.vKmS = [0, Math.sqrt(saturn.muKm3S2 / rAtmo) * 1.05, 0];
  app.setTimeWarp(1000);
  const iceBefore = app.getSnapshot().iceIntegrity;
  app.step(10, 0.1);
  const atmoSnap = app.getSnapshot();
  assert.equal(atmoSnap.lastImpact, null);
  assert.equal(atmoSnap.timeWarp, 1);
  assert.ok(atmoSnap.iceIntegrity < iceBefore, 'expected atmospheric ablation');
  assert.equal(atmoSnap.warning?.title, 'ATMOSPHERIC ENTRY');

  // 4. Ring-plane crossing applies ice pitting and records lastRingCrossing.
  app.resetVoyage(); app.undock();
  const rRing = saturn.radiusKm * 1.7;
  app.orbit.rKm = [rRing, 0, 500];
  app.orbit.vKmS = [0, Math.sqrt(saturn.muKm3S2 / rRing), -40];
  const icePreRing = app.getSnapshot().iceIntegrity;
  app.step(30, 0.1);
  const ringSnap = app.getSnapshot();
  assert.ok(ringSnap.lastRingCrossing, 'expected lastRingCrossing');
  assert.ok(ringSnap.iceIntegrity < icePreRing);

  // 5. High-speed station pass within 0.45 km nudges ship outside 0.55 km.
  app.resetVoyage(); app.undock();
  const tNow = app.getSnapshot().simTimeS;
  const stW = galaxy.getBodyWorldState(sys, { kind: 'station', planetIdx: 0 }, tNow);
  const pW = galaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, tNow);
  const stRelR = stW.rKm.map((x, i) => x - pW.rKm[i]);
  const stRelV = stW.vKmS.map((x, i) => x - pW.vKmS[i]);
  app.orbit.rKm = [stRelR[0] + 0.15, stRelR[1], stRelR[2] - 0.5];
  app.orbit.vKmS = [stRelV[0], stRelV[1], stRelV[2] + 0.5];
  app.step(2, 0.1);
  const proxSnap = app.getSnapshot();
  const stAfter = galaxy.getBodyWorldState(sys, { kind: 'station', planetIdx: 0 }, proxSnap.simTimeS);
  const pAfter = galaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, proxSnap.simTimeS);
  const distAfter = norm(proxSnap.orbit.rKm.map((x, i) => x - (stAfter.rKm[i] - pAfter.rKm[i])));
  assert.ok(distAfter >= 0.54, 'station proximity nudge should clear outside 0.55 km, got '+distAfter);
  assert.equal(proxSnap.warning?.title, 'STATION PROXIMITY AVOIDANCE');
});

test('zero-velocity radial free-fall is finite and never hovers, and body atmospheres clear capture radius',()=>{
  const elZero = O.stateToElements([R, 0, 0], [0, 0, 0], mu);
  assert.ok(Number.isFinite(norm(elZero.progradeHat)) && Math.abs(norm(elZero.progradeHat) - 1) < 1e-6);
  const elPts = O.sampleOrbitPoints(elZero, mu, 33);
  assert.equal(elPts.points.length, 33);
  assert.ok(elPts.points.flat().every(Number.isFinite));
  const fall = O.stepOrbitalState([R, 0, 0], [0, 0, 0], [0, 0, 0], 100, mu);
  assert.ok(norm(fall.rKm) < R - 10, 'zero velocity must fall radially inward under gravity');
  assert.ok(fall.vKmS[0] < -0.5, 'inward radial speed must grow smoothly');

  const titan = galaxy.SYSTEMS[0].planets[0].moons[0];
  const titanAtmo = O.bodyAtmosphereAltKm(titan, 'moon');
  const titanSafeR = O.safeOrbitRadiusKm(titan.radiusKm, titan.rHillKm, true, titanAtmo);
  assert.ok(titanSafeR - (titan.radiusKm + titanAtmo) >= 500, 'Titan capture orbit must clear atmo by >= 500 km');

  for (const [body, isMoon] of [
    [{ name: 'Titan', kind: 'hazy-planetoid' }, true],
    [{ name: 'Triton', kind: 'cryovolcanic' }, true],
    [{ name: 'Pluto', kind: 'hazy-planetoid' }, false],
    [{ name: 'Mars', kind: 'arid-mars' }, false],
    [{ name: 'Earth', kind: 'terrestrial-archipelago' }, false],
    [{ name: 'Jupiter', kind: 'rust-giant' }, false]
  ]) {
    const prof = galaxy.bodyAtmoProfile(body, isMoon, 137);
    assert.ok(prof && prof.ratio > 1.05 && Array.isArray(prof.betaR) && prof.betaR.length === 3 &&
      Number.isFinite(prof.betaM) && Array.isArray(prof.mieTint) && prof.mieTint.length === 3,
      'missing volumetric atmo profile for ' + body.name);
  }
  assert.equal(galaxy.bodyAtmoProfile({ name: 'Luna', kind: 'cratered-rock' }, true, 137), null);
});

test('procedural frontier catalog preserves 28 curated systems, gates discovery beyond 40 LY / 28 LY scan radius, and supports multi-hop routing', () => {
  assert.equal(galaxy.SYSTEMS.length, 28);
  for (const s of galaxy.SYSTEMS) {
    assert.equal(s.procedural, false, 'curated system must have procedural=false: ' + s.id);
  }
  assert.ok(Array.isArray(galaxy.FRONTIER_SYSTEMS) && galaxy.FRONTIER_SYSTEMS.length >= 24,
    'expected >= 24 frontier systems, got ' + galaxy.FRONTIER_SYSTEMS?.length);
  assert.equal(galaxy.ALL_SYSTEMS.length, galaxy.SYSTEMS.length + galaxy.FRONTIER_SYSTEMS.length);
  for (const fs of galaxy.FRONTIER_SYSTEMS) {
    assert.equal(fs.procedural, true);
    const dSol = Math.hypot(fs.xyz[0], fs.xyz[1], fs.xyz[2]);
    assert.ok(dSol > 40, 'frontier star too close to Sol: ' + fs.id + ' ' + dSol);
    assert.ok(Array.isArray(fs.planets) && fs.planets.length >= 4, 'frontier star needs >= 4 planets: ' + fs.id);
    assert.ok(fs.station && fs.station.name && fs.station.type, 'frontier star missing station: ' + fs.id);
    assert.equal(/[^\x20-\x7e]/.test(fs.name + ' ' + fs.lore), false, 'non-ASCII text in frontier star: ' + fs.id);
  }
  assert.equal(galaxy.getVisibleSystems([], [0, 0, 0]).length, 28);
  const f0 = galaxy.FRONTIER_SYSTEMS.find(s => Math.hypot(s.xyz[0], s.xyz[1], s.xyz[2]) < 65);
  assert.ok(f0, 'expected an inner frontier star < 65 LY from Sol');
  assert.equal(galaxy.getSystem(f0.id).id, f0.id);
  assert.ok(galaxy.getVisibleSystems([f0.id], [0, 0, 0]).some(s => s.id === f0.id));
  const route = galaxy.planMultiHopRoute('sol', f0.id, { maxHopLy: 20, accelG: 1, systems: galaxy.ALL_SYSTEMS });
  assert.ok(route && route.hops.length >= 2 && route.hops.at(-1).toId === f0.id,
    'multi-hop route to frontier star failed: ' + JSON.stringify(route));
});

test('full app: cross-SOI Saturn to Earth transfer promotes primary cleanly, captures at Earth, and extended transit duration scales with distance', async () => {
  const app = await loadAppHarness();
  const sys = galaxy.SYSTEMS[0], saturn = sys.planets[0], titan = saturn.moons[0], earth = sys.planets[3];
  assert.equal(earth.id, 'sol-p3');
  assert.equal(earth.name, 'Earth');
  assert.equal(app.orbit.primary, 'planet');
  assert.equal(app.orbit.planetIdx, 0);
  assert.ok(app.getSnapshot().targetOrbits.some(t => t.id === 'sol-p3' && t.crossSoi === true));

  const titanCap = app.plotOrbitCapture(titan.id);
  assert.equal(titanCap.valid, true, JSON.stringify(titanCap));
  assert.ok(app.getSnapshot().maneuverChain.length > 0);

  const earthPlan = app.plotTargetOrbit(earth.id);
  assert.ok(earthPlan && Number.isFinite(earthPlan.totalDvKmS));
  const afterSelectEarth = app.getSnapshot();
  assert.equal(afterSelectEarth.orbitPrimary, 'star');
  assert.equal(afterSelectEarth.maneuverChain.length, 0);

  const earthCap = app.plotOrbitCapture(earth.id, { execute: true });
  assert.equal(earthCap.valid, true, JSON.stringify(earthCap));
  assert.equal(earthCap.burns.length, 2);
  for (let i = 0; i < 600; i++) {
    const sn = app.getSnapshot();
    if (!sn.burn?.active) break;
    const rem = sn.burn.remainingS || 0;
    const dt = Math.max(1, Math.min(Math.max(60, rem / 12), 2e6));
    app.step(dt, 0.05);
  }
  const capturedEarth = app.getSnapshot();
  assert.equal(capturedEarth.orbitPrimary, 'planet');
  assert.equal(capturedEarth.orbit.bodyName, 'Earth');
  assert.equal(capturedEarth.orbit.el.isBound, true);
  assert.ok(capturedEarth.orbit.altKm > 200, 'Earth capture altitude too low: ' + capturedEarth.orbit.altKm);

  const runTransit = (destId, warpMode) => {
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.engageInterstellar({ destId });
    if (warpMode) app.setTimeWarp(warpMode);
    let elapsed = 0;
    for (let i = 0; i < 2000; i++) {
      if (!app.getSnapshot().transitStage) break;
      app.step(0.05, 0.05, true);
      elapsed += 0.05;
    }
    assert.equal(app.getSnapshot().transitStage, null, destId + ' did not finish transit in 2000 steps');
    return elapsed;
  };
  const durRigil = runTransit('rigil');
  assert.ok(durRigil >= 25 && durRigil <= 48, 'Expected Rigil duration in [25, 48]s, got ' + durRigil);
  const durHyper = runTransit('rigil', 'hyper');
  assert.ok(durHyper < durRigil * 0.65, 'Expected HYPR faster than 0.65x default: ' + durHyper + ' vs ' + durRigil);
  const durVega = runTransit('vega');
  assert.ok(durVega > durRigil + 4, 'Expected 25 LY Vega longer than Rigil by >4s: ' + durVega + ' vs ' + durRigil);
});

test('full app round 9: tangential Titan flip-burn, undock station framing, live finite burns, calmer approach, and smooth rel contacts', async () => {
  const app = await loadAppHarness();
  const sys = galaxy.SYSTEMS[0], saturn = sys.planets[0], titan = saturn.moons[0];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit3 = v => { const l = norm(v) || 1; return v.map(x => x / l); };

  // 1. Undock leaves station clearly in front-abeam sector at ~3.3 km inside dock range.
  const undockSnap = app.getSnapshot();
  const pSt0 = galaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, undockSnap.simTimeS);
  const stSt0 = galaxy.getBodyWorldState(sys, { kind: 'station', planetIdx: 0 }, undockSnap.simTimeS);
  const shipWorld0 = pSt0.rKm.map((x, i) => x + undockSnap.orbit.rKm[i]);
  const toStation = stSt0.rKm.map((x, i) => x - shipWorld0[i]);
  const toStationDir = unit3(toStation);
  assert.ok(undockSnap.dock.distKm >= 2.0 && undockSnap.dock.distKm <= 5.0, 'expected ~3.3 km station separation, got ' + undockSnap.dock.distKm);
  assert.equal(undockSnap.dock.inRange, true);
  assert.ok(dot3(toStationDir, undockSnap.basis.f) > 0.35, 'station should sit forward of ship after undock');
  assert.ok(dot3(toStationDir, undockSnap.basis.y) > 0.1, 'station should sit in open sky above orbital plane after undock');

  // 2. Flip-burn to Titan enters via tangential limb across phases (never head-on plunge) and clears stale chains.
  for (const t of [0, 12000, 80000, 250000]) {
    app.resetVoyage();
    app.state.simTimeS = t;
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.plotOrbitCapture(titan.id);
    assert.ok(app.getSnapshot().maneuverChain.length > 0);
    const fb = app.plotBrachistochroneOrbit(titan.id, 1);
    assert.equal(fb.valid, true, 'expected clear flip-burn at t=' + t + ': ' + fb.hitBody);
    assert.equal(app.getSnapshot().maneuverChain.length, 0, 'flip-burn should clear prior maneuver chain');
    assert.equal(app.executeBrachistochroneOrbit(), true);
    let minOffCenterEndDeg = null;
    for (let i = 0; i < 600 && app.getSnapshot().burn.active; i++) {
      app.step(0.05, 0.05, true);
      const cur = app.getSnapshot();
      if (cur.burn.active && cur.burn.progress >= 0.90) {
        const pW = galaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, cur.simTimeS);
        const mW = galaxy.getBodyWorldState(sys, { kind: 'moon', planetIdx: 0, moonIdx: 0 }, cur.simTimeS);
        const shipW = pW.rKm.map((x, k) => x + cur.orbit.rKm[k]);
        const toTitan = unit3(mW.rKm.map((x, k) => x - shipW[k]));
        const ang = Math.acos(Math.max(-1, Math.min(1, dot3(toTitan, cur.basis.f)))) * 180 / Math.PI;
        if (minOffCenterEndDeg == null || cur.burn.progress > 0.96) minOffCenterEndDeg = ang;
      }
    }
    const done = app.getSnapshot();
    assert.equal(done.lastImpact, null, 'impact during flip-burn at t=' + t);
    assert.equal(done.orbitPrimary, 'moon');
    assert.ok(done.orbit.altKm >= 850 && done.orbit.altKm <= 1150, 'unexpected Titan altKm: ' + done.orbit.altKm);
    assert.ok(minOffCenterEndDeg >= 30, 'final limb approach should turn tangent to Titan rather than diving straight in: ' + minOffCenterEndDeg);
  }

  // 3. Live finite orbital transfer burn fires engines visibly (thrustG >= 0.5) and reaches capture.
  app.resetVoyage();
  app.undock();
  const orbCap = app.plotOrbitCapture(titan.id, { execute: true });
  assert.equal(orbCap.valid, true);
  let sawFiring = false, peakThrustG = 0;
  for (let i = 0; i < 600; i++) {
    const sn = app.getSnapshot();
    if (!sn.burn.active) break;
    if (sn.burn.firing) {
      sawFiring = true;
      peakThrustG = Math.max(peakThrustG, sn.thrustG);
      app.step(0.1, 0.1, false, true);
    } else {
      const dt = Math.max(1, Math.min(sn.burn.remainingS || 60, Math.max(50, (sn.burn.remainingS || 0) * 0.45)));
      app.step(dt, 0.05, false, true);
    }
  }
  const orbDone = app.getSnapshot();
  assert.equal(sawFiring, true, 'expected liveVisual orbital transfer to trigger finite burn.firing');
  assert.ok(peakThrustG >= 0.5, 'expected orbital burn peak thrust >= 0.5g, got ' + peakThrustG);
  assert.equal(orbDone.burn.active, false);
  assert.equal(orbDone.orbitPrimary, 'moon');

  // 4. Relativistic corridor contacts keep stable IDs/names and smooth range delta despite massive simTimeS jumps.
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  app.engageInterstellar({ destId: 'rigil' });
  for (let i = 0; i < 200; i++) app.step(0.05, 0.05, true);
  const cBefore = app.getSnapshot().contacts.map(c => ({ id: c.id, name: c.name, vec: c.obsVec.slice() }));
  for (let i = 0; i < 12; i++) app.step(0.025, 0.025, true);
  const cAfter = app.getSnapshot().contacts.map(c => ({ id: c.id, name: c.name, vec: c.obsVec.slice() }));
  assert.equal(cBefore.length, 3);
  for (let idx = 0; idx < 3; idx++) {
    assert.equal(cAfter[idx].name, cBefore[idx].name, 'corridor vessel respawned/flickered during rel cruise');
    const cosMove = dot3(cBefore[idx].vec, cAfter[idx].vec);
    assert.ok(cosMove > 0.99, 'corridor vessel jumped excessively between relativistic frames: cos=' + cosMove);
  }

  // 5. Star-system arrival approach + capture takes >= 10s real time instead of blasting past.
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  app.engageInterstellar({ destId: 'rigil' });
  let appDur = 0, totalDur = 0;
  for (let i = 0; i < 2000; i++) {
    const s = app.getSnapshot();
    if (!s.transitStage) break;
    if (s.transitStage === 'approach' || s.transitStage === 'capture') appDur += 0.05;
    totalDur += 0.05;
    app.step(0.05, 0.05, true);
  }
  assert.equal(app.getSnapshot().transitStage, null);
  assert.ok(appDur >= 10 && appDur <= 22, 'expected calibrated approach+capture duration in [10, 22]s, got ' + appDur);
  assert.ok(totalDur >= 25 && totalDur <= 48, 'expected total Rigil duration in [25, 48]s, got ' + totalDur);
});

test('RCS auto-slew torque and C2 obstacle-avoiding flip-burn / capture arcs prevent body collisions', async () => {
  const app = await loadAppHarness();

  // 1. Auto-slew RCS torque triggers whenever attitude slews (> 2e-4 rad) and zeroes once settled.
  app.enterSystemOrbit('sol', true);
  app.undock();
  app.setAttitudeMode('prograde');
  app.step(0.05, 0.05, false, true);
  app.setAttitudeMode('retrograde');
  app.step(0.05, 0.05, false, true);
  const midTurn = app.getSnapshot();
  assert.ok(Math.hypot(...midTurn.rcsTorque) > 0.2, 'expected auto-slew to fire RCS torque, got ' + JSON.stringify(midTurn.rcsTorque));
  for (let i = 0; i < 60; i++) app.step(0.1, 0.1, false, true);
  const settledTurn = app.getSnapshot();
  assert.ok(Math.hypot(...settledTurn.rcsTorque) < 1e-6, 'expected RCS torque to clear once aligned, got ' + JSON.stringify(settledTurn.rcsTorque));

  // 2. Opposite-side brachistochrone flip-burn across central planet bends via C2 curve with zero impact.
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  const saturnR = app.orbit.bodyRadiusKm;
  const titan = app.getSnapshot().targetOrbits.find(t => /TITAN/i.test(t.label));
  assert.ok(titan, 'Titan target missing');
  const solSys = galaxy.SYSTEMS.find(s => s.id === 'sol');
  const titanState = galaxy.getBodyWorldState(
    solSys,
    { kind: 'moon', planetIdx: app.orbit.planetIdx, moonIdx: titan.focusRef.moonIdx },
    app.state.simTimeS
  );
  const satState = galaxy.getBodyWorldState(
    solSys,
    { kind: 'planet', planetIdx: app.orbit.planetIdx },
    app.state.simTimeS
  );
  const relTitan = [titanState.rKm[0] - satState.rKm[0], titanState.rKm[1] - satState.rKm[1], titanState.rKm[2] - satState.rKm[2]];
  const titanUnit = unitVec(relTitan);
  const oppDist = saturnR * 2.8;
  const perpOpp = [-titanUnit[1], titanUnit[0], 0];
  app.orbit.rKm = [-titanUnit[0] * oppDist, -titanUnit[1] * oppDist, -titanUnit[2] * oppDist];
  app.orbit.vKmS = [perpOpp[0] * Math.sqrt(app.orbit.muKm3S2 / oppDist), perpOpp[1] * Math.sqrt(app.orbit.muKm3S2 / oppDist), perpOpp[2] * Math.sqrt(app.orbit.muKm3S2 / oppDist)];
  const r0Before = app.orbit.rKm.slice();
  const v0Before = app.orbit.vKmS.slice();
  const bp = app.plotBrachistochroneOrbit(titan.id, 1.0);
  assert.ok(bp && bp.valid && !bp.surfaceIntercept, 'expected opposite-side flip-burn to avoid Saturn via clear curve: ' + JSON.stringify({ valid: bp?.valid, hitBody: bp?.hitBody }));
  const pStart = bp.stateAt(0), pEnd = bp.stateAt(bp.tofS);
  const endDiff = Math.hypot(pStart.rKm[0] - r0Before[0], pStart.rKm[1] - r0Before[1], pStart.rKm[2] - r0Before[2]);
  assert.ok(endDiff < 1e-3, 'expected curved flip-burn start continuity, diff=' + endDiff);
  const dvStartDiff = Math.hypot(pStart.vKmS[0] - v0Before[0], pStart.vKmS[1] - v0Before[1], pStart.vKmS[2] - v0Before[2]);
  assert.ok(dvStartDiff < 1e-5, 'expected C1 velocity continuity at t=0, diff=' + dvStartDiff);
  assert.ok(Math.hypot(...pEnd.rKm) > saturnR * 1.1, 'expected valid curved endpoint');

  // Minimum Saturn clearance along all 129 points exceeds surface radius + atmo margin.
  const minClear = bp.points.reduce((m, pt) => Math.min(m, Math.hypot(pt[0], pt[1], pt[2])), Infinity);
  assert.ok(minClear > saturnR * 1.05, 'expected curved flip-burn path to clear Saturn surface, min=' + minClear + ' vs R=' + saturnR);

  // 3. Graphics prefs & 3D ORB default OFF
  const snap0 = app.getSnapshot();
  assert.equal(snap0.showOrbitsInHelm, false, 'expected showOrbitsInHelm OFF by default');
  app.toggleVectors();
  assert.equal(app.getSnapshot().showOrbitsInHelm, true, 'expected toggleVectors to enable 3D ORB');
  app.toggleVectors();
  const gfx = app.setGraphics({ aa: 'fxaa', renderScale: 1.5, autoOrbit: false });
  assert.equal(gfx.aa, 'fxaa');
  assert.equal(gfx.renderScale, 1.5);
  assert.equal(gfx.autoOrbit, false);
});

test('Round 11: collision-free multi-hop interstellar paths, visibly icy harvest sites, realistic 1x timer, warp trim, and cam viewpoints', async () => {
  const app = await loadAppHarness();

  // 1. Icy site targeting prioritizes icy moons / comets / ice rings over metallic stations
  for (const sysId of ['sol', 'rigil', 'sirius', 'vega']) {
    const s = galaxy.getSystem(sysId);
    const site = galaxy.findBestIceHarvestSite(s);
    assert.ok(site && site.kind !== 'cryo-station', sysId + ' should pick natural icy site, got ' + JSON.stringify(site));
    assert.ok(['icy-moon', 'comet', 'ice-rings', 'ice-world', 'comet-belt'].includes(site.kind));
  }

  // 2. Multi-hop route Sol -> Sirius (or >1 hop route) keeps clearance outside bodies & stations with zero snap-back
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  const hopPreview = galaxy.planMultiHopRoute('sol', 'vega', { maxHopLy: 14, accelG: 1, systems: galaxy.ALL_SYSTEMS });
  assert.ok(hopPreview && hopPreview.hops.length >= 2);
  assert.equal(app.launchMultiHopRoute('vega', 14), true);

  let checkedApproachPts = 0, minAppStationDistKm = Infinity, minDepStationDistKm = Infinity, minBodyRatio = Infinity;
  let lastStage = null, prevApproachKm = null, maxCaptureJumpKm = 0;
  for (let i = 0; i < 2400; i++) {
    const sn = app.getSnapshot();
    if (!sn.multiHop?.active) break;
    const activeSys = galaxy.getSystem(sn.dioramaSysId || sn.systemId);
    if (sn.mode === 'interstellar' && sn.shipRelStarKm && activeSys) {
      const stW = galaxy.getBodyWorldState(activeSys, { kind: 'station', planetIdx: activeSys.station.parentPlanetIdx }, sn.simTimeS);
      const stDist = norm(stW.rKm.map((x, k) => x - sn.shipRelStarKm[k]));
      if (sn.transitStage === 'approach' || sn.transitStage === 'capture') minAppStationDistKm = Math.min(minAppStationDistKm, stDist);
      else if (sn.transitStage === 'departure') minDepStationDistKm = Math.min(minDepStationDistKm, stDist);
      for (let pi = 0; pi < activeSys.planets.length; pi++) {
        const p = activeSys.planets[pi];
        const pW = galaxy.getBodyWorldState(activeSys, { kind: 'planet', planetIdx: pi }, sn.simTimeS);
        minBodyRatio = Math.min(minBodyRatio, norm(pW.rKm.map((x, k) => x - sn.shipRelStarKm[k])) / Math.max(1, p.radiusKm));
      }
      checkedApproachPts++;
    }
    if (sn.transitStage === 'approach' && sn.shipRelStarKm) prevApproachKm = sn.shipRelStarKm.slice();
    if (lastStage === 'approach' && sn.transitStage === 'capture' && prevApproachKm && sn.shipRelStarKm) {
      maxCaptureJumpKm = Math.max(maxCaptureJumpKm, norm(sn.shipRelStarKm.map((x, k) => x - prevApproachKm[k])));
    }
    lastStage = sn.transitStage;
    if (sn.multiHop.phase === 'harvesting') {
      assert.ok(sn.iceHarvest.durationSimS >= 5400, 'waypoint harvest duration should be realistic multi-hour sim time');
      app.step(Math.max(4000, sn.effectiveWarp * 1.5), 1.5, true);
    } else {
      app.step(0.05, 0.05, true);
    }
  }
  const endHop = app.getSnapshot();
  assert.equal(endHop.systemId, 'vega');
  assert.ok(checkedApproachPts > 10, 'expected to inspect approach/departure coordinates');
  assert.ok(minAppStationDistKm >= 10, 'arrival flew too close to / through a space station: ' + minAppStationDistKm + ' km');
  assert.ok(minDepStationDistKm >= 3.2, 'departure cut closer to / through the departure station: ' + minDepStationDistKm + ' km');
  assert.ok(minBodyRatio > 1.05, 'interstellar path passed through a planet interior: ratio=' + minBodyRatio);
  assert.ok(maxCaptureJumpKm < 25, 'capture transition teleported excessively: ' + maxCaptureJumpKm + ' km');

  // 3. Realistic manual harvest duration & 1x slowdown vs auto boost
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  app.state.iceIntegrity = 0.45;
  assert.equal(app.harvestIceWithDropships(), true);
  const hInit = app.getSnapshot();
  assert.ok(hInit.iceHarvest.active && hInit.iceHarvest.durationSimS >= 18000, 'expected multi-hour duration, got ' + hInit.iceHarvest.durationSimS);
  assert.equal(hInit.autoClock, true);
  app.setTimeWarp(1);
  app.step(1.0, 1.0, false, true);
  const after1x = app.getSnapshot();
  assert.ok(after1x.iceHarvest.active && after1x.iceHarvest.progress < 0.001, '1x clock must take hours physically, progress=' + after1x.iceHarvest.progress);
  app.step(after1x.iceHarvest.durationSimS, 5.0, false, true);
  assert.equal(app.getSnapshot().iceShield, 1);

  // 4. Warp fine trim + 3-way viewpoints + camLock / Pilot Puck snap-back
  const trimmed = app.setTimeWarpExact(4321);
  assert.equal(trimmed, 4321);
  assert.equal(app.getSnapshot().autoClock, false);
  assert.equal(app.getSnapshot().timeWarp, 4321);

  assert.equal(app.cycleCamViewMode(), 'high');
  assert.equal(app.getSnapshot().hideShip, false);
  assert.equal(app.cycleCamViewMode(), 'first');
  assert.equal(app.getSnapshot().hideShip, true);
  assert.equal(app.cycleCamViewMode(), 'low');
  assert.equal(app.getSnapshot().hideShip, false);

  // Round 12 default: camLock=false; Pilot Puck snaps back to preset when unlocked, holds custom angle when locked
  assert.equal(app.getSnapshot().camLock, false);
  app.setPuckInput(0.5, 0.2, true);
  assert.equal(app.state.camSnapActive, true);
  app.setPuckInput(0, 0, false);
  app.toggleCamLock();
  assert.equal(app.getSnapshot().camLock, true);
  app.state.camSnapActive = false;
  app.setPuckInput(0.5, 0.2, true);
  assert.equal(app.state.camSnapActive, false);
  app.setPuckInput(0, 0, false);
  app.toggleCamLock();
  assert.equal(app.getSnapshot().camLock, false);
});

test('Round 12: per-system mapped ice deposits, distance-scaled sortie timing, camLock vs Pilot Puck, and waypoint targetOrbits', async () => {
  const sol = galaxy.getSystem('sol');
  for (const s of galaxy.ALL_SYSTEMS) {
    const deps = galaxy.getSystemIceDeposits(s);
    assert.ok(Array.isArray(deps) && deps.length >= 2, s.id + ' should have >= 2 mapped ice deposits');
    const st0 = galaxy.getIceDepositWorldState(s, deps[0], 0);
    assert.ok(Array.isArray(st0.rKm) && st0.rKm.length === 3 && st0.rKm.every(Number.isFinite));
  }

  const nearestCheck = galaxy.findNearestIceDeposit(sol, [1.5e8, 0, 0], 0);
  assert.ok(nearestCheck && nearestCheck.deposit && nearestCheck.all.length >= 2);
  for (let i = 1; i < nearestCheck.all.length; i++) {
    assert.ok(nearestCheck.all[i].distKm >= nearestCheck.all[i - 1].distKm);
  }

  const app = await loadAppHarness();
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  app.state.iceIntegrity = 0.50;
  assert.equal(app.harvestIceWithDropships(), true);
  const nearSnap = app.getSnapshot();
  assert.ok(nearSnap.iceHarvest.active && nearSnap.iceHarvest.depositId);
  assert.ok(Number.isFinite(nearSnap.iceHarvest.distKm) && nearSnap.iceHarvest.distKm > 0);
  assert.ok(Array.isArray(nearSnap.iceDeposits) && nearSnap.iceDeposits.length >= 2);
  assert.ok(Array.isArray(nearSnap.targetOrbits) && nearSnap.targetOrbits.some(t => t.kind === 'ice-deposit'));

  // Waypoint harvest in multi-hop transit still exposes Orbit Nav targets (never blank)
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  assert.equal(app.launchMultiHopRoute('vega', 14), true);
  let waySnap = null;
  for (let i = 0; i < 1600; i++) {
    const sn = app.getSnapshot();
    if (sn.multiHop?.phase === 'harvesting') {
      waySnap = sn;
      break;
    }
    app.step(0.05, 0.05, true);
  }
  assert.ok(waySnap, 'expected multi-hop waypoint harvest phase');
  assert.ok(Array.isArray(waySnap.targetOrbits) && waySnap.targetOrbits.length > 0, 'waypoint harvest must expose Orbit Nav targets');
  assert.ok(waySnap.targetOrbits.some(t => t.kind === 'ice-deposit'), 'waypoint targetOrbits should include mapped ice deposits');
});

test('Round 13-15: NASA found-sound + space music manifest, clean RCS, combat music, modulation, and headless safety', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const crypto = await import('node:crypto');
  const url = await import('node:url');
  const audioMod = await import('../lighthugger-audio.js');
  const AudioEng = audioMod.default || globalThis.LighthuggerAudio;
  assert.ok(AudioEng && typeof AudioEng.computeMixTargets === 'function' && typeof AudioEng.create === 'function');

  const testDir = path.dirname(url.fileURLToPath(import.meta.url));
  const audioDir = path.resolve(testDir, '..', 'audio');
  const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8'));
  const attribution = fs.readFileSync(path.join(audioDir, 'ATTRIBUTION.md'), 'utf8');

  assert.equal(manifest.stems.length, 25);
  assert.ok(manifest.totalBytes < 2.8 * 1024 * 1024, 'total audio footprint must stay under 2.8 MB');
  for (const name of ['Cassini', 'Perseverance', 'SLS', 'InSight', 'Quindar', 'Dorian', 'Lydian', 'Phrygian']) {
    assert.ok(attribution.includes(name), 'ATTRIBUTION.md missing ' + name);
  }
  const stemIds = new Set(manifest.stems.map(s => s.id));
  for (const reqId of ['music-orbital', 'music-interstellar', 'music-combat', 'sfx-explosion', 'sfx-ui-tab', 'sfx-ui-confirm', 'sfx-ui-deny', 'sfx-warn-caution']) {
    assert.ok(stemIds.has(reqId), 'manifest missing stem ' + reqId);
  }
  const rcsStem = manifest.stems.find(s => s.id === 'stem-rcs');
  assert.ok(rcsStem && rcsStem.sources.some(s => s.key === 'sls_fire') && !rcsStem.sources.some(s => s.key === 'enceladus_rpws'),
    'stem-rcs must use clean cold-gas nozzle sources without enceladus plasma chirps');
  const orbMus = manifest.stems.find(s => s.id === 'music-orbital');
  const istMus = manifest.stems.find(s => s.id === 'music-interstellar');
  const comMus = manifest.stems.find(s => s.id === 'music-combat');
  assert.ok(orbMus && orbMus.loopEnd >= 32 && istMus && istMus.loopEnd >= 32 && comMus && comMus.loopEnd >= 24);

  for (const stem of manifest.stems) {
    const filePath = path.join(audioDir, stem.file);
    assert.ok(fs.existsSync(filePath), 'Missing stem file: ' + stem.file);
    const stat = fs.statSync(filePath);
    assert.equal(stat.size, stem.bytes, 'Byte size mismatch for ' + stem.file);
    assert.ok(stem.bytes > 200, 'Stem too small: ' + stem.file);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    assert.equal(sha, stem.sha256, 'SHA-256 mismatch for ' + stem.file);
    assert.ok(Array.isArray(stem.sources) && stem.sources.length >= 1);
    for (const src of stem.sources) {
      assert.match(src.license, /Public domain/i);
      assert.match(src.credit, /NASA|JPL/i);
    }
    if (stem.kind === 'loop' || stem.kind === 'music') {
      assert.ok(Number.isFinite(stem.loopStart) && Number.isFinite(stem.loopEnd));
      assert.ok(stem.loopStart >= 0 && stem.loopStart < stem.loopEnd && stem.loopEnd <= stem.durationSec);
    }
  }

  const defCfg = AudioEng.DEFAULT_CONFIG;
  assert.equal(defCfg.music, 0.68);
  assert.equal(defCfg.ambience, 0.32);
  assert.equal(defCfg.ui, 0.85);
  const dockedMix = AudioEng.computeMixTargets({ docked: true, mode: 'docked', inDeepSpace: false, screen: 'helm' }, defCfg);
  assert.ok(dockedMix.musicOrbitalGain > 0.25 && dockedMix.musicIstlGain === 0);
  assert.ok(dockedMix.cabinGain > 0.18 && dockedMix.planetGain > 0.08);
  assert.equal(dockedMix.driveGain, 0);
  assert.equal(dockedMix.rcsGain, 0);
  assert.equal(dockedMix.sheathGain, 0);

  const burnMix = AudioEng.computeMixTargets({
    docked: false, mode: 'orbit', screen: 'helm',
    thrustG: 1.5, thermal: { coreHeat: 0.4 }, rcsTorque: [0.6, 0, 0]
  }, defCfg);
  assert.ok(burnMix.driveGain > 0.25 && burnMix.driveCutoff > 1000 && burnMix.rcsGain > 0.15);

  const cruiseMix = AudioEng.computeMixTargets({
    docked: false, mode: 'interstellar', inDeepSpace: true, screen: 'helm',
    beta: 0.99, gamma: 7.1, thrustG: 1.0
  }, defCfg);
  assert.ok(cruiseMix.musicIstlGain > 0.2 && cruiseMix.musicOrbitalGain === 0);
  assert.ok(cruiseMix.istlGain > 0.08);
  assert.equal(cruiseMix.planetGain, 0);
  assert.ok(cruiseMix.sheathGain > 0.12 && cruiseMix.sheathRate > 1.3 && cruiseMix.sheathCutoff > 6000);

  const harvestMix = AudioEng.computeMixTargets({
    docked: false, mode: 'orbit', screen: 'helm', iceHarvest: { active: true }
  }, defCfg);
  assert.ok(harvestMix.harvestGain > 0.15);

  const combatMix = AudioEng.computeMixTargets({
    docked: false, mode: 'orbit', screen: 'helm',
    combat: { alertS: 12, hostileCount: 1 }
  }, defCfg);
  assert.ok(combatMix.musicCombatGain > 0.25 && combatMix.musicOrbitalGain < 0.10);

  const mutedMix = AudioEng.computeMixTargets({ docked: false, thrustG: 1.5 }, Object.assign({}, defCfg, { enabled: false }));
  assert.equal(mutedMix.masterGain, 0);

  const ctrl = AudioEng.create({ baseUrl: 'prototypes/lighthugger/audio/' });
  assert.equal(await ctrl.preload(), false);
  ctrl.update({ docked: false, mode: 'orbit', thrustG: 1.5 }, 0.016);
  for (const uiKind of ['click', 'toggle', 'tab', 'confirm', 'deny', 'caution', 'alarm']) {
    ctrl.playUi(uiKind);
  }
  const toggled = ctrl.toggleMute();
  assert.equal(toggled.enabled, false);
  const patched = ctrl.setConfig({ enabled: true, master: 0.5, music: 0.4 });
  assert.equal(patched.master, 0.5);
  assert.equal(patched.music, 0.4);
  const diag = ctrl.getDiagnostics();
  assert.equal(diag.supported, false);
  assert.equal(diag.muted, false);
  assert.ok(Array.isArray(diag.activeLayers) && diag.activeLayers.includes('music-orbital'));
});

test('Round 15: combat damage tracking, target destruction, hostile retaliation, Titan zero-bounce impact, and recommission', async () => {
  const app = await loadAppHarness();
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();

  // Lock station and engage
  const lock1 = app.toggleWeaponLock();
  assert.ok(lock1 && lock1.destructible && lock1.id === 'body:station');
  assert.equal(app.fireWeaponPulse(), true);
  const afterShot1 = app.getSnapshot();
  const stAfter1 = afterShot1.combat.entities['body:station'];
  assert.ok(afterShot1.weaponEvent.hit && stAfter1 && stAfter1.hostile === true && stAfter1.hull < stAfter1.maxHull);

  // Docking is denied at a hostile station
  assert.equal(app.dock(), false);

  // Step combat -> hostile station (and escorts) retaliate, damaging player ice & hull across damaged/critical states
  let sawEnemyFire = false, sawDamaged = false, sawCritical = false;
  for (let i = 0; i < 40; i++) {
    app.stepCombat(1.0);
    const sn = app.getSnapshot();
    if (sn.combat.enemyWeaponEvent && sn.combat.playerHitSeq > 0) sawEnemyFire = true;
    if (sn.damageState === 'damaged') sawDamaged = true;
    if (sn.damageState === 'critical') sawCritical = true;
    if (sn.destroyed) break;
  }
  assert.ok(sawEnemyFire && sawDamaged && sawCritical, 'expected enemy retaliation fire and damaged/critical states');
  assert.equal(app.getSnapshot().destroyed, true);
  assert.ok(app.getSnapshot().combat.explosionEvent && app.getSnapshot().combat.explosionEvent.isPlayer);

  // Recommission restores 100% hull/ice and clears system hostility
  assert.equal(app.recommissionShip(), true);
  const restored = app.getSnapshot();
  assert.equal(restored.destroyed, false);
  assert.equal(restored.hullIntegrity, 1);
  assert.equal(restored.iceIntegrity, 1);
  assert.equal(restored.damageState, 'nominal');

  // Re-engage and destroy the station completely
  app.undock();
  app.toggleWeaponLock();
  for (let s = 0; s < 15; s++) {
    if (app.getCombatState().entities['body:station']?.destroyed) break;
    app.fireWeaponPulse();
  }
  const stKill = app.getSnapshot();
  const stDead = stKill.combat.entities['body:station'];
  assert.ok(stDead && stDead.destroyed && stDead.hull === 0);
  assert.ok(stKill.combat.kills >= 1 && stKill.combat.explosionEvent && !stKill.combat.explosionEvent.isPlayer);

  // Titan direct surface impact arrests cleanly at surface with ZERO bounce (altKm < 120 km)
  app.recommissionShip();
  app.undock();
  const sys0 = galaxy.SYSTEMS[0], saturn = sys0.planets[0], titan = saturn.moons[0];
  assert.equal(app.switchPhysicsPrimary({ kind: 'moon', planetIdx: 0, moonIdx: 0 }), true);
  app.orbit.rKm = [titan.radiusKm + 260, 0, 0];
  app.orbit.vKmS = [-3.5, 0.2, 0];
  app.step(120, 0.05, false);
  const crashed = app.getSnapshot();
  assert.ok(crashed.lastImpact && /titan/i.test(crashed.lastImpact.bodyName));
  assert.equal(crashed.destroyed, true);
  assert.equal(crashed.hullIntegrity, 0);
  assert.ok(crashed.orbit.altKm >= 0 && crashed.orbit.altKm < 120,
    'expected Titan crash arrested near surface without 1.75R bounce, got altKm=' + crashed.orbit.altKm);
  assert.equal(app.recommissionShip(), true);
});

test('Round 16A: endless 50 LY rolling frontier, inhabited vs uninhabited systems, and Milky Way galactocentric mapping', () => {
  const originDeep = [320, 0, -240];
  const added1 = galaxy.ensureSectorsNear(originDeep, 55);
  const countAfterFirst = galaxy.DYNAMIC_SYSTEMS.length;
  assert.ok(Array.isArray(added1) && countAfterFirst >= 6, 'expected procedural sector systems beyond curated frontier');
  const added2 = galaxy.ensureSectorsNear(originDeep, 55);
  assert.equal(galaxy.DYNAMIC_SYSTEMS.length, countAfterFirst, 'ensureSectorsNear must not duplicate already-seeded sectors');
  assert.equal(added2.length, added1.length, 'cached sector query returns consistent system set');

  let hasInhabited = false, hasUninhabited = false;
  for (const s of galaxy.DYNAMIC_SYSTEMS) {
    assert.ok(s.signalId && /^SIG-/.test(s.signalId), 'every sector star needs an unidentified signalId');
    assert.ok(Array.isArray(s.planets) && s.planets.length >= 1, 'every star system has planets');
    if (s.station) {
      hasInhabited = true;
      assert.ok(s.faction && s.station.name);
    } else {
      hasUninhabited = true;
      assert.match(s.name, /^(Gaia DR3|HIP|HD|TYC|2MASS)\s/, 'uninhabited star uses catalog name: ' + s.name);
    }
  }
  assert.ok(hasInhabited && hasUninhabited, 'frontier sectors must include both inhabited and uninhabited systems');

  const visSol = galaxy.getVisibleSystems([], [0, 0, 0]);
  assert.equal(visSol.length, 28, 'Sol starts with 28 core systems inside 50 LY');

  const mwSol = galaxy.getMilkyWayInfo([0, 0, 0]);
  assert.ok(mwSol.galRadiusLy > 25000 && mwSol.galRadiusLy < 28500 && mwSol.sectorLabel === 'ORION SPUR', 'Sol sits ~26.6 kLY in Orion Spur');
  const mwFar = galaxy.getMilkyWayInfo([10000, 0, 0]);
  assert.ok(Math.abs(mwFar.galRadiusLy - mwSol.galRadiusLy) > 500 && mwFar.solDistLy === 10000);
});

test('Round 16B: weapon budget enforcement vs hull/core/radiator specs and LH3 share code round-trip', () => {
  const stock = G.PRESETS[0];
  const stockB = G.computeWeaponBudget(stock);
  assert.equal(stockB.withinBudget, true);
  assert.deepEqual(stockB.counts, { rail: 4, fel: 2, lance: 2, missile: 2, pdc: 2 });

  // Sleek twin low-nacelle hull overloaded with heavy energy weapons exceeds power/heat budget
  const overloaded = G.normalize({
    seed: stock.seed,
    name: 'Overloaded Sleek',
    P: Object.assign({}, stock.P, {
      arch: 'twin-v', nacelleSize: 0.05, fins: 0, habRing: false, styleSleek: 1.0, styleCoade: 0.0,
      wpnRail: 6, wpnFel: 4, wpnLance: 4, wpnMissile: 4, wpnPdc: 4
    })
  });
  const overB = G.computeWeaponBudget(overloaded);
  assert.equal(overB.withinBudget, false);
  assert.ok(overB.overPower || overB.overHeat);

  // CoaDE high-radiator quad hull has substantially higher budgets
  const dreadnought = G.normalize({
    seed: stock.seed,
    name: 'CoaDE Cruiser',
    P: Object.assign({}, stock.P, {
      arch: 'quad', nacelleSize: 0.95, fins: 6, habRing: true, styleCoade: 1.0, styleSleek: 0.0,
      wpnRail: 5, wpnFel: 2, wpnLance: 3, wpnMissile: 4, wpnPdc: 3
    })
  });
  const dreadB = G.computeWeaponBudget(dreadnought);
  assert.ok(dreadB.powerBudgetMW > overB.powerBudgetMW && dreadB.heatBudgetMW > overB.heatBudgetMW);
  assert.equal(dreadB.withinBudget, true);

  const code = G.encodeShareCode(dreadnought);
  assert.ok(code.startsWith('LH3-'));
  const decoded = G.decodeShareCode(code);
  assert.equal(decoded.P.wpnRail, 5);
  assert.equal(decoded.P.wpnFel, 2);
  assert.equal(decoded.P.wpnLance, 3);
  assert.equal(decoded.P.wpnMissile, 4);
  assert.equal(decoded.P.wpnPdc, 3);
});

test('Round 16C: real curved Keplerian orbital projectiles and ProNav AI missile intercept', () => {
  const muE = 398600.4418, earthR = 6371;
  // Unguided coilgun slug curves noticeably under planetary gravity over 60s
  const slug = {
    id: 'test-slug',
    kind: 'rail',
    rKm: [7200, 0, 0],
    vKmS: [2.0, 9.5, 0.5],
    ageS: 0,
    hitRadiusKm: 4
  };
  let defl = 0;
  for (let i = 0; i < 6; i++) {
    const r = O.stepOrbitalProjectile(slug, 10, muE, earthR, null);
    defl = r.gravDeflectionKm;
  }
  assert.ok(defl > 10, 'expected real Keplerian curvature deflection > 10 km, got ' + defl);

  // AI-guided orbital missile curves and intercepts a moving orbiting target
  const t0 = O.elementsToState({ rp: 7350, e: 0.04, iRad: 0.08, nuRad: 0.05, argPeriRad: 0.1, omegaAscRad: 0 }, muE);
  const m0 = O.elementsToState({ rp: 7180, e: 0.02, iRad: 0.0, nuRad: 0.0, argPeriRad: 0.1, omegaAscRad: 0 }, muE);
  const missile = {
    id: 'test-msl',
    kind: 'missile',
    rKm: m0.rKm.slice(),
    vKmS: [m0.vKmS[0] + 3.0, m0.vKmS[1] + 2.0, m0.vKmS[2] + 1.0],
    aMaxKmS2: 0.55,
    fuelS: 90,
    navGain: 4.4,
    hitRadiusKm: 10,
    ageS: 0
  };
  let tgt = { rKm: t0.rKm.slice(), vKmS: t0.vKmS.slice() };
  let sawBurning = false, intercepted = false;
  for (let s = 0; s < 160; s++) {
    const dt = 0.5;
    const stepT = O.stepOrbitalState(tgt.rKm, tgt.vKmS, [0, 0, 0], dt, muE);
    tgt = { rKm: stepT.rKm, vKmS: stepT.vKmS };
    const res = O.stepOrbitalProjectile(missile, dt, muE, earthR, tgt);
    if (missile.burning) sawBurning = true;
    if (res.hit) { intercepted = true; break; }
  }
  assert.ok(sawBurning, 'missile thruster should fire under AI guidance');
  assert.ok(intercepted, 'AI orbital missile should intercept moving orbital target');
});

test('Round 16D: exact 3D relativistic contact addition, boost-axis aberration, and Doppler factor', () => {
  // Collinear verification against exact 1D Lorentz subtraction
  const col = O.computeRelativisticContact3D([0.6, 0, 0], [-0.6, 0, 0], [1, 0, 0]);
  const expectedBetaRel = (0.6 + 0.6) / (1 + 0.6 * 0.6);
  near(col.betaRelMag, expectedBetaRel, 1e-6);
  near(col.gammaRel, 1 / Math.sqrt(1 - expectedBetaRel * expectedBetaRel), 1e-5);
  assert.ok(col.D > 1, 'oncoming target must blueshift (D > 1), got ' + col.D);

  // Full 3D oblique boost verification (no hardcoded +X bias)
  const bo = [0.42, 0.51, -0.28];
  const bt = [-0.25, 0.35, 0.40];
  const restDir = unitVec([0.3, -0.7, 0.65]);
  const rel3d = O.computeRelativisticContact3D(bo, bt, restDir);
  assert.ok(rel3d.betaRelMag > 0 && rel3d.betaRelMag < 1);
  near(rel3d.gammaRel, 1 / Math.sqrt(1 - rel3d.betaRelMag * rel3d.betaRelMag), 1e-5);
  assert.ok(rel3d.D > 0 && Number.isFinite(rel3d.D));

  const boHat = unitVec(bo);
  const dotRest = restDir[0] * boHat[0] + restDir[1] * boHat[1] + restDir[2] * boHat[2];
  const dotObs = rel3d.obsDirGal[0] * boHat[0] + rel3d.obsDirGal[1] * boHat[1] + rel3d.obsDirGal[2] * boHat[2];
  assert.ok(dotObs > dotRest, '3D aberration must fold apparent direction toward 3D observer boost vector');
});

test('Round 17: orbital coilgun ship-relative trail stays aligned along boresight at high warp while inertial path curves under gravity', async () => {
  const app = await loadAppHarness();
  app.stopAll();
  app.enterSystemOrbit('sol', true);
  app.undock();
  app.setAttitudeMode('normal');
  for (let i = 0; i < 35; i++) app.step(1.5, 0.05, false);
  app.setAttitudeMode('manual');
  app.state.hudWeapons = true;
  app.state.weaponLockOn = false;

  const aimGal = app.state.basis.f.slice();
  const vHat = unitVec(app.orbit.vKmS);
  const aimDotV = Math.abs(aimGal[0] * vHat[0] + aimGal[1] * vHat[1] + aimGal[2] * vHat[2]);
  assert.ok(aimDotV < 0.2, 'expected aim direction nearly perpendicular to orbital velocity, got dot=' + aimDotV);

  assert.equal(app.fireWeaponPulse(), true);
  for (let i = 0; i < 8; i++) app.step(1.36, 0.016, false, true);

  const rail = (app.getSnapshot().projectiles || []).find(p => p.kind === 'rail');
  assert.ok(rail && Array.isArray(rail.relTrailKm) && rail.relTrailKm.length >= 3, 'expected railgun projectile with ship-relative trail');
  const relUnit = unitVec(rail.relRKm);
  const boreDot = relUnit[0] * aimGal[0] + relUnit[1] * aimGal[1] + relUnit[2] * aimGal[2];
  assert.ok(boreDot > 0.985, 'expected ship-relative coilgun trajectory aligned along boresight without 90 deg kink, got dot=' + boreDot);

  for (let k = 1; k < rail.relTrailKm.length; k++) {
    const seg = rail.relTrailKm[k];
    const segU = unitVec(seg);
    const segDot = segU[0] * aimGal[0] + segU[1] * aimGal[1] + segU[2] * aimGal[2];
    assert.ok(segDot > 0.97, 'expected relTrailKm[' + k + '] forward along boresight, got dot=' + segDot);
  }

  const tailIn = rail.trailKm[rail.trailKm.length - 1];
  const headIn = rail.trailKm[0];
  const dIn = unitVec([tailIn[0] - headIn[0], tailIn[1] - headIn[1], tailIn[2] - headIn[2]]);
  const inOrbitDot = dIn[0] * vHat[0] + dIn[1] * vHat[1] + dIn[2] * vHat[2];
  assert.ok(inOrbitDot > 0.5, 'inertial Keplerian slug path must still carry orbital velocity around primary, got dot=' + inOrbitDot);
});

function unitVec(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}
})();
