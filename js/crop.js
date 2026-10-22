// ---- Photo crop editor -------------------------------------------------------------------
// The picked image is shown behind a circular mask. The person drags it into place and zooms;
// "Use photo" renders exactly the visible square to a 160x160 JPEG (the circle is its inscribed
// disc), which is what gets stored. The math below is pure so it can be unit-tested.
const CROP_VIEW = 240, CROP_OUT = 160, CROP_MAX_ZOOM = 4, CROP_MAX_BYTES = 40000;
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Smallest scale at which the image still covers the whole view (so the circle is never empty).
function cropMinScale(iw, ih, view){ return view / Math.min(iw, ih); }
// st = { scale, x, y }: x/y are the image's top-left corner in view pixels (always <= 0).
function cropClamp(st, iw, ih, view){
  const min = cropMinScale(iw, ih, view);
  const scale = clampNum(st.scale, min, min * CROP_MAX_ZOOM);
  const x = clampNum(st.x, view - iw * scale, 0);
  const y = clampNum(st.y, view - ih * scale, 0);
  return { scale, x, y };
}
function cropInitial(iw, ih, view){
  const scale = cropMinScale(iw, ih, view);
  return { scale, x: (view - iw * scale) / 2, y: (view - ih * scale) / 2 };
}
// Changes the scale while keeping the image point under (fx, fy) (view pixels) where it is.
function cropZoomAt(st, newScale, fx, fy, iw, ih, view){
  const min = cropMinScale(iw, ih, view);
  const scale = clampNum(newScale, min, min * CROP_MAX_ZOOM);
  const ix = (fx - st.x) / st.scale, iy = (fy - st.y) / st.scale;
  return cropClamp({ scale, x: fx - ix * scale, y: fy - iy * scale }, iw, ih, view);
}
// The part of the source image that is visible in the view, in source pixels.
function cropSourceRect(st, view){
  return { sx: -st.x / st.scale, sy: -st.y / st.scale, sw: view / st.scale, sh: view / st.scale };
}
function cropRender(img, iw, ih, st, view, out){
  const r = cropSourceRect(cropClamp(st, iw, ih, view), view);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out, out);   // transparent PNGs would otherwise turn black in a JPEG
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, out, out);
  // Every photo lives in the one shared household document (1 MB at most), so keep each one small.
  // A browser that couldn't draw returns "data:," instead of an image; treat that as a failure.
  let data = '';
  for(const q of [0.8, 0.6, 0.4]){
    data = c.toDataURL('image/jpeg', q);
    if(!/^data:image\//.test(data)) throw new Error('canvas gave no image');
    if(data.length <= CROP_MAX_BYTES) break;
  }
  return data;
}

const crop = { open:false, img:null, iw:0, ih:0, st:null, cb:null, onCancel:null, pointers:new Map(), last:null, wired:false };

function cropApply(){
  const el = document.getElementById('cropImg');
  el.style.width = crop.iw + 'px'; el.style.height = crop.ih + 'px';
  el.style.transform = `translate(${crop.st.x}px, ${crop.st.y}px) scale(${crop.st.scale})`;
  const z = document.getElementById('cropZoom');
  z.value = String(crop.st.scale / cropMinScale(crop.iw, crop.ih, CROP_VIEW));
}
function cropSet(st){ crop.st = cropClamp(st, crop.iw, crop.ih, CROP_VIEW); cropApply(); }
function cropZoomBy(factor, fx, fy){
  cropSet(cropZoomAt(crop.st, crop.st.scale * factor, fx, fy, crop.iw, crop.ih, CROP_VIEW));
}

