// front-app.js — the front page's miniatures. One WebGL renderer draws every card that is on
// screen through a scissor rectangle behind a transparent hole in that card, so seven schemas
// (one of them 1,400 tables) cost one context. Needs THREE, CARD, layout() and window.GALLERY.
(() => {
  const G = window.GALLERY;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // No WebGL: keep the flat map posters, say so, and show the switch for this browser. The
  // browser is read from the user agent, which is only good enough to pick a paragraph.
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
    document.body.classList.add('nogl');
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox'
      : /Chrome\/|Chromium\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
    const tip = document.querySelector(`.nogl-note p[data-browser="${browser}"]`);
    if (tip) tip.classList.add('on');
    // The recorded clips stand in for the miniatures; they are only fetched now, not for viewers with WebGL.
    for (const v of document.querySelectorAll('video.poster')) { v.preload = 'auto'; v.play().catch(() => {}); }
    return;
  }
  document.body.classList.add('gl');

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  const slabGeo = new THREE.BoxGeometry(CARD.w, CARD.h, CARD.d);
  const slabMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
  const tmpM = new THREE.Matrix4();
  const tmpC = new THREE.Color();

  function buildScene(card) {
    const el = document.querySelector(`.mini[data-slug="${card.slug}"]`);
    if (!el) return null;
    const m = card.mini;
    const L = layout(m);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#dfe7f5', '#1a1f2a', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.2);
    sun.position.set(20, 40, 15);
    scene.add(sun);
    const colorOfDomain = new Map(m.domains.map((d) => [d.key, d.color]));
    const domainOf = new Map(m.tables.map((t) => [t.name, t.domain]));

    // Islands: one translucent plate each.
    for (const i of L.islands) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(i.w, i.d),
        new THREE.MeshBasicMaterial({ color: i.color, transparent: true, opacity: 0.1, side: THREE.DoubleSide }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(i.cx, -0.12, i.cz);
      scene.add(plate);
    }
    // Cards: one instanced mesh, coloured per domain.
    const names = Object.keys(L.pos);
    const slabs = new THREE.InstancedMesh(slabGeo, slabMat, names.length);
    names.forEach((name, k) => {
      const p = L.pos[name];
      slabs.setMatrixAt(k, tmpM.makeTranslation(p.x, 0, p.z));
      slabs.setColorAt(k, tmpC.set(colorOfDomain.get(domainOf.get(name)) ?? '#7f8a99'));
    });
    slabs.instanceMatrix.needsUpdate = true;
    if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
    scene.add(slabs);
    // Arcs: every foreign key as 16 straight pieces of a quadratic curve, in one geometry.
    const SEG = 16;
    const positions = [];
    const colors = [];
    const a0 = new THREE.Vector3(), a1 = new THREE.Vector3(), mid = new THREE.Vector3();
    for (const a of L.arcs) {
      const fk = m.fks[a.i];
      const c = L.pos[fk.child], p = L.pos[fk.parent];
      if (a.kind === 'self') { a0.set(c.x + CARD.w / 2, 0.12, c.z); a1.set(c.x - CARD.w / 2, 0.12, c.z); }
      else { a0.set(c.x, 0.12, c.z); a1.set(p.x, 0.12, p.z); }
      mid.addVectors(a0, a1).multiplyScalar(0.5);
      mid.y += a.lift;
      const curve = new THREE.QuadraticBezierCurve3(a0.clone(), mid.clone(), a1.clone());
      const pts = curve.getPoints(SEG);
      tmpC.set(colorOfDomain.get(domainOf.get(fk.child)) ?? '#7f8a99');
      for (let s = 0; s < SEG; s += 1) {
        positions.push(pts[s].x, pts[s].y, pts[s].z, pts[s + 1].x, pts[s + 1].y, pts[s + 1].z);
        colors.push(tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b);
      }
    }
    if (positions.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 })));
    }
    const extent = Math.max(10, ...L.islands.map((i) => Math.hypot(i.cx, i.cz) + Math.hypot(i.w, i.d) / 2));
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, extent * 8);
    scene.fog = new THREE.Fog(new THREE.Color('#0e1116'), extent * 2.2, extent * 5);
    let seed = 0;
    for (const ch of card.slug) seed = (seed * 31 + ch.charCodeAt(0)) % 628;
    return { el, scene, camera, angle: seed / 100, dist: extent * 1.7, height: extent + 6, visible: false };
  }

  const scenes = G.cards.map(buildScene).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) { const s = scenes.find((x) => x.el === en.target); if (s) s.visible = en.isIntersecting; }
  }, { rootMargin: '80px' });
  scenes.forEach((s) => io.observe(s.el));

  const size = () => renderer.setSize(innerWidth, innerHeight, false);
  size();
  addEventListener('resize', size);

  function tick() {
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    const H = renderer.domElement.clientHeight;
    for (const s of scenes) {
      if (!s.visible) continue;
      const r = s.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width < 2) continue;
      const bottom = H - r.bottom;
      renderer.setViewport(r.left, bottom, r.width, r.height);
      renderer.setScissor(r.left, bottom, r.width, r.height);
      s.camera.aspect = r.width / r.height;
      s.camera.updateProjectionMatrix();
      if (!REDUCED) s.angle += 0.003;
      s.camera.position.set(Math.sin(s.angle) * s.dist, s.height, Math.cos(s.angle) * s.dist);
      s.camera.lookAt(0, 0, 0);
      renderer.render(s.scene, s.camera);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
