(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LighthuggerOrbits = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const AU_KM = 149597870.7, LY_KM = 9.46073047e12, LY_PER_AU = 1 / 63241.077;
  const C_KMS = 299792.458, G0_KMS2 = 0.00980665, KAPPA_PER_G = G0_KMS2 * 31557600 / C_KMS;
  const TAU = 2 * Math.PI, zero = [0, 0, 0];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const norm = a => Math.hypot(...a);
  const scale = (a,k) => a.map(x => x*k);
  const add = (a,b) => a.map((x,i) => x+b[i]);
  const sub = (a,b) => a.map((x,i) => x-b[i]);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => scale(a,1/(norm(a)||1));
  const clamp = (x,l,h) => Math.min(h,Math.max(l,x));
  const wrap = x => ((x%TAU)+TAU)%TAU;
  const angle = (a,b,n) => Math.atan2(dot(cross(a,b),n),dot(a,b));
  function axes(i=0,lan=0) {
    const node = [Math.cos(lan), Math.sin(lan), 0];
    const side = [-node[1]*Math.cos(i),node[0]*Math.cos(i),Math.sin(i)];
    return {node,side,normal:cross(node,side)};
  }
  function meanAnomaly(e,nu) {
    const E = Math.atan2(Math.sqrt(1-e*e)*Math.sin(nu),e+Math.cos(nu));
    return E-e*Math.sin(E);
  }
  function stateToElements(r,v,mu) {
    const radiusKm = norm(r), speedKmS = norm(v);
    if (!(radiusKm>0 && mu>0)) throw new RangeError('Positive radius and mu required');
    const radialHat = unit(r), hVec = cross(r,v), h = norm(hVec);
    const normalHat = h>1e-12 ? unit(hVec) : unit(cross(radialHat, Math.abs(radialHat[2])<0.9?[0,0,1]:[1,0,0]));
    const progradeHat = speedKmS>1e-9 ? unit(v) : unit(cross(normalHat,radialHat));
    const eVec = sub(scale(cross(v,hVec),1/mu),radialHat), e = norm(eVec);
    const energy = speedKmS**2/2-mu/radiusKm, a = -mu/(2*energy), isBound = energy<0;
    const iRad = Math.atan2(Math.hypot(normalHat[0],normalHat[1]),normalHat[2]);
    const omegaAscRad = Math.hypot(normalHat[0],normalHat[1])>1e-14 ? wrap(Math.atan2(normalHat[0],-normalHat[1])) : 0;
    const {node} = axes(iRad,omegaAscRad);
    const peri = e>1e-14 ? unit(eVec) : node;
    const argPeriRad = wrap(angle(node,peri,normalHat)), nuRad = wrap(angle(peri,radialHat,normalHat));
    const rp = h*h/mu/(1+e), ra = isBound ? 2*a-rp : Infinity;
    const periodS = isBound ? TAU*Math.sqrt(a**3/mu) : Infinity;
    let timeToPeS = Infinity, timeToApS = Infinity;
    if (isBound) {
      const M = meanAnomaly(Math.min(e,1),nuRad);
      timeToPeS = wrap(-M)*periodS/TAU;
      timeToApS = wrap(Math.PI-M)*periodS/TAU;
    } else if (dot(r,v)<0 && e>1) {
      const H = Math.asinh(dot(r,v)/(e*Math.sqrt(-mu*a)));
      timeToPeS = -(e*Math.sinh(H)-H)*Math.sqrt((-a)**3/mu);
    }
    return {a,e,eVec,hVec,h,iRad,omegaAscRad,argPeriRad,nuRad,rp,ra,radiusKm,periodS,energy,
      speedKmS,vCircKmS:Math.sqrt(mu/radiusKm),vEscKmS:Math.sqrt(2*mu/radiusKm),
      isBound,timeToPeS,timeToApS,progradeHat,radialHat,normalHat};
  }
  function elementsToState(el,mu) {
    const {node,side} = axes(el.iRad,el.omegaAscRad);
    const u = (el.nuRad||0)+(el.argPeriRad||0), w = el.argPeriRad||0;
    const p = el.h ? el.h**2/mu : el.rp ? el.rp*(1+el.e) : el.a*(1-el.e**2);
    if (!(p > 1e-9)) {
      const rRad = Math.max(1, el.radiusKm || el.ra || 1);
      return {rKm:scale(add(scale(node,Math.cos(u)),scale(side,Math.sin(u))),rRad), vKmS:zero.slice()};
    }
    const r = p/(1+el.e*Math.cos(el.nuRad||0));
    return {rKm:scale(add(scale(node,Math.cos(u)),scale(side,Math.sin(u))),r),
      vKmS:scale(add(scale(node,-Math.sin(u)-el.e*Math.sin(w)),scale(side,Math.cos(u)+el.e*Math.cos(w))),Math.sqrt(mu/p))};
  }
  function stepOrbitalState(r,v,accel,dt,mu,opts) {
    const acceleration = p => add(scale(p,-mu/norm(p)**3),accel||zero);
    const onSubstep = opts && typeof opts.onSubstep === 'function' ? opts.onSubstep : null;
    const maxSubstepS = opts && Number.isFinite(opts.maxSubstepS) && opts.maxSubstepS > 0 ? opts.maxSubstepS : Infinity;
    let left = dt, elapsedS = 0, stopped = false;
    if (!onSubstep && !norm(accel||zero) && Math.abs(dt)>1000) {
      const orbit = stateToElements(r,v,mu);
      if (orbit.isBound) left %= orbit.periodS;
    }
    let g = acceleration(r);
    while (Math.abs(left)>1e-12) {
      const radius = norm(r);
      const h = Math.sign(left)*Math.min(Math.abs(left),maxSubstepS,0.013*Math.sqrt(radius/(norm(g)||1e-30)),0.013*radius/(norm(v)||1e-30));
      const rPrev = r, vPrev = v, tPrev = elapsedS;
      r = add(add(r,scale(v,h)),scale(g,0.5*h*h));
      const next = acceleration(r);
      v = add(v,scale(add(g,next),0.5*h));
      g = next;
      left -= h;
      elapsedS += h;
      if (onSubstep && onSubstep(rPrev,r,vPrev,v,tPrev,elapsedS)===false) {
        stopped = true;
        break;
      }
    }
    return onSubstep ? {rKm:r,vKmS:v,stopped,elapsedS} : {rKm:r,vKmS:v};
  }
  function sampleOrbitPoints(el,mu,numPts=128) {
    const count = Math.max(3,Math.floor(numPts));
    if (!(el.h > 1e-6)) {
      const rStart = Math.max(1, el.radiusKm || el.ra || 1);
      const hat = el.radialHat || [1,0,0];
      return {points:Array.from({length:count},(_,j)=>scale(hat, rStart*(1-j/(count-1)))),
        periapsis:zero.slice(), apoapsis:scale(hat, rStart)};
    }
    const bound = el.e<1, limit = bound ? Math.PI : Math.acos(-1/el.e)*0.95;
    const at = nuRad => elementsToState({...el,nuRad},mu).rKm;
    return {points:Array.from({length:count},(_,j)=>at(-limit+2*limit*j/(count-1))),
      periapsis:at(0),apoapsis:bound?at(Math.PI):null};
  }
  function computeHillRadiusKm(orbitRadiusKm, bodyMuKm3S2, parentMuKm3S2) {
    if (!(orbitRadiusKm > 0 && bodyMuKm3S2 > 0 && parentMuKm3S2 > 0)) return 0;
    return orbitRadiusKm * Math.cbrt(bodyMuKm3S2 / (3 * parentMuKm3S2));
  }

  function segmentSphereHit(p0, p1, center=zero, radius=0) {
    const c = center || zero;
    if (!(radius > 0) || !Array.isArray(p0) || !Array.isArray(p1)) {
      return {hit:false, tHit:null, tClosest:0, minDist:Infinity, closestPoint:Array.isArray(p0)?p0.slice():zero.slice(), hitPoint:null};
    }
    const d = sub(p1, p0), m = sub(p0, c), a = dot(d, d), m2 = dot(m, m), r2 = radius * radius;
    if (a <= 1e-18) {
      const dist = Math.sqrt(m2), hit = dist <= radius;
      return {hit, tHit:hit?0:null, tClosest:0, minDist:dist, closestPoint:p0.slice(), hitPoint:hit?p0.slice():null};
    }
    const b = dot(m, d);
    const tClosest = clamp(-b / a, 0, 1);
    const closestPoint = add(p0, scale(d, tClosest));
    const minDist = norm(sub(closestPoint, c));
    if (minDist > radius) {
      return {hit:false, tHit:null, tClosest, minDist, closestPoint, hitPoint:null};
    }
    let tHit = 0;
    if (m2 > r2) {
      const disc = Math.max(0, b * b - a * (m2 - r2));
      tHit = clamp((-b - Math.sqrt(disc)) / a, 0, 1);
    }
    const hitPoint = add(p0, scale(d, tHit));
    return {hit:true, tHit, tClosest, minDist, closestPoint, hitPoint};
  }

  function segmentRingPlaneHit(p0, p1, rInnerKm, rOuterKm, center=zero, normal=[0,0,1]) {
    const c = center || zero, n = unit(normal || [0,0,1]);
    if (!(rOuterKm > rInnerKm && rInnerKm >= 0) || !Array.isArray(p0) || !Array.isArray(p1)) {
      return {hit:false, tHit:null, radiusKm:NaN, hitPoint:null};
    }
    const q0 = sub(p0, c), q1 = sub(p1, c);
    const z0 = dot(q0, n), z1 = dot(q1, n);
    const crossed = (z0 > 0 && z1 <= 0) || (z0 < 0 && z1 >= 0);
    if (!crossed || Math.abs(z0 - z1) < 1e-15) {
      return {hit:false, tHit:null, radiusKm:NaN, hitPoint:null};
    }
    const tHit = clamp(z0 / (z0 - z1), 0, 1);
    const rel = add(q0, scale(sub(q1, q0), tHit));
    const inPlane = sub(rel, scale(n, dot(rel, n)));
    const radiusKm = norm(inPlane);
    const hit = radiusKm >= rInnerKm && radiusKm <= rOuterKm;
    return {hit, tHit:hit?tHit:null, radiusKm, hitPoint:hit?add(c, rel):null};
  }

  function checkStationProximity(rShip, vShip, rStation, vStation, opts={}) {
    const triggerDistKm = Number.isFinite(opts.triggerDistKm) ? opts.triggerDistKm : 0.45;
    const safeDistKm = Number.isFinite(opts.safeDistKm) ? opts.safeDistKm : 0.55;
    const minRelSpeedKmS = Number.isFinite(opts.minRelSpeedKmS) ? opts.minRelSpeedKmS : 0.05;
    const rel1 = sub(rShip, rStation);
    const rel0 = opts.rShipPrev ? sub(opts.rShipPrev, opts.rStationPrev || rStation) : rel1;
    const relV = sub(vShip, vStation);
    const relSpeedKmS = norm(relV);
    const hit = segmentSphereHit(rel0, rel1, zero, triggerDistKm);
    if (opts.docked || !hit.hit || !(relSpeedKmS > minRelSpeedKmS)) {
      return {triggered:false, minDistKm:hit.minDist, relSpeedKmS, rKm:rShip.slice(), vKmS:vShip.slice(), safeDistKm};
    }
    let outDir;
    if (norm(rel1) > 1e-6) outDir = unit(rel1);
    else if (norm(hit.closestPoint) > 1e-6) outDir = unit(hit.closestPoint);
    else {
      const vHat = unit(relV);
      outDir = unit(cross(vHat, Math.abs(vHat[2]) < 0.9 ? [0,0,1] : [1,0,0]));
    }
    const rKm = add(rStation, scale(outDir, safeDistKm));
    const radialSpeed = dot(relV, outDir);
    const pushSpeed = radialSpeed < 0 ? (-radialSpeed + 0.015) : 0.015;
    const vKmS = add(vShip, scale(outDir, pushSpeed));
    return {triggered:true, minDistKm:hit.minDist, relSpeedKmS, rKm, vKmS, safeDistKm};
  }

  function ensureBodyGravity(body, parentBody, isMoon=false) {
    if (!body || typeof body !== 'object') return body;
    const r = Math.max(1, Number(body.radiusKm) || (isMoon ? 250 : 6000));
    if (!(Number.isFinite(body.muKm3S2) && body.muKm3S2 > 0)) {
      // Realistic density fallback: ~1900 kg/m^3 for icy/rocky moons (~8978 km^3/s^2 for Titan),
      // terrestrial density for rocky planets.
      body.muKm3S2 = isMoon ? 5.31e-7 * r * r * r : 398600.44 * (r / 6371) ** 3;
    }
    if (parentBody && Number.isFinite(parentBody.muKm3S2) && parentBody.muKm3S2 > 0) {
      const orbitR = body.orbitRadiusKm ?? ((body.orbitRadiusAU || 0) * AU_KM);
      if (orbitR > 0) {
        body.rHillKm = computeHillRadiusKm(orbitR, body.muKm3S2, parentBody.muKm3S2);
      }
    }
    return body;
  }

  function safeOrbitRadiusKm(bodyRadiusKm, rHillKm, isMoon=false, atmoAltKm=0) {
    const r = Math.max(1, Number(bodyRadiusKm) || 1);
    const atmo = Math.max(0, Number(atmoAltKm) || 0);
    const minAlt = isMoon ? Math.max(350, 0.35 * r, atmo + 550) : Math.max(450, 0.35 * r, atmo + 450);
    const desired = r + minAlt;
    if (Number.isFinite(rHillKm) && rHillKm > r * 1.15) {
      return Math.min(desired, Math.max(r * 1.35, r + atmo + 300, rHillKm * 0.72));
    }
    return desired;
  }

  function isGasGiant(body, kind) {
    if (!body) return false;
    const k = String(body.kind || kind || '');
    return /saturnian|giant|disk|clouds|brown-dwarf/i.test(k);
  }

  function bodyAtmosphereAltKm(body, kind) {
    if (!body) return 0;
    const r = Math.max(0, Number(body.radiusKm) || 0);
    if (!(r > 0)) return 0;
    if (kind === 'star') return Math.max(5000, 0.05 * r);
    if (kind === 'moon') {
      const desc = (body.name || '') + ' ' + (body.kind || '');
      if (/titan|triton|hazy/i.test(desc)) return Math.max(300, 0.12 * r);
      return 0;
    }
    if (isGasGiant(body, kind)) return Math.max(450, 0.015 * r);
    const pk = String(body.kind || '');
    if (/venus|hazy|terrestrial|pelagic|ocean|mars/i.test(pk)) return Math.max(120, 0.02 * r);
    return 0;
  }

  function planCircularizationBurn(rKm, vKmS, muKm3S2, mode='now') {
    const m = ['now', 'pe', 'ap'].includes(mode) ? mode : 'now';
    const el = stateToElements(rKm, vKmS, muKm3S2);
    let dtS = 0, rBurn = rKm.slice(), vBurn = vKmS.slice();
    if (m === 'pe') {
      if ((el.isBound || dot(rKm, vKmS) < 0) && Number.isFinite(el.timeToPeS)) {
        dtS = Math.max(0, el.timeToPeS);
        if (dtS > 1e-6) {
          const st = keplerCoast(rKm, vKmS, muKm3S2, el)(dtS);
          rBurn = st.rKm; vBurn = st.vKmS;
        }
      }
    } else if (m === 'ap') {
      if (!el.isBound || !Number.isFinite(el.timeToApS)) {
        return {valid:false, reason:'no-apoapsis', alreadyCircular:false, dtS:0, dvKmS:0, dvVecKmS:zero.slice(), dvP:0, dvN:0, dvR:0, radiusKm:el.radiusKm, mode:m};
      }
      dtS = Math.max(0, el.timeToApS);
      if (dtS > 1e-6) {
        const st = keplerCoast(rKm, vKmS, muKm3S2, el)(dtS);
        rBurn = st.rKm; vBurn = st.vKmS;
      }
    }
    const elB = stateToElements(rBurn, vBurn, muKm3S2);
    const {radial:radHat, normal:nrmHat, tangent:proHat} = orbitalFrame(rBurn, vBurn);
    const vCircVec = scale(proHat, elB.vCircKmS);
    const dvVecKmS = sub(vCircVec, vBurn);
    const dvKmS = norm(dvVecKmS);
    const dvP = dot(dvVecKmS, proHat), dvN = dot(dvVecKmS, nrmHat), dvR = dot(dvVecKmS, radHat);
    const alreadyCircular = dvKmS < 0.002;
    return {valid:true, alreadyCircular, dtS, dvKmS, dvVecKmS, dvP, dvN, dvR, radiusKm:elB.radiusKm, mode:m, rKm:rBurn, vKmS:vBurn};
  }

  const lagrangeOrigins = new WeakMap();

  function orbitalFrame(relativeR, relativeV) {
    const radial = unit(relativeR);
    const auxiliary = Math.abs(radial[2]) < 0.9 ? [0,0,1] : [0,1,0];
    const h = cross(radial, relativeV);
    const normal = norm(h) > 0 ? unit(h) : unit(sub(auxiliary, scale(radial, dot(auxiliary, radial))));
    return {radial, normal, tangent:cross(normal, radial)};
  }

  function computeLagrangePoints(rPrimaryKm, rSecondaryKm, muPrimary, muSecondary, velSecondaryKmS=zero) {
    const relativeR = sub(rSecondaryKm, rPrimaryKm), separation = norm(relativeR);
    if (!(separation > 0 && muPrimary > 0 && muSecondary > 0)) return [];
    const q = muSecondary / (muPrimary + muSecondary);
    const frame = orbitalFrame(relativeR, velSecondaryKmS);
    const angularSpeed = Math.sqrt((muPrimary + muSecondary) / separation**3);

    // Solve the circular restricted three-body force equation for L1 and L2.
    // x is in separation units with the primary at 0 and secondary at 1.
    function equilibrium(low, high) {
      for (let i=0; i<60; i++) {
        const x = (low+high)/2, d = x-1;
        const force = x-q-(1-q)/x**2-q*Math.sign(d)/d**2;
        if (force > 0) high=x;
        else low=x;
      }
      return (low+high)/2;
    }
    const coordinates = [
      [equilibrium(0,1),0], [equilibrium(1,2),0], [-(1-5*q/12),0],
      [0.5,Math.sqrt(3)/2], [0.5,-Math.sqrt(3)/2]
    ];
    return coordinates.map(([x,y],index) => {
      const relative = scale(add(scale(frame.radial,x),scale(frame.tangent,y)),separation);
      const id = 'L'+(index+1);
      const point = {
        id, label:id, rKm:add(rPrimaryKm,relative),
        vKmS:scale(cross(frame.normal,relative),angularSpeed),
        kind:'lagrange', stable:index>=3 && 27*q*(1-q)<1
      };
      lagrangeOrigins.set(point,rPrimaryKm.slice());
      return point;
    });
  }

  function sampleLissajousOrbit(lPoint, rSecondaryKm, muPrimary, muSecondary, opts={}) {
    const primary = opts.rPrimaryKm || lagrangeOrigins.get(lPoint) || zero;
    const relativeR = sub(rSecondaryKm, primary);
    const separation = norm(relativeR);
    const pointNormal = cross(sub(lPoint.rKm,primary),lPoint.vKmS||zero);
    const frame = orbitalFrame(relativeR,opts.velSecondaryKmS||cross(pointNormal,relativeR));
    const centerKm = lPoint.rKm.slice();
    const triang = lPoint.id === 'L4' || lPoint.id === 'L5';
    const hill = computeHillRadiusKm(separation,muSecondary,muPrimary);
    const ampKm = opts.ampKm ?? hill*(triang ? 0.62 : 0.42);
    const vertical = opts.verticalAmpKm ?? ampKm*(triang ? 0.18 : 0.72);
    const n = Math.sqrt((muPrimary+muSecondary)/separation**3);
    const q = muSecondary/(muPrimary+muSecondary);
    const slow = Math.sqrt((1-Math.sqrt(Math.max(0,1-27*q*(1-q))))/2);
    const periodS = opts.periodS ?? TAU/(n*(triang ? slow || 1 : 2));
    const count = Math.max(9,Math.floor(opts.numPts ?? opts.samples ?? 129));
    const points = Array.from({length:count-1},(_,i) => {
      const t = TAU*i/(count-1);
      const x = ampKm*(triang ? Math.cos(t) : 0.46*Math.sin(2*t));
      const y = ampKm*Math.sin(t);
      const z = vertical*(triang ? Math.cos(2*t) : Math.cos(t));
      return add(centerKm,add(add(scale(frame.radial,x),scale(frame.tangent,y)),scale(frame.normal,z)));
    });
    points.push(points[0].slice());
    return {points,periodS,ampKm,centerKm};
  }

  function stumpff(z) {
    if (Math.abs(z)<1e-3) {
      return [0.5-z*(1/24-z*(1/720-z/40320)), 1/6-z*(1/120-z*(1/5040-z/362880))];
    }
    const x = Math.sqrt(Math.abs(z));
    return z>0 ? [2*Math.sin(x/2)**2/z,(x-Math.sin(x))/x**3]
      : [2*Math.sinh(x/2)**2/(-z),(Math.sinh(x)-x)/x**3];
  }

  // Short-way, zero-revolution Lambert transfer between two positions.
  function transferVelocity(from,to,mu,dt) {
    const r0=norm(from), r1=norm(to), cosine=clamp(dot(from,to)/(r0*r1),-1,1);
    const A=Math.sqrt(r0*r1*(1+cosine));
    if (!(A>0 && mu>0 && dt>0) || Math.abs(cosine)>0.999999) return null;
    function evaluate(z) {
      const [c,s]=stumpff(z);
      const y=r0+r1+A*(z*s-1)/Math.sqrt(c);
      const t=y>0 ? ((y/c)**1.5*s+A*Math.sqrt(y))/Math.sqrt(mu) : -1;
      return {y,t};
    }
    let lo=-4, hi=TAU**2-1e-3;
    while (evaluate(lo).t>dt && lo>-256) lo*=2;
    for (let i=0;i<54;i++) {
      const mid=(lo+hi)/2;
      if (evaluate(mid).t<dt) lo=mid;
      else hi=mid;
    }
    const {y,t}=evaluate((lo+hi)/2);
    if (!(y>0) || Math.abs(t-dt)>dt*1e-6) return null;
    const g=A*Math.sqrt(y/mu);
    return {
      departure:scale(sub(to,scale(from,1-y/r0)),1/g),
      arrival:scale(sub(scale(to,1-y/r1),from),1/g)
    };
  }

  function coastPreviewTime(el) {
    return el.isBound && el.h ? el.periodS : 8*el.radiusKm/Math.max(el.speedKmS,el.vCircKmS);
  }

  // Universal anomaly keeps the same Kepler solver through the escape limit.
  function keplerCoast(r,v,mu,el) {
    const r0 = norm(r), rootMu = Math.sqrt(mu);
    const alpha = -2*el.energy/mu, radial = dot(r,v)/rootMu;
    function timeEquation(x) {
      const [c,s] = stumpff(alpha*x*x);
      return (radial*x*x*c+(1-alpha*r0)*x**3*s+r0*x)/rootMu;
    }
    return duration => {
      const dt = el.isBound ? duration%el.periodS : duration;
      if (dt===0) return {rKm:r.slice(),vKmS:v.slice()};
      let lo = 0, hi = Math.min(rootMu*dt/r0,Math.sqrt(r0));
      if (alpha<0) hi=Math.min(hi,1/Math.sqrt(-alpha));
      while (timeEquation(hi)<dt) { lo=hi; hi*=2; }
      for (let j=0; j<48; j++) {
        const mid=(lo+hi)/2;
        if (timeEquation(mid)<dt) lo=mid;
        else hi=mid;
      }
      const x=(lo+hi)/2, z=alpha*x*x, [c,s]=stumpff(z);
      const rKm=add(scale(r,1-x*x*c/r0),scale(v,dt-x**3*s/rootMu));
      const r1=norm(rKm);
      return {rKm,vKmS:add(scale(r,rootMu*x*(z*s-1)/(r0*r1)),scale(v,1-x*x*c/r1))};
    };
  }

  function propagateManeuverChain(r0Km, v0KmS, muKm3S2, burns=[]) {
    const mu=muKm3S2, segments=[], nodes=[];
    let r=r0Km, v=v0KmS, time=0, totalDvKmS=0, el=stateToElements(r,v,mu);
    function coast(duration,burnIndex,waypointS) {
      const stateAt=keplerCoast(r,v,mu,el);
      const displayDuration=Math.min(duration,el.periodS);
      const sampleTimesS=duration ? Array.from({length:97},(_,j)=>displayDuration*j/96) : [0];
      // One revolution describes the closed conic even when waiting multiple
      // periods. Sample the remaining partial revolution so the arc joins the burn.
      let gapIndex=-1;
      if (duration>displayDuration) {
        const tail=duration%displayDuration;
        gapIndex=sampleTimesS.length;
        if (tail>0) {
          for (let j=0; j<=48; j++) sampleTimesS.push(duration-tail+tail*j/48);
        } else {
          sampleTimesS.push(duration);
        }
      }
      if (waypointS>0 && waypointS<duration && !sampleTimesS.includes(waypointS)) {
        // Preserve the exact scheduled encounter in whichever displayed pass contains it.
        const pass=sampleTimesS.findIndex(dt=>dt>waypointS);
        if (pass>=0 && pass!==gapIndex) {
          sampleTimesS.splice(pass,0,waypointS);
          if (gapIndex>=0 && pass<gapIndex) gapIndex++;
        }
      }
      sampleTimesS[sampleTimesS.length-1]=duration;
      const next=stateAt(duration);
      const points=sampleTimesS.map((dt,j)=>j===sampleTimesS.length-1 ? next.rKm : stateAt(dt).rKm);
      const {periapsis,apoapsis}=el.h ? sampleOrbitPoints(el,mu,3) : {periapsis:zero,apoapsis:null};
      const segment={points,sampleTimesS,gapIndex,el,startTimeS:time,endTimeS:time+duration,burnIndex,periapsis,apoapsis};
      // Keep the serialized segment shape while allowing exact timed previews.
      Object.defineProperty(segment,'stateAt',{value:stateAt});
      segments.push(segment);
      r=next.rKm; v=next.vKmS; time+=duration;
    }
    const finite = x => Number.isFinite(x) ? x : 0;
    burns.forEach((burn,index) => {
      const dtS=Math.max(0,finite(burn.dtS));
      coast(dtS,index);
      const {radial:radHat,normal:nrmHat,tangent:proHat}=orbitalFrame(r,v);
      const dvP=finite(burn.dvP), dvN=finite(burn.dvN), dvR=finite(burn.dvR);
      const dvVecKmS=add(add(scale(proHat,dvP),scale(nrmHat,dvN)),scale(radHat,dvR));
      const vAfterKmS=add(v,dvVecKmS), dvMagKmS=Math.hypot(dvP,dvN,dvR);
      nodes.push({index,id:burn.id,label:burn.label,kind:burn.kind,dtS,cumTimeS:time,rKm:r,
        vBeforeKmS:v,vAfterKmS,dvVecKmS,dvP,dvN,dvR,dvMagKmS,proHat,nrmHat,radHat});
      totalDvKmS+=dvMagKmS;
      v=vAfterKmS;
      el=stateToElements(r,v,mu);
    });
    const interceptTimeS=finite(burns.at(-1)?.interceptTimeS);
    coast(Math.max(coastPreviewTime(el),interceptTimeS),null,interceptTimeS);
    return {segments,nodes,totalDvKmS,finalEl:el};
  }

  function planEscapeManeuver(r,v,mu,dirHat) {
    const dir = unit(dirHat && norm(dirHat) ? dirHat : norm(v)?v:r);
    const gap = 2*mu/norm(r)-dot(v,v), along = dot(v,dir);
    const dvKmS = gap>=0 ? Math.sqrt(along**2+gap)-along+0.001 : 0;
    return {valid:true,dvKmS,dvVecKmS:scale(dir,dvKmS),burnDurationS:dvKmS/G0_KMS2};
  }
  function targetElements(el,s) {
    const rp = s.rpKm || s.radiusKm || el.radiusKm, ra = s.raKm || rp;
    return {a:(rp+ra)/2,e:(ra-rp)/(ra+rp),rp,ra,iRad:s.incRad??el.iRad,
      omegaAscRad:s.lanRad??el.omegaAscRad,argPeriRad:s.argPeriRad||0,nuRad:0};
  }
  function planHohmannTransfer(r,v,mu,s={}) {
    const el = stateToElements(r,v,mu), targetEl = targetElements(el,s);
    const R = targetEl.rp, plane = axes(targetEl.iRad,targetEl.omegaAscRad);
    let radial = el.radialHat, dv1NodeNuRad = el.nuRad, waitTimeS = 0;
    // Put the arrival at a mutual node so the insertion impulse can rotate the plane.
    const mutual = cross(el.normalHat,plane.normal);
    if (norm(mutual)>1e-7 && el.isBound) {
      radial = unit(mutual);
      let advance = wrap(angle(el.radialHat,radial,el.normalHat));
      if (advance>Math.PI) { radial=scale(radial,-1); advance-=Math.PI; }
      dv1NodeNuRad = wrap(el.nuRad+advance);
      waitTimeS = wrap(meanAnomaly(el.e,dv1NodeNuRad)-meanAnomaly(el.e,el.nuRad))*el.periodS/TAU;
      const node = elementsToState({...el,nuRad:dv1NodeNuRad},mu);
      r=node.rKm; v=node.vKmS;
    }
    const r0=norm(r), a=(r0+R)/2, tang=unit(cross(el.normalHat,radial));
    const departure=scale(tang,Math.sqrt(mu*(2/r0-1/a)));
    let dv1VecKmS=sub(departure,v), transferTimeS=Math.PI*Math.sqrt(a**3/mu);
    const arrivalRad=scale(radial,-1), arrivalTan=unit(cross(plane.normal,arrivalRad));
    const insertionSpeed=Math.sqrt(mu*(2/R-1/targetEl.a));
    const arrivalSpeed=Math.sqrt(mu*(2/R-1/a));
    let dv2VecKmS=sub(scale(arrivalTan,insertionSpeed),scale(tang,-arrivalSpeed));
    targetEl.argPeriRad=wrap(angle(plane.node,arrivalRad,plane.normal));
    if (s.targetPosKm && el.isBound && norm(mutual)<1e-7) {
      const n0=TAU/el.periodS, n1=Math.sqrt(mu/R**3), phase=angle(radial,unit(s.targetPosKm),el.normalHat);
      const error=Math.PI-phase-n1*transferTimeS;
      if (Math.abs(n1-n0)>1e-12) {
        waitTimeS=wrap(Math.sign(n1-n0)*error)/Math.abs(n1-n0);
        const u=n0*waitTimeS;
        radial=add(scale(radial,Math.cos(u)),scale(tang,Math.sin(u)));
        const rotated=unit(cross(el.normalHat,radial));
        r=scale(radial,r0); v=scale(rotated,el.speedKmS);
        dv1VecKmS=scale(rotated,dot(dv1VecKmS,tang));
        dv2VecKmS=scale(rotated,dot(dv2VecKmS,tang));
        dv1NodeNuRad=wrap(el.nuRad+u);
      } else if (el.e<1e-6) {
        // One-revolution phasing ellipse. Return to the burn point with the target.
        transferTimeS=(TAU+wrap(-phase))/n1;
        const phaseA=Math.cbrt(mu*(transferTimeS/TAU)**2);
        dv1VecKmS=sub(scale(tang,Math.sqrt(mu*(2/r0-1/phaseA))),v);
        dv2VecKmS=scale(dv1VecKmS,-1);
      }
    }
    if (s.kind==='escape') {
      dv1VecKmS=planEscapeManeuver(r,v,mu,s.dirHat).dvVecKmS;
      transferTimeS=0; dv2VecKmS=zero;
    } else if (Math.abs(r0-R)<1e-8 && !s.targetPosKm) {
      dv1VecKmS=sub(scale(unit(cross(plane.normal,radial)),insertionSpeed),v);
      transferTimeS=0; dv2VecKmS=zero;
    }
    const dv1KmS=norm(dv1VecKmS), dv2KmS=norm(dv2VecKmS), accel=s.maxAccelKmS2||G0_KMS2;
    return {valid:true,id:s.id,label:s.label,mode:s.kind,totalDvKmS:dv1KmS+dv2KmS,dv1KmS,dv1VecKmS,
      dv1NodeNuRad,waitTimeS,burn1DurationS:dv1KmS/accel,dv2KmS,dv2VecKmS,burn2DurationS:dv2KmS/accel,
      planeDvKmS:norm(add(arrivalTan,tang))*insertionSpeed,transferTimeS,
      predictedTransferEl:stateToElements(r,add(v,dv1VecKmS),mu),targetEl};
  }
  function planBrachistochroneOrbit(r0Km, v0KmS, rTgtKm, vTgtKmS, muKm3S2, accelG=1, opts={}) {
    if (![r0Km,v0KmS,rTgtKm,vTgtKmS].every(v=>Array.isArray(v) && v.length===3 && v.every(Number.isFinite))) {
      throw new TypeError('Flip-burn requires finite 3D endpoint states');
    }
    r0Km=r0Km.slice(); v0KmS=v0KmS.slice();
    rTgtKm=rTgtKm.slice(); vTgtKmS=vTgtKmS.slice();
    accelG=clamp(Number.isFinite(accelG)?accelG:1,0.25,2);
    const aKmS2=accelG*G0_KMS2;
    const dr=sub(rTgtKm,r0Km), dv=sub(vTgtKmS,v0KmS);
    // Endpoints are in the same SOI frame. This kinematic preview takes their
    // gravity and ephemeris as inputs via the endpoint states.
    const speedSum=add(v0KmS,vTgtKmS);
    const timeScale=Math.max(Math.sqrt(4*norm(dr)/aKmS2),(norm(v0KmS)+norm(vTgtKmS))/aKmS2);
    const stationary=norm(dr)===0 && norm(dv)===0;
    let tofS=0, accelLegKmS2=zero, decelLegKmS2=zero;
    if (!stationary) {
      // Equal-duration constant-vector legs satisfy both position and velocity
      // exactly. Solve for the shortest time with both legs within the g limit.
      // Normalize inverse time x so each acceleration is a*x*(q*x + l).
      const q=scale(dr,4/(timeScale**2*aKmS2));
      const legs=[1,-1].map(sign=>({
        q:scale(q,sign),
        l:scale(sub(dv,scale(speedSum,2*sign)),1/(timeScale*aKmS2))
      }));
      const acceleration=(leg,x)=>scale(add(scale(leg.q,x),leg.l),x);
      const magnitude=(leg,x)=>norm(acceleration(leg,x));
      // A leg's squared magnitude is quartic in x. Its stationary points
      // partition the search so closing velocity cannot hide a faster root.
      const limits=legs.flatMap(leg=>{
        const A=2*dot(leg.q,leg.q), B=3*dot(leg.q,leg.l), C=dot(leg.l,leg.l);
        if (!A || B>=0 || B*B<4*A*C) return [];
        const upperNumerator=(-B+Math.sqrt(B*B-4*A*C))/2;
        return [C/upperNumerator,upperNumerator/A];
      }).sort((a,b)=>a-b);
      let upper=Math.max(1,2*(limits.at(-1)||0));
      while (legs.every(leg=>magnitude(leg,upper)<=1)) upper*=2;
      const bounds=[0,...limits,upper];
      let inverseTime=0;
      for (let i=bounds.length-1;i>0;i--) {
        const low=bounds[i-1], high=bounds[i];
        let start=low,end=high;
        for (const leg of legs) {
          const lowOK=magnitude(leg,low)<=1, highOK=magnitude(leg,high)<=1;
          if (!lowOK && !highOK) { end=-1; break; }
          if (lowOK===highOK) continue;
          let a=low,b=high;
          for (let j=0;j<54;j++) {
            const mid=(a+b)/2;
            if ((magnitude(leg,mid)<=1)===lowOK) a=mid;
            else b=mid;
          }
          if (lowOK) end=Math.min(end,a);
          else start=Math.max(start,b);
        }
        if (end>=start) { inverseTime=end; break; }
      }
      tofS=timeScale/inverseTime;
      [accelLegKmS2,decelLegKmS2]=legs.map(leg=>scale(acceleration(leg,inverseTime),aKmS2));
    }
    const tFlipS=tofS/2;
    const at=(r,v,a,t)=>({rKm:add(r,scale(add(v,scale(a,t/2)),t)),vKmS:add(v,scale(a,t))});
    const flip=at(r0Km,v0KmS,accelLegKmS2,tFlipS);
    function stateAt(tS) {
      const t=clamp(tS,0,tofS);
      if (t===0) return {rKm:r0Km.slice(),vKmS:v0KmS.slice()};
      if (t===tofS) return {rKm:rTgtKm.slice(),vKmS:vTgtKmS.slice()};
      if (t<=tFlipS) return at(r0Km,v0KmS,accelLegKmS2,t);
      return at(rTgtKm,vTgtKmS,decelLegKmS2,t-tofS);
    }
    const intervals=2*Math.ceil((clamp(Number(opts?.samples)||129,65,4097)-1)/2);
    const points=Array.from({length:intervals+1},(_,i)=>stateAt(tofS*(i/intervals)).rKm);
    const peakSpeedKmS=Math.max(norm(v0KmS),norm(flip.vKmS),norm(vTgtKmS));
    let surfaceIntercept=false, hitBody=null;
    const bodyRadiusKm=Number(opts?.bodyRadiusKm)||0;
    const obstacles=Array.isArray(opts?.obstacles)?opts.obstacles:null;
    if (bodyRadiusKm>0 || (obstacles && obstacles.length)) {
      for (let i=1;i<points.length && !surfaceIntercept;i++) {
        const p0=points[i-1], p1=points[i];
        const t0=tofS*((i-1)/intervals), t1=tofS*(i/intervals);
        if (bodyRadiusKm>0 && segmentSphereHit(p0,p1,zero,bodyRadiusKm).hit) {
          surfaceIntercept=true; hitBody=opts?.bodyName||'primary'; break;
        }
        if (obstacles) {
          for (const obs of obstacles) {
            if (!obs || !(obs.radiusKm>0)) continue;
            const c0=typeof obs.centerAt==='function'?obs.centerAt(t0):(obs.centerKm||zero);
            const c1=typeof obs.centerAt==='function'?obs.centerAt(t1):(obs.centerKm||zero);
            if (segmentSphereHit(sub(p0,c0),sub(p1,c1),zero,obs.radiusKm).hit) {
              surfaceIntercept=true; hitBody=obs.name||'body'; break;
            }
          }
        }
      }
    }
    return {valid:!surfaceIntercept,surfaceIntercept,hitBody,isBrachistochrone:true,points,flipPointKm:flip.rKm,tofS,tFlipS,
      peakSpeedKmS,peakBeta:peakSpeedKmS/C_KMS,dvTotalKmS:aKmS2*tofS,accelG,muKm3S2,
      accelLegKmS2,decelLegKmS2,stateAt};
  }
  function computeGuidedOrbitMatch(r,v,mu,s,maxAccel) {
    const el=stateToElements(r,v,mu), target=targetElements(el,s);
    if (s.kind==='escape') {
      const burn=planEscapeManeuver(r,v,mu,s.dirHat);
      return {accelVecKmS2:scale(unit(burn.dvVecKmS),Math.min(maxAccel,burn.dvKmS)),dvEstKmS:burn.dvKmS,
        errAltKm:0,errVelKmS:burn.dvKmS,converged:burn.dvKmS===0};
    }
    const plane=axes(target.iRad,target.omegaAscRad);
    const longitude=Math.atan2(dot(r,plane.side),dot(r,plane.node));
    const goal=elementsToState({...target,nuRad:longitude-target.argPeriRad},mu);
    const R=norm(goal.rKm), n=Math.sqrt(mu/R**3);
    // Follow a rotating reference. Limit the radial approach speed during long transfers.
    let reference=goal.rKm, referenceV=goal.vKmS;
    if (s.targetPosKm && s.targetVelKmS) {
      const phase=angle(goal.rKm,s.targetPosKm,plane.normal);
      // Follow the arc rather than commanding a chord through the parent body.
      if (Math.abs(phase)>0.15 || Math.abs(el.radiusKm-R)>R*0.25) {
        referenceV=scale(goal.vKmS,1+clamp(phase*0.4,-0.12,0.12));
      } else {
        reference=s.targetPosKm; referenceV=s.targetVelKmS;
      }
    }
    const positionError=sub(reference,r);
    const velocityError=sub(referenceV,v);
    const gain=Math.max(n,Math.sqrt(maxAccel/Math.max(1,norm(positionError)))*0.45);
    const force=add(scale(positionError,gain*gain),scale(velocityError,2*gain));
    const radial=unit(reference);
    const centripetal=s.targetPosKm && reference===goal.rKm ?
      -(dot(v,unit(cross(plane.normal,radial)))**2)/R : -mu/norm(reference)**2;
    const command=add(force,sub(scale(radial,centripetal),scale(r,-mu/norm(r)**3)));
    const errAltKm=norm(sub(s.targetPosKm||reference,r)), errVelKmS=norm(sub(s.targetVelKmS||referenceV,v));
    return {accelVecKmS2:scale(command,Math.min(1,maxAccel/(norm(command)||1))),
      dvEstKmS:errVelKmS+gain*errAltKm,errAltKm,errVelKmS,
      converged:errAltKm<Math.max(0.1,R*0.0001) && errVelKmS<Math.max(0.001,n*R*0.0001)};
  }
  // Classical relativistic rocket algebra, kept for reference readouts only. Conjoiner
  // drives tap the quantum vacuum: no flight path is ever limited by these numbers.
  const relativisticDeltaVFromMass=(m0,m1,ve)=>ve*Math.log(m0/m1);
  const massAfterEtaBurn=(m0,delta,ve)=>m0*Math.exp(-Math.abs(delta)/ve);
  const maxEtaFromFuel=(m,dry,ve)=>Math.max(0,relativisticDeltaVFromMass(m,dry,ve));
  // Core thermal model. Waste heat scales as (a/1.5g)^1.6 against radiator headroom;
  // load 1 is the sustainable torch. Heat is a 0..1 fraction evolved in real seconds.
  const THERMAL_EQ=0.82, HEAT_TAU_S=30, COOL_TAU_S=20;
  const headroomOf=h=>clamp(Number.isFinite(h)&&h>0?h:1,0.25,2);
  function coreThermalLoad(accelG,headroom) {
    const g=Math.abs(Number(accelG)||0);
    return g>0.05?(g/1.5)**1.6/Math.max(0.35,headroomOf(headroom)):0;
  }
  const sustainableAccelG=(headroom,maxAccelG)=>
    Math.min(Number.isFinite(maxAccelG)&&maxAccelG>0?maxAccelG:Infinity,1.5*Math.max(0.35,headroomOf(headroom))**(1/1.6));
  const thermalStateOf=h=>h>=0.96?'overload':h>=0.8?'hot':h>=0.55?'warm':'nominal';
  function stepCoreHeat(heat,accelG,headroom,dtS) {
    const h=headroomOf(headroom), load=coreThermalLoad(accelG,h), target=THERMAL_EQ*load;
    const now=clamp(Number(heat)||0,0,1), dt=Math.max(0,Number(dtS)||0);
    const tau=target>now?HEAT_TAU_S:COOL_TAU_S/Math.max(0.35,h);
    const next=clamp(target+(now-target)*Math.exp(-dt/tau),0,1);
    return {heat:next,load,target,state:thermalStateOf(next)};
  }
  function stepRelativisticRocket(eta0,aCmdG,dt,stopAtZero,massOrOpts,dry) {
    // Reactionless: rapidity changes at kappa*tau with no propellant cap. The legacy
    // mass arguments are accepted and passed through unchanged.
    const opts=massOrOpts&&typeof massOrOpts==='object'?massOrOpts:{};
    const massMt=Number.isFinite(opts.massMt)?opts.massMt:Number.isFinite(massOrOpts)?massOrOpts:Number.isFinite(dry)?dry:0;
    eta0=clamp(Number(eta0)||0,-500,500); dt=Math.max(0,Number(dt)||0);
    const k=(Number(aCmdG)||0)*KAPPA_PER_G;
    const braking=stopAtZero && (eta0*k<0 || (eta0===0 && k<0));
    const capped=braking && Math.abs(k)*dt>=Math.abs(eta0);
    const rawDelta=Math.sign(k)*Math.min(Math.abs(k)*dt,braking?Math.abs(eta0):Infinity);
    const targetEta=capped?0:clamp(eta0+rawDelta,-500,500);
    const delta=targetEta-eta0;
    const eta=targetEta, gamma=Math.cosh(eta), burn=k?Math.abs(delta/k):0, coast=Math.max(0,dt-burn);
    const avg=eta0+delta/2, factor=delta?Math.sinh(delta/2)/(delta/2):1;
    return {eta,beta:Math.tanh(eta),gamma,massMt,dTauYears:dt,burnYears:burn,coastYears:coast,
      dCoordYears:burn*factor*Math.cosh(avg)+coast*gamma,
      dDistLy:burn*factor*Math.sinh(avg)+coast*Math.sinh(eta),
      fuelEmpty:false,fuelFrac:1,propUsedMt:0,reactionless:true,stopped:braking && eta===0};
  }
  function computeIsmAblation(beta,gamma,iceThick,iceCoverage,cos,dt) {
    // Incident relativistic H-I energy flux scales as beta*gamma*(gamma-1), while
    // vapor-shield self-blanketing & magnetic plasma deflection temper mass-loss
    // efficiency at high gamma so a multi-million-tonne Lighthugger ice carapace
    // survives 4-60 LY voyages and gives ample reaction time before critical loss.
    const bSafe=clamp(Math.abs(Number(beta)||0),0,0.999999);
    const gSafe=Number.isFinite(gamma)&&gamma>=1?Math.min(gamma,1e4):1/Math.sqrt(Math.max(1e-12,1-bSafe*bSafe));
    const dtSafe=Math.max(0,Number(dt)||0);
    const intensity=bSafe*gSafe*(gSafe-1);
    const effFlux=intensity/(1+0.12*(gSafe-1));
    const exposure=(1+24*(1-clamp(cos,0,1))**2)/(0.08+0.92*clamp(iceCoverage,0,1));
    const rate=effFlux*exposure*0.00018/(0.22+clamp(Number(iceThick)||0,0,2));
    return {intensity,exposure,iceLoss:rate*dtSafe,warningLevel:rate>0.075?'critical':rate>0.022?'elevated':'nominal'};
  }
  function planRelativisticMission(distLy,accelG,s,genome,opts={}) {
    // Flip-and-burn with no reaction-mass budget: every finite course can stop at the
    // destination. Limits come only from the core thermal load and the ice shield.
    s=s||{}; opts=opts||{};
    const dist=Math.max(0,Number(distLy)||0), g=Math.max(1e-6,Math.abs(Number(accelG)||0)), k=g*KAPPA_PER_G;
    const peakEta=Math.min(2*Math.asinh(Math.sqrt(k*dist/4)),Math.atanh(clamp(opts.maxBetaCap??1,1e-9,0.999999)));
    const peakBeta=Math.tanh(peakEta), peakGamma=Math.cosh(peakEta);
    const flipDistLy=2*Math.sinh(peakEta/2)**2/k, coastDistLy=Math.max(0,dist-2*flipDistLy);
    const coast=coastDistLy?(coastDistLy/peakBeta):0;
    const coordYears=2*Math.sinh(peakEta)/k+coast, burnTau=2*peakEta/k, coastTau=coast/peakGamma, tauYears=burnTau+coastTau, P=genome?.P||{};
    // Integrate ablation over proper ship time (burn spends most proper time below peak gamma).
    const effTau=burnTau*0.38+coastTau;
    const ice=computeIsmAblation(peakBeta,peakGamma,P.iceThick??0.5,P.iceCoverage??1,1,effTau);
    const headroom=headroomOf(Number.isFinite(s.thermalHeadroom)?s.thermalHeadroom:
      s.radiatorMW>0&&s.coreWasteMW>0?s.radiatorMW/s.coreWasteMW:1);
    const thermalLoad=coreThermalLoad(g,headroom), thermalPeakPct=100*Math.min(1,THERMAL_EQ*thermalLoad);
    const sustainedG=sustainableAccelG(headroom,s.maxAccelG);
    const thermalLevel=thermalPeakPct>=96?'critical':thermalPeakPct>=80?'elevated':'nominal';
    const thermalWarning=thermalLevel==='critical'?'Core saturates during burns; sustainable torch '+sustainedG.toFixed(2)+' g':
      thermalLevel==='elevated'?'Core runs hot during burns':'';
    const rank={nominal:0,elevated:1,critical:2};
    const warningLevel=rank[thermalLevel]>rank[ice.warningLevel]?thermalLevel:ice.warningLevel;
    const warningText=[thermalWarning,ice.warningLevel==='nominal'?'':'Elevated shield loading'].filter(Boolean).join('; ');
    return {distLy:dist,accelG:g,exhaustVelC:s.exhaustVelC,peakBeta,peakGamma,peakEta,coastDistLy,flipDistLy,tauYears,coordYears,
      reactionless:true,deltaVCapacity:Infinity,propUsedMt:0,fuelFracUsed:0,fuelRemainingAfterStop:1,canReachAndStop:true,
      thermalLoad,thermalPeakPct,radiatorHeadroom:headroom,sustainedAccelG:sustainedG,thermalWarning,
      coreRatingGW:s.coreRatingGW,radiatorMW:s.radiatorMW,
      iceAblationEst:ice.iceLoss,warningLevel,warningText};
  }
  // Bounded onboard AI missile guidance in gravity (Augmented ProNav + gravity compensation)
  function computeMissileGuidanceAccel(mPos, mVel, tPos, tVel, muKm3S2=0, opts={}) {
    const aMax = Math.max(0.01, Number(opts.aMaxKmS2) || 0.28);
    const navGain = Number(opts.navGain) || 3.8;
    const dr = sub(tPos, mPos);
    const R = norm(dr);
    if (!(R > 1e-6)) return { accelKmS2: [0, 0, 0], dirHat: unit(mVel || [1, 0, 0]), rangeKm: 0, closingKmS: 0 };
    const rHat = scale(dr, 1 / R);
    const dv = sub(tVel || zero, mVel || zero);
    const vc = -dot(dv, rHat);
    // Relative gravity compensation between target and missile
    let dg = zero;
    if (muKm3S2 > 0) {
      const rm = norm(mPos), rt = norm(tPos);
      const gm = rm > 1 ? scale(mPos, -muKm3S2 / (rm * rm * rm)) : zero;
      const gt = rt > 1 ? scale(tPos, -muKm3S2 / (rt * rt * rt)) : zero;
      dg = sub(gt, gm);
    }
    // ProNav acceleration normal to line-of-sight + closing-rate / lead pursuit term
    const omega = cross(dr, dv);
    const omegaVec = scale(omega, 1 / Math.max(1e-6, R * R));
    const vCloseEff = Math.max(vc, norm(dv) * 0.45, 0.8);
    const aPn = scale(cross(omegaVec, rHat), navGain * vCloseEff);
    const leadT = clamp(R / Math.max(1.2, vCloseEff + aMax * 4), 0.15, 22);
    const interceptErr = add(dr, scale(dv, leadT));
    const interceptHat = unit(interceptErr);
    // Bias toward LOS intercept while killing transverse miss rate via ProNav
    const alongGain = vc < Math.sqrt(2 * aMax * R) * 0.55 ? aMax * 0.85 : aMax * 0.35;
    const cmd = add(add(aPn, scale(interceptHat, alongGain)), scale(dg, 0.75));
    const cmdMag = norm(cmd);
    const accelKmS2 = cmdMag > aMax ? scale(cmd, aMax / cmdMag) : cmd;
    return {
      accelKmS2,
      dirHat: cmdMag > 1e-9 ? unit(accelKmS2) : rHat,
      rangeKm: R,
      closingKmS: vc
    };
  }

  // Advance physical coilgun slugs, RKVs, or AI-guided orbital missiles on true curved Keplerian paths
  function stepOrbitalProjectile(p, dtS, muKm3S2=0, bodyRadiusKm=0, targetState=null) {
    if (!p || !(dtS > 0)) return { hit: false, bodyHit: false, gravDeflectionKm: p?.gravDeflectionKm || 0 };
    const totalDt = Math.min(30, Math.max(0, dtS));
    const substeps = clamp(Math.ceil(totalDt / 0.2), 1, 24);
    const h = totalDt / substeps;
    if (!Array.isArray(p.rKm)) p.rKm = [0, 0, 0];
    if (!Array.isArray(p.vKmS)) p.vKmS = [1, 0, 0];
    if (!Array.isArray(p.straightR)) p.straightR = p.rKm.slice();
    if (!Array.isArray(p.straightV)) p.straightV = p.vKmS.slice();
    const hitRadiusKm = Math.max(0.5, Number(p.hitRadiusKm) || (p.kind === 'missile' ? 4.5 : 3.0));
    const mu = Number(muKm3S2) > 0 ? Number(muKm3S2) : 0;
    const gravAt = pos => {
      if (!(mu > 0)) return zero;
      const rMag = norm(pos);
      if (!(rMag > 1)) return zero;
      return scale(pos, -mu / (rMag * rMag * rMag));
    };
    const isMissile = p.kind === 'missile';
    const hasTgt = targetState && Array.isArray(targetState.rKm);
    let tPos = hasTgt ? targetState.rKm.slice() : null;
    const tVel = (hasTgt && Array.isArray(targetState.vKmS)) ? targetState.vKmS : zero;

    for (let si = 0; si < substeps; si++) {
      const prevR = p.rKm.slice();
      let thrustA = zero;
      p.burning = false;
      if (isMissile && (p.fuelS || 0) > 0 && tPos) {
        const gCmd = computeMissileGuidanceAccel(p.rKm, p.vKmS, tPos, tVel, mu, {
          aMaxKmS2: p.aMaxKmS2 || 0.28,
          navGain: p.navGain || 4.0
        });
        thrustA = gCmd.accelKmS2;
        if (norm(thrustA) > 1e-6) {
          p.burning = true;
          p.thrustDir = gCmd.dirHat;
        }
        p.fuelS = Math.max(0, (p.fuelS || 0) - h);
      }
      const a0 = add(gravAt(p.rKm), thrustA);
      const rNext = add(add(p.rKm, scale(p.vKmS, h)), scale(a0, 0.5 * h * h));
      const a1 = add(gravAt(rNext), thrustA);
      const vNext = add(p.vKmS, scale(add(a0, a1), 0.5 * h));
      p.rKm = rNext;
      p.vKmS = vNext;
      p.ageS = (p.ageS || 0) + h;
      // Also integrate gravity-free straight path (with same initial v, or same thrust without gravity)
      p.straightR = add(add(p.straightR, scale(p.straightV, h)), scale(thrustA, 0.5 * h * h));
      p.straightV = add(p.straightV, scale(thrustA, h));
      p.gravDeflectionKm = norm(sub(p.rKm, p.straightR));

      if (tPos) {
        const prevT = tPos;
        tPos = add(tPos, scale(tVel, h));
        const rel0 = sub(prevR, prevT), rel1 = sub(rNext, tPos);
        const hitTgt = segmentSphereHit(rel0, rel1, zero, hitRadiusKm);
        if (hitTgt.hit) {
          return { hit: true, bodyHit: false, hitPointKm: tPos.slice(), gravDeflectionKm: p.gravDeflectionKm, minDistKm: hitTgt.minDist };
        }
      }
      if (bodyRadiusKm > 0 && segmentSphereHit(prevR, rNext, zero, bodyRadiusKm).hit) {
        return { hit: false, bodyHit: true, gravDeflectionKm: p.gravDeflectionKm };
      }
    }
    return { hit: false, bodyHit: false, gravDeflectionKm: p.gravDeflectionKm || 0 };
  }

  // Exact 3D relativistic kinematics for an observed vessel in 3D motion relative to the Solar/Galactic frame
  function computeRelativisticContact3D(betaObsVec, betaTgtVec, restRelDirGal) {
    const bo = Array.isArray(betaObsVec) ? betaObsVec : [0, 0, 0];
    const bt = Array.isArray(betaTgtVec) ? betaTgtVec : [0, 0, 0];
    const nRest = unit(Array.isArray(restRelDirGal) ? restRelDirGal : [1, 0, 0]);
    const b2o = clamp(dot(bo, bo), 0, 0.99999);
    const b2t = clamp(dot(bt, bt), 0, 0.99999);
    const boMag = Math.sqrt(b2o);
    const gammaO = 1 / Math.sqrt(Math.max(1e-10, 1 - b2o));
    const gammaT = 1 / Math.sqrt(Math.max(1e-10, 1 - b2t));
    const boDotBt = dot(bo, bt);
    const denomVel = Math.max(1e-8, 1 - boDotBt);
    // Target 3D velocity in observer rest frame (Thomas-Wigner-boosted subtraction)
    const kO = gammaO > 1.00001 ? (gammaO / (gammaO + 1)) * boDotBt : 0.5 * boDotBt;
    const betaRelVec = [
      ((bt[0] / gammaO) - bo[0] + kO * bo[0]) / denomVel,
      ((bt[1] / gammaO) - bo[1] + kO * bo[1]) / denomVel,
      ((bt[2] / gammaO) - bo[2] + kO * bo[2]) / denomVel
    ];
    let betaRelMag = norm(betaRelVec);
    if (betaRelMag > 0.999995) {
      const sCap = 0.999995 / betaRelMag;
      betaRelVec[0] *= sCap; betaRelVec[1] *= sCap; betaRelVec[2] *= sCap;
      betaRelMag = 0.999995;
    }
    const gammaRel = Math.max(1, gammaO * gammaT * (1 - boDotBt));

    // Exact 3D relativistic aberration of line of sight nRest -> nObs (along observer velocity bo)
    let obsDirGal;
    if (boMag < 1e-6) {
      obsDirGal = nRest.slice();
    } else {
      const nDotBo = dot(nRest, bo);
      const factor = ((gammaO - 1) / b2o) * nDotBo + gammaO;
      const denomObs = Math.max(1e-8, gammaO * (1 + nDotBo));
      obsDirGal = unit([
        (nRest[0] + factor * bo[0]) / denomObs,
        (nRest[1] + factor * bo[1]) / denomObs,
        (nRest[2] + factor * bo[2]) / denomObs
      ]);
    }
    // Transform target rest hull heading (unit(bt)) to observer frame via Lorentz boost of unit direction
    let obsVelDirGal = norm(bt) > 1e-6 ? unit(bt) : [1, 0, 0];
    if (boMag >= 1e-6) {
      const hRest = obsVelDirGal;
      const hDotBo = dot(hRest, bo);
      const hFac = ((gammaO - 1) / b2o) * hDotBo - gammaO;
      obsVelDirGal = unit([
        hRest[0] + hFac * bo[0],
        hRest[1] + hFac * bo[1],
        hRest[2] + hFac * bo[2]
      ]);
    }
    const betaRadial = clamp(dot(betaRelVec, obsDirGal), -0.999995, 0.999995);
    const D = 1 / Math.max(1e-4, gammaRel * (1 + betaRadial));
    return {
      betaObsMag: boMag,
      gammaObs: gammaO,
      gammaRel,
      betaRelVec,
      betaRelMag,
      betaRelDirGal: betaRelMag > 1e-7 ? scale(betaRelVec, 1 / betaRelMag) : obsDirGal.slice(),
      betaRadial,
      obsDirGal,
      obsVelDirGal,
      D
    };
  }

  return {AU_KM,LY_KM,LY_PER_AU,C_KMS,G0_KMS2,KAPPA_PER_G,stateToElements,elementsToState,stepOrbitalState,
    sampleOrbitPoints,planHohmannTransfer,planBrachistochroneOrbit,computeGuidedOrbitMatch,planEscapeManeuver,relativisticDeltaVFromMass,
    massAfterEtaBurn,maxEtaFromFuel,planRelativisticMission,stepRelativisticRocket,computeIsmAblation,
    THERMAL_EQ,coreThermalLoad,sustainableAccelG,stepCoreHeat,thermalStateOf,
    computeHillRadiusKm,computeLagrangePoints,sampleLissajousOrbit,propagateManeuverChain,
    transferVelocity,coastPreviewTime,keplerCoast,
    segmentSphereHit,segmentRingPlaneHit,checkStationProximity,
    ensureBodyGravity,safeOrbitRadiusKm,isGasGiant,bodyAtmosphereAltKm,planCircularizationBurn,
    computeMissileGuidanceAccel,stepOrbitalProjectile,computeRelativisticContact3D};
});
