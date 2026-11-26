(function (root) {
  'use strict';

  const TAU = 2*Math.PI, origin = [0,0,0];
  const px = [1,0,0], py = [0,1,0], pz = [0,0,1];
  const add = (a,b) => a.map((x,i)=>x+b[i]);
  const sub = (a,b) => a.map((x,i)=>x-b[i]);
  const scale = (a,k) => a.map(x=>x*k);
  const dot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm = a => Math.hypot(...a);
  const unit = a => scale(a,1/(norm(a)||1));
  const clamp = (x,min,max) => Math.max(min,Math.min(max,x));
  const valid = a => Array.isArray(a) && a.length===3 && a.every(Number.isFinite);
  const mix = (a,b,t) => a+(b-a)*t;
  const fade = (x,start,end) => {
    const t=clamp(Math.log(x/start)/Math.log(end/start),0,1);
    return t*t*(3-2*t);
  };

  function circle(center,radius,axisA=px,axisB=py) {
    return Array.from({length:97},(_,i)=>{
      const t = TAU*i/96;
      return add(center,add(scale(axisA,radius*Math.cos(t)),scale(axisB,radius*Math.sin(t))));
    });
  }

  function create(canvasEl,callbacks={}) {
    const O=root.LighthuggerOrbits, G=root.LighthuggerGalaxy;
    const ctx=canvasEl.getContext('2d');
    const originalTouchAction=canvasEl.style.touchAction;
    canvasEl.style.touchAction='none';
    const camera={yaw:0.3,pitch:0.94,zoom:1,panX:0,panY:0,panZ:0};
    let snap={}, options={}, system, world, plan, chain, frame='planet', planetIdx=0, moonIdx=0;
    let framePicked=false, synodicStar=false, showHill=true, showLagrange=true, showIceDeposits=true, selectedBurnIdx=-1;
    let lastPrimaryKey='';
    let burns=[], nextId=1, hits=[], gizmoHandles6=[], hillCount=0, lagrangeCount=0, iceDepositCount=0;
    let burnArcCount=0, closestApproach=null;
    let shipScreenPos=null, transferPreviewDrawn=false, centeredOnShip=false;
    let coast, preview, track=[], hover=null, focusAnimation=0;
    const originalCursor=canvasEl.style.cursor;
    canvasEl.style.cursor='grab';
    let w=1,h=1,view,drag,pinch,pendingUpdate,disposed=false,requestedRadius=null;
    const pointers=new Map();
    const events=[];
    const placedLabels=[];
    const numeric=value=>Number.isFinite(Number(value))?Number(value):0;

    function state(ref,t=snap.simTimeS||0) {
      return G.getBodyWorldState(system,ref,t);
    }

    function body(ref) {
      const {kind,planetIdx:pi,moonIdx:mi}=ref;
      const planet=system.planets[pi];
      if (kind==='star') return {name:system.name,radiusKm:system.starRadiusKm,muKm3S2:system.muStarKm3S2};
      if (kind==='station') return system.station;
      return kind==='moon' ? planet?.moons?.[mi] : planet;
    }

    function stationRef() {
      return system.station && {kind:'station',planetIdx:system.station.parentPlanetIdx};
    }

    function targetEntry() {
      return snap.targetOrbits?.find(item=>item.id===options.selectedTargetId);
    }

    function targetRef() {
      const id=options.selectedTargetId;
      if (!id || id==='custom') return null;
      const ref=targetEntry()?.focusRef;
      if (ref?.kind==='station' || id==='station' || id===system.station?.id) return stationRef();
      if (ref && ['star','planet','moon'].includes(ref.kind) && body(ref)) return ref;
      for (const [pi,planet] of system.planets.entries()) {
        if (planet.id===id) return {kind:'planet',planetIdx:pi};
        const mi=planet.moons.findIndex(moon=>moon.id===id);
        if (mi>=0) return {kind:'moon',planetIdx:pi,moonIdx:mi};
      }
      return null;
    }

    function fallbackTargetRef() {
      const station=stationRef(), moon={kind:'moon',planetIdx,moonIdx:0};
      return station?.planetIdx===planetIdx ? station : body(moon) ? moon : station;
    }

    function flight() {
      const orbit=snap.orbit, kind=orbit?.primary||orbit?.focusSoi||'planet';
      if (!valid(orbit?.rKm) || !valid(orbit?.vKmS) || norm(orbit.rKm)===0) return null;
      const ref={kind,planetIdx:orbit.planetIdx??0,moonIdx:orbit.moonIdx??0};
      const b=body(ref);
      if (b && !(b.muKm3S2>0) && O.ensureBodyGravity) {
        const parent=kind==='moon'?system.planets[ref.planetIdx]:null;
        O.ensureBodyGravity(b,parent,kind==='moon');
      }
      const mu=orbit.mu||orbit.muKm3S2||b?.muKm3S2;
      return mu>0 ? {ref,mu,r:orbit.rKm,v:orbit.vKmS} : null;
    }

    function secondaryPair() {
      const primary={kind:'planet',planetIdx};
      const moon={kind:'moon',planetIdx,moonIdx};
      return frame==='star' || (frame==='synodic' && synodicStar) || !body(moon)
        ? [{kind:'star'},primary] : [primary,moon];
    }

    function makeWorld() {
      const epoch=snap.simTimeS||0;
      const star={kind:'star'}, planet={kind:'planet',planetIdx}, moon={kind:'moon',planetIdx,moonIdx};
      const [primary,secondary]=secondaryPair();
      const target=frame==='target' ? movingTarget(false) : null;
      const center=frame==='star' ? star : frame==='moon' && body(moon) ? moon : frame==='synodic' ? primary : planet;
      const c=target ? target.at(0).r : state(center,epoch).rKm;
      const a=state(primary,epoch), b=state(secondary,epoch);
      const r=sub(b.rKm,a.rKm), v=sub(b.vKmS,a.vKmS);
      const er=unit(r), en=unit(cross(r,v)), et=cross(en,er);
      const rate=norm(v)/norm(r);
      const focalBody=body(center);
      const starView=center.kind==='star';
      const moonView=center.kind==='moon';
      const systemRefs=[star,...system.planets.map((_,i)=>({kind:'planet',planetIdx:i}))];
      const localRefs=body(planet).moons.map((_,i)=>({kind:'moon',planetIdx,moonIdx:i}));
      if (system.station?.parentPlanetIdx===planetIdx) localRefs.push(stationRef());
      const bodies=[...systemRefs,...localRefs].map(ref=>{
        const data=body(ref), radius=data.orbitRadiusKm ?? (data.orbitRadiusAU||0)*O.AU_KM;
        const parent=ref.kind==='planet' ? star : planet;
        const parentData=body(parent);
        if ((ref.kind==='moon' || ref.kind==='planet') && O.ensureBodyGravity) {
          O.ensureBodyGravity(data,parentData,ref.kind==='moon');
        }
        const parentKm=ref.kind==='star' ? origin : state(parent,epoch).rKm;
        const hill=ref.kind==='moon' || ref.kind==='planet'
          ? O.computeHillRadiusKm(radius,data.muKm3S2,parentData.muKm3S2) : 0;
        return {ref,data,radius,hill,parentKm,rKm:state(ref,epoch).rKm};
      });
      const host=bodies[planetIdx+1], systemBodies=bodies.slice(0,systemRefs.length);
      const localBodies=bodies.slice(systemRefs.length);
      const activeMoon=moonView ? localBodies[moonIdx] : null;
      const localLimit=Math.max(host.hill,host.data.radiusKm*5,...localBodies.map(item=>item.radius));
      const outerOrbit=Math.max(O.AU_KM,...systemBodies.map(item=>item.radius));
      const veilStart=system.id==='sol' ? 35*O.AU_KM : 1.5*outerOrbit;
      const boundary=Math.max(120*O.AU_KM,veilStart*1.55);
      const moonLimit=Math.max(12e3,host.data.radiusKm*2,...localBodies.filter(item=>item.ref.kind==='moon')
        .map(item=>Math.min(item.hill*1.38,host.data.radiusKm*3)));
      const defaultBodies=starView ? systemBodies : [host,...localBodies];
      const lagrange=O.computeLagrangePoints(a.rKm,b.rKm,body(primary).muKm3S2,body(secondary).muKm3S2,v)
        .map(point=>({point,loop:O.sampleLissajousOrbit(point,b.rKm,body(primary).muKm3S2,body(secondary).muKm3S2,{rPrimaryKm:a.rKm})}));
      let extent=activeMoon ? Math.max(focalBody.radiusKm*3.8,activeMoon.hill*1.38)
        : Math.max(focalBody.radiusKm*3.8,...defaultBodies.filter(item=>item.ref.kind!==center.kind)
          .map(item=>norm(sub(item.rKm,c))+item.hill),
        frame==='synodic' ? norm(r)*1.25 : 0)*1.20;
      const baseExtent=extent;
      if (frame==='planet' && plan?.ref.planetIdx===planetIdx && plan.ref.kind!=='star') {
        const offset=sub(state(plan.ref,epoch).rKm,c);
        const base=Math.max(focalBody.radiusKm*3.6,norm(add(offset,plan.r))*1.95);
        const reach=Math.max(targetEntry()?.radiusKm||0,snap.orbits?.target?.el?.ra||0,
          options.selectedTargetId==='custom'?snap.customOrbitKm||0:0);
        extent=Math.max(base,Math.min(base*30,reach*1.16));
        for (const segment of chain.segments) for (const p of segment.points) {
          extent=Math.max(extent,Math.min(base*30,norm(add(offset,p))*1.16));
        }
      } else if (frame==='moon' && plan?.ref.kind==='moon' && plan.ref.planetIdx===planetIdx && plan.ref.moonIdx===moonIdx) {
        const base=Math.max(focalBody.radiusKm*3.8,norm(plan.r)*2.1);
        extent=Math.max(base,activeMoon?activeMoon.hill*0.65:0);
        for (const segment of chain.segments) for (const p of segment.points) {
          extent=Math.max(extent,Math.min(base*24,norm(p)*1.16));
        }
      }
      const iceDeposits=(G.getSystemIceDeposits ? G.getSystemIceDeposits(system) : []).map(dep=>({
        dep,
        state:G.getIceDepositWorldState ? G.getIceDepositWorldState(system,dep,epoch) : {rKm:[0,0,0],vKmS:[0,0,0]}
      }));
      return {epoch,c,center,target,primary,secondary,a,b,bodies,lagrange,iceDeposits,extent,baseExtent,er,en,et,
        rate,focalBody,moonView,activeMoon,localLimit,moonLimit,outerOrbit,veilStart,boundary};
    }

    function updateWorld() {
      system=snap.system?.planets ? snap.system : G?.SYSTEMS.find(s=>s.id===(snap.systemId||snap.currentSystemId||'sol')) || G?.SYSTEMS[0];
      if (!O || !system) return;
      planetIdx=clamp(Number.isInteger(planetIdx)?planetIdx:0,0,system.planets.length-1);
      moonIdx=clamp(Number.isInteger(moonIdx)?moonIdx:0,0,Math.max(0,system.planets[planetIdx].moons.length-1));
      replan();
      world=makeWorld();
      preview=makeTransfer();
      if (preview?.isBrachistochrone) {
        for (const [i,p] of preview.points.entries()) {
          world.extent=Math.max(world.extent,norm(fromFlight(p,preview.times[i],preview.ref))*1.16);
        }
      } else if (frame==='planet' && preview && plan.ref.kind==='planet' && plan.ref.planetIdx===planetIdx) {
        const radius=preview.target?.ra;
        if (Number.isFinite(radius)) world.extent=Math.max(world.extent,Math.min(world.extent*30,radius*1.16));
      }
      if (centeredOnShip && !focusAnimation && plan) {
        [camera.panX,camera.panY,camera.panZ]=fromFlight(plan.r);
      }
      if (!plan && centeredOnShip) cancelFocus();
      updateClosestApproach();
    }

    function replan() {
      plan = system ? flight() : null;
      chain = plan ? O.propagateManeuverChain(plan.r,plan.v,plan.mu,burns) : null;
      coast=chain && (burns.length ? O.propagateManeuverChain(plan.r,plan.v,plan.mu) : chain).segments[0];
    }

    function locate(p,dt=0) {
      if (world.target) return sub(p,dt ? world.target.at(dt).r : world.c);
      if (frame!=='synodic') return sub(p,world.c);
      const center=dt ? state(world.center,world.epoch+dt).rKm : world.c;
      const q=sub(p,center), x=dot(q,world.er), y=dot(q,world.et);
      const angle=dt*world.rate, c=Math.cos(angle), s=Math.sin(angle);
      return [x*c+y*s,y*c-x*s,dot(q,world.en)];
    }

    function fromFlight(p,dt=0,ref=plan.ref) {
      if (world.target) return add(p,sub(state(ref,world.epoch+dt).rKm,world.target.at(dt).r));
      const epoch=world.epoch+(frame==='synodic'?dt:0);
      return locate(add(p,state(ref,epoch).rKm),dt);
    }

    function defaultRadius() {
      return closestApproach?.extent || world.extent;
    }

    function clampRadius(radius) {
      return clamp(radius,1500,Math.max(150*O.AU_KM,1.25*world.boundary));
    }

    function setProjection() {
      const c=Math.cos(camera.yaw), s=Math.sin(camera.yaw);
      const si=Math.sin(camera.pitch), co=Math.cos(camera.pitch);
      const right=[c,s,0], up=[-s*si,c*si,co], towards=cross(right,up);
      const extent=defaultRadius(), radius=clampRadius(requestedRadius??extent);
      camera.zoom=extent/radius;
      const systemStart=3*world.localLimit;
      const systemAlpha=fade(radius,systemStart/2,systemStart*2);
      const veilAlpha=fade(radius,world.veilStart,world.boundary*0.86);
      const distance=Math.max(radius,Math.min(frame==='planet'?Math.max(extent,world.baseExtent):extent,radius*3))*3.4;
      let cx=w/2, cy=h/2, viewH=h, safeTop=0, safeBottom=h;
      const openEl=canvasEl.closest?.('#lh-screen-orbits')?.querySelector('.lh-chrono-viewport');
      if (openEl && canvasEl.getBoundingClientRect) {
        const cRect=canvasEl.getBoundingClientRect();
        const oRect=openEl.getBoundingClientRect();
        if (oRect.height>40) {
          safeTop=Math.max(0,oRect.top-cRect.top);
          safeBottom=Math.min(h,oRect.bottom-cRect.top);
          viewH=Math.max(80,safeBottom-safeTop);
          cy=(safeTop+safeBottom)*0.5;
        }
      }
      const focal=Math.min(w,viewH)*0.44*distance/radius;
      const viewScale=radius>=world.veilStart?'veil':radius>=systemStart?'system':
        radius<=world.moonLimit?'moon':'planet';
      view={right,up,towards,distance,focal,radius,viewScale,systemAlpha,veilAlpha,
        pan:[camera.panX,camera.panY,camera.panZ],cx,cy,safeTop,safeBottom};
    }

    function project(p) {
      const q=sub(p,view.pan);
      const depth=view.distance-dot(q,view.towards);
      if (depth<view.distance*0.018) return null;
      const k=view.focal/depth;
      return {x:view.cx+k*dot(q,view.right),y:view.cy-k*dot(q,view.up),depth,k};
    }

    function stroke(points,color,width=1,glow=0,dashes) {
      ctx.save();
      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.shadowBlur=glow;
      ctx.shadowColor=color;
      if (dashes) ctx.setLineDash(dashes);
      ctx.beginPath();
      let previous=null;
      for (const p of points) {
        if (p) {
          if (previous) ctx.lineTo(p.x,p.y);
          else ctx.moveTo(p.x,p.y);
        }
        previous=p;
      }
      ctx.stroke();
      ctx.restore();
    }

    function worldPath(points,color,width,glow,dashes) {
      stroke(points.map(p=>project(locate(p))),color,width,glow,dashes);
    }

    function dotAt(p,r,color) {
      ctx.fillStyle=color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,r,0,TAU);
      ctx.fill();
    }

    function label(p,text,color,dx=7,dy=-7,nudge=false) {
      ctx.save();
      ctx.font='11px "Share Tech Mono", monospace';
      ctx.lineWidth=3;
      ctx.strokeStyle='#050911';
      ctx.fillStyle=color;
      const x=p.x+dx;
      let y=p.y+dy;
      if (nudge && x<w && y>=0 && y<h+10 && h>=14) {
        const width=ctx.measureText(text).width;
        if (x+width>0) y=placeLabel(x,y,width,dy);
      }
      ctx.strokeText(text,x,y);
      ctx.fillText(text,x,y);
      ctx.restore();
    }

    function placeLabel(x,y,width,dy) {
      const lineHeight=18, yMin=Math.max(14,(view?.safeTop||0)+14), yMax=Math.max(yMin+18,(view?.safeBottom||h)-6);
      const right=x+Math.max(70,width+10);
      const nearby=placedLabels.filter(box=>x<box.right && right>box.x);
      const isClear=baseline=>nearby.every(box=>Math.abs(baseline-box.y)>=lineHeight);
      const start=clamp(y,yMin,yMax);
      const direction=dy<0?-1:1;
      let baseline=start;
      if (!isClear(start)) {
        for (let offset=lineHeight; start-offset>=yMin || start+offset<=yMax; offset+=lineHeight) {
          const open=[start+direction*offset,start-direction*offset]
            .find(candidate=>candidate>=yMin && candidate<=yMax && isClear(candidate));
          if (open!==undefined) {
            baseline=open;
            break;
          }
        }
      }
      placedLabels.push({x,right,y:baseline});
      return baseline;
    }

    function arrow(a,b,color) {
      if (!a || !b) return;
      const dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);
      if (n<0.5) return;
      const x=dx/n,y=dy/n;
      stroke([{x:b.x-8*x-3*y,y:b.y-8*y+3*x},b,{x:b.x-8*x+3*y,y:b.y-8*y-3*x}],color,1.3);
    }

    function hit(p,entry,r) {
      hits.push({...entry,x:p.x,y:p.y,r});
    }

    function drawGrid() {
      const R=view.radius;
      for (let i=-5;i<=5;i++) {
        const d=i*R/5;
        const color=i?'rgba(126,237,166,0.06)':'rgba(126,237,166,0.16)';
        stroke([[-R,d,0],[R,d,0]].map(project),color);
        stroke([[d,-R,0],[d,R,0]].map(project),color);
      }
    }

    function drawHill(item,p) {
      const R=item.hill, width=p.k*R;
      if (!(R>0) || !showHill) return;
      hillCount++;
      const center=item.rKm;
      for (const [a,b] of [[px,py],[px,pz],[py,pz]]) {
        worldPath(circle(center,R,a,b),'rgba(124,192,255,0.37)');
      }
      if (width>=1 && width < 3*Math.max(w,h)) {
        const rim=ctx.createRadialGradient(p.x,p.y,width*0.55,p.x,p.y,width);
        rim.addColorStop(0,'rgba(91,170,251,0)');
        rim.addColorStop(0.88,'rgba(91,170,251,0.035)');
        rim.addColorStop(1,'rgba(91,170,251,0.18)');
        dotAt(p,width,rim);
        if (width>=12) label(p,'HILL r='+Math.round(R).toLocaleString('en-US')+' km','#86aecc',8,width+12,true);
      }
    }

    function drawSystemEnvironment() {
      const {systemAlpha,veilAlpha}=view;
      if (systemAlpha<=0) return;
      ctx.save();
      ctx.globalAlpha=systemAlpha;
      const AU=O.AU_KM, sol=system.id==='sol';
      const belts=sol ? [[2.12*AU,3.44*AU,'#ad9979'],[30*AU,50*AU,'#719faa']]
        : [[world.outerOrbit*0.28,world.outerOrbit*0.37,'#ad9979'],
          [world.outerOrbit*1.06,world.outerOrbit*1.58,'#719faa']];
      for (const [inner,outer,color] of belts) {
        for (let i=0;i<11;i++) {
          worldPath(circle(origin,mix(inner,outer,i/10)),color+(i%4===0?'3b':'26'),1,0,[1,4+i%3]);
        }
      }
      if (veilAlpha>0) {
        const outer=world.boundary*0.96, inner=Math.min(world.veilStart,outer*0.72);
        ctx.globalAlpha=veilAlpha;
        // Many low-opacity lanes give the annulus soft inner and outer edges.
        for (let i=1;i<32;i++) {
          const u=i/32, opacity=0.13*Math.sin(Math.PI*u)**1.5;
          worldPath(circle(origin,mix(inner,outer,u)),'rgba(127,212,234,'+opacity+')',
            Math.max(1.5,(outer-inner)*view.focal/view.distance/31*1.3),4);
        }
        const boundary=circle(origin,world.boundary).map(p=>project(locate(p)));
        stroke(boundary,'rgba(140,224,247,0.64)',1.4,4,[6,6]);
        function annotate(points,text,color) {
          const width=7+6*text.length;
          const p=points.find(p=>p && p.x>=12 && p.x<w-width &&
            p.y>(view.safeTop||0)+25 && p.y<(view.safeBottom||h)-24);
          if (p) label(p,text,color,7,-7,true);
        }
        annotate(circle(origin,mix(inner,outer,0.49)).map(p=>project(locate(p))),
          'SYSTEM VEIL / ICE CLOUD','#9de0ed');
        annotate(boundary,'HELIOPAUSE // INTERSTELLAR BOUNDARY','#a9f1ff');
      }
      ctx.restore();
    }

    function spreadSystemMarkers(foreground) {
      const systemMarkers=foreground.filter(({item,alpha})=>alpha>=0.13 &&
        (item.ref.kind==='star' || item.ref.kind==='planet')).sort((a,b)=>a.item.radius-b.item.radius);
      const placed=[];
      for (const marker of systemMarkers) {
        const {item,p}=marker;
        if (p.x<0 || p.x>w || p.y<0 || p.y>h) continue;
        const position={...p};
        for (let pass=0;pass<5;pass++) {
          for (const other of placed) {
            const dx=position.x-other.x, dy=position.y-other.y, distance=Math.hypot(dx,dy);
            if (distance>=20) continue;
            const angle=distance>0.01 ? Math.atan2(dy,dx) : (item.ref.planetIdx||0)*2.4;
            position.x+=Math.cos(angle)*(20-distance);
            position.y+=Math.sin(angle)*(20-distance);
          }
        }
        marker.position=position;
        placed.push(position);
      }
    }

    function drawBodies() {
      const foreground=[];
      const {systemAlpha}=view;
      const closeMoon=world.activeMoon ? 1-fade(view.radius,world.baseExtent,world.baseExtent*3) : 0;
      for (const item of world.bodies) {
        const {ref,data,radius,rKm,parentKm}=item;
        const isHost=ref.kind==='planet' && ref.planetIdx===planetIdx;
        const isSystem=ref.kind==='star' || ref.kind==='planet';
        const isFocus=ref.kind===world.center.kind &&
          (ref.kind==='star'||(ref.planetIdx===world.center.planetIdx && ref.moonIdx===world.center.moonIdx));
        const alpha=isSystem ? (isHost || isFocus ? 1 : systemAlpha) :
          (1-systemAlpha)*(item===world.activeMoon?1:1-closeMoon);
        if (alpha<=0.005) continue;
        const p=project(locate(rKm));
        const color=ref.kind==='station'?'#71f5f9':ref.kind==='moon'?'#c9cfff':'#f3d398';
        ctx.save();
        const orbitAlpha=isSystem ? systemAlpha : (1-systemAlpha)*(1-closeMoon);
        if (radius && orbitAlpha>0.005) {
          ctx.globalAlpha=orbitAlpha;
          const inc=data.incRad||0, selected=options.selectedTargetId===data.id;
          worldPath(circle(parentKm,radius,px,[0,Math.cos(inc),Math.sin(inc)]),
            selected?'#ddc050':'rgba(160,172,226,0.27)',selected?1.5:1);
        }
        ctx.globalAlpha=alpha*(1-systemAlpha);
        if (p && data.hasRings && p.k*data.radiusKm>0.75) {
          for (const [r,alpha] of [[1.24,0.48],[1.46,0.22],[1.77,0.36],[2.02,0.24],[2.27,0.56]]) {
            worldPath(circle(rKm,data.radiusKm*r),'rgba(230,195,141,'+alpha+')');
          }
        }
        if (item===world.activeMoon && closeMoon>0.005) {
          ctx.globalAlpha=closeMoon*alpha;
          for (const factor of [1.16,1.46,1.92]) {
            worldPath(circle(rKm,data.radiusKm*factor),'rgba(67,218,208,0.58)');
          }
        }
        ctx.globalAlpha=isSystem ? systemAlpha : alpha;
        if (p && ctx.globalAlpha>0.005) drawHill(item,p);
        ctx.restore();
        if (p) foreground.push({item,p,color,alpha});
      }
      spreadSystemMarkers(foreground);
      foreground.sort((a,b)=>b.p.depth-a.p.depth);
      for (const {item,p:physical,position:p=physical,color,alpha} of foreground) {
        const {ref,data}=item;
        const rad=clamp((data.radiusKm||0)*p.k,ref.kind==='star'?5:3,2*Math.max(w,h));
        if (p.x<-rad || p.x>w+rad || p.y<-rad || p.y>h+rad) continue;
        ctx.save();
        ctx.globalAlpha=alpha;
        if (Math.hypot(p.x-physical.x,p.y-physical.y)>0.75) {
          stroke([physical,p],'rgba(200,209,228,0.38)');
        }
        if (ref.kind==='station') {
          ctx.strokeStyle=color;
          ctx.strokeRect(p.x-3.5,p.y-3.5,7,7);
        } else {
          const g=ctx.createRadialGradient(p.x-rad*0.27,p.y-rad*0.3,0,p.x,p.y,rad);
          g.addColorStop(0,color);
          g.addColorStop(1,ref.kind==='star'?'#d78d42':'#182033');
          dotAt(p,rad,g);
        }
        const id=ref.kind==='station'?'station':data.id;
        const target=world.target?.ref;
        if (target?.kind!==ref.kind || target.planetIdx!==ref.planetIdx || target.moonIdx!==ref.moonIdx) {
          label(p,data.name.toUpperCase(),color,rad+6,-7,true);
        }
        if (alpha>=0.13) hit(p,{id,kind:ref.kind,planetIdx:ref.planetIdx,moonIdx:ref.moonIdx,label:data.name},
          Math.max(9,Math.min(rad,24)));
        ctx.restore();
      }
    }

    function drawIceDeposits() {
      if (!showIceDeposits || !world?.iceDeposits?.length) return;
      const activeId=(snap.iceHarvest?.active && snap.iceHarvest.depositId)
        || (snap.multiHop?.harvestSite?.depositId) || null;
      for (const {dep,state:st} of world.iceDeposits) {
        const isActive=!!(activeId && dep.id===activeId);
        const isLocalPlanet=dep.ref?.kind==='planet' && dep.ref.planetIdx===planetIdx;
        let alpha=dep.ref?.kind==='star'
          ? Math.max(0.28,view.systemAlpha)*(1-view.veilAlpha*0.85)
          : isLocalPlanet ? (1-view.veilAlpha*0.7) : view.systemAlpha;
        if (isActive) alpha=Math.max(alpha,0.92);
        if (alpha<=0.01) continue;
        const p=project(locate(st.rKm));
        if (!p || p.x<-24 || p.x>w+24 || p.y<-24 || p.y>h+24) continue;
        const selected=options.selectedTargetId===dep.id;
        const color=selected?'#ffe37a':isActive?'#88fff4':'#63e6ff';
        const r=selected||isActive?5.5:4;
        ctx.save();
        ctx.globalAlpha=alpha;
        iceDepositCount++;
        if (isActive) {
          ctx.beginPath();
          ctx.arc(p.x,p.y,9,0,TAU);
          ctx.strokeStyle='rgba(120,255,238,0.65)';
          ctx.lineWidth=1.2;
          ctx.stroke();
        }
        stroke([
          {x:p.x,y:p.y-r},{x:p.x+r,y:p.y},
          {x:p.x,y:p.y+r},{x:p.x-r,y:p.y},{x:p.x,y:p.y-r}
        ],color,isActive||selected?1.75:1.35,isActive?8:0);
        if (isActive && shipScreenPos) {
          stroke([shipScreenPos,p],'#78ffee',1.35,7,[5,4]);
          const mid={x:(shipScreenPos.x+p.x)*0.5,y:(shipScreenPos.y+p.y)*0.5};
          const ph=snap.iceHarvest?.phase==='returning'?'RETURN':'SORTIE';
          label(mid,ph,'#88fff4',6,-5,true);
        }
        if (isActive || selected || view.systemAlpha>0.25 || isLocalPlanet) {
          label(p,'ICE \u00b7 '+dep.name.toUpperCase(),color,8,-6,true);
        }
        if (alpha>=0.13) {
          hit(p,{id:dep.id,kind:'ice-deposit',planetIdx:dep.ref?.planetIdx??0,moonIdx:dep.ref?.moonIdx??0,label:'ICE \u00b7 '+dep.name},10);
        }
        ctx.restore();
      }
    }

    function drawLagrange() {
      if (!showLagrange) return;
      for (const {point,loop} of world.lagrange) {
        const localPair=world.primary.kind!=='star';
        let alpha=localPair ? 1-view.systemAlpha : view.systemAlpha*(1-view.veilAlpha*0.8);
        if (world.moonView && !['L1','L2'].includes(point.id)) {
          alpha*=fade(view.radius,world.baseExtent,world.baseExtent*3);
        }
        if (alpha<=0.005) continue;
        const p=project(locate(point.rKm));
        if (!p) continue;
        ctx.save();
        ctx.globalAlpha=alpha;
        lagrangeCount++;
        const selected=options.selectedTargetId===point.id;
        const color=selected?'#fff18a':'#60ff9d';
        if (point.id!=='L3') worldPath(loop.points,'#36ff70',selected?2:1.25,9);
        stroke([{x:p.x-4,y:p.y},{x:p.x+4,y:p.y}],color,1.4);
        stroke([{x:p.x,y:p.y-4},{x:p.x,y:p.y+4}],color,1.4);
        label(p,point.id,color,7,point.id==='L1'?12:-6,true);
        if (alpha>=0.13) hit(p,{id:point.id,kind:'lagrange',label:point.label},8);
        ctx.restore();
      }
    }

    function drawSegment(segment,color) {
      const span=segment.endTimeS-segment.startTimeS;
      const points=segment.points.map((p,i)=>project(fromFlight(p,segment.startTimeS+segment.sampleTimesS[i])));
      const gap=segment.gapIndex;
      if (gap>=0 && (frame==='synodic' || world.target)) {
        stroke(points.slice(0,gap),color,1.65,7);
        stroke(points.slice(gap),color,1.65,7);
      } else stroke(points,color,1.65,7);
      for (const fraction of [0.29,0.72]) {
        const i=Math.floor((points.length-1)*fraction);
        arrow(points[i-1],points[i],color);
      }
      for (const [name,p,time] of [
        ['PE',segment.periapsis,segment.el.timeToPeS],['AP',segment.apoapsis,segment.el.timeToApS]
      ]) {
        if (!p || time>span) continue;
        const a=project(fromFlight(p,segment.startTimeS+time));
        if (!a) continue;
        dotAt(a,2.6,color);
        label(a,name,color,5,11,true);
      }
    }

    function drawGizmo(node,p) {
      const len=Math.min(44/p.k,p.depth*0.5);
      for (const [axis,opposite,key,basis,color,darkColor] of [
        ['pro','ret','dvP',node.proHat,'#36ff70','#24c960'],
        ['nrm','anm','dvN',node.nrmHat,'#3898ff','#2670d8'],
        ['rad','rin','dvR',node.radHat,'#ff3e55','#d8324b']
      ]) {
        const target=fromFlight(add(node.rKm,scale(basis,len)),node.cumTimeS);
        const tip=project(target);
        if (!tip) continue;
        const length=Math.hypot(tip.x-p.x,tip.y-p.y);
        const offset=length<1.5 ? {x:0,y:-1} : {x:(tip.x-p.x)/length,y:(tip.y-p.y)/length};
        let distance=clamp(length,axis==='nrm'?27:33,62);
        // Near edge-on views can project two axes onto the same screen ray.
        // Keep the paired handles symmetric and stagger their distances.
        while (gizmoHandles6.some(handle=>
          Math.hypot(handle.x-p.x-offset.x*distance,handle.y-p.y-offset.y*distance)<16 ||
          Math.hypot(handle.x-p.x+offset.x*distance,handle.y-p.y+offset.y*distance)<16)) distance+=16;
        for (const [handleAxis,tint,sign] of [[axis,color,1],[opposite,darkColor,-1]]) {
          const dx=offset.x*sign, dy=offset.y*sign;
          const end={x:p.x+dx*distance,y:p.y+dy*distance};
          stroke([p,end],tint,1.7,6,sign<0?[4,3]:undefined);
          const r=7;
          const g=ctx.createRadialGradient(end.x-2,end.y-2,0,end.x,end.y,r);
          g.addColorStop(0,sign>0?'#f4faff':'#163042');
          g.addColorStop(0.42,sign>0?tint:'#091321');
          g.addColorStop(1,sign>0?'#122232':tint);
          dotAt(end,r,g);
          label(end,(sign>0?'+':'-')+handleAxis.toUpperCase(),tint,dx<0?-33:9,dy<0?-5:11);
          if (sign<0) {
            ctx.save();
            ctx.strokeStyle=tint;
            ctx.lineWidth=1.6;
            ctx.stroke();
            ctx.restore();
          }
          const handle={axis:handleAxis,key,x:end.x,y:end.y,r,dx,dy,sign};
          gizmoHandles6.push(handle);
          hit(end,{kind:'gizmo',...handle},r+4);
        }
      }
      const tip=project(fromFlight(add(node.rKm,scale(node.proHat,-len*0.44)),node.cumTimeS));
      if (tip) {
        stroke([p,tip],'#c7d4e8');
        dotAt(tip,3.7,'#fff');
        hit(tip,{kind:'time',index:node.index,id:node.id},9);
      }
      const signed=n=>(n<0?'':'+')+n.toFixed(2);
      const text='PRO '+signed(node.dvP)+' | NRM '+signed(node.dvN)+' | RAD '+signed(node.dvR)+' km/s';
      const total='TOT \u0394v '+chain.totalDvKmS.toFixed(2)+' km/s';
      ctx.save();
      ctx.font='11px "Share Tech Mono", monospace';
      const tw=Math.max(ctx.measureText(text).width,ctx.measureText(total).width)+14;
      const yMin=Math.max(2,(view.safeTop||0)+4), yMax=Math.max(yMin,(view.safeBottom||h)-36);
      const x=clamp(p.x+13,2,Math.max(2,w-tw-2)), y=clamp(p.y+49,yMin,yMax);
      ctx.fillStyle='rgba(5,12,23,0.94)';
      ctx.fillRect(x,y,tw,34);
      ctx.strokeStyle='#50788b';
      ctx.strokeRect(x,y,tw,34);
      placedLabels.push({x,right:x+tw,y:y+10},{x,right:x+tw,y:y+22},{x,right:x+tw,y:y+34});
      label({x,y},text,'#dcfff2',7,13);
      label({x,y},total,'#8ef8cb',7,27);
      ctx.restore();
    }

    function relativeAt(segment,dt) {
      return fromFlight(segment.stateAt(dt).rKm,segment.startTimeS+dt);
    }

    function updateClosestApproach() {
      closestApproach=null;
      if (!world?.target || !chain) return;
      let bestKm=Infinity, bestPoint, extent=0;
      function consider(point) {
        const km=norm(point);
        if (km<bestKm) {
          bestKm=km;
          bestPoint=point;
        }
        return km;
      }
      for (const [index,segment] of chain.segments.entries()) {
        const times=segment.sampleTimesS;
        const distances=segment.points.map((point,i)=>{
          const km=consider(fromFlight(point,segment.startTimeS+times[i]));
          extent=Math.max(extent,km);
          return km;
        });
        const encounter=burns[index-1]?.interceptTimeS;
        if (encounter>0 && encounter<=segment.endTimeS-segment.startTimeS) {
          consider(relativeAt(segment,encounter));
        }
        for (let i=0;i<times.length;i++) {
          const before=i>0 && i!==segment.gapIndex ? i-1 : i;
          const after=i+1<times.length && i+1!==segment.gapIndex ? i+1 : i;
          if (before===after || distances[i]>distances[before] || distances[i]>distances[after]) continue;
          if (distances[before]-distances[i]<1e-6 && distances[after]-distances[i]<1e-6) continue;
          // Refine each sampled minimum with exact coasts and ephemerides.
          let lo=times[before], hi=times[after];
          for (let j=0;j<28;j++) {
            const a=(2*lo+hi)/3, b=(lo+2*hi)/3;
            if (consider(relativeAt(segment,a))<consider(relativeAt(segment,b))) hi=b;
            else lo=a;
          }
        }
      }
      if (bestPoint) closestApproach={point:bestPoint,km:bestKm,extent:Math.max(50,extent*1.16)};
    }

    function drawTarget() {
      const target=project(origin);
      if (!target) return;
      const approach=closestApproach && project(closestApproach.point);
      if (approach) {
        stroke([target,approach],'#ffdfa0',1.35,0,[5,4]);
        dotAt(approach,2.3,'#ffdfa0');
      }
      const color='#8dffff';
      for (const [x,y] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        stroke([6,14].map(r=>({x:target.x+r*x,y:target.y+r*y})),color,1.8,6);
      }
      label(target,world.target.label.toUpperCase(),color,16,-7,true);
      if (approach) label(approach,'CA '+closestApproach.km.toFixed(1)+' km','#ffdfa0',9,16,true);
    }

    function burnDuration(node) {
      const specs=snap.rocketSpecs;
      const g=Number(specs?.sustainedG || specs?.maxG || specs?.sustainedAccelG || specs?.maxAccelG || 1);
      return node.dvMagKmS/(clamp(Number.isNaN(g)?1:g,0.15,12)*O.G0_KMS2);
    }

    function drawBurnArc(node) {
      if (node.dvMagKmS<=0.005) return;
      const duration=burnDuration(node);
      const start=node.cumTimeS-(node.dtS>=duration/2?duration/2:0);
      let i=node.index;
      const points=Array.from({length:25},(_,j)=>{
        const t=start+duration*j/24;
        while (i<chain.segments.length-1 && t>chain.segments[i].endTimeS) i++;
        const segment=chain.segments[i];
        return project(relativeAt(segment,t-segment.startTimeS));
      });
      if (!points.some((point,i)=>point && points[i+1])) return;
      burnArcCount++;
      stroke(points,'#ff6e28',4.5,13);
      stroke(points,'#ffc477',2.4,6);
      for (const j of [6,12,18]) arrow(points[j-1],points[j],'#ffe0a4');
      const caption=points[12] || points.find(Boolean);
      label(caption,'BURN '+Math.max(1,Math.round(duration))+'s','#ffc477',9,-10,true);
    }

    function pill(p,text,color,dx,dy) {
      if (!p || p.x<0 || p.x>w || p.y<0 || p.y>h) return;
      ctx.save();
      ctx.font='11px "Share Tech Mono", monospace';
      const width=ctx.measureText(text).width+12;
      const x=clamp(p.x+dx,2,Math.max(2,w-width-2));
      const y=placeLabel(x,p.y+dy,width,dy);
      ctx.fillStyle='#071721'; ctx.fillRect(x,y-11,width,15);
      ctx.strokeStyle=color; ctx.lineWidth=0.8; ctx.strokeRect(x,y-11,width,15);
      ctx.fillStyle=color; ctx.fillText(text,x+6,y);
      ctx.restore();
    }

    function drawShip(p) {
      shipScreenPos={x:p.x,y:p.y};
      hit(p,{kind:'ship'},18);
      const tip=project(fromFlight(add(plan.r,scale(unit(plan.v),24/p.k))));
      const angle=tip?Math.atan2(tip.y-p.y,tip.x-p.x):0;
      const c=Math.cos(angle),s=Math.sin(angle);
      const at=(x,y)=>({x:p.x+c*x-s*y,y:p.y+s*x+c*y});
      ctx.save();
      ctx.shadowColor='#74ffba'; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.arc(p.x,p.y,14,0,TAU);
      ctx.strokeStyle='#68cb9e'; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath();
      for (const [i,q] of [at(12,0),at(-8,7),at(-4,0),at(-8,-7)].entries()) {
        if (i) ctx.lineTo(q.x,q.y); else ctx.moveTo(q.x,q.y);
      }
      ctx.closePath(); ctx.fillStyle='#e0fff1'; ctx.fill(); ctx.restore();
      stroke([at(15,0),at(29,0)],'#9dffd3'); arrow(at(15,0),at(29,0),'#9dffd3');
      pill(p,'YOU // '+(snap.shipName||'LIGHTHUGGER'),'#afffd7',18,-19);
      if (!burns.length && !preview && !transferPreviewDrawn && !(snap.burn && snap.burn.active)) pill(p,'CLICK SHIP TO PLOT BURN','#8ccaa9',18,20);
    }

    function makeTransfer() {
      const supplied=snap.orbits?.transfer,id=options.selectedTargetId;
      const brach=snap.orbits?.brachistochrone || (supplied?.isBrachistochrone && supplied);
      const brachPoints=brach?.points||brach?.brachPoints;
      if (brachPoints?.length>=2 && brachPoints.every(valid)) {
        const tofS=Math.max(0,numeric(brach.tofS??brach.transferTimeS));
        const tFlipS=clamp(brach.tFlipS??tofS/2,0,tofS);
        const ref=brach.ref||brach.frameRef||plan?.ref||world.center;
        return {...brach,isBrachistochrone:true,points:brachPoints,tofS,tFlipS,ref,
          times:brachPoints.map((_,i)=>tofS*i/(brachPoints.length-1))};
      }
      if (!plan || burns.length || (!id && !supplied)) return null;
      if (supplied?.isBrachistochrone) return null;
      const catalog=id ? G.getSystemTargetOrbits(system,plan.ref.kind==='star'?-1:plan.ref.planetIdx,plan.r,plan.mu,world.epoch) : [];
      const entry=targetEntry() || catalog.find(item=>item.id===id);
      const radius=entry?.radiusKm || (id==='custom' && snap.customOrbitKm) || snap.orbits?.target?.el?.rp;
      if (!supplied && !radius) return null;
      const planned=supplied && snap.orbitPlan?.valid ? snap.orbitPlan :
        O.planHohmannTransfer(plan.r,plan.v,plan.mu,entry || {radiusKm:radius});
      const points=[plan.r],times=[0];
      const wait=planned.waitTimeS||0;
      if (wait>0) for (let i=1;i<=32;i++) {
        const dt=wait*i/32;
        points.push(coast.stateAt(dt).rKm); times.push(dt);
      }
      const el=supplied?.el || planned.predictedTransferEl;
      const start=O.elementsToState(el,plan.mu);
      const segment=O.propagateManeuverChain(start.rKm,start.vKmS,plan.mu).segments[0];
      const duration=supplied?.transferTimeS ?? (snap.orbitPlan?.valid?planned.transferTimeS:
        supplied?.el?.isBound?el.periodS/2:planned.transferTimeS || segment.endTimeS);
      const samples=supplied?.points;
      const count=samples?.length || 97;
      for (let i=0;i<count;i++) {
        const dt=duration*i/Math.max(count-1,1);
        points.push(samples?samples[i]:segment.stateAt(dt).rKm); times.push(wait+dt);
      }
      return {points,times,target:snap.orbits?.target?.el||planned.targetEl,dv:supplied?.totalDvKmS??planned.totalDvKmS};
    }

    function drawTransfer() {
      if (!preview) return;
      if (preview.isBrachistochrone) {
        const accel='#ffaa33', decel='#5ce1ff';
        const points=preview.points.map((p,i)=>project(fromFlight(p,preview.times[i],preview.ref)));
        const split=(points.length-1)*(preview.tofS ? preview.tFlipS/preview.tofS : 0.5);
        const before=Math.floor(split), after=Math.ceil(split);
        const flipKm=valid(preview.flipPointKm) ? preview.flipPointKm :
          preview.points[before].map((x,i)=>mix(x,preview.points[after][i],split-before));
        const flip=project(fromFlight(flipKm,preview.tFlipS,preview.ref));
        const legs=[[...points.slice(0,before+1),flip],[flip,...points.slice(after)]];
        transferPreviewDrawn=legs.some(leg=>leg.some((p,i)=>p && leg[i+1]));
        stroke(legs[0],accel,2,8);
        stroke(legs[1],decel,2,8);
        if (flip) {
          const {x,y}=flip, top={x,y:y-7};
          stroke([top,{x:x+7,y},{x,y:y+7},{x:x-7,y},top],accel,1.7,8);
          const duration=preview.tofS>=3600 ? (preview.tofS/3600).toFixed(1)+' h' : Math.round(preview.tofS)+' s';
          pill(flip,'FLIP / TURNOVER',accel,12,-9);
          pill(flip,'TOF '+duration+' / PEAK '+numeric(preview.peakSpeedKmS).toFixed(1)+' km/s',decel,12,14);
        }
        return;
      }
      const color='#00f0ff';
      const points=preview.points.map((p,i)=>project(fromFlight(p,preview.times[i])));
      transferPreviewDrawn=points.some((p,i)=>p && points[i+1]);
      if (!transferPreviewDrawn) return;
      if (!world.target && !snap.orbits?.target && !/^L[1-5]$/.test(options.selectedTargetId)) {
        stroke(O.sampleOrbitPoints(preview.target,plan.mu,97).points.map(p=>project(fromFlight(p))),'#ffd479',1.4);
      }
      stroke(points,color,2,8,[7,4]);
      for (const f of [0.27,0.72]) {
        const i=Math.max(1,Math.floor((points.length-1)*f));
        arrow(points[i-1],points[i],color);
      }
      for (const [i,p] of [points[0],points.at(-1)].entries()) if (p) {
        dotAt(p,5,color); pill(p,'BURN '+(i+1),color,-52,22);
      }
      pill(points[Math.floor(points.length/2)],'XFER \u0394v '+preview.dv.toFixed(2)+' km/s',color,7,-9);
    }

    function drawFlight() {
      if (!chain) {
        if (preview?.isBrachistochrone) drawTransfer();
        return;
      }
      const el=chain.segments[0].el;
      if (world.target) {
        chain.segments.forEach((segment,i)=>drawSegment(segment,i===0?'#00ff88':i%2?'#00e8ff':'#ff9238'));
      } else if (el.h) {
        stroke(track,'#00ff88',1.65,7);
        for (const [name,pos] of [['PE',coast.periapsis],['AP',coast.apoapsis]]) {
          const q=pos&&project(fromFlight(pos));
          if (q) { dotAt(q,2.6,'#00ff88'); label(q,name,'#00ff88',6,11,true); }
        }
      }
      if (!world.target) chain.segments.slice(1).forEach((segment,i)=>drawSegment(segment,i%2?'#ff9238':'#00e8ff'));
      const target=options.selectedTargetId;
      const custom = snap.customOrbitKm;
      if (!world.target && target==='custom' && custom>world.focalBody.radiusKm) {
        worldPath(circle(world.c,custom),'#ffd479',1.5);
      } else if (!world.target) {
        const arc=snap.orbits?.target;
        const points=arc?.points || (arc?.el && O.sampleOrbitPoints(arc.el,arc.muKm3S2||plan.mu,97).points);
        if (points && !/^L[1-5]$/.test(target)) stroke(points.map(p=>project(fromFlight(p))),'#ffd479',1.3);
      }
      if (preview?.isBrachistochrone || (!burns.length && (target || snap.orbits?.transfer))) drawTransfer();
      const ship=project(fromFlight(plan.r));
      if (ship) drawShip(ship);

      let selected=null;
      chain.nodes.forEach(drawBurnArc);
      for (const node of chain.nodes) {
        const p=project(fromFlight(node.rKm,node.cumTimeS));
        if (!p) continue;
        const active=node.index===selectedBurnIdx;
        const color=active?'#fff4c8':'#ff9c4b', r=active?6:4.5;
        if (node.dvMagKmS>0) {
          const tip=project(fromFlight(add(node.rKm,scale(unit(node.dvVecKmS),32/p.k)),node.cumTimeS));
          stroke([p,tip],'#ff9238',1.35);
          arrow(p,tip,'#ff9238');
        }
        const top={x:p.x,y:p.y-r};
        stroke([top,{x:p.x+r,y:p.y},{x:p.x,y:p.y+r},{x:p.x-r,y:p.y},top],color,1.7);
        label(p,String(node.index+1),color,-11,-9);
        hit(p,{kind:'burn',id:node.id,index:node.index},9);
        if (active) selected={node,p};
      }
      if (selected) drawGizmo(selected.node,selected.p);
    }

    function drawProjectiles() {
      const list=Array.isArray(snap.projectiles) ? snap.projectiles : [];
      if (!list.length) return;
      const prim=plan?.ref || {kind:'planet',planetIdx,moonIdx:0};
      const orig=state(prim,world.epoch).rKm;
      for (const proj of list) {
        if (!valid(proj.rKm)) continue;
        const isMsl=proj.kind==='missile', isEnemy=proj.owner==='enemy';
        const col=isEnemy ? '#ff5568' : isMsl ? '#ff9c44' : proj.kind==='rkv' ? '#c88aff' : '#ffd87a';
        const trail=Array.isArray(proj.trailKm) ? proj.trailKm : [];
        if (trail.length>=2) {
          const pts=trail.map(pt=>project(sub(pt,orig)));
          stroke(pts,col,isMsl?1.8:1.2,isMsl?6:3,isMsl?null:[3,3]);
        }
        const pCur=project(sub(proj.rKm,orig));
        if (pCur) {
          dotAt(pCur,isMsl?3.2:2.2,col);
          if (isMsl) label(pCur,isEnemy?'HOSTILE MSL':'AI MSL',col,7,-6,true);
        }
      }
    }

    function draw() {
      if (disposed || !ctx) return;
      const rect=canvasEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      w=rect.width; h=rect.height;
      const dpr=root.devicePixelRatio||1;
      const bw=Math.round(w*dpr),bh=Math.round(h*dpr);
      if (canvasEl.width!==bw) canvasEl.width=bw;
      if (canvasEl.height!==bh) canvasEl.height=bh;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      hits=[]; gizmoHandles6=[]; hillCount=0; lagrangeCount=0; iceDepositCount=0; burnArcCount=0;
      shipScreenPos=null; transferPreviewDrawn=false;
      placedLabels.length=0;
      if (world) setProjection();
      const gx=view?.cx??w*0.5, gy=view?.cy??h*0.46;
      const bgGrad=ctx.createRadialGradient(gx,gy,0,gx,gy,Math.max(w,h)*0.78);
      bgGrad.addColorStop(0,'#091822');
      bgGrad.addColorStop(0.65,'#050a14');
      bgGrad.addColorStop(1,'#03060c');
      ctx.fillStyle=bgGrad;
      ctx.fillRect(0,0,w,h);
      if (!world) return;
      track=coast ? coast.points.map((p,i)=>project(fromFlight(p,coast.sampleTimesS[i]))) : [];
      drawGrid();
      drawSystemEnvironment();
      drawBodies();
      drawLagrange();
      drawFlight();
      drawProjectiles();
      drawIceDeposits();
      if (world.target) drawTarget();
      if (hover) {
        const item=pick(hover);
        canvasEl.style.cursor=item?'pointer':'grab';
        if (item) {
          ctx.beginPath(); ctx.arc(item.x,item.y,item.r+2,0,TAU);
          ctx.strokeStyle='rgba(204,255,240,0.58)'; ctx.lineWidth=1; ctx.stroke();
        }
      }
    }

    function copyBurns() {
      return burns.map(b=>({...b}));
    }

    function adoptBurns(next,index) {
      burns=next.map(b=>({...b,dtS:Math.max(0,numeric(b.dtS)),
        dvP:numeric(b.dvP),dvN:numeric(b.dvN),dvR:numeric(b.dvR)}));
      selectedBurnIdx=clamp(Number.isInteger(index)?index:-1,-1,burns.length-1);
    }

    function setBurns(next,index=next.length-1) {
      adoptBurns(next,index);
      updateWorld();
      draw();
    }

    function publish() {
      updateWorld();
      draw();
      callbacks.onBurnsChange?.(copyBurns(),selectedBurnIdx);
    }

    function cancelFocus() {
      if (focusAnimation) root.cancelAnimationFrame?.(focusAnimation);
      focusAnimation=0; centeredOnShip=false;
    }

    function animateFocus(positionAt, destinationRadius) {
      const start=[camera.panX,camera.panY,camera.panZ];
      const radius=clampRadius(requestedRadius??defaultRadius());
      const finalRadius=clampRadius(destinationRadius);
      const begin=root.performance?.now()||0;
      const duration=340;
      function step(t) {
        const u=1-(1-clamp((t-begin)/duration,0,1))**3;
        const target=positionAt();
        [camera.panX,camera.panY,camera.panZ]=start.map((v,i)=>mix(v,target[i],u));
        requestedRadius=Math.exp(mix(Math.log(radius),Math.log(finalRadius),u));
        draw();
        focusAnimation=u<1?root.requestAnimationFrame(step):0;
      }
      if (root.requestAnimationFrame && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        focusAnimation=root.requestAnimationFrame(step);
      } else step(begin+duration);
    }

    function centerOnShip() {
      if (!plan || !world) return;
      cancelFocus();
      centeredOnShip=true;
      animateFocus(()=>fromFlight(plan.r),defaultRadius()/1.5);
    }

    function focusBody({kind,planetIdx:pi,moonIdx:mi=0}) {
      const pan=[camera.panX,camera.panY,camera.panZ];
      const offset=frame==='synodic' ?
        add(add(scale(world.er,pan[0]),scale(world.et,pan[1])),scale(world.en,pan[2])) : pan;
      const centerKm=add(world.c,offset);
      const {radius}=view, {yaw,pitch}=camera;
      const nextPlanet=pi??planetIdx;
      cancelFocus();
      framePicked=true;
      chooseFrame(kind,nextPlanet,mi);
      updateWorld();
      [camera.panX,camera.panY,camera.panZ]=locate(centerKm);
      Object.assign(camera,{yaw,pitch});
      requestedRadius=radius;
      const destination=kind==='star' ? world.focalBody.radiusKm*9 :
        kind==='moon' ? world.baseExtent : Math.min(defaultRadius(),world.localLimit);
      animateFocus(()=>origin,destination);
      callbacks.onFocusBody?.(kind,planetIdx,moonIdx);
    }

    function trackEpoch(pos) {
      let best=12,result=null;
      for (let i=1;i<track.length;i++) {
        const a=track[i-1],b=track[i];
        if (!a || !b || i===coast.gapIndex) continue;
        const dx=b.x-a.x,dy=b.y-a.y;
        const u=clamp(((pos.x-a.x)*dx+(pos.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
        const distance=Math.hypot(pos.x-a.x-u*dx,pos.y-a.y-u*dy);
        if (distance>=best) continue;
        best=distance;
        result=coast.sampleTimesS[i-1]+u*(coast.sampleTimesS[i]-coast.sampleTimesS[i-1]);
      }
      return result;
    }

    function insertNode(epoch) {
      const index=chain.nodes.findIndex(node=>node.cumTimeS>=epoch);
      selectedBurnIdx=index<0?burns.length:index;
      const dtS=epoch-(chain.nodes[selectedBurnIdx-1]?.cumTimeS||0);
      appendImpulse('node',dtS,plan.r,plan.v,origin);
      const node=burns.pop();
      if (burns[selectedBurnIdx]) burns[selectedBurnIdx].dtS-=dtS;
      burns.splice(selectedBurnIdx,0,node);
      publish();
    }

    function addBurnAtShip() {
      if (!chain) return;
      if (chain.nodes[0]?.cumTimeS<=1) {
        selectedBurnIdx=0; publish();
        callbacks.onSelectBurn?.(0);
      } else insertNode(0);
    }

    function resetCamera() {
      cancelFocus();
      requestedRadius=null;
      Object.assign(camera,{yaw:frame==='synodic'?0:0.3,pitch:frame==='synodic'?1.28:0.94,
        zoom:1,panX:0,panY:0,panZ:0});
    }

    function resetView() {
      resetCamera();
      draw();
    }

    function chooseFrame(next,pi=planetIdx,mi=moonIdx) {
      if (!['star','planet','moon','target','synodic'].includes(next)) return;
      const withStar=next==='synodic' && (pi===-1 || mi===-1 || frame==='star' || (frame==='synodic' && synodicStar));
      const candidate=pi<0 ? planetIdx : pi;
      const index=mi<0 ? 0 : mi;
      if (next===frame && candidate===planetIdx && index===moonIdx && withStar===synodicStar) return;
      frame=next; planetIdx=candidate; moonIdx=index; synodicStar=withStar;
      resetCamera();
    }

    function setFrame(next,pi,mi) {
      framePicked=true;
      chooseFrame(next,pi,mi);
      updateWorld();
      draw();
    }

    function update(nextSnap,opts={}) {
      if (disposed) return;
      const orbit=nextSnap.orbit;
      const next={...nextSnap,orbit:orbit&&{...orbit,rKm:orbit.rKm?.slice(),vKmS:orbit.vKmS?.slice()}};
      if (drag?.hit) {
        pendingUpdate=[next,opts];
        return;
      }
      const before=snap.systemId||snap.currentSystemId||snap.system?.id;
      snap=next;
      options={selectedTargetId:opts.selectedTargetId??opts.selectedTarget??opts.targetId??opts.selTarget??snap.selectedTargetId};
      if (Array.isArray(opts.burns)) adoptBurns(opts.burns,opts.selectedBurnIdx??
        (selectedBurnIdx>=0 ? selectedBurnIdx : opts.burns.length-1));
      else if (Number.isInteger(opts.selectedBurnIdx)) {
        selectedBurnIdx=clamp(opts.selectedBurnIdx,-1,burns.length-1);
      }
      const orbPrimary=orbit?.primary||orbit?.focusSoi;
      const primaryKey=orbPrimary ? orbPrimary+':'+(orbit?.planetIdx??0)+':'+(orbit?.moonIdx??0) : '';
      const primaryChanged=!!(lastPrimaryKey && primaryKey && primaryKey!==lastPrimaryKey);
      lastPrimaryKey=primaryKey;
      const viewFrame=snap.orbitViewFrame||snap.orbitFrame;
      const autoFollowPrimary=primaryChanged && (!viewFrame || viewFrame===orbPrimary);
      const nextFrame=opts.frame || (autoFollowPrimary ? orbPrimary : (!framePicked && orbPrimary));
      if (nextFrame) {
        const followFlight=!opts.frame || !before || autoFollowPrimary;
        const p=opts.planetIdx??(followFlight ? orbit?.planetIdx??planetIdx : planetIdx);
        const m=opts.moonIdx??(followFlight ? orbit?.moonIdx??moonIdx : moonIdx);
        chooseFrame(nextFrame,p,m);
        framePicked=framePicked || !!opts.frame;
      } else if (before!==(snap.systemId||snap.currentSystemId||snap.system?.id) && orbit) {
        planetIdx=orbit.planetIdx??0;
        moonIdx=orbit.moonIdx??0;
      }
      if (before && before!==(snap.systemId||snap.currentSystemId||snap.system?.id)) resetCamera();
      updateWorld();
      draw();
    }

    function lastState() {
      const node=chain.nodes.at(-1);
      return node ? {r:node.rKm,v:node.vAfterKmS,elapsed:node.cumTimeS}
        : {r:plan.r,v:plan.v,elapsed:0};
    }

    function appendImpulse(kind,dtS,r,v,dv,extra) {
      const el=O.stateToElements(r,v,plan.mu);
      let id;
      do { id='burn-'+nextId++; } while (burns.some(b=>b.id===id));
      const labels={node:'NODE',orbit:'ORBIT',circularize:'CIRCULARIZE',match:'MATCH','moon-close':'MOON LOW',
        intercept:'INTERCEPT',rendezvous:'RENDEZVOUS'};
      burns.push(Object.assign({id,kind,label:labels[kind]||kind,dtS,
        dvP:dot(dv,cross(el.normalHat,el.radialHat)),dvN:dot(dv,el.normalHat),dvR:dot(dv,el.radialHat)},extra||{}));
    }

    function lagrangeDestination(kind) {
      const entry=world.lagrange.find(item=>item.point.id===kind);
      const {primary,a,er,et,en,rate}=world;
      const {point,loop}=entry;
      const path=kind==='L3' ? [point.rKm] : loop.points;
      return {
        radius:norm(sub(point.rKm,a.rKm)),
        at(elapsed,phase) {
          const angle=elapsed*rate, c=Math.cos(angle),s=Math.sin(angle);
          const radial=add(scale(er,c),scale(et,s)), tangent=cross(en,radial);
          const parent=state(primary,world.epoch+elapsed);
          const i=path.length===1 ? 0 : Math.round(phase*(path.length-1));
          const delta=sub(path[i],a.rKm);
          const arm=add(add(scale(radial,dot(delta,er)),scale(tangent,dot(delta,et))),scale(en,dot(delta,en)));
          let loopVel=origin;
          if (path.length>1) {
            const span=path.length-1;
            const derivative=scale(sub(path[(i+1)%span],path[(i+span-1)%span]),span/(2*loop.periodS));
            loopVel=add(add(scale(radial,dot(derivative,er)),scale(tangent,dot(derivative,et))),scale(en,dot(derivative,en)));
          }
          return {r:add(parent.rKm,arm),v:add(parent.vKmS,add(scale(cross(en,arm),rate),loopVel))};
        }
      };
    }

    function bodyCaptureDestination(ref) {
      if (!ref || (ref.kind!=='moon' && ref.kind!=='planet')) return null;
      const targetBody=body(ref);
      if (!targetBody) return null;
      const isMoon=ref.kind==='moon';
      const parentData=isMoon ? system.planets[ref.planetIdx] : {muKm3S2:system.muStarKm3S2};
      if (O.ensureBodyGravity) O.ensureBodyGravity(targetBody,parentData,isMoon);
      const radius=O.safeOrbitRadiusKm
        ? O.safeOrbitRadiusKm(targetBody.radiusKm,targetBody.rHillKm,isMoon)
        : (targetBody.radiusKm+Math.max(isMoon?350:450,targetBody.radiusKm*0.35));
      const inclination=targetBody.incRad||0, side=[0,Math.cos(inclination),Math.sin(inclination)];
      const samePrimary=plan.ref.kind===ref.kind && plan.ref.planetIdx===ref.planetIdx &&
        (!isMoon || plan.ref.moonIdx===ref.moonIdx);
      const orbitR=targetBody.orbitRadiusKm ?? (targetBody.orbitRadiusAU||0)*O.AU_KM;
      const vCirc=Math.sqrt(targetBody.muKm3S2/radius);
      return {
        ref,
        label:targetBody.name,
        bodyRadiusKm:targetBody.radiusKm,
        captureRadiusKm:radius,
        radius:samePrimary ? radius : orbitR,
        at(elapsed,phase) {
          const bState=state(ref,world.epoch+elapsed), t=TAU*phase;
          const p=add(scale(px,Math.cos(t)),scale(side,Math.sin(t)));
          const v=add(scale(px,-Math.sin(t)),scale(side,Math.cos(t)));
          return {r:add(bState.rKm,scale(p,radius)),v:add(bState.vKmS,scale(v,vCirc))};
        }
      };
    }

    function moonDestination() {
      const sel=targetRef();
      const ref=sel?.kind==='moon' ? sel : {kind:'moon',planetIdx,moonIdx};
      return bodyCaptureDestination(ref);
    }

    function movingTarget(allowCustom) {
      const epoch=snap.simTimeS||0, selected=options.selectedTargetId, entry=targetEntry();
      const ref=targetRef();
      const custom=allowCustom && selected==='custom';
      if (plan && (custom || (!ref && selected!=='custom' &&
          valid(entry?.targetPosKm) && valid(entry?.targetVelKmS)))) {
        let r=entry?.targetPosKm, v=entry?.targetVelKmS;
        if (custom && !(valid(r)&&valid(v))) {
          const radius=snap.customOrbitKm ?? entry?.radiusKm;
          if (!(radius>0 && Number.isFinite(radius))) return null;
          const inclination=entry?.incRad||0, lan=entry?.lanRad||0;
          const angle=Math.atan2(plan.r[1],plan.r[0])-lan;
          const el={a:radius,e:0,iRad:inclination,omegaAscRad:lan,argPeriRad:0,nuRad:angle};
          ({rKm:r,vKmS:v}=O.elementsToState(el,plan.mu));
        }
        if (norm(r)>0) {
          const {segments:[segment]}=O.propagateManeuverChain(r,v,plan.mu);
          return {label:entry?.label||'Custom orbit',at(elapsed) {
            const s=segment.stateAt(elapsed), parent=state(plan.ref,epoch+elapsed);
            return {r:add(s.rKm,parent.rKm),v:add(s.vKmS,parent.vKmS)};
          }};
        }
      }
      const target=ref||fallbackTargetRef();
      if (!target) return null;
      return {label:body(target).name,ref:target,at(elapsed) {
        const s=state(target,epoch+elapsed);
        return {r:s.rKm,v:s.vKmS};
      }};
    }

    function plotTransfer(kind,start,destination) {
      const intercept=kind==='intercept';
      const factors=intercept ? [0.34,0.29,0.24,0.19,0.15] : [0.58,0.72,0.87,1,1.16,1.36,1.59,1.85,2.2,2.6];
      const scaleTime=Math.PI*Math.sqrt(((norm(start.r)+destination.radius)/2)**3/plan.mu);
      const bodyRadius=body(plan.ref)?.radiusKm||0;
      const primaryClearR=bodyRadius*1.05;
      const targetClearR=destination.bodyRadiusKm ? destination.bodyRadiusKm*1.06 : 0;
      const sibBodies=[];
      if (plan.ref.kind==='star') {
        const pls=system.planets||[];
        for (let pi=0;pi<pls.length;pi++) {
          if (destination.ref?.kind==='planet' && destination.ref.planetIdx===pi) continue;
          sibBodies.push({ref:{kind:'planet',planetIdx:pi},clearR:(pls[pi].radiusKm||1000)*1.15});
        }
      } else if (plan.ref.kind==='planet') {
        const ms=system.planets[plan.ref.planetIdx]?.moons||[];
        for (let mi=0;mi<ms.length;mi++) {
          if (destination.ref?.kind==='moon' && destination.ref.planetIdx===plan.ref.planetIdx && destination.ref.moonIdx===mi) continue;
          sibBodies.push({ref:{kind:'moon',planetIdx:plan.ref.planetIdx,moonIdx:mi},clearR:(ms[mi].radiusKm||500)*1.15});
        }
      }
      const nSub=16;
      const transferBlocked=(el,depV,rEnd,dt,origCache,destCache,sibCache)=>{
        if (el.rp<primaryClearR && el.timeToPeS<dt) return true;
        if (!O.keplerCoast || !O.segmentSphereHit) return false;
        const coastFn=O.keplerCoast(start.r,depV,plan.mu,el);
        let prevP=start.r;
        for (let si=1;si<=nSub;si++) {
          const tSub=dt*si/nSub;
          const curP=si===nSub ? rEnd : coastFn(tSub).rKm;
          if (primaryClearR>0 && O.segmentSphereHit(prevP,curP,origin,primaryClearR).hit) return true;
          if (destCache && targetClearR>0 && O.segmentSphereHit(sub(prevP,destCache[si-1]),sub(curP,destCache[si]),origin,targetClearR).hit) return true;
          for (let bi=0;bi<sibBodies.length;bi++) {
            if (O.segmentSphereHit(sub(prevP,sibCache[si-1][bi]),sub(curP,sibCache[si][bi]),origin,sibBodies[bi].clearR).hit) return true;
          }
          prevP=curP;
        }
        return false;
      };
      let best;
      for (const tilt of [0, 0.16, -0.16, 0.36, -0.36]) {
        for (const factor of factors) {
          const dt=scaleTime*factor, elapsed=start.elapsed+dt;
          const parent=state(plan.ref,world.epoch+elapsed);
          const origCache=[], destCache=destination.ref?[]:null, sibCache=[];
          for (let si=0;si<=nSub;si++) {
            const tS=world.epoch+start.elapsed+dt*si/nSub;
            const oP=state(plan.ref,tS).rKm;
            origCache.push(oP);
            if (destCache) destCache.push(sub(state(destination.ref,tS).rKm,oP));
            sibCache.push(sibBodies.map(b=>sub(state(b.ref,tS).rKm,oP)));
          }
          for (const phase of [0,0.25,0.5,0.75]) {
            const target=destination.at(elapsed,phase);
            let r=sub(target.r,parent.rKm), v=sub(target.v,parent.vKmS);
            if (tilt) {
              const ct=Math.cos(tilt), st=Math.sin(tilt);
              r=[r[0], r[1]*ct - r[2]*st, r[1]*st + r[2]*ct];
              v=[v[0], v[1]*ct - v[2]*st, v[1]*st + v[2]*ct];
            }
            const arc=O.transferVelocity(start.r,r,plan.mu,dt);
            if (!arc) continue;
            const el=O.stateToElements(start.r,arc.departure,plan.mu);
            if (transferBlocked(el,arc.departure,r,dt,origCache,destCache,sibCache)) continue;
            const departure=sub(arc.departure,start.v), arrival=sub(v,arc.arrival);
            const cost=norm(departure)+(intercept?0:norm(arrival));
            if (!best || cost<best.cost) best={cost,dt,r,arc,departure,arrival};
          }
        }
        if (best) break;
      }
      if (!best) return false;
      const meta=destination.ref ? {targetRef:destination.ref,captureRadiusKm:destination.captureRadiusKm||null} : null;
      const shortName=destination.label ? String(destination.label).toUpperCase().slice(0,12) : '';
      const depMeta=kind==='orbit' && shortName ? Object.assign({label:'ORBIT '+shortName+' DEP'},meta) : meta;
      const arrMeta=kind==='orbit' && shortName ? Object.assign({label:'ORBIT '+shortName+' CAP'},meta) : meta;
      appendImpulse(kind,0,start.r,start.v,best.departure,depMeta);
      if (intercept) burns.at(-1).interceptTimeS=best.dt;
      else appendImpulse(kind,best.dt,best.r,best.arc.arrival,best.arrival,arrMeta);
      return true;
    }

    function addQuickBurn(kind,nextSnap,quickOpts) {
      if (nextSnap) update(nextSnap,options);
      if (!plan || !chain) {
        callbacks.onHint?.('Orbital state unavailable');
        return;
      }
      const start=lastState(), {r,v}=start, el=O.stateToElements(r,v,plan.mu);
      const dtS=kind==='node' ? (el.isBound ? el.periodS*0.055 : 0) : 0;
      if (kind==='node') {
        appendImpulse(kind,dtS,r,v,origin);
      } else if (kind==='circularize' || kind==='circularize-pe' || kind==='circularize-ap') {
        const mode=quickOpts?.mode || (kind==='circularize-pe'?'pe':kind==='circularize-ap'?'ap':'now');
        const primaryName=(body(plan.ref)?.name || plan.ref.kind || 'PRIMARY').toUpperCase();
        const circ=O.planCircularizationBurn ? O.planCircularizationBurn(r,v,plan.mu,mode) : null;
        if (circ && !circ.valid) {
          callbacks.onHint?.('No apoapsis on escape orbit around '+primaryName);
          return;
        }
        const burnDt=circ ? circ.dtS : 0;
        const burnR=circ ? circ.rKm : r;
        const burnV=circ ? circ.vKmS : v;
        const dvVec=circ ? circ.dvVecKmS : sub(scale(cross(el.normalHat,el.radialHat),el.vCircKmS),v);
        appendImpulse('circularize',burnDt,burnR,burnV,dvVec,{label:'CIRC '+primaryName+(mode!=='now'?' @ '+mode.toUpperCase():'')});
        if (circ?.alreadyCircular) {
          callbacks.onHint?.('ALREADY CIRCULAR AROUND '+primaryName+' (dv '+circ.dvKmS.toFixed(2)+' km/s)');
        }
      } else if (kind==='orbit') {
        const ref=targetRef();
        const defaultRef=!ref && !options.selectedTargetId && body({kind:'moon',planetIdx,moonIdx:0})
          ? {kind:'moon',planetIdx,moonIdx:0} : ref;
        if (defaultRef?.kind==='moon' || defaultRef?.kind==='planet') {
          const samePrimary=plan.ref.kind===defaultRef.kind && plan.ref.planetIdx===defaultRef.planetIdx &&
            (defaultRef.kind!=='moon' || plan.ref.moonIdx===defaultRef.moonIdx);
          const dest=bodyCaptureDestination(defaultRef);
          if (samePrimary && dest) {
            const radius=dest.captureRadiusKm;
            if (Math.abs(radius-norm(r))>1) {
              const result=O.planHohmannTransfer(r,v,plan.mu,{radiusKm:radius});
              const inward=radius<norm(r);
              const end=O.elementsToState({...result.predictedTransferEl,nuRad:inward?0:Math.PI},plan.mu);
              appendImpulse('orbit',0,r,v,result.dv1VecKmS,{label:'ORBIT '+dest.label.toUpperCase()});
              appendImpulse('orbit',result.transferTimeS,end.rKm,end.vKmS,
                scale(unit(end.vKmS),Math.sqrt(plan.mu/radius)-norm(end.vKmS)),{label:'ORBIT '+dest.label.toUpperCase()+' CAP'});
            } else {
              appendImpulse('orbit',0,r,v,sub(scale(cross(el.normalHat,el.radialHat),el.vCircKmS),v),{label:'CIRC '+dest.label.toUpperCase()});
            }
          } else if (!dest || !plotTransfer('orbit',start,dest)) {
            callbacks.onHint?.('No clear capture orbit found for '+(dest?.label||'target'));
            return;
          }
        } else {
          const catalog=plan.ref.kind==='moon' ? [] : G.getSystemTargetOrbits(system,
            plan.ref.kind==='star'?-1:plan.ref.planetIdx,r,plan.mu,world.epoch+start.elapsed);
          const selected=options.selectedTargetId;
          const target=snap.targetOrbits?.find(item=>item.id===selected) || catalog.find(item=>item.id===selected);
          if (target?.kind==='station' || defaultRef?.kind==='station') {
            const mt=movingTarget(true);
            const parent=state(plan.ref,world.epoch+start.elapsed);
            const radius=mt && norm(sub(mt.at(start.elapsed).r,parent.rKm));
            if (!(radius>0) || !plotTransfer('orbit',start,{...mt,radius})) {
              callbacks.onHint?.('No clear capture transfer found');
              return;
            }
          } else {
            const radius=selected==='custom' ? snap.customOrbitKm : target?.radiusKm;
            if (radius>0 && Math.abs(radius-norm(r))>1) {
              const result=O.planHohmannTransfer(r,v,plan.mu,{radiusKm:radius});
              const inward=radius<norm(r);
              const end=O.elementsToState({...result.predictedTransferEl,nuRad:inward?0:Math.PI},plan.mu);
              appendImpulse('orbit',0,r,v,result.dv1VecKmS);
              appendImpulse('orbit',result.transferTimeS,end.rKm,end.vKmS,
                scale(unit(end.vKmS),Math.sqrt(plan.mu/radius)-norm(end.vKmS)));
            } else {
              appendImpulse('orbit',0,r,v,sub(scale(cross(el.normalHat,el.radialHat),el.vCircKmS),v));
            }
          }
        }
      } else if (kind==='intercept' || kind==='rendezvous') {
        const ref=targetRef();
        if (kind==='rendezvous' && (ref?.kind==='moon' || ref?.kind==='planet')) {
          const dest=bodyCaptureDestination(ref);
          if (!dest || !plotTransfer(kind,start,dest)) {
            callbacks.onHint?.('No clear transfer found for '+kind);
            return;
          }
        } else {
          const target=movingTarget(true);
          const parent=state(plan.ref,world.epoch+start.elapsed);
          const radius=target && norm(sub(target.at(start.elapsed).r,parent.rKm));
          if (!(radius>0) || !plotTransfer(kind,start,{...target,radius})) {
            callbacks.onHint?.('No clear transfer found for '+kind);
            return;
          }
        }
      } else if (kind==='match') {
        const catalog=plan.ref.kind==='moon' ? [] : G.getSystemTargetOrbits(system,
          plan.ref.kind==='star'?-1:plan.ref.planetIdx,r,plan.mu,world.epoch+start.elapsed);
        const selected=options.selectedTargetId;
        const target=snap.targetOrbits?.find(item=>item.id===selected) ||
          catalog.find(item=>item.id===selected) || catalog.find(item=>item.kind==='station');
        if (target?.focusRef && (target.focusRef.kind==='moon' || target.focusRef.kind==='planet')) {
          const dest=bodyCaptureDestination(target.focusRef);
          if (!dest || !plotTransfer(kind,start,dest)) {
            callbacks.onHint?.('No clear matching transfer found');
            return;
          }
        } else if (target?.focusRef && target.radiusKm>0) {
          const ok=plotTransfer(kind,start,{radius:target.radiusKm,at(elapsed) {
            const s=state(target.focusRef,world.epoch+elapsed);
            return {r:s.rKm,v:s.vKmS};
          }});
          if (!ok) { callbacks.onHint?.('No clear matching transfer found'); return; }
        } else {
          const radius=selected==='custom' ? snap.customOrbitKm : target?.radiusKm;
          if (radius>0 && Math.abs(radius-norm(r))>1) {
            const result=O.planHohmannTransfer(r,v,plan.mu,{radiusKm:radius});
            const inward=radius<norm(r);
            const end=O.elementsToState({...result.predictedTransferEl,nuRad:inward?0:Math.PI},plan.mu);
            appendImpulse(kind,0,r,v,result.dv1VecKmS);
            appendImpulse(kind,result.transferTimeS,end.rKm,end.vKmS,
              scale(unit(end.vKmS),Math.sqrt(plan.mu/radius)-norm(end.vKmS)));
          } else {
            appendImpulse(kind,0,r,v,sub(scale(cross(el.normalHat,el.radialHat),el.vCircKmS),v));
          }
        }
      } else if (/^L[1-5]$/.test(kind) || kind==='moon-close') {
        const destination=kind==='moon-close' ? moonDestination() : lagrangeDestination(kind);
        if (!destination || !plotTransfer(kind,start,destination)) {
          callbacks.onHint?.('No clear transfer found for '+kind);
          return;
        }
      } else {
        return;
      }
      selectedBurnIdx=burns.length-1;
      publish();
    }

    function removeBurn(index) {
      if (index<0 || index>=burns.length || !Number.isInteger(index)) return;
      burns.splice(index,1);
      if (index<selectedBurnIdx || selectedBurnIdx>=burns.length) selectedBurnIdx--;
      publish();
    }

    function getBurnContext(index) {
      const node=chain?.nodes[index];
      if (!node) return null;
      const el=chain.segments[index].el;
      return {
        dtS:node.dtS,maxDtS:Math.max(node.dtS,O.coastPreviewTime(el)),periodS:el.periodS,
        burnDurationS:burnDuration(node),dvMagKmS:node.dvMagKmS
      };
    }

    function setBurnDelay(index,dtS) {
      if (!Number.isInteger(index) || !burns[index] || !Number.isFinite(dtS)) return;
      burns[index].dtS=Math.max(0,dtS);
      publish();
    }

    function local(e) {
      const rect=canvasEl.getBoundingClientRect();
      return {x:e.clientX-rect.left,y:e.clientY-rect.top};
    }

    function pick(pos,kinds) {
      let found=null, distance=Infinity;
      for (const item of hits) {
        if (kinds && !kinds.includes(item.kind)) continue;
        const d=Math.hypot(pos.x-item.x,pos.y-item.y);
        if (d<=item.r && d<=distance) { found=item; distance=d; }
      }
      return found;
    }

    function pan(dx,dy) {
      if (!view) return;
      cancelFocus();
      const pxToKm=view.distance/view.focal;
      const vector=add(scale(view.right,-dx*pxToKm),scale(view.up,dy*pxToKm));
      camera.panX+=vector[0]; camera.panY+=vector[1]; camera.panZ+=vector[2];
    }

    function zoomAt(pos,factor) {
      if (!view || !(factor>0)) return;
      const next=clampRadius(view.radius/factor);
      const ratio=1-next/view.radius;
      pan(-(pos.x-view.cx)*ratio,(view.cy-pos.y)*ratio);
      requestedRadius=next;
    }

    function timeTrack(index) {
      const previous=chain.nodes[index-1];
      const r=previous?.rKm||plan.r, v=previous?.vAfterKmS||plan.v;
      const {segments:[segment]}=O.propagateManeuverChain(r,v,plan.mu);
      const epoch=previous?.cumTimeS||0;
      const period=segment.endTimeS;
      const points=segment.points.map((p,i)=>project(fromFlight(p,epoch+segment.sampleTimesS[i])));
      return {points,period,bound:segment.el.isBound};
    }

    function updateTime(pos) {
      const {points,period,bound}=drag.track;
      let best=Infinity, time=drag.value;
      for (let i=1;i<points.length;i++) {
        const a=points[i-1], b=points[i];
        if (!a || !b) continue;
        const dx=b.x-a.x,dy=b.y-a.y;
        const u=clamp(((pos.x-a.x)*dx+(pos.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
        const distance=Math.hypot(pos.x-a.x-u*dx,pos.y-a.y-u*dy);
        if (distance>=best) continue;
        best=distance;
        time=(i-1+u)*period/(points.length-1);
      }
      if (bound) time+=Math.round((drag.value-time)/period)*period;
      burns[drag.index].dtS=Math.max(0,time);
      drag.value=burns[drag.index].dtS;
    }

    function pointerDown(e) {
      if (e.button!==0 && e.button!==2) return;
      const pos=local(e);
      try {
        canvasEl.setPointerCapture?.(e.pointerId);
      } catch (error) {
        // A synthetic pointer can still interact on the canvas without capture.
        if (error.name!=='NotFoundError') throw error;
      }
      pointers.set(e.pointerId,pos);
      if (pointers.size===2) {
        drag=null;
        pinch=[...pointers.values()];
        return;
      }
      const panning=e.button===2 || (e.shiftKey && !pick(pos,['gizmo']));
      const target=panning ? null : pick(pos,['gizmo','time','burn']);
      const index=target?.index??selectedBurnIdx;
      drag={id:e.pointerId,start:pos,last:pos,panning,hit:target,index,moved:false};
      if (target && target.kind==='gizmo') {
        drag.value=burns[index][target.key];
        drag.gain=Math.max(0.004,norm(chain.nodes[index].vBeforeKmS)/260);
      } else if (target) {
        selectedBurnIdx=index;
        drag.track=timeTrack(index);
        drag.value=burns[index].dtS;
        drag.offset={x:pos.x-target.x,y:pos.y-target.y};
        const node=project(fromFlight(chain.nodes[index].rKm,chain.nodes[index].cumTimeS));
        if (node) {
          drag.offset.x=pos.x-node.x;
          drag.offset.y=pos.y-node.y;
        }
        draw();
        callbacks.onSelectBurn?.(index);
      }
    }

    function pointerMove(e) {
      const pos=local(e);
      if (!pointers.has(e.pointerId)) { hover=pos; draw(); return; }
      pointers.set(e.pointerId,pos);
      if (pointers.size===2) {
        const [a,b]=[...pointers.values()], [c,d]=pinch||[a,b];
        const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        pan(midpoint.x-(c.x+d.x)/2,midpoint.y-(c.y+d.y)/2);
        zoomAt(midpoint,Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,Math.hypot(c.x-d.x,c.y-d.y)));
        pinch=[a,b];
      } else if (drag?.id===e.pointerId) {
        const {hit:target,index}=drag;
        const dx=pos.x-drag.start.x,dy=pos.y-drag.start.y;
        drag.moved=drag.moved||Math.hypot(dx,dy)>2;
        if (!drag.moved) return;
        if (target?.kind==='gizmo') {
          const stepX=pos.x-drag.last.x,stepY=pos.y-drag.last.y;
          const value=burns[index][target.key]+(stepX*target.dx+stepY*target.dy)*drag.gain*target.sign*(e.shiftKey?0.2:1);
          drag.last=pos;
          burns[index][target.key]=clamp(value,-1500,1500);
          publish();
          return;
        }
        if (target) {
          updateTime({x:pos.x-drag.offset.x,y:pos.y-drag.offset.y});
          publish();
          return;
        }
        const stepX=pos.x-drag.last.x, stepY=pos.y-drag.last.y;
        if (drag.panning) pan(stepX,stepY);
        else {
          camera.yaw=(camera.yaw-stepX*0.009)%TAU;
          camera.pitch=clamp(camera.pitch+stepY*0.009,-Math.PI/2,Math.PI/2);
        }
        drag.last=pos;
      }
      draw();
    }

    function pickOrbit(pos) {
      if (!view || !callbacks.onSelectCustomOrbit) return;
      const eye=add(view.pan,scale(view.towards,view.distance));
      const ray=add(add(scale(view.right,(pos.x-view.cx)/view.focal),scale(view.up,(view.cy-pos.y)/view.focal)),
        scale(view.towards,-1));
      if (Math.abs(ray[2])<0.005) return;
      const t=-eye[2]/ray[2];
      if (!(t>0)) return;
      const r=norm(add(eye,scale(ray,t)));
      if (r>world.focalBody.radiusKm*1.04 && r<world.extent*12) callbacks.onSelectCustomOrbit(r);
    }

    function pointerUp(e) {
      if (e.type==='lostpointercapture' && e.buttons) return;
      pointers.delete(e.pointerId);
      pinch=null;
      if (drag?.id!==e.pointerId) return;
      const finished=drag;
      drag=null;
      // A callback during the drag can synchronously feed back its latest burn
      // list. The final local edit remains authoritative when the epoch unpins.
      if (pendingUpdate) {
        const [next,opts]=pendingUpdate;
        pendingUpdate=null;
        update(next,{...opts,burns,selectedBurnIdx});
      }
      if (e.type!=='pointerup' || finished.moved || finished.panning || finished.hit ||
          (e.target && e.target!==canvasEl)) return;
      const pos=local(e);
      if (pick(pos,['ship'])) { addBurnAtShip(); return; }
      const target=pick(pos,['lagrange','planet','moon','station','ice-deposit']);
      if (target?.id) {
        options.selectedTargetId=target.id;
        if (frame==='target') updateWorld();
        callbacks.onSelectTarget?.(target.id);
        if (target.kind==='lagrange') addQuickBurn(target.id);
        draw();
      } else {
        const epoch=trackEpoch(pos);
        if (epoch!==null) insertNode(epoch);
        else pickOrbit(pos);
      }
    }

    function listen(name,fn,opts,target=canvasEl) {
      target.addEventListener(name,fn,opts);
      events.push([target,name,fn,opts]);
    }
    listen('pointerdown',pointerDown);
    listen('pointermove',pointerMove);
    listen('pointerleave',()=>{ hover=null; canvasEl.style.cursor='grab'; draw(); });
    listen('pointerup',pointerUp);
    listen('pointercancel',pointerUp);
    listen('lostpointercapture',pointerUp);
    if (root.addEventListener && root.removeEventListener && root!==canvasEl) {
      listen('pointermove',e=>{ if (drag && e.target!==canvasEl) pointerMove(e); },undefined,root);
      listen('pointerup',pointerUp,undefined,root);
      listen('pointercancel',pointerUp,undefined,root);
    }
    listen('contextmenu',e=>e.preventDefault());
    listen('wheel',e=>{
      e.preventDefault();
      const units=e.deltaMode===1?16:e.deltaMode===2?h:1;
      zoomAt(local(e),Math.exp(clamp(-e.deltaY*units*0.0014,-2,2)));
      draw();
    },{passive:false});
    listen('dblclick',e=>{
      const target=pick(local(e),['star','planet','moon']);
      if (target) focusBody(target);
    });
    const observer=root.ResizeObserver ? new root.ResizeObserver(draw) : null;
    observer?.observe(canvasEl);

    return {
      update,sync:update,setFrame,setBurns,getBurns:copyBurns,addQuickBurn,removeBurn,resetView,setBurnDelay,getBurnContext,centerOnShip,addBurnAtShip,
      setShowHill(value) { showHill=!!value; draw(); },
      setShowLagrange(value) { showLagrange=!!value; draw(); },
      setShowIceDeposits(value) { showIceDeposits=!!value; draw(); },
      setTopDown() { camera.yaw=0; camera.pitch=Math.PI/2; draw(); },
      getDiagnostics() {
        return {...camera,frame,planetIdx,moonIdx,showHill,showLagrange,showIceDeposits,hillCount,lagrangeCount,iceDepositCount,
          viewScale:view?.viewScale??'planet',viewRadiusKm:view?.radius??null,
          shipScreenPos:shipScreenPos && {...shipScreenPos},hasShipHit:hits.some(item=>item.kind==='ship'),transferPreviewDrawn,centeredOnShip,
          burnCount:burns.length,totalDvKmS:chain?.totalDvKmS||0,
          burnArcCount,closestApproachKm:closestApproach?.km??null,
          gizmoHandles:gizmoHandles6.filter(handle=>handle.sign>0).map(({axis,x,y,r})=>({axis,x,y,r})),
          gizmoHandles6:gizmoHandles6.map(({axis,x,y,r})=>({axis,x,y,r})),hits:hits.map(item=>({...item}))};
      },
      dispose() {
        disposed=true;
        cancelFocus();
        canvasEl.style.cursor=originalCursor;
        observer?.disconnect();
        for (const [target,name,fn,opts] of events) target.removeEventListener(name,fn,opts);
        for (const id of pointers.keys()) {
          if (canvasEl.hasPointerCapture?.(id)) canvasEl.releasePointerCapture(id);
        }
        pointers.clear();
        canvasEl.style.touchAction=originalTouchAction;
      }
    };
  }

  root.LighthuggerOrbit3D={create};
})(typeof window==='object' ? window : globalThis);
