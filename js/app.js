const { useState, useRef, useEffect, useCallback, createElement: h } = React;
const ACCENT = "#c9a96e";
const CATEGORIES = ["SHIRTS","TROUSERS","POLOS","KAFTANS","T-SHIRTS","TWO-PIECE","AGBADA","ACCESSORIES","OTHER"];

/* ═══════════════════ SERVER API ═══════════════════ */
async function fetchPieces() {
  try { const r = await fetch("/api/pieces"); return await r.json(); }
  catch (e) { console.warn("Fetch failed:", e); return []; }
}
async function savePiecesToServer(pieces) {
  try { await fetch("/api/pieces", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(pieces) }); }
  catch (e) { console.warn("Save failed:", e); }
}
async function uploadImageToServer(dataUrl) {
  try {
    const r = await fetch("/api/upload", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ image: dataUrl }) });
    const d = await r.json(); return d.url;
  } catch (e) { console.warn("Upload failed:", e); return null; }
}
async function deleteImageFromServer(url) {
  try { await fetch("/api/image?file=" + encodeURIComponent(url), { method:"DELETE" }); } catch(_){}
}
async function fetchSettings() {
  try { const r = await fetch("/api/settings"); return await r.json(); }
  catch(e) { return {}; }
}
async function uploadVideoToServer(file, onProgress) {
  try {
    const ext = file.name.split(".").pop() || "mp4";
    const r = await fetch("/api/upload-video", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Ext": ext },
      body: file,
    });
    return await r.json();
  } catch(e) { console.warn("Video upload failed:", e); return null; }
}
async function deleteVideoFromServer() {
  try { await fetch("/api/video", { method:"DELETE" }); } catch(_){}
}

/* ═══════════════════ WEBSOCKET SYNC ═══════════════════ */
let ws = null, wsTimer = null, onSyncUpdate = null, onSettingsUpdate = null;
function connectWS() {
  try {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/ws");
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if(m.type==="sync" && onSyncUpdate) onSyncUpdate(m.pieces);
        if(m.type==="settings" && onSettingsUpdate) onSettingsUpdate(m.settings);
      } catch(_){}
    };
    ws.onclose = () => { ws=null; wsTimer=setTimeout(connectWS, 2000); };
    ws.onerror = () => { ws&&ws.close(); };
  } catch(_){}
}
function genId() { return Date.now().toString(36)+Math.random().toString(36).substr(2,5); }

/* ═══════════════════ DEVICE DETECTION ═══════════════════ */
const IS_MOBILE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

/* ═══════════════════ GRAIN ═══════════════════ */
function Grain({ opacity }) {
  return h("div", { style:{ position:"absolute", inset:"-50%", background:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\''+(opacity||'0.08')+'\'/%3E%3C/svg%3E")', animation:"grainShift 0.5s steps(4) infinite", pointerEvents:"none", zIndex:50 }});
}

/* ═══════════════════ WORDMARK ═══════════════════ */
function Wordmark({ height, onClick, style }) {
  return h("img", { src:"assets/images/pakeru-wordmark.png", alt:"PAKERU", onClick, draggable:false,
    style:{ height:height||"20px", width:"auto", cursor:onClick?"pointer":"default", filter:"brightness(1.1)", ...style }});
}

/* ═══════════════════ IMAGE CARD SWIPER (horizontal front/back) ═══════════════════ */
function ImageSwiper({ images, aspect, borderRadius, showCounter }) {
  const [idx, setIdx] = useState(0);
  const [txs, setTxs] = useState(null);
  const [txd, setTxd] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState({});

  useEffect(() => { setIdx(0); setLoaded({}); }, [images && images[0]]);

  function hTS(e) { e.stopPropagation(); setTxs(e.touches[0].clientX); setDragging(true); }
  function hTM(e) { if(!dragging||txs===null) return; e.stopPropagation(); setTxd(e.touches[0].clientX - txs); }
  function hTE(e) {
    e.stopPropagation();
    if(!dragging) return;
    if(txd < -40 && idx < 1) setIdx(1);
    else if(txd > 40 && idx > 0) setIdx(0);
    setTxs(null); setTxd(0); setDragging(false);
  }
  function hClick() { setIdx(idx === 0 ? 1 : 0); }

  if(!images || images.length < 2) return null;

  const offset = dragging ? (-idx * 100) + (txd / 3) : (-idx * 100);

  return h("div", {
    onTouchStart: hTS, onTouchMove: hTM, onTouchEnd: hTE,
    style:{ width:"100%", height:"100%", position:"relative", overflow:"hidden", borderRadius: borderRadius||0, touchAction:"pan-y" }
  },
    h("div", { style:{ display:"flex", width:"200%", height:"100%", transform:"translateX("+offset/2+"%)", transition: dragging?"none":"transform 0.35s cubic-bezier(0.16,1,0.3,1)" }},
      images.map((src, i) =>
        h("div", { key:i, onClick: hClick, style:{ width:"50%", height:"100%", flexShrink:0, position:"relative", cursor:"pointer" }},
          !loaded[i] && h("div", { style:{ position:"absolute", inset:0, background:"linear-gradient(90deg, #111 25%, #1a1a1a 50%, #111 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.5s ease infinite" }}),
          h("img", { src, alt:i===0?"Front":"Back", onLoad:()=>setLoaded(p=>({...p,[i]:true})),
            style:{ width:"100%", height:"100%", objectFit:"cover", opacity:loaded[i]?1:0, transition:"opacity 0.4s ease" }})
        )
      )
    ),
    h("div", { style:{ position:"absolute", bottom:12, left:"50%", transform:"translateX(-50%)", display:"flex", gap:"8px", zIndex:10 }},
      [0,1].map(i =>
        h("div", { key:i, onClick:(e)=>{ e.stopPropagation(); setIdx(i); },
          style:{ width: i===idx?20:6, height:6, borderRadius:3,
            background: i===idx ? "linear-gradient(90deg, "+ACCENT+", #d4af37)" : "rgba(250,248,245,0.3)",
            transition:"all 0.3s ease", cursor:"pointer" }})
      )
    ),
    h("div", { style:{ position:"absolute", bottom:12, right:12, fontSize:"8px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.2em", color:"rgba(250,248,245,0.4)", zIndex:10 }}, idx===0?"FRONT":"BACK"),
    showCounter && h("div", { style:{ position:"absolute", top:16, left:16, fontSize:"9px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.3em", color:"rgba(250,248,245,0.5)", textShadow:"0 1px 4px rgba(0,0,0,0.8)", zIndex:10 }}, showCounter)
  );
}

