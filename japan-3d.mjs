import * as THREE from './assets/three.module.min.js';

// Render on demand. No continuous animation or map service requests.
export function createJapan3D(instance,polygons){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.domElement.className='three-map';renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  const material=new THREE.MeshStandardMaterial({color:0x295566,roughness:.7,metalness:.15});
  const lines=new THREE.LineBasicMaterial({color:0x6695a5});
  polygons.forEach(poly=>{
    const shape=new THREE.Shape(poly[0].map(([lon,lat])=>{const[x,y]=RoyGeography.project(lon,lat);return new THREE.Vector2(x-360,265-y)}));
    poly.slice(1).forEach(r=>shape.holes.push(new THREE.Path(r.map(([lon,lat])=>{const[x,y]=RoyGeography.project(lon,lat);return new THREE.Vector2(x-360,265-y)}))));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:7,bevelEnabled:false});
    group.add(new THREE.Mesh(geo,material),new THREE.LineSegments(new THREE.EdgesGeometry(geo,35),lines));
  });
  scene.add(new THREE.AmbientLight(0xa4d6dd,2));const light=new THREE.DirectionalLight(0x8deddf,3);light.position.set(-200,300,500);scene.add(light);
  const camera=new THREE.OrthographicCamera(-360,360,265,-265,.1,2000);camera.position.set(0,-150,850);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const coord=new THREE.Vector3();let disposed=false;
  function updatePins(){if(disposed)return;instance.pins.forEach(p=>{coord.set(p.x-360,265-p.y,9).project(camera);const x=(coord.x+1)*360,y=(1-coord.y)*265;p.g.querySelectorAll('circle').forEach(c=>{c.setAttribute('cx',x);c.setAttribute('cy',y)});p.g.querySelector('.pin-hit').setAttribute('x',x-18);p.g.querySelector('.pin-hit').setAttribute('y',y-22);p.label.setAttribute('x',x+12);p.label.setAttribute('y',y-10);});}
  function render(){if(disposed||!instance.host.clientWidth)return;const scale=Math.min(instance.host.clientWidth/720,instance.host.clientHeight/530),w=720*scale,h=530*scale;renderer.setSize(w,h,false);renderer.domElement.style.width=`${w}px`;renderer.domElement.style.height=`${h}px`;renderer.render(scene,camera);}
  // Pin projection uses the SVG's letterboxed viewBox; scene uses matching framing.
  const canvas=renderer.domElement;instance.host.prepend(canvas);instance.land.setAttribute('visibility','hidden');
  const observer=new ResizeObserver(render);observer.observe(instance.host);render();updatePins();
  return {updatePins,dispose(){disposed=true;observer.disconnect();scene.traverse(o=>o.geometry?.dispose());material.dispose();lines.dispose();renderer.dispose();canvas.remove();instance.land.removeAttribute('visibility');instance.pins.forEach(p=>{p.g.querySelectorAll('circle').forEach(c=>{c.setAttribute('cx',p.x);c.setAttribute('cy',p.y)});p.g.querySelector('.pin-hit').setAttribute('x',p.x-18);p.g.querySelector('.pin-hit').setAttribute('y',p.y-22);p.label.setAttribute('x',p.x+12);p.label.setAttribute('y',p.y-10);});}};
}