function cropWire(){
  if(crop.wired) return;
  crop.wired = true;
  const stage = document.getElementById('cropStage');
  const pos = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) * CROP_VIEW / r.width, y: (e.clientY - r.top) * CROP_VIEW / r.height }; };
  const gesture = () => {
    const pts = [...crop.pointers.values()];
    if(pts.length === 1) return { cx: pts[0].x, cy: pts[0].y, d: 0 };
    return { cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
  };
  stage.addEventListener('pointerdown', e => {
    if(!crop.open) return;
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    try { stage.setPointerCapture(e.pointerId); } catch(err) {}
    crop.pointers.set(e.pointerId, pos(e));
    crop.last = gesture();
    stage.classList.add('dragging');
    e.preventDefault();
  });
  stage.addEventListener('pointermove', e => {
    if(!crop.open || !crop.pointers.has(e.pointerId)) return;
    crop.pointers.set(e.pointerId, pos(e));
    const g = gesture(), l = crop.last;
    crop.last = g;
    if(!l) return;
    let st = { scale: crop.st.scale, x: crop.st.x + (g.cx - l.cx), y: crop.st.y + (g.cy - l.cy) };
    if(crop.pointers.size > 1 && l.d > 0 && g.d > 0){
      st = cropZoomAt(st, st.scale * g.d / l.d, g.cx, g.cy, crop.iw, crop.ih, CROP_VIEW);
    }
    cropSet(st);
    e.preventDefault();
  });
  const up = e => {
    if(!crop.pointers.has(e.pointerId)) return;
    crop.pointers.delete(e.pointerId);
    crop.last = crop.pointers.size ? gesture() : null;
    if(!crop.pointers.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('lostpointercapture', up);
  stage.addEventListener('wheel', e => {
    if(!crop.open) return;
    e.preventDefault();
    const p = pos(e);
    cropZoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });
  stage.addEventListener('keydown', e => {
    if(!crop.open) return;
    const step = 12, c = CROP_VIEW / 2;
    const moves = { ArrowLeft:[step,0], ArrowRight:[-step,0], ArrowUp:[0,step], ArrowDown:[0,-step] };
    if(moves[e.key]){ cropSet({ scale: crop.st.scale, x: crop.st.x + moves[e.key][0], y: crop.st.y + moves[e.key][1] }); e.preventDefault(); }
    else if(e.key === '+' || e.key === '='){ cropZoomBy(1.1, c, c); e.preventDefault(); }
    else if(e.key === '-' || e.key === '_'){ cropZoomBy(1 / 1.1, c, c); e.preventDefault(); }
  });
  document.getElementById('cropZoom').addEventListener('input', e => {
    const min = cropMinScale(crop.iw, crop.ih, CROP_VIEW), c = CROP_VIEW / 2;
    cropSet(cropZoomAt(crop.st, min * parseFloat(e.target.value), c, c, crop.iw, crop.ih, CROP_VIEW));
  });
  document.getElementById('cropOk').addEventListener('click', cropConfirm);
  document.getElementById('cropCancel').addEventListener('click', () => closeCropEditor(true));
  document.getElementById('cropOverlay').addEventListener('mousedown', e => { if(e.target.id === 'cropOverlay') closeCropEditor(true); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && crop.open) closeCropEditor(true); });
}

// img: a loaded image (naturalWidth/naturalHeight). cb(dataUrl) runs only if the person confirms.
function openCropEditor(img, cb, onCancel){
  // an image with no size (some SVGs, a broken file) would make every number below NaN
  if(!((img.naturalWidth || img.width) > 0 && (img.naturalHeight || img.height) > 0)){
    askAlert('Couldn’t read that image. Try a JPG or PNG.');
    if(onCancel) onCancel();
    return;
  }
  cropWire();
  crop.img = img;
  crop.iw = img.naturalWidth || img.width;
  crop.ih = img.naturalHeight || img.height;
  crop.cb = cb; crop.onCancel = onCancel || null;
  crop.pointers.clear(); crop.last = null;
  crop.st = cropInitial(crop.iw, crop.ih, CROP_VIEW);
  document.getElementById('cropImg').src = img.src;
  crop.open = true;
  cropApply();
  document.getElementById('cropOverlay').style.display = 'flex';
  try { document.getElementById('cropStage').focus({ preventScroll:true }); } catch(e) {}
}
function closeCropEditor(cancelled){
  const onCancel = crop.onCancel;
  crop.open = false; crop.cb = null; crop.onCancel = null; crop.img = null; crop.pointers.clear();
  document.getElementById('cropStage').classList.remove('dragging');
  document.getElementById('cropOverlay').style.display = 'none';
  document.getElementById('cropImg').removeAttribute('src');
  if(cancelled && onCancel) onCancel();
}
function cropConfirm(){
  if(!crop.open) return;
  let data;
  try { data = cropRender(crop.img, crop.iw, crop.ih, crop.st, CROP_VIEW, CROP_OUT); }
  catch(err){ closeCropEditor(true); askAlert('Couldn’t use that photo. Try a different one.'); return; }
  const cb = crop.cb;
  closeCropEditor(false);
  if(cb) cb(data);
}

// Reads a picked image file and opens the crop editor. cb(dataUrl) runs only when the person
// presses "Use photo"; onCancel runs when they back out or the file can't be read as an image.
function cropPhotoFile(file, cb, onCancel){
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => openCropEditor(img, cb, onCancel);
    img.onerror = () => { askAlert('Couldn’t read that image. Try a JPG or PNG.'); if(onCancel) onCancel(); };
    img.src = e.target.result;
  };
  reader.onerror = () => { askAlert('Couldn’t read that image. Try a JPG or PNG.'); if(onCancel) onCancel(); };
  reader.readAsDataURL(file);
}