/* ═══════════════════ ADMIN: HOMEPAGE TAB ═══════════════════ */
function HomepageTab({ settings, onSettingsChange }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [notif, setNotif] = useState(null);
  const videoRef = useRef(null);

  function notify(m) { setNotif(m); setTimeout(()=>setNotif(null), 3000); }

  async function handleVideoUpload(e) {
    const file = e.target.files[0]; if(!file) return;
    if(!file.type.startsWith("video/")) { notify("Please select a video file"); return; }
    if(file.size > 500*1024*1024) { notify("Video too large — keep under 500 MB"); return; }

    setUploading(true);
    setProgress("Uploading " + (file.size/1024/1024).toFixed(1) + " MB...");

    const result = await uploadVideoToServer(file);

    if(result && result.url) {
      onSettingsChange({...settings, splashVideo: result.url});
      notify("Video uploaded! Phone will update automatically.");
    } else {
      notify("Upload failed — try again");
    }
    setUploading(false);
    setProgress("");
    e.target.value = "";
  }

  async function removeVideo() {
    await deleteVideoFromServer();
    onSettingsChange({...settings, splashVideo: null});
    notify("Video removed");
  }

  const ss = {
    section: { background:"rgba(250,248,245,0.02)", border:"1px solid rgba(250,248,245,0.06)", borderRadius:"4px", padding:"24px", marginBottom:"16px" },
    label: { fontSize:"9px", fontWeight:300, letterSpacing:"0.4em", color:"rgba(201,169,110,0.5)", marginBottom:"12px" },
    goldBtn: { padding:"14px 24px", background:"linear-gradient(135deg, "+ACCENT+", #d4af37)", border:"none", borderRadius:"4px", cursor:"pointer", fontSize:"11px", fontWeight:500, letterSpacing:"0.2em", color:"#0a0a0a", fontFamily:"'Outfit', sans-serif" },
    dangerBtn: { padding:"10px 20px", background:"rgba(200,50,50,0.1)", border:"1px solid rgba(200,50,50,0.3)", borderRadius:"4px", cursor:"pointer", fontSize:"10px", fontWeight:500, letterSpacing:"0.15em", color:"#e05555", fontFamily:"'Outfit', sans-serif" },
  };

  return h("div", { style:{ padding:"24px 16px" }},
    notif && h("div", { style:{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"rgba(201,169,110,0.15)", border:"1px solid rgba(201,169,110,0.3)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", padding:"12px 24px", borderRadius:"4px", zIndex:100, fontSize:"12px", fontWeight:400, letterSpacing:"0.05em", color:ACCENT, animation:"notifIn 0.3s ease", maxWidth:"90vw", textAlign:"center" }}, notif),

    // ── Heading Text (above wordmark) ──
    h("div", { style:ss.section },
      h("div", { style:ss.label }, "HEADING"),
      h("div", { style:{ fontSize:"13px", fontWeight:300, color:"rgba(250,248,245,0.4)", marginBottom:"12px", lineHeight:1.6 }},
        "Text displayed above the wordmark on the splash page. Currently shows: \"" + ((settings.headingText || "COLLECTION")) + "\""
      ),
      h("div", { style:{ display:"flex", gap:"10px", alignItems:"center" }},
        h("input", {
          value: settings.headingText !== undefined ? settings.headingText : "COLLECTION",
          onChange: (e) => onSettingsChange({...settings, headingText: e.target.value}),
          placeholder: "e.g. COLLECTION",
          style:{ flex:1, background:"rgba(250,248,245,0.05)", border:"1px solid rgba(250,248,245,0.1)", borderRadius:"4px", padding:"14px 16px", color:"#faf8f5", fontSize:"14px", fontFamily:"'Outfit', sans-serif", letterSpacing:"0.25em", textTransform:"uppercase" }
        }),
        h("button", {
          onClick: async () => {
            try {
              await fetch("/api/settings", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ headingText: settings.headingText || "COLLECTION" }) });
              notify("Heading saved!");
            } catch(_) { notify("Save failed"); }
          },
          style: ss.goldBtn
        }, "SAVE")
      )
    ),

    // ── Splash Video ──
    h("div", { style:ss.section },
      h("div", { style:ss.label }, "SPLASH VIDEO"),
      h("div", { style:{ fontSize:"13px", fontWeight:300, color:"rgba(250,248,245,0.4)", marginBottom:"20px", lineHeight:1.6 }},
        "This video plays as the background on the phone's title page. It loops until the user taps the wordmark to enter the lookbook."
      ),

      settings.splashVideo ?
        // Video exists — show preview and replace/remove options
        h("div", null,
          h("div", { style:{ width:"100%", maxWidth:"400px", aspectRatio:"9/16", borderRadius:"8px", overflow:"hidden", background:"#111", marginBottom:"16px", position:"relative", border:"1px solid rgba(201,169,110,0.15)" }},
            h("video", { ref:videoRef, src:settings.splashVideo, autoPlay:true, muted:true, loop:true, playsInline:true,
              style:{ width:"100%", height:"100%", objectFit:"cover" }}),
            h("div", { style:{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center" }},
              h("div", { style:{ textAlign:"center" }},
                h("div", { style:{ fontSize:"10px", fontWeight:300, letterSpacing:"0.3em", color:"rgba(255,255,255,0.6)" }}, "PREVIEW WITH DARK TINT"),
                h("img", { src:"assets/images/pakeru-wordmark.png", alt:"PAKERU", style:{ width:"160px", height:"auto", margin:"12px auto", display:"block", filter:"brightness(1.2) drop-shadow(0 2px 8px rgba(0,0,0,0.5))" }})
              )
            )
          ),
          h("div", { style:{ display:"flex", gap:"12px", flexWrap:"wrap" }},
            h("label", { style:{...ss.goldBtn, display:"inline-flex", alignItems:"center", gap:"8px", opacity:uploading?0.5:1 }},
              h("svg", { width:14, height:14, viewBox:"0 0 24 24", fill:"none", stroke:"#0a0a0a", strokeWidth:2 }, h("path", { d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" })),
              uploading ? progress : "REPLACE VIDEO",
              h("input", { type:"file", accept:"video/*", onChange:handleVideoUpload, disabled:uploading, style:{ display:"none" }})
            ),
            h("button", { onClick:removeVideo, style:ss.dangerBtn, disabled:uploading }, "REMOVE")
          )
        ) :
        // No video — upload prompt
        h("div", null,
          h("label", { style:{ display:"flex", flexDirection:"column", alignItems:"center", gap:"16px", padding:"48px 24px", border:"2px dashed rgba(201,169,110,0.2)", borderRadius:"8px", cursor:uploading?"wait":"pointer", background:"rgba(250,248,245,0.01)" }},
            h("svg", { width:48, height:48, viewBox:"0 0 24 24", fill:"none", stroke:"rgba(201,169,110,0.3)", strokeWidth:1.2 },
              h("polygon", { points:"23 7 16 12 23 17 23 7" }), h("rect", { x:1, y:5, width:15, height:14, rx:2, ry:2 })
            ),
            uploading ?
              h("div", { style:{ textAlign:"center" }},
                h("div", { style:{ fontSize:"13px", fontWeight:400, color:ACCENT, marginBottom:"4px" }}, progress),
                h("div", { style:{ width:200, height:3, background:"rgba(250,248,245,0.08)", borderRadius:2 }},
                  h("div", { style:{ width:"60%", height:"100%", background:"linear-gradient(90deg, "+ACCENT+", #d4af37)", borderRadius:2, animation:"shimmer 1.5s ease infinite" }}))
              ) :
              h("div", { style:{ textAlign:"center" }},
                h("div", { style:{ fontSize:"14px", fontFamily:"'BlackMango', serif", fontWeight:500, color:"#faf8f5", marginBottom:"4px" }}, "Upload Splash Video"),
                h("div", { style:{ fontSize:"11px", fontWeight:300, color:"rgba(250,248,245,0.3)" }}, "MP4 recommended · Max 500 MB")
              ),
            h("input", { type:"file", accept:"video/*", onChange:handleVideoUpload, disabled:uploading, style:{ display:"none" }})
          )
        )
    ),

    // Info
    h("div", { style:{ padding:"16px", background:"rgba(201,169,110,0.04)", border:"1px solid rgba(201,169,110,0.1)", borderRadius:"4px" }},
      h("div", { style:{ fontSize:"9px", fontWeight:300, letterSpacing:"0.3em", color:"rgba(201,169,110,0.5)", marginBottom:"8px" }}, "HOW IT WORKS"),
      h("div", { style:{ fontSize:"12px", fontWeight:300, color:"rgba(250,248,245,0.35)", lineHeight:1.8 }},
        "\u2022 The video plays full-screen behind a dark tint on the phone's splash page", h("br"),
        "\u2022 The wordmark and texts are layered on top — always legible", h("br"),
        "\u2022 Video loops until the user taps to enter the lookbook", h("br"),
        "\u2022 If no video is set, a dark animated background is shown instead", h("br"),
        "\u2022 The video is saved permanently in data/media/ on the server"
      )
    )
  );
}

/* ═══════════════════ ADMIN: PIECES TAB ═══════════════════ */
function PiecesTab({ pieces, save }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [np, setNp] = useState({ name:"", category:"SHIRTS", front:null, back:null });
  const [confirmDel, setConfirmDel] = useState(null);
  const [notif, setNotif] = useState(null);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const editFileRef = useRef(null);
  const [editTarget, setEditTarget] = useState(null);

  function notify(m) { setNotif(m); setTimeout(()=>setNotif(null), 3000); }

  async function handleNewImg(e, side) {
    const f = e.target.files[0]; if(!f) return;
    if(f.size > 20*1024*1024) { notify("Image too large — keep under 20 MB"); return; }
    const r = new FileReader();
    r.onload = async (ev) => {
      notify("Uploading " + side + " image...");
      const url = await uploadImageToServer(ev.target.result);
      if(!url) { notify("Upload failed"); return; }
      setNp(prev => ({...prev, [side]: url}));
      notify((side === "front" ? "Front" : "Back") + " image uploaded");
    };
    r.readAsDataURL(f); e.target.value="";
  }

  async function handleEditImg(e) {
    const f = e.target.files[0]; if(!f) return;
    if(f.size > 20*1024*1024) { notify("Image too large"); return; }
    const r = new FileReader();
    r.onload = async (ev) => {
      if(!editTarget) return;
      notify("Uploading...");
      const url = await uploadImageToServer(ev.target.result);
      if(!url) { notify("Upload failed"); return; }
      const piece = pieces.find(p => p.id === editTarget.id);
      if(piece && piece.images && piece.images[editTarget.index]) deleteImageFromServer(piece.images[editTarget.index]);
      const u = pieces.map(p => {
        if(p.id !== editTarget.id) return p;
        const imgs = [...(p.images||[])];
        imgs[editTarget.index] = url;
        return {...p, images: imgs};
      });
      save(u); notify("Image updated"); setEditTarget(null);
    };
    r.readAsDataURL(f); e.target.value="";
  }

  function addPiece() {
    if(!np.name.trim()) { notify("Enter a piece name"); return; }
    if(!np.front) { notify("Upload the FRONT image"); return; }
    if(!np.back) { notify("Upload the BACK image"); return; }
    save([...pieces, { id:genId(), name:np.name.trim(), category:np.category, images:[np.front, np.back] }]);
    setNp({ name:"", category:"SHIRTS", front:null, back:null });
    setShowAdd(false); notify("Piece added — now visible on phone!");
  }

  function removePiece(id) {
    const piece = pieces.find(p => p.id === id);
    if(piece && piece.images) piece.images.forEach(img => { if(img) deleteImageFromServer(img); });
    save(pieces.filter(p=>p.id!==id));
    setConfirmDel(null); notify("Piece removed");
  }

  function movePiece(from,to) {
    if(to<0||to>=pieces.length) return;
    const u=[...pieces]; const [m]=u.splice(from,1); u.splice(to,0,m); save(u);
  }
  function updateName(id, name) { save(pieces.map(p => p.id===id ? {...p, name} : p)); }
  function updateCategory(id, cat) { save(pieces.map(p => p.id===id ? {...p, category:cat} : p)); }

  const ss = {
    card: { background:"rgba(250,248,245,0.02)", border:"1px solid rgba(250,248,245,0.06)", borderRadius:"4px", marginBottom:"12px", overflow:"hidden" },
    goldBtn: { width:"100%", padding:"16px", background:"linear-gradient(135deg, "+ACCENT+", #d4af37)", border:"none", borderRadius:"4px", cursor:"pointer", fontSize:"12px", fontWeight:500, letterSpacing:"0.25em", color:"#0a0a0a", fontFamily:"'Outfit', sans-serif" },
    uploadBox: function(hasImg) { return { width:"48%", aspectRatio:"3/4", border:hasImg?"1px solid rgba(201,169,110,0.15)":"2px dashed rgba(201,169,110,0.2)", borderRadius:"4px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"6px", overflow:"hidden", background:hasImg?"none":"rgba(250,248,245,0.02)", position:"relative" }; }
  };

  return h("div", { style:{ paddingBottom:"100px" }},
    notif && h("div", { style:{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"rgba(201,169,110,0.15)", border:"1px solid rgba(201,169,110,0.3)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", padding:"12px 24px", borderRadius:"4px", zIndex:100, fontSize:"12px", fontWeight:400, letterSpacing:"0.05em", color:ACCENT, animation:"notifIn 0.3s ease", maxWidth:"90vw", textAlign:"center" }}, notif),

    pieces.length===0 && !showAdd && h("div", { style:{ padding:"80px 32px", textAlign:"center", animation:"fadeIn 0.6s ease" }},
      h("div", { style:{ width:80, height:80, borderRadius:"50%", border:"1px solid rgba(201,169,110,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 24px" }},
        h("svg", { width:32, height:32, viewBox:"0 0 24 24", fill:"none", stroke:"rgba(201,169,110,0.25)", strokeWidth:"1.2" },
          h("rect", { x:3, y:3, width:18, height:18, rx:1 }), h("circle", { cx:8.5, cy:8.5, r:1.5 }), h("path", { d:"M21 15l-5-5L5 21" }))
      ),
      h("div", { style:{ fontSize:"18px", fontFamily:"'BlackMango', serif", fontWeight:500, marginBottom:"8px" }}, "Your lookbook is empty"),
      h("div", { style:{ fontSize:"13px", fontWeight:300, color:"rgba(250,248,245,0.35)", lineHeight:1.6 }}, "Tap + to add your first piece (front & back images required)")
    ),

    h("div", { style:{ padding:"16px 16px 0" }},
      pieces.map((piece, i) =>
        h("div", { key:piece.id, style:{...ss.card, animation:"fadeIn 0.4s ease "+i*0.05+"s both"} },
          h("div", { style:{ display:"flex", gap:"14px", padding:"14px", alignItems:"center" }},
            h("div", { style:{ display:"flex", flexDirection:"column", gap:"2px", flexShrink:0 }},
              h("button", { onClick:()=>movePiece(i,i-1), disabled:i===0, style:{ background:"none", border:"none", cursor:i===0?"default":"pointer", padding:"4px", color:i===0?"rgba(250,248,245,0.1)":"rgba(250,248,245,0.35)", fontSize:"14px", lineHeight:1 }}, "\u25B2"),
              h("button", { onClick:()=>movePiece(i,i+1), disabled:i===pieces.length-1, style:{ background:"none", border:"none", cursor:i===pieces.length-1?"default":"pointer", padding:"4px", color:i===pieces.length-1?"rgba(250,248,245,0.1)":"rgba(250,248,245,0.35)", fontSize:"14px", lineHeight:1 }}, "\u25BC")
            ),
            h("div", { style:{ display:"flex", gap:"4px", flexShrink:0 }},
              [0,1].map(idx =>
                h("div", { key:idx, onClick:()=>{ setEditTarget({id:piece.id, index:idx}); editFileRef.current?.click(); },
                  style:{ width:48, height:64, borderRadius:"2px", overflow:"hidden", cursor:"pointer", background:"#141414", border:"1px solid rgba(250,248,245,0.06)", position:"relative" }},
                  piece.images && piece.images[idx] ?
                    h("img", { src:piece.images[idx], alt:idx===0?"Front":"Back", style:{ width:"100%", height:"100%", objectFit:"cover" }}) :
                    h("div", { style:{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"8px", color:"rgba(250,248,245,0.15)" }}, idx===0?"F":"B"),
                  h("div", { style:{ position:"absolute", bottom:2, left:0, right:0, textAlign:"center", fontSize:"7px", fontWeight:300, letterSpacing:"0.1em", color:"rgba(250,248,245,0.3)" }}, idx===0?"FRONT":"BACK")
                )
              )
            ),
            h("div", { style:{ flex:1, minWidth:0 }},
              editId===piece.id ?
                h("div", { style:{ display:"flex", flexDirection:"column", gap:"8px" }},
                  h("input", { value:piece.name, onChange:e=>updateName(piece.id, e.target.value),
                    onBlur:()=>setEditId(null), onKeyDown:e=>{ if(e.key==="Enter") setEditId(null); },
                    autoFocus:true, style:{ background:"rgba(250,248,245,0.05)", border:"1px solid rgba(250,248,245,0.12)", borderRadius:"3px", padding:"8px 10px", color:"#faf8f5", fontSize:"14px", fontFamily:"'BlackMango', serif" }}),
                  h("select", { value:piece.category, onChange:e=>updateCategory(piece.id, e.target.value),
                    style:{ background:"rgba(250,248,245,0.05)", border:"1px solid rgba(250,248,245,0.12)", borderRadius:"3px", padding:"6px 8px", color:"rgba(250,248,245,0.6)", fontSize:"11px", fontFamily:"'Outfit', sans-serif" }},
                    CATEGORIES.map(c => h("option", { key:c, value:c, style:{ background:"#1a1a1a" }}, c)))
                ) :
                h("div", { onClick:()=>setEditId(piece.id), style:{ cursor:"pointer" }},
                  h("div", { style:{ fontSize:"15px", fontFamily:"'BlackMango', serif", fontWeight:500, color:"#faf8f5", marginBottom:"4px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}, piece.name),
                  h("div", { style:{ fontSize:"9px", fontWeight:300, letterSpacing:"0.3em", color:"rgba(201,169,110,0.5)" }}, piece.category)
                ),
              h("div", { style:{ fontSize:"9px", fontWeight:300, color:"rgba(250,248,245,0.2)", marginTop:"6px" }}, "Position "+(i+1)+" of "+pieces.length)
            ),
            confirmDel===piece.id ?
              h("div", { style:{ display:"flex", gap:"6px", flexShrink:0 }},
                h("button", { onClick:()=>removePiece(piece.id), style:{ background:"rgba(200,50,50,0.15)", border:"1px solid rgba(200,50,50,0.3)", borderRadius:"3px", padding:"6px 12px", color:"#e05555", fontSize:"10px", fontWeight:500, fontFamily:"'Outfit', sans-serif", cursor:"pointer", letterSpacing:"0.1em" }}, "YES"),
                h("button", { onClick:()=>setConfirmDel(null), style:{ background:"rgba(250,248,245,0.05)", border:"1px solid rgba(250,248,245,0.1)", borderRadius:"3px", padding:"6px 12px", color:"rgba(250,248,245,0.4)", fontSize:"10px", fontWeight:500, fontFamily:"'Outfit', sans-serif", cursor:"pointer", letterSpacing:"0.1em" }}, "NO")
              ) :
              h("button", { onClick:()=>setConfirmDel(piece.id), style:{ background:"none", border:"none", cursor:"pointer", padding:"8px", flexShrink:0 }},
                h("svg", { width:16, height:16, viewBox:"0 0 24 24", fill:"none", stroke:"rgba(250,248,245,0.2)", strokeWidth:1.5 },
                  h("path", { d:"M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }))
              )
          )
        )
      )
    ),

    h("input", { ref:editFileRef, type:"file", accept:"image/*", onChange:handleEditImg, style:{ display:"none" }}),

    // Add overlay
    showAdd && h("div", { style:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }},
      h("div", { onClick:()=>{ setShowAdd(false); setNp({ name:"", category:"SHIRTS", front:null, back:null }); }, style:{ flex:1, cursor:"pointer" }}),
      h("div", { style:{ background:"#111", borderTop:"1px solid rgba(201,169,110,0.15)", borderRadius:"16px 16px 0 0", padding:"28px 20px 36px", animation:"slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)", maxHeight:"85vh", overflowY:"auto" }},
        h("div", { style:{ width:32, height:3, borderRadius:2, background:"rgba(250,248,245,0.15)", margin:"0 auto 24px" }}),
        h("div", { style:{ fontSize:"16px", fontFamily:"'BlackMango', serif", fontWeight:500, marginBottom:"20px", textAlign:"center" }}, "Add New Piece"),
        h("div", { style:{ display:"flex", gap:"4%", marginBottom:"20px" }},
          h("div", { onClick:()=>frontRef.current?.click(), style:ss.uploadBox(!!np.front) },
            np.front ?
              [h("img", { key:"fp", src:np.front, alt:"Front", style:{ width:"100%", height:"100%", objectFit:"cover" }}),
               h("div", { key:"fb", style:{ position:"absolute", bottom:6, left:0, right:0, textAlign:"center", fontSize:"8px", fontWeight:400, letterSpacing:"0.2em", color:ACCENT, textShadow:"0 1px 4px rgba(0,0,0,0.8)" }}, "FRONT \u2713")] :
              [h("svg", { key:"fi", width:28, height:28, viewBox:"0 0 24 24", fill:"none", stroke:"rgba(201,169,110,0.3)", strokeWidth:1.2 },
                h("path", { d:"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }), h("circle", { cx:12, cy:13, r:4 })),
               h("div", { key:"ft", style:{ fontSize:"10px", fontWeight:400, letterSpacing:"0.15em", color:"rgba(250,248,245,0.3)" }}, "FRONT"),
               h("div", { key:"ft2", style:{ fontSize:"8px", fontWeight:300, color:"rgba(250,248,245,0.15)" }}, "Required")]
          ),
          h("div", { onClick:()=>backRef.current?.click(), style:ss.uploadBox(!!np.back) },
            np.back ?
              [h("img", { key:"bp", src:np.back, alt:"Back", style:{ width:"100%", height:"100%", objectFit:"cover" }}),
               h("div", { key:"bb", style:{ position:"absolute", bottom:6, left:0, right:0, textAlign:"center", fontSize:"8px", fontWeight:400, letterSpacing:"0.2em", color:ACCENT, textShadow:"0 1px 4px rgba(0,0,0,0.8)" }}, "BACK \u2713")] :
              [h("svg", { key:"bi", width:28, height:28, viewBox:"0 0 24 24", fill:"none", stroke:"rgba(201,169,110,0.3)", strokeWidth:1.2 },
                h("path", { d:"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }), h("circle", { cx:12, cy:13, r:4 })),
               h("div", { key:"bt", style:{ fontSize:"10px", fontWeight:400, letterSpacing:"0.15em", color:"rgba(250,248,245,0.3)" }}, "BACK"),
               h("div", { key:"bt2", style:{ fontSize:"8px", fontWeight:300, color:"rgba(250,248,245,0.15)" }}, "Required")]
          )
        ),
        h("input", { ref:frontRef, type:"file", accept:"image/*", onChange:e=>handleNewImg(e,"front"), style:{ display:"none" }}),
        h("input", { ref:backRef, type:"file", accept:"image/*", onChange:e=>handleNewImg(e,"back"), style:{ display:"none" }}),
        h("div", { style:{ display:"flex", justifyContent:"center", gap:"16px", marginBottom:"16px" }},
          h("div", { style:{ fontSize:"9px", fontWeight:300, letterSpacing:"0.15em", color: np.front ? ACCENT : "rgba(250,248,245,0.2)" }}, np.front ? "\u2713 Front uploaded" : "\u25CB Front needed"),
          h("div", { style:{ fontSize:"9px", fontWeight:300, letterSpacing:"0.15em", color: np.back ? ACCENT : "rgba(250,248,245,0.2)" }}, np.back ? "\u2713 Back uploaded" : "\u25CB Back needed")
        ),
        h("input", { value:np.name, onChange:e=>setNp(prev=>({...prev, name:e.target.value})), placeholder:"Piece name (e.g. The Sovereign Shirt)",
          style:{ width:"100%", background:"rgba(250,248,245,0.05)", border:"1px solid rgba(250,248,245,0.1)", borderRadius:"4px", padding:"14px 16px", color:"#faf8f5", fontSize:"15px", fontFamily:"'BlackMango', serif", marginBottom:"12px" }}),
        h("select", { value:np.category, onChange:e=>setNp(prev=>({...prev, category:e.target.value})),
          style:{ width:"100%", background:"rgba(250,248,245,0.05)", border:"1px solid rgba(250,248,245,0.1)", borderRadius:"4px", padding:"12px 16px", color:"rgba(250,248,245,0.6)", fontSize:"12px", fontFamily:"'Outfit', sans-serif", letterSpacing:"0.1em", marginBottom:"20px" }},
          CATEGORIES.map(c => h("option", { key:c, value:c, style:{ background:"#1a1a1a" }}, c))
        ),
        h("button", { onClick:addPiece, style:{...ss.goldBtn, opacity:(np.front&&np.back)?1:0.4 } }, "ADD TO LOOKBOOK")
      )
    ),

    h("button", { onClick:()=>setShowAdd(true), style:{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg, "+ACCENT+", #d4af37)", border:"none", borderRadius:"50px", cursor:"pointer", padding:"16px 32px", display:"flex", alignItems:"center", gap:"10px", boxShadow:"0 8px 32px rgba(201,169,110,0.3)", zIndex:40 } },
      h("svg", { width:16, height:16, viewBox:"0 0 24 24", fill:"none", stroke:"#0a0a0a", strokeWidth:2.5 }, h("path", { d:"M12 5v14M5 12h14" })),
      h("span", { style:{ fontSize:"11px", fontWeight:600, letterSpacing:"0.2em", color:"#0a0a0a", fontFamily:"'Outfit', sans-serif" }}, "ADD PIECE")
    )
  );
}

/* ═══════════════════ ADMIN PANEL (Tabbed) ═══════════════════ */
function AdminPanel({ pieces, save, settings, onSettingsChange }) {
  const [tab, setTab] = useState("pieces");

  const tabStyle = (active) => ({
    padding:"12px 20px", background:"none", border:"none", borderBottom: active ? "2px solid "+ACCENT : "2px solid transparent",
    cursor:"pointer", fontSize:"10px", fontWeight: active?500:300, letterSpacing:"0.3em",
    color: active ? ACCENT : "rgba(250,248,245,0.35)", fontFamily:"'Outfit', sans-serif", transition:"all 0.3s ease"
  });

  return h("div", { style:{ minHeight:"100vh", background:"#0a0a0a", fontFamily:"'Outfit', sans-serif", color:"#faf8f5" }},
    // Header
    h("div", { style:{ padding:"24px 20px 0", background:"rgba(10,10,10,0.95)", position:"sticky", top:0, zIndex:50, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" }},
      h("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }},
        h("div", null,
          h("div", { style:{ fontSize:"9px", fontWeight:300, letterSpacing:"0.5em", color:"rgba(201,169,110,0.5)", marginBottom:"6px" }}, "ADMIN PORTAL"),
          h(Wordmark, { height:"20px" })
        ),
        h("div", { style:{ fontSize:"11px", fontWeight:400, color:"rgba(250,248,245,0.4)" }}, pieces.length + (pieces.length===1?" piece":" pieces"))
      ),
      // Tabs
      h("div", { style:{ display:"flex", borderBottom:"1px solid rgba(250,248,245,0.06)" }},
        h("button", { onClick:()=>setTab("pieces"), style:tabStyle(tab==="pieces") }, "PIECES"),
        h("button", { onClick:()=>setTab("homepage"), style:tabStyle(tab==="homepage") }, "HOMEPAGE")
      )
    ),
    // Tab content
    tab === "pieces" ? h(PiecesTab, { pieces, save }) : h(HomepageTab, { settings, onSettingsChange })
  );
}

/* ═══════════════════ LOOKBOOK (Phone) ═══════════════════ */
function Lookbook({ products, settings }) {
  const [phase, setPhase] = useState("splash");
  const [ci, setCi] = useState(0);
  const [dir, setDir] = useState(null);
  const [anim, setAnim] = useState(false);
  const [tsy, setTsy] = useState(null);
  const [tdy, setTdy] = useState(0);
  const [dragY, setDragY] = useState(false);
  const [sr, setSr] = useState(false);
  const [sf, setSf] = useState(false);

  useEffect(() => { setTimeout(()=>setSr(true), 300); }, []);

  function enter() { if(products.length===0) return; setSf(true); setTimeout(()=>setPhase("gallery"), 800); }
  function backToSplash() { setPhase("splash"); setSf(false); setSr(false); setTimeout(()=>setSr(true), 300); setCi(0); }

  const goTo = useCallback((ni, d) => {
    if(anim||ni<0||ni>=products.length) return;
    setAnim(true); setDir(d);
    setTimeout(()=>{ setCi(ni); setDir(null); setAnim(false); }, 500);
  }, [anim, products.length]);

  function onTS(e) { if(anim) return; setTsy(e.touches[0].clientY); setDragY(true); }
  function onTM(e) { if(!dragY||tsy===null) return; setTdy(e.touches[0].clientY - tsy); }
  function onTE() {
    if(!dragY) return;
    if(tdy<-60 && ci<products.length-1) goTo(ci+1,"up");
    else if(tdy>60 && ci>0) goTo(ci-1,"down");
    setTsy(null); setTdy(0); setDragY(false);
  }
  const onW = useCallback(e => {
    if(anim) return;
    if(e.deltaY>30 && ci<products.length-1) goTo(ci+1,"up");
    else if(e.deltaY<-30 && ci>0) goTo(ci-1,"down");
  }, [ci, anim, goTo, products.length]);

  const hasVideo = settings && settings.splashVideo;

  // SPLASH — video background (from server) or dark fallback
  if(phase==="splash") {
    return h("div", { onClick:enter, style:{ position:"fixed", inset:0, background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:products.length>0?"pointer":"default", overflow:"hidden", opacity:sf?0:1, transition:"opacity 0.8s ease" }},
      // Video background (if uploaded via admin)
      hasVideo && h("video", { autoPlay:true, muted:true, loop:true, playsInline:true, "webkit-playsinline":"true", preload:"auto",
        style:{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", zIndex:0 },
        src: settings.splashVideo }),
      // Dark tint overlay
      h("div", { style:{ position:"absolute", inset:0, background: hasVideo ? "rgba(0,0,0,0.6)" : "#030303", zIndex:1 }}),
      // Vignette
      h("div", { style:{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.4) 100%)", pointerEvents:"none", zIndex:2 }}),
      // Grain (subtle on video, stronger on fallback)
      !hasVideo && h(Grain, { opacity:"0.08" }),
      // Content
      h("div", { style:{ position:"relative", zIndex:10, textAlign:"center", opacity:sr?1:0, transform:sr?"translateY(0)":"translateY(40px)", transition:"all 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }},
        h("div", { style:{ width:48, height:1, background:"linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)", margin:"0 auto 32px", animation:"lineGrow 1.5s ease 0.5s both" }}),
        h("div", { style:{ fontSize:"11px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.5em", color:"rgba(255,255,255,0.5)", marginBottom:"24px", animation:sr?"fadeUp 0.8s ease 0.8s both":"none" }}, (settings && settings.headingText) || "COLLECTION"),
        h("img", { src:"assets/images/pakeru-wordmark.png", alt:"PAKERU", draggable:false,
          style:{ display:"block", width:"clamp(200px, 60vw, 360px)", height:"auto", margin:"0 auto 12px", cursor:products.length>0?"pointer":"default",
            filter:"brightness(1.2) drop-shadow(0 2px 12px rgba(0,0,0,0.6))",
            animation: sr?"scaleReveal 1.2s cubic-bezier(0.16,1,0.3,1) 1.0s both":"none" }}),
        h("div", { style:{ fontSize:"clamp(11px, 3vw, 14px)", fontFamily:"'BlackMango', serif", fontWeight:500, letterSpacing:"0.35em", color:"rgba(255,255,255,0.85)", textShadow:"0 2px 8px rgba(0,0,0,0.5)", animation:sr?"breathe 4s ease infinite, fadeUp 0.8s ease 1.6s both":"none", marginBottom:"40px" }}, "DEFY THE NORM"),
        h("div", { style:{ width:48, height:1, background:"linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)", margin:"0 auto 40px", animation:"lineGrow 1.5s ease 2.0s both" }}),
        products.length>0 ?
          h("div", { style:{ fontSize:"10px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.4em", color:"rgba(255,255,255,0.4)", textShadow:"0 1px 4px rgba(0,0,0,0.5)", animation:sr?"pulseGlow 2.5s ease infinite, fadeUp 0.8s ease 2.4s both":"none" }}, "TAP TO ENTER \u00B7 "+products.length+(products.length===1?" PIECE":" PIECES")) :
          h("div", { style:{ fontSize:"11px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.15em", color:"rgba(255,255,255,0.35)", textShadow:"0 1px 4px rgba(0,0,0,0.5)", lineHeight:1.8, animation:sr?"fadeUp 0.8s ease 2.4s both":"none" }}, "No pieces yet", h("br"), "Waiting for uploads\u2026")
      ),
      h("div", { style:{ position:"absolute", top:24, left:24, zIndex:10, opacity:sr?0.3:0, transition:"opacity 1.5s ease 2.5s" }}, h("div", { style:{ width:20, height:1, background:"#fff" }}), h("div", { style:{ width:1, height:20, background:"#fff" }})),
      h("div", { style:{ position:"absolute", bottom:24, right:24, zIndex:10, opacity:sr?0.3:0, transition:"opacity 1.5s ease 2.5s" }}, h("div", { style:{ width:20, height:1, background:"#fff", marginLeft:"auto" }}), h("div", { style:{ width:1, height:20, background:"#fff", marginLeft:"auto" }}))
    );
  }

  // GALLERY
  const p = products[ci]; if(!p) return null;
  const prog = ((ci+1)/products.length)*100;
  const animName = dir==="up"?"slideInUp":dir==="down"?"slideInDown":"fadeIn";

  return h("div", { onTouchStart:onTS, onTouchMove:onTM, onTouchEnd:onTE, onWheel:onW,
    style:{ position:"fixed", inset:0, background:"#050505", overflow:"hidden", userSelect:"none", WebkitUserSelect:"none", touchAction:"none" }},
    h(Grain, { opacity:"0.06" }),
    h("div", { style:{ position:"absolute", top:0, left:0, right:0, padding:"20px 24px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:20, background:"linear-gradient(to bottom, rgba(5,5,5,0.9) 0%, transparent 100%)" }},
      h(Wordmark, { height:"16px", onClick:backToSplash }),
      h("div", { style:{ fontSize:"9px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.3em", color:"rgba(201,169,110,0.6)" }}, "LOOKBOOK")
    ),
    h("div", { style:{ position:"absolute", top:62, left:24, right:24, height:"1px", background:"rgba(250,248,245,0.08)", zIndex:20 }},
      h("div", { style:{ height:"100%", background:"linear-gradient(90deg, "+ACCENT+", #d4af37)", width:prog+"%", transition:"width 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }})
    ),
    h("div", { key:ci, style:{ position:"absolute", inset:0, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", transform:dragY?"translateY("+tdy*0.3+"px)":"none", transition:dragY?"none":"transform 0.3s ease", animation:animName+" 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards" }},
      h("div", { style:{ width:"calc(100% - 48px)", maxWidth:"380px", aspectRatio:"3/4", borderRadius:"2px", position:"relative", overflow:"hidden", boxShadow:"0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,169,110,0.08)", marginTop:"30px", background:"#111" }},
        p.images && p.images.length >= 2 ?
          h(ImageSwiper, { images: p.images, showCounter: String(ci+1).padStart(2,"0")+" / "+String(products.length).padStart(2,"0") }) :
          h("div", { style:{ position:"absolute", inset:0, background:"linear-gradient(145deg, #1a1a1a, #111)", display:"flex", alignItems:"center", justifyContent:"center" }},
            h("svg", { width:32, height:32, viewBox:"0 0 24 24", fill:"none", stroke:"rgba(201,169,110,0.12)", strokeWidth:1 },
              h("rect", { x:3, y:3, width:18, height:18, rx:1 }), h("circle", { cx:8.5, cy:8.5, r:1.5 }), h("path", { d:"M21 15l-5-5L5 21" }))
          ),
        h("div", { style:{ position:"absolute", top:16, right:16, fontSize:"8px", fontFamily:"'Outfit', sans-serif", fontWeight:400, letterSpacing:"0.3em", color:"#faf8f5", opacity:0.7, padding:"4px 8px", background:"rgba(0,0,0,0.4)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", border:"1px solid rgba(250,248,245,0.1)", zIndex:15 }}, p.category)
      ),
      h("div", { style:{ textAlign:"center", marginTop:"28px", padding:"0 32px", animation:"slideUp 0.6s ease 0.15s both" }},
        h("div", { style:{ width:24, height:1, background:"linear-gradient(90deg, transparent, "+ACCENT+", transparent)", margin:"0 auto 16px", animation:"expandWidth 0.8s ease 0.3s both" }}),
        h("h2", { style:{ fontSize:"clamp(22px, 6vw, 30px)", fontFamily:"'BlackMango', serif", fontWeight:500, color:"#faf8f5", letterSpacing:"0.02em", lineHeight:1.1 }}, p.name)
      )
    ),
    h("div", { style:{ position:"absolute", bottom:28, left:0, right:0, textAlign:"center", zIndex:20 }},
      h("div", { style:{ display:"inline-flex", flexDirection:"column", alignItems:"center", gap:"6px" }},
        h("svg", { width:16, height:16, viewBox:"0 0 24 24", fill:"none", stroke:"rgba(250,248,245,0.15)", strokeWidth:1.5, style:{ animation:"floatUp 2s ease infinite" }}, h("path", { d:"M12 19V5M5 12l7-7 7 7" })),
        h("div", { style:{ fontSize:"8px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.4em", color:"rgba(250,248,245,0.15)" }}, "SWIPE")
      )
    ),
    h("div", { style:{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", display:"flex", flexDirection:"column", gap:"12px", zIndex:20 }},
      products.map((_,i) =>
        h("button", { key:i, onClick:()=>{ if(i!==ci) goTo(i, i>ci?"up":"down"); },
          style:{ width:3, height:i===ci?24:8, borderRadius:2, background:i===ci?"linear-gradient(to bottom, "+ACCENT+", #d4af37)":"rgba(250,248,245,0.12)", border:"none", cursor:"pointer", padding:0, transition:"all 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }})
      )
    )
  );
}

/* ═══════════════════ MAIN APP ═══════════════════ */
function App() {
  const [pieces, setPieces] = useState([]);
  const [settings, setSettings] = useState({});
  const [ready, setReady] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([fetchPieces(), fetchSettings()]);
      setPieces(p); setSettings(s);
      setReady(true);
    })();
    onSyncUpdate = (p) => { setPieces(p); setSynced(true); setTimeout(()=>setSynced(false), 2500); };
    onSettingsUpdate = (s) => { setSettings(s); };
    connectWS();
    return () => { clearTimeout(wsTimer); if(ws) ws.close(); };
  }, []);

  async function save(updated) { setPieces(updated); await savePiecesToServer(updated); }
  function handleSettingsChange(s) { setSettings(s); }

  if(!ready) {
    return h("div", { style:{ position:"fixed", inset:0, background:"#030303", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }},
      h("img", { src:"assets/images/pakeru-wordmark.png", alt:"PAKERU", style:{ width:"clamp(120px, 40vw, 200px)", height:"auto", opacity:0.3, marginBottom:"24px", animation:"subtlePulse 2s ease infinite" }}),
      h("div", { style:{ fontSize:"10px", fontFamily:"'Outfit', sans-serif", fontWeight:300, letterSpacing:"0.4em", color:"rgba(250,248,245,0.2)" }}, "LOADING")
    );
  }

  if(IS_MOBILE) {
    return h("div", null,
      synced && h("div", { style:{ position:"fixed", top:12, left:"50%", transform:"translateX(-50%)", background:"rgba(201,169,110,0.15)", border:"1px solid rgba(201,169,110,0.3)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", padding:"6px 14px", borderRadius:"20px", zIndex:200, fontSize:"9px", fontWeight:400, letterSpacing:"0.15em", color:ACCENT, animation:"notifIn 0.3s ease", display:"flex", alignItems:"center", gap:"6px" }},
        h("div", { style:{ width:5, height:5, borderRadius:"50%", background:ACCENT, animation:"syncPulse 1s ease infinite" }}),
        "NEW PIECES ADDED"
      ),
      h(Lookbook, { products:pieces, settings })
    );
  }

  return h(AdminPanel, { pieces, save, settings, onSettingsChange: handleSettingsChange });
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
