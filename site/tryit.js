/* RunLock "Tie it yourself": the 3D animations, driven by your hand.
   Each lock is one of the app's videos. A step is a stretch of the film; you take hold of the rope where the
   marker sits and drag in the direction of the arrow, and the film follows your hand. Let go and the rope stays
   where it is. Finish the drag and the next step is offered. "Show me" plays the step for you. */
(function(){
  var host=document.getElementById('tryit');if(!host)return;
  var stage=host.querySelector('.tstage'),v=host.querySelector('video'),ov=host.querySelector('canvas.tov'),ctx=ov.getContext('2d');
  var msg=host.querySelector('.tmsg'),stepsEl=host.querySelector('.tsteps'),reset=host.querySelector('.treset'),tabs=host.querySelectorAll('.ttabs button'),ttl=host.querySelector('.ttitle'),fsb=host.querySelector('.tfull'),showBtn=host.querySelector('.tshow'),nextBtn=host.querySelector('.tnext');
  var capStep=host.querySelector('.tcap-step'),capMsg=host.querySelector('.tcap-msg'),capReset=host.querySelector('.tcap-reset'),capShow=host.querySelector('.tcap-show');
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* steps: end time in the film, where to take hold (x,y in % of the picture), which way to drag, the caption.
     auto: a step that is only the camera moving or a demonstration; it plays by itself. */
  var LOCKS=[
    {name:'Running loop',vid:'lock3',dur:12,t0:0,poster:'video/lock3-start.webp',
     steps:[{end:1.4,x:50,y:86,dx:0,dy:-1,text:'Lift a fold of the rope where you want the loop.'},
            {end:2.6,x:33,y:90,dx:-0.6,dy:0.8,text:'Open a loop where you want the running loop to sit.'},
            {end:6.0,x:52,y:16,dx:-0.7,dy:0.7,text:'Push the fold through one of the rope’s own loops.'},
            {end:12,x:94,y:91,dx:1,dy:0,text:'Done. Pull the long end to tighten the loop, slack it off to open it.'}]},
    {name:'Fixed loop',vid:'lock2',dur:14.84,t0:0.45,poster:'video/lock2-start.webp',
     steps:[{end:4.4,x:46,y:86,dx:0.15,dy:-1,text:'Push the end through one of the rope’s loops, so you get a loop of the size you want.'},
            {end:7,auto:true,text:'Close up: the end sits in one loop, and the next loop on the end lies right beside it.'},
            {end:8,x:48,y:82,dx:0,dy:-1,text:'Push the end through that next loop as well.'},
            {end:9.6,x:38,y:56,dx:0.7,dy:-0.7,text:'Pull the loop tight.'},
            {end:14.84,auto:true,text:'Locked. The loop keeps its size under load. Push the end back out to release.'}]},
    {name:'Quick loop',vid:'lock4',dur:29.96,t0:0,poster:'video/lock4-start.webp',
     steps:[{end:5.4,x:34,y:22,dx:1,dy:0.35,text:'Pass the end through the ring or around the hook and bring it back along the rope.'},
            {end:8.2,x:50,y:60,dx:0,dy:-1,text:'Fold the end and push the fold through one of the rope’s loops, then pull it through.'},
            {end:11.6,x:20,y:44,dx:-1,dy:0,text:'Tighten, then load the long end: the lock closes on itself and holds.'},
            {end:29.96,x:12,y:88,dx:-1,dy:0.3,text:'To release, pull the free end. It opens even after a heavy load.'}]},
    {name:'Securing lock',vid:'lock1',dur:24,t0:0.45,poster:'video/lock1-start.webp',
     steps:[{end:3.2,x:54,y:80,dx:-0.3,dy:-1,text:'Run the rope over the load and around the anchor, and bring the end back to the rope.'},
            {end:7.4,x:44,y:76,dx:0.4,dy:-1,text:'Push the end through one of the rope’s loops.'},
            {end:13,x:60,y:52,dx:0.3,dy:-1,text:'Pull it through.'},
            {end:17,x:45,y:84,dx:0.6,dy:-0.7,text:'Take the end around and through once more.'},
            {end:24,x:48,y:88,dx:-0.3,dy:1,text:'Pull tight. It holds the load and releases without a knot to pick apart.'}]}];
  var li=0,L=LOCKS[0],cur=0,prog=0,dragging=false,p0=null,prog0=0,unlocked=false,playing=false,rafId=0,frame=0,stepEls=[],done=false,loaded=false;
  function start(i){return i===0?L.t0:L.steps[i-1].end;}
  function end(i){return L.steps[i].end;}

  /* ---- video seeking, throttled so a fast drag does not queue up seeks ---- */
  var seeking=false,pending=null;
  function seekTo(t){t=Math.max(0,Math.min(L.dur-0.05,t));if(seeking){pending=t;return;}seeking=true;pending=null;try{v.currentTime=t;}catch(e){seeking=false;}}
  v.addEventListener('seeked',function(){seeking=false;if(pending!==null){var t=pending;pending=null;seekTo(t);}});
  v.addEventListener('loadedmetadata',function(){seeking=false;});
  /* phones only decode after a user gesture has started the film once: play and pause straight away */
  function unlock(){if(unlocked)return;unlocked=true;var p=v.play();if(p&&p.then)p.then(function(){if(!playing)v.pause();}).catch(function(){unlocked=false;});}

  function setLock(n){li=n;L=LOCKS[n];cur=0;prog=0;done=false;playing=false;
    tabs.forEach(function(b,i){b.setAttribute('aria-pressed',i===n?'true':'false')});if(ttl)ttl.textContent='The '+L.name.toLowerCase();
    v.pause();v.poster=L.poster;seeking=false;pending=null;loaded=false;stage.classList.add('loading');
    var mine=L;window.rlLoadVideo(v,'video/'+L.vid+'.mp4',function(){if(L!==mine)return;loaded=true;stage.classList.remove('loading');seekTo(L.t0+0.01);});
    if(stepsEl){stepsEl.innerHTML=L.steps.map(function(s){return '<li>'+s.text+'</li>'}).join('');stepEls=stepsEl.querySelectorAll('li');}
    setStep(0);}
  function setStep(i){cur=i;prog=0;var s=L.steps[i];
    var lead=s.auto?'':(i===0?'Take hold of the rope at the marker and drag it the way the arrow points. ':'Now: ');
    var t=lead+s.text;if(msg)msg.textContent=t;if(capMsg)capMsg.textContent=t;if(capStep)capStep.textContent=(i+1)+'/'+L.steps.length;
    stepEls.forEach(function(el,k){el.classList.toggle('on',k===i);el.classList.toggle('done',k<i)});
    if(showBtn)showBtn.hidden=!!s.auto;if(capShow)capShow.hidden=!!s.auto;
    if(s.auto){if(loaded)playStep();else{var wait=setInterval(function(){if(loaded){clearInterval(wait);if(cur===i&&!done)playStep();}},100);}}}
  function finishLock(){done=true;var t='That is the '+L.name.toLowerCase()+'. Pick another lock, or press Reset and tie it again.';if(msg)msg.textContent=t;if(capMsg)capMsg.textContent=t;
    stepEls.forEach(function(el){el.classList.add('done');el.classList.remove('on')});if(showBtn)showBtn.hidden=true;if(capShow)capShow.hidden=true;}
  function completeStep(){prog=1;seekTo(end(cur));if(cur<L.steps.length-1)setStep(cur+1);else finishLock();}
  /* play the rest of the current step, then stop at its end */
  function playStep(){if(!loaded)return;unlock();playing=true;dragging=false;v.playbackRate=0.8;var p=v.play();if(p&&p.catch)p.catch(function(){playing=false;});
    function watch(){if(!playing)return;if(v.currentTime>=end(cur)-0.04||v.ended){v.pause();playing=false;completeStep();return;}prog=Math.max(0,Math.min(1,(v.currentTime-start(cur))/(end(cur)-start(cur))));requestAnimationFrame(watch);}
    requestAnimationFrame(watch);}

  /* ---- pointer: drag anywhere on the picture, the film follows the part of the drag that goes the arrow's way ---- */
  function local(e){var r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top,w:r.width,h:r.height};}
  function gestureLen(){return Math.max(120,Math.min(260,v.getBoundingClientRect().width*0.3));}
  stage.addEventListener('pointerdown',function(e){if(done||L.steps[cur].auto||playing||!loaded)return;unlock();dragging=true;p0=local(e);prog0=prog;stage.setPointerCapture(e.pointerId);stage.classList.add('grab');e.preventDefault();});
  stage.addEventListener('pointermove',function(e){if(!dragging)return;var p=local(e),s=L.steps[cur],d=(p.x-p0.x)*s.dx+(p.y-p0.y)*s.dy;
    prog=Math.max(0,Math.min(1,prog0+d/gestureLen()));seekTo(start(cur)+(end(cur)-start(cur))*prog);e.preventDefault();});
  function up(){if(!dragging)return;dragging=false;stage.classList.remove('grab');if(prog>=0.9)completeStep();}
  stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);stage.addEventListener('lostpointercapture',up);

  /* ---- overlay: the marker and the arrow ---- */
  function resize(){var r=v.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);ov.width=Math.round(r.width*dpr);ov.height=Math.round(r.height*dpr);ov.style.width=r.width+'px';ov.style.height=r.height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}
  function draw(){frame++;var r=v.getBoundingClientRect(),w=r.width,h=r.height;if(Math.abs(w-ov.clientWidth)>1||Math.abs(h-ov.clientHeight)>1)resize();ctx.clearRect(0,0,w,h);
    if(done||playing)return;var s=L.steps[cur];if(s.auto)return;
    var x=s.x/100*w,y=s.y/100*h,pulse=reduce?0:Math.sin(frame/9)*3;
    if(!dragging&&prog<0.05){
      ctx.fillStyle='rgba(216,18,31,.16)';ctx.beginPath();ctx.arc(x,y,26+pulse,0,7);ctx.fill();
      ctx.strokeStyle='rgba(216,18,31,.95)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,26+pulse,0,7);ctx.stroke();
      ctx.fillStyle='#d8121f';ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.fill();}
    /* arrow, always, so you know which way to drag; it shrinks as the step completes */
    var L2=Math.max(30,80*(1-prog)),ax=x+s.dx*36,ay=y+s.dy*36,bx=x+s.dx*(36+L2),by=y+s.dy*(36+L2);
    if(prog>=0.05&&!dragging)ctx.globalAlpha=0.6;
    ctx.strokeStyle='#d8121f';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
    var px=-s.dy,py=s.dx;ctx.fillStyle='#d8121f';ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx-s.dx*14+px*9,by-s.dy*14+py*9);ctx.lineTo(bx-s.dx*14-px*9,by-s.dy*14-py*9);ctx.closePath();ctx.fill();
    ctx.globalAlpha=1;
    if(!dragging&&prog<0.05){ctx.fillStyle='#d8121f';ctx.font='700 14px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillText('DRAG',x,y-36);}
    /* progress ring while dragging */
    if(dragging||prog>0){ctx.strokeStyle='rgba(216,18,31,.35)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(w-30,30,16,0,7);ctx.stroke();ctx.strokeStyle='#d8121f';ctx.beginPath();ctx.arc(w-30,30,16,-Math.PI/2,-Math.PI/2+prog*2*Math.PI);ctx.stroke();}}
  var running=false;function loop(){draw();if(running)rafId=requestAnimationFrame(loop);}
  function go(){if(!running){running=true;rafId=requestAnimationFrame(loop);}}
  function stop(){running=false;cancelAnimationFrame(rafId);}
  if('IntersectionObserver' in window){new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?go():stop();})},{threshold:.05}).observe(stage);}else go();

  /* ---- buttons ---- */
  tabs.forEach(function(b,i){b.addEventListener('click',function(){setLock(i)})});
  function restart(){v.pause();playing=false;done=false;seekTo(L.t0);setStep(0);}
  if(reset)reset.addEventListener('click',restart);if(capReset)capReset.addEventListener('click',restart);
  if(showBtn)showBtn.addEventListener('click',function(){if(!done)playStep();});if(capShow)capShow.addEventListener('click',function(){if(!done)playStep();});
  if(nextBtn)nextBtn.addEventListener('click',function(){if(!done){v.pause();playing=false;completeStep();}});
  if(fsb){fsb.addEventListener('click',function(){if(document.fullscreenElement){document.exitFullscreen();}else if(host.requestFullscreen){host.requestFullscreen();}});
    document.addEventListener('fullscreenchange',function(){fsb.textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';setTimeout(resize,60);setTimeout(resize,400);});
    if(!document.documentElement.requestFullscreen)fsb.hidden=true;}
  window.addEventListener('resize',resize);
  resize();setLock(0);
  host.dataset.ready='1';
  window.__tryit={get:function(){return {li:li,cur:cur,prog:prog,t:v.currentTime,done:done,playing:playing}},def:function(){return L.steps[cur]},setLock:setLock};
})();
