/* RunLock "Try it": a rope of loops on a table, seen from above.
   You can drag any point of the rope, lift a fold and push it through one of the rope's own loops, or push an end through.
   The rope is a chain of fixed-length segments moved with a follow-the-leader rule: a point only moves when the rope
   pulls it, so the rope stays where you put it, like a real rope on a table, and it never stretches.
   A "ring" is a loop that something passes through: one pass point for an end, two for a fold. Rope slides through
   a ring when it is pulled from one side; when the enclosed loop cannot shrink any further (a tow ball inside it),
   the ring itself is dragged instead, and if the geometry cannot follow, the pull is refused: the lock holds. */
(function(){
  var host=document.getElementById('tryit');if(!host)return;
  var cv=host.querySelector('canvas'),ctx=cv.getContext('2d');
  var W=900,H=460;                       /* logical size, H follows the box */
  var K=6,CELLS=21,N=K*CELLS+1,SEG=11;   /* 6 segments per loop cell, 21 loops (15 on a phone) */
  var RR=5,LH=9,JOINSEG=2;               /* rope radius, loop half height, join = first 2 segments of a cell */
  var ball={x:768,y:318,r:27},post={x:790,y:96,r:14},OBJ=[ball,post];
  var P=[],S=[],rings=[],armed=-1,dwell=0,still=0,holdT=0,prevC={},touch=false,lift=0,drag=-1,ptr={x:0,y:0},lastPtr=null,ptrSpeed=0,hover=-1,cool=0,frame=0,stage=0,best=null,stuckFrames=0;
  var msg=host.querySelector('.tmsg'),stepsEl=host.querySelector('.tsteps'),reset=host.querySelector('.treset'),tabs=host.querySelectorAll('.ttabs button'),ttl=host.querySelector('.ttitle'),fsb=host.querySelector('.tfull');
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ---------- missions ---------- */
  function isFold(r){return r.passes.length===2;}
  function foldRings(){return rings.filter(isFold);}
  function endRings(){return rings.filter(function(r){return !isFold(r)});}
  var MISSIONS=[
    {name:'The running loop',guided:'running',
     steps:['Lift a fold','Push the fold through the loop next to it','Drop the loop over the tow ball','Pull the long end'],
     msgs:['Drag the marked point to lift a fold of the rope, like in the video.',
       'Now push the fold through the loop right next to it: drag it in the direction of the arrow.',
       'You have a running loop. Drag it over to the tow ball.',
       'Pull the long end. The rope runs through the loop and the loop closes on the ball.',
       'That is the running loop. It holds as long as there is pull, and it is not a knot: slack it off and it opens again. Try the fixed loop, or play freely with the rope.']},
    {name:'The fixed loop',guided:'fixed',
     steps:['Push the end through a loop','Pull it on through','Fold the big loop through the loop on the end','Pull it snug'],
     msgs:['Push the free end through one of the rope\u2019s loops: drag it in the direction of the arrow.',
       'Pull the end on through, so the big loop gets the size you want.',
       'Now fold the big loop and push the fold through the loop on the end, right beside the crossing.',
       'Pull it snug.',
       'Locked. The loop keeps its size under load, which is what a leash or a lifting loop needs, and it still opens without a knot to pick apart.']},
    {name:'Free play',guided:null,
     steps:['Drag the rope anywhere','Hold a fold or an end still over a loop to push it through','Pull an end and the rope runs through the loop'],
     msgs:['A rope of loops on a table. Drag any point, hold a fold or an end still over a loop until it lights up and it goes through, then pull. Hold a running loop over the tow ball to drop it over.'],
     test:function(){return 0;}}];
  var mi=0,stepEls=[];

  function init(){P=[];S=[];rings=[];stage=0;cool=0;stuckFrames=0;CELLS=21;N=K*CELLS+1;holdT=0;setScale(1);
    /* lay the rope as a sine wave along the longer axis of the table, with a little slack, and make it fit */
    var portrait=H>W,len=portrait?H:W,wid=portrait?W:H,margin=portrait?40:60,PER=portrait?34:52,AMP=portrait?wid*0.26:wid*0.3,mid=portrait?wid*0.42:wid/2,pts;
    for(var tries=0;tries<12;tries++){pts=[];var u=margin,v=0;
      for(var i=0;i<N;i++){pts.push({u:u,v:mid+v});var dv=AMP*Math.cos((u-margin)/PER)/PER;u+=SEG*0.93/Math.sqrt(1+dv*dv);v=AMP*Math.sin((u-margin)/PER);}
      if(u<len-margin-(portrait?0:120))break;AMP=Math.min(portrait?wid*0.34:wid*0.42,AMP*1.12);PER*=0.9;}
    for(i=0;i<N;i++){var q=pts[N-1-i];P[i]=portrait?{x:q.v,y:q.u}:{x:q.u,y:q.v};S[i]={x:P[i].x,y:P[i].y};}
    setStage(0);}
  function setMission(n){mi=n;var M=MISSIONS[n];if(ttl)ttl.textContent=M.name;tabs.forEach(function(b,i){b.setAttribute('aria-pressed',i===n?'true':'false')});
    if(stepsEl){stepsEl.innerHTML=M.steps.map(function(t){return '<li>'+t+'</li>'}).join('');stepEls=stepsEl.querySelectorAll('li');}
    if(M.guided){guidedStart(M.guided);}else{G=null;init();}}
  var capStep=host.querySelector('.tcap-step'),capMsg=host.querySelector('.tcap-msg'),capReset=host.querySelector('.tcap-reset'),showBtn=host.querySelector('.tshow');
  function setStage(n){stage=n;var M=MISSIONS[mi],t=M.msgs[Math.min(n,M.msgs.length-1)];if(msg)msg.textContent=t;if(showBtn)showBtn.hidden=!(M.guided&&n<M.steps.length);
    if(capStep)capStep.textContent=(Math.min(n,M.steps.length-1)+1)+'/'+M.steps.length;if(capMsg)capMsg.textContent=t;
    stepEls.forEach(function(li,i){li.classList.toggle('on',i===n);li.classList.toggle('done',i<n)});}

  /* ---------- geometry ---------- */
  function cellCenter(c){return c*K+JOINSEG+Math.round((K-JOINSEG)/2);}
  function amp(i){var r=i%K;if(r<=JOINSEG)return 0;var u=(r-JOINSEG)/(K-JOINSEG);return LH*Math.sin(Math.PI*u);}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function inside(poly,pt){var c=false;for(var i=0,j=poly.length-1;i<poly.length;j=i++){var a=poly[i],b=poly[j];if(((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x))c=!c;}return c;}
  /* the rope enclosed by a ring: from the pass point to the ring for an end, between the two pass points for a fold */
  function span(r){return isFold(r)?[r.passes[0],r.passes[1]]:(r.passes[0]<r.ci?[r.passes[0],r.ci]:[r.ci,r.passes[0]]);}
  function spanLen(r){var s=span(r);return s[1]-s[0];}
  function encloses(r,o){var s=span(r);return inside(P.slice(s[0],s[1]+1),o);}
  function minSegs(r){var m=isFold(r)?K+2:2*K;OBJ.forEach(function(o){if(encloses(r,o))m=Math.max(m,Math.ceil(2*Math.PI*(o.r+RR+1.5)/SEG)+1)});return m;}
  function enclosing(){var b=null;rings.forEach(function(r){if(OBJ.some(function(o){return encloses(r,o)})){var tight=spanLen(r)<=minSegs(r)+1||r.stuck>0;if(!b||tight)b={r:r,tight:tight};}});return b;}
  function ringOf(i){for(var j=0;j<rings.length;j++){var r=rings[j];if(r.ci===i||r.passes.indexOf(i)>=0)return r;}return null;}
  function ringIndices(){var o={};rings.forEach(function(r){o[r.ci]=1;r.passes.forEach(function(p){o[p]=1})});return o;}

  /* ---------- rope movement: follow the leader ---------- */
  var fail=false,visits=[],why='';
  function collide(i,from){
    for(var it=0;it<3;it++){var hit=false;
      for(var oi=0;oi<OBJ.length;oi++){var o=OBJ[oi],rr=o.r+RR;
        /* swept: if the point passed through the object since the start of this step, put it back on the side it came from */
        var ax=S[i].x,ay=S[i].y,mx=P[i].x-ax,my=P[i].y-ay,ml=mx*mx+my*my;
        if(ml>0.5){var tt=Math.max(0,Math.min(1,((o.x-ax)*mx+(o.y-ay)*my)/ml)),kx=ax+mx*tt-o.x,ky=ay+my*tt-o.y,kd=Math.hypot(kx,ky);
          if(kd<rr&&Math.hypot(P[i].x-o.x,P[i].y-o.y)<rr+0.5){if(kd<0.01){kx=-my;ky=mx;kd=Math.sqrt(ml);}P[i].x=o.x+kx/kd*rr;P[i].y=o.y+ky/kd*rr;hit=true;continue;}}
        var dx=P[i].x-o.x,dy=P[i].y-o.y,d=Math.hypot(dx,dy);if(d<rr){var f=(rr-d)/(d||1);P[i].x+=dx*f;P[i].y+=dy*f;hit=true;}
        /* the segment to the leader may not cut through the object either */
        if(from>=0){var L=P[from],ex=P[i].x-L.x,ey=P[i].y-L.y,el=ex*ex+ey*ey||1,t=Math.max(0,Math.min(1,((o.x-L.x)*ex+(o.y-L.y)*ey)/el));
          if(t>0&&t<1){var cx=L.x+ex*t-o.x,cy=L.y+ey*t-o.y,cd=Math.hypot(cx,cy);if(cd<rr){if(cd<0.01){cx=-ey;cy=ex;cd=Math.sqrt(el);}P[i].x+=cx/cd*(rr-cd)/(1-t)*0.999;P[i].y+=cy/cd*(rr-cd)/(1-t)*0.999;hit=true;}}}}
      if(P[i].x<RR||P[i].x>W-RR||P[i].y<RR||P[i].y>H-RR){P[i].x=Math.max(RR,Math.min(W-RR,P[i].x));P[i].y=Math.max(RR,Math.min(H-RR,P[i].y));hit=true;}
      if(!hit)return;
      if(from>=0){var L=P[from],ex=P[i].x-L.x,ey=P[i].y-L.y,el=Math.hypot(ex,ey);if(el>SEG){P[i].x=L.x+ex/el*SEG;P[i].y=L.y+ey/el*SEG;}}}
    if(from>=0&&dist(P[i],P[from])>SEG*1.2){fail=true;why='collide '+i+' from '+from+' d='+dist(P[i],P[from]).toFixed(1);}}
  /* keep point i within one segment of its leader. Returns true if it had to move */
  function place(i,from){var L=P[from],dx=P[i].x-L.x,dy=P[i].y-L.y,d=Math.hypot(dx,dy);
    if(d<=SEG+0.01)return false;if(d<1e-6){dx=1;dy=0;d=1;}
    P[i].x=L.x+dx/d*SEG;P[i].y=L.y+dy/d*SEG;collide(i,from);return true;}
  function moveRingTo(r,x,y){P[r.ci].x=x;P[r.ci].y=y;r.passes.forEach(function(p){P[p].x=x;P[p].y=y});}
  /* can pass point p of ring r shift by s (the pulled side gains one segment)? */
  function canSlide(r,p,s){var np=p+s;if(np<1||np>N-2)return false;
    var used=ringIndices();if(used[np])return false;
    var s0=span(r),len=s0[1]-s0[0],shrinks=isFold(r)?((p===s0[0]&&s>0)||(p===s0[1]&&s<0)):((p<r.ci&&s>0)||(p>r.ci&&s<0));
    if(shrinks&&len-1<=(r.min||minSegs(r)))return false;
    /* growing pulls rope in from the far side: refuse if that rope is held by another ring right there */
    return true;}
  function propagate(work){
    while(work.length){var w=work.pop(),i=w[0],from=w[1];if(i<0||i>=N)continue;
      if(!place(i,from))continue;
      if(++visits[i]>14){fail=true;why='visits '+i;return;}
      var s=i-from,r=ringOf(i);
      if(!r){work.push([i+s,i]);continue;}
      if(r.ci===i){moveRingTo(r,P[i].x,P[i].y);r.passes.forEach(function(p){work.push([p-1,p]);work.push([p+1,p]);});work.push([i+s,i]);continue;}
      /* i is a pass point pulled from one side */
      if(canSlide(r,i,s)){var np=i+s;r.passes[r.passes.indexOf(i)]=np;r.passes.sort(function(a,b){return a-b});P[np].x=P[r.ci].x;P[np].y=P[r.ci].y;r.slid=frame;work.push([np+s,np]);
        /* an end pulled out, or a fold pulled through: the ring is gone */
        if(isFold(r)?(r.passes[1]-r.passes[0]<2):(np===r.ci||np<1||np>N-2)){rings.splice(rings.indexOf(r),1);cool=20;}
        continue;}
      /* cannot slide: the whole ring is dragged along */
      if(dist(P[r.ci],P[i])<0.01)continue;
      moveRingTo(r,P[i].x,P[i].y);r.stuck=2;
      work.push([r.ci-1,r.ci]);work.push([r.ci+1,r.ci]);
      r.passes.forEach(function(p){if(p!==i){work.push([p-1,p]);work.push([p+1,p]);}});
      work.push([i+s,i]);}}
  /* which side of each rope segment an object lies on; a flip means the rope went through it */
  function sides(){var out=[];OBJ.forEach(function(o){var a=[];for(var i=0;i<N-1;i++){var p=P[i],q=P[i+1],ex=q.x-p.x,ey=q.y-p.y,el=ex*ex+ey*ey||1,t=((o.x-p.x)*ex+(o.y-p.y)*ey)/el;
      a.push((t>0&&t<1)?((ex*(o.y-p.y)-ey*(o.x-p.x))>0?1:-1):0);}out.push(a);});return out;}
  function crossed(before){var now=sides(),used=ringIndices();for(var oi=0;oi<OBJ.length;oi++)for(var i=0;i<N-1;i++){if(used[i]||used[i+1])continue;if(before[oi][i]&&now[oi][i]&&before[oi][i]!==now[oi][i])return i;}return -1;}
  function snapshot(){return {P:P.map(function(p){return {x:p.x,y:p.y}}),rings:rings.map(function(r){return {ci:r.ci,passes:r.passes.slice(),t:r.t,stuck:r.stuck,slid:r.slid,min:r.min,enc:r.enc,nx:r.nx,ny:r.ny}})};}
  function restore(sn){P=sn.P;rings=sn.rings;}
  function moveDragged(x,y){var sn=snapshot(),sd=sides(),used0=ringIndices();fail=false;visits=new Array(N).fill(0);
    rings.forEach(function(r){r.min=minSegs(r);r.enc=OBJ.map(function(o){return encloses(r,o)});});
    var r=ringOf(drag),ox=P[drag].x,oy=P[drag].y,C0=snapCenters();
    P[drag].x=x;P[drag].y=y;collide(drag,-1);
    var work=[];
    if(r){moveRingTo(r,P[drag].x,P[drag].y);work.push([r.ci-1,r.ci]);work.push([r.ci+1,r.ci]);r.passes.forEach(function(p){work.push([p-1,p]);work.push([p+1,p]);});}
    else{work.push([drag-1,drag]);work.push([drag+1,drag]);}
    propagate(work);
    if(!fail&&!r){var nr=gate(ox,oy,C0);
      /* a new ring: lay the rope next to the pass points again */
      if(nr){var w2=[];nr.passes.forEach(function(p){if(p-1!==drag)w2.push([p-1,p]);if(p+1!==drag)w2.push([p+1,p]);});visits=new Array(N).fill(0);propagate(w2);}}
    /* rings must still close: every pass sits on its ring and every segment next to it is not overstretched */
    if(!fail)rings.forEach(function(r){r.passes.concat([r.ci]).forEach(function(p){if(p>0&&dist(P[p],P[p-1])>SEG*1.2){fail=true;why='ring '+p+'/'+(p-1)+' d='+dist(P[p],P[p-1]).toFixed(1);}if(p<N-1&&dist(P[p],P[p+1])>SEG*1.2){fail=true;why='ring '+p+'/'+(p+1)+' d='+dist(P[p],P[p+1]).toFixed(1);}})});
    if(!fail){var cx=crossed(sd);if(cx>=0&&!used0[cx]&&!used0[cx+1]&&!used0[cx-1]&&!used0[cx+2]){fail=true;why='crossed '+cx;}}
    /* what is inside a loop stays inside: a loop cannot pass through the ball */
    if(!fail)rings.forEach(function(r){if(r.enc)OBJ.forEach(function(o,oi){if(r.enc[oi]&&!encloses(r,o)){fail=true;why='slipped';}})});
    if(fail){restore(sn);stuckFrames++;rings.forEach(function(q){if(q.stuck)q.stuck=3});return false;}
    return true;}

  /* ---------- threading: a dragged point pushed through a loop ---------- */
  function segX(ax,ay,bx,by,cx,cy,dx,dy){var d=(bx-ax)*(dy-cy)-(by-ay)*(dx-cx);if(Math.abs(d)<1e-9)return false;
    var t=((cx-ax)*(dy-cy)-(cy-ay)*(dx-cx))/d,u=((cx-ax)*(by-ay)-(cy-ay)*(bx-ax))/d;return t>=0&&t<=1&&u>=0&&u<=1;}
  function snapCenters(){var o={};for(var c=0;c<CELLS;c++){var ci=cellCenter(c);o[ci]={x:P[ci].x,y:P[ci].y};}return o;}
  function tipOf(r){return isFold(r)?Math.round((r.passes[0]+r.passes[1])/2):(r.passes[0]<r.ci?r.passes[0]-1:r.passes[0]+1);}
  /* the loop opening is a gate along the rope at the loop centre; crossing it, measured relative to the loop, is going through */
  function gate(ox,oy,C0){if(cool>0||ptrSpeed>18)return null;var i=drag,hx=P[i].x,hy=P[i].y;
    for(var c=0;c<CELLS;c++){var ci=cellCenter(c);if(ci<2||ci>=N-2||Math.abs(ci-i)<K+1)continue;
      var ringed=null;rings.forEach(function(r){if(r.ci===ci)ringed=r});
      if(ringed&&tipOf(ringed)!==i)continue;
      var a=P[ci-1],b=P[ci+1],tx=b.x-a.x,ty=b.y-a.y,tl=Math.hypot(tx,ty)||1,nx=tx/tl,ny=ty/tl,g=(K-JOINSEG)*SEG/2+3,q=P[ci],q0=C0[ci];
      var rx0=ox-q0.x,ry0=oy-q0.y,rx1=hx-q.x,ry1=hy-q.y;if(Math.hypot(rx1-rx0,ry1-ry0)<0.2)continue;
      if(!segX(rx0,ry0,rx1,ry1,-nx*g,-ny*g,nx*g,ny*g))continue;
      if(!(armed===ci&&dwell>=12)&&!ringed)continue;      /* only a loop you have held the rope over for a moment */
      if(!ringed&&prevC[ci]&&dist(prevC[ci],P[ci])>2.5)continue;   /* and one that lies still, not one being dragged along */
      if(ringed){var back=(rx0*ringed.nx+ry0*ringed.ny)>0&&(rx1*ringed.nx+ry1*ringed.ny)<0,small=isFold(ringed)?(ringed.passes[1]-ringed.passes[0]<=K+3):(Math.abs(ringed.passes[0]-ringed.ci)>=1&&spanLen(ringed)>=0&&(ringed.passes[0]<=3||ringed.passes[0]>=N-4));
        if(back&&small&&!OBJ.some(function(o){return encloses(ringed,o)})){rings.splice(rings.indexOf(ringed),1);cool=20;hover=-1;}return null;}       /* the tip came back out */
      var passes=(i===0)?[1]:(i===N-1)?[N-2]:[i-1,i+1];
      var used=ringIndices();if(passes.some(function(p){return used[p]}))continue;
      passes.forEach(function(p){P[p].x=q.x;P[p].y=q.y});
      /* the tip sits just through the ring; pulling it further makes the rope slide through */
      var vx=hx-q.x,vy=hy-q.y,vl=Math.hypot(vx,vy)||1;P[i].x=q.x+vx/vl*SEG*0.8;P[i].y=q.y+vy/vl*SEG*0.8;
      var mv=rx1-rx0,mw=ry1-ry0,mlen=Math.hypot(mv,mw)||1;
      var nr={ci:ci,passes:passes,t:frame,stuck:0,slid:0,nx:mv/mlen,ny:mw/mlen};rings.push(nr);cool=20;hover=-1;return nr;}
    return null;}

  /* the fold ring whose noose the dragged point belongs to */
  function tipRingAt(i){for(var j=0;j<rings.length;j++){var r=rings[j];if(isFold(r)&&i>r.passes[0]&&i<r.passes[1])return r;}return null;}
  function nearObject(p){for(var j=0;j<OBJ.length;j++){var o=OBJ[j];if(dist(p,o)<o.r+26)return o;}return null;}
  function autoThread(ci){if(rings.some(function(r){return r.ci===ci}))return;var i=drag,q=P[ci],a=P[ci-1],b=P[ci+1],tx=b.x-a.x,ty=b.y-a.y,tl=Math.hypot(tx,ty)||1,nx=-ty/tl,ny=tx/tl;
    var rx=P[i].x-q.x,ry=P[i].y-q.y,sgn=(rx*nx+ry*ny)>=0?1:-1;nx*=sgn;ny*=sgn;      /* through, away from the side the tip is on */
    var passes=(i===0)?[1]:(i===N-1)?[N-2]:[i-1,i+1],used=ringIndices();if(passes.some(function(p){return used[p]}))return;
    var sn=snapshot();fail=false;visits=new Array(N).fill(0);
    passes.forEach(function(p){P[p].x=q.x;P[p].y=q.y});P[i].x=q.x-nx*SEG*0.8;P[i].y=q.y-ny*SEG*0.8;
    var nr={ci:ci,passes:passes,t:frame,stuck:0,slid:0,nx:-nx,ny:-ny};rings.push(nr);
    var w2=[];passes.forEach(function(p){if(p-1!==i)w2.push([p-1,p]);if(p+1!==i)w2.push([p+1,p]);});propagate(w2);
    if(fail){restore(sn);return;}cool=30;hover=-1;armed=-1;dwell=0;still=0;}
  /* lay the noose of a fold ring around an object, as if dropped over it from above */
  function dropOver(r,o){var sn=snapshot();var s0=span(r),need=Math.ceil(2*Math.PI*(o.r+RR+4)/SEG)+2+2*Math.ceil(dist(P[r.ci],o)/SEG);
    /* feed rope through the ring until the noose is long enough */
    var guard=0;while(s0[1]-s0[0]<need&&guard++<200){var grew=false;
      if(canSlide(r,r.passes[1],1)){var np=r.passes[1]+1;r.passes[1]=np;grew=true;}
      else if(canSlide(r,r.passes[0],-1)){np=r.passes[0]-1;r.passes[0]=np;grew=true;}
      if(!grew)break;s0=span(r);}
    var len=s0[1]-s0[0];if(len<need-2*Math.ceil(dist(P[r.ci],o)/SEG)){restore(sn);return;}
    /* path: ring -> circle -> around -> back to ring, with the circle radius chosen so the path uses the whole noose */
    var q=P[r.ci],dq=dist(q,o)||1,ux=(o.x-q.x)/dq,uy=(o.y-q.y)/dq,R=o.r+RR+4;
    var total=len*SEG;for(var it=0;it<20;it++){var straight=Math.max(0,dq-R),L=2*straight+2*Math.PI*R;if(L>=total)break;R+=(total-L)/(2*Math.PI+0.01)*0.9;}
    if(dq<R){/* the ring sits inside the circle: move it out onto the circle */var qx=o.x+ux*R*-1,qy=o.y+uy*R*-1;q.x=qx;q.y=qy;r.passes.forEach(function(pp){P[pp].x=qx;P[pp].y=qy});dq=R;}
    var straight2=Math.max(0,dq-R),arc=2*Math.PI*R,L2=2*straight2+arc,pts=[];
    for(var k=0;k<=len;k++){var d=L2*k/len,pt;
      if(d<=straight2)pt={x:q.x+ux*d,y:q.y+uy*d};
      else if(d<=straight2+arc){var ang=Math.atan2(-uy,-ux)+(d-straight2)/R;pt={x:o.x+R*Math.cos(ang),y:o.y+R*Math.sin(ang)};}
      else{var back=L2-d;pt={x:q.x+ux*back,y:q.y+uy*back};}
      pts.push(pt);}
    for(k=0;k<=len;k++){P[s0[0]+k].x=pts[k].x;P[s0[0]+k].y=pts[k].y;}
    P[s0[0]].x=q.x;P[s0[0]].y=q.y;P[s0[1]].x=q.x;P[s0[1]].y=q.y;
    /* the two tails were dragged along on the way here: lay them out again, away from the object, so the ends are easy to find */
    var cx=W/2,cy=H/2,ax=cx-o.x,ay=cy-o.y,al=Math.hypot(ax,ay)||1;ax/=al;ay/=al;
    function lay(from,to,step,ang){var ca=Math.cos(ang),sa=Math.sin(ang),dx=ax*ca-ay*sa,dy=ax*sa+ay*ca,x=q.x,y=q.y,n=0,M=24;
      for(var i=from;i!==to;i+=step){n++;
        for(var tr=0;tr<10;tr++){var nx=x+dx*SEG*0.9,ny=y+dy*SEG*0.9;if(nx>M&&nx<W-M&&ny>M&&ny<H-M)break;
          /* would leave the table: turn towards the middle */
          var tx=cx-x,ty=cy-y,tl=Math.hypot(tx,ty)||1,cross=dx*ty-dy*tx,rot=cross>0?0.35:-0.35,c2=Math.cos(rot),s2=Math.sin(rot),ndx=dx*c2-dy*s2;dy=dx*s2+dy*c2;dx=ndx;}
        x+=dx*SEG*0.9;y+=dy*SEG*0.9;var wob=Math.sin(n/5)*8;P[i].x=x-dy*wob;P[i].y=y+dx*wob;}}
    lay(s0[0]-1,-1,-1,-0.5);lay(s0[1]+1,N,1,0.5);
    fail=false;visits=new Array(N).fill(0);propagate([[s0[0]-1,s0[0]],[s0[1]+1,s0[1]]]);
    if(fail){restore(sn);return;}
    r.t=frame;r.stuck=0;cool=30;drag=-1;holdT=0;cv.classList.remove('grab');}
  var holdT=0;

  /* ---------- guided mode: keyframes of rope positions, scrubbed by a drag gesture ----------
     Side view, like the RunLock videos: the rope lies flat along a baseline and the loop stands up.
     Every keyframe is built from the same list of primitives with the same sample counts, so the
     dense paths can be blended point by point; the rope is then laid along the blended path from the
     free end, which makes rope slide through a ring when a loop shrinks instead of morphing. */
  var G=null;
  function vadd(a,b,k){return {x:a.x+b.x*(k===undefined?1:k),y:a.y+b.y*(k===undefined?1:k)};}
  function vnorm(v){var l=Math.hypot(v.x,v.y)||1;return {x:v.x/l,y:v.y/l};}
  function perp(v){return {x:-v.y,y:v.x};}
  function pLine(out,a,b,n){n=n||24;for(var i=0;i<=n;i++)out.push({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n});}
  /* a flat-lying rope is never dead straight: a line with a small undulation */
  function pFlat(out,a,b,n,amp){n=n||40;var d={x:b.x-a.x,y:b.y-a.y},L=Math.hypot(d.x,d.y)||1,nx=-d.y/L,ny=d.x/L;
    for(var i=0;i<=n;i++){var t=i/n,w=Math.sin(t*Math.PI*2.3+0.4)*amp*Math.sin(t*Math.PI);out.push({x:a.x+d.x*t+nx*w,y:a.y+d.y*t+ny*w});}}
  function pEll(out,c,rx,ry,a0,a1,n){n=n||64;for(var i=0;i<=n;i++){var a=a0+(a1-a0)*i/n;out.push({x:c.x+rx*Math.cos(a),y:c.y+ry*Math.sin(a)});}}
  function pBez(out,p0,c1,c2,p1,n){n=n||32;for(var i=0;i<=n;i++){var t=i/n,u=1-t;out.push({x:u*u*u*p0.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*p1.x,y:u*u*u*p0.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*p1.y});}}
  /* lay N rope points SEG apart along a dense path, from the path start (the free end) */
  function resample(path){var pts=[path[0]],acc=0,i=1,cur=path[0];
    while(pts.length<N&&i<path.length){var nx=path[i],d=dist(cur,nx);if(d<1e-6){i++;continue;}if(acc+d>=SEG){var t=(SEG-acc)/d;cur={x:cur.x+(nx.x-cur.x)*t,y:cur.y+(nx.y-cur.y)*t};pts.push(cur);acc=0;}else{acc+=d;cur=nx;i++;}}
    var last=pts[pts.length-1],dd={x:1,y:0};if(pts.length>1){var pv=pts[pts.length-2];dd=vnorm({x:last.x-pv.x,y:last.y-pv.y});}
    while(pts.length<N){last={x:last.x+dd.x*SEG,y:last.y+dd.y*SEG};pts.push(last);}
    return pts;}
  /* the ring at a crossing point K: the loop the rope first passes K in, and the index where it comes back through */
  function ringAt(pts,Kp,minGap){var first=-1,last=-1;for(var i=0;i<pts.length;i++){if(dist(pts[i],Kp)<SEG*0.8){if(first<0)first=i;else if(i>first+(minGap||3))last=i;}}
    if(first<0||last<0)return null;var c=Math.round((first-JOINSEG-2)/K);var ci=cellCenter(Math.max(0,c));if(Math.abs(ci-first)>K)ci=first;return {ci:ci,passes:[last]};}
  /* ---- the running loop, side view ---- */
  function framesRunning(){var F=[],rings=[],hand=[],B=ball;
    var y0=B.y+B.r+56,xL=W*0.04,xf=W*0.36,xR=W*1.4,undul=3;                     /* baseline, free end, fold spot */
    function build(o){var p=[];
      pFlat(p,{x:xL,y:y0},o.X,40,undul);                      /* free tail */
      pLine(p,o.X,o.K,12);                                     /* left leg up to the crossing / neck */
      pEll(p,o.c,o.rx,o.ry,o.a0,o.a1,72);                      /* the loop */
      pLine(p,o.K2,o.Y,12);                                    /* right leg down */
      pFlat(p,o.Y,{x:xR,y:y0},60,undul);                      /* standing part, off to the right */
      return p;}
    /* A: flat */
    var A={X:{x:xf,y:y0},K:{x:xf,y:y0},c:{x:xf,y:y0},rx:0,ry:0,a0:Math.PI*0.5,a1:Math.PI*2.5,K2:{x:xf,y:y0},Y:{x:xf,y:y0}};
    /* B: a fold lifted: round head on two straight legs */
    var h=Math.min(150,y0*0.62),r=Math.min(52,h*0.36),cB={x:xf,y:y0-h+r},gap=0.9;
    var Bf={X:{x:xf-r*Math.cos(gap),y:y0},K:{x:cB.x-r*Math.cos(gap),y:cB.y+r*Math.sin(gap)},c:cB,rx:r,ry:r,a0:Math.PI-gap,a1:Math.PI-gap+ (2*Math.PI-2*gap)*0+ (Math.PI+2*gap),K2:{x:cB.x+r*Math.cos(gap),y:cB.y+r*Math.sin(gap)},Y:{x:xf+r*Math.cos(gap),y:y0}};
    Bf.a0=Math.PI-gap;Bf.a1=2*Math.PI+gap;                      /* from lower-left, over the top, to lower-right */
    /* C: the fold pushed through the loop next to it: the legs cross at the base and the loop stands as a ring */
    var rC=Math.min(56,h*0.42),K={x:xf,y:y0-16},cC={x:xf,y:K.y-rC};
    var Cf={X:{x:xf-18,y:y0},K:K,c:cC,rx:rC,ry:rC,a0:Math.PI*0.5,a1:Math.PI*2.5,K2:K,Y:{x:xf+18,y:y0}};
    /* D: the ring dropped over the hitch: a flat ellipse round the stem below the ball */
    var xb=B.x,KD={x:xb-78,y:y0-22},cD={x:xb,y:y0-22},Df={X:{x:xb-110,y:y0},K:KD,c:cD,rx:78,ry:24,a0:Math.PI,a1:Math.PI*3,K2:KD,Y:{x:xb-50,y:y0}};
    /* E: pulled tight round the stem */
    var KE={x:xb-16,y:y0-18},cE={x:xb,y:y0-18},Ef={X:{x:xb-44,y:y0},K:KE,c:cE,rx:16,ry:8,a0:Math.PI,a1:Math.PI*3,K2:KE,Y:{x:xb-2,y:y0}};
    [A,Bf,Cf,Df,Ef].forEach(function(o){F.push(build(o));});
    var pts=F.map(function(p){return resample(p)});
    rings=[[],[],[ringAt(pts[2],K)].filter(Boolean),[ringAt(pts[3],KD)].filter(Boolean),[ringAt(pts[4],KE)].filter(Boolean)];
    /* handles: the top of the fold, the top of the fold (push down through), the ring, the long end */
    function topIdx(p,c){var bi=0,bd=1e9;for(var i=0;i<p.length;i++){var d=Math.hypot(p[i].x-c.x,p[i].y-(c.y-1e3));if(d<bd){bd=d;bi=i;}}return bi;}
    hand.push({idx:topIdx(pts[1],cB),dir:{x:0,y:-1},dist:h-r});
    hand.push({idx:topIdx(pts[1],cB),dir:{x:0,y:1},dist:60,fixed:true});
    hand.push({idx:topIdx(pts[2],cC),dir:vnorm({x:xb-xf,y:0}),dist:xb-xf});
    hand.push({idx:N-1,dir:{x:1,y:0},dist:120,tight:true,fixed:true});
    return {dense:F,frames:pts,rings:rings,hands:hand,y0:y0};}
  /* ---- the fixed loop, side view ---- */
  function framesFixed(){var F=[],rings=[],hand=[];
    var y0=ball.y+ball.r+56,xR=W*1.4,undul=3,xk=W<600?W*0.62:W*0.55;                /* the loop the end goes through sits at xk */
    var C=W<600?20:30,segs=function(n){return n*SEG};
    function build(o){var p=[];
      pLine(p,o.E,o.K,20);                                       /* the free end up to the crossing */
      pEll(p,o.c,o.rx,o.ry,o.a0,o.a1,72);                       /* the big loop */
      pLine(p,o.K2,o.Y,12);
      pFlat(p,o.Y,{x:xR,y:y0},60,undul);
      return p;}
    /* A: flat, the end lying C segments before the crossing spot */
    var A={E:{x:xk-segs(C),y:y0},K:{x:xk,y:y0},c:{x:xk,y:y0},rx:0,ry:0,a0:Math.PI*0.5,a1:Math.PI*2.5,K2:{x:xk,y:y0},Y:{x:xk,y:y0}};
    /* B: the end pushed through the loop: everything between the end and the crossing becomes a standing ring */
    var k=4,rB=segs(C-k)/(2*Math.PI),K={x:xk,y:y0-16},cB={x:xk,y:K.y-rB},endB={x:xk-segs(k)*0.8,y:y0+2};
    var Bf={E:endB,K:K,c:cB,rx:rB,ry:rB*0.92,a0:Math.PI*0.5,a1:Math.PI*2.5,K2:K,Y:{x:xk+16,y:y0}};
    /* C: pulled on through: a longer end, a smaller ring */
    var k2=W<600?8:10,rC=segs(C-k2)/(2*Math.PI),cC={x:xk,y:K.y-rC},endC={x:xk-segs(k2)*0.85,y:y0+2};
    var Cf={E:endC,K:K,c:cC,rx:rC,ry:rC*0.95,a0:Math.PI*0.5,a1:Math.PI*2.5,K2:K,Y:{x:xk+16,y:y0}};
    /* D: the top of the big loop folded down and pushed through the loop on the end, beside the crossing */
    var K3={x:xk-segs(5)*0.85,y:y0-4},rD=rC*0.72,cD={x:xk-8,y:K.y-rD};
    var Df={E:endC,K:K,c:cD,rx:rD,ry:rD*0.9,a0:Math.PI*0.5,a1:Math.PI*2.5,K2:K,Y:{x:xk+16,y:y0}};
    /* E: snug: the ring stands again with the lock at its base */
    var rE=rC*0.9,cE={x:xk,y:K.y-rE},Ef={E:endC,K:K,c:cE,rx:rE,ry:rE,a0:Math.PI*0.5,a1:Math.PI*2.5,K2:K,Y:{x:xk+16,y:y0}};
    [A,Bf,Cf,Df,Ef].forEach(function(o){F.push(build(o));});
    var pts=F.map(function(p){return resample(p)});
    var rB1=ringAt(pts[1],K),rC1=ringAt(pts[2],K),rD1=ringAt(pts[3],K),rE1=ringAt(pts[4],K);
    rings=[[],rB1?[rB1]:[],rC1?[rC1]:[],[rD1,{ci:4,passes:[]}].filter(Boolean),[rE1,{ci:4,passes:[]}].filter(Boolean)];
    rings[3]=rings[3].map(function(r){return r.passes.length?r:{ci:4,passes:[Math.round((k2+C)/2)]}});
    rings[4]=rings[4].map(function(r){return r.passes.length?r:{ci:4,passes:[Math.round((k2+C)/2)]}});
    hand.push({idx:0,dir:{x:1,y:0},dist:segs(C)*0.8});
    hand.push({idx:0,dir:{x:-1,y:0.15},dist:segs(k2-k)*0.85,fixed:true});
    var top=0,bd=1e9;for(var i=k2;i<C;i++){if(pts[2][i].y<bd){bd=pts[2][i].y;top=i;}}
    hand.push({idx:top,dir:{x:-0.3,y:1},dist:rC*0.9,fixed:true});
    hand.push({idx:top,dir:{x:0.2,y:-1},dist:50,fixed:true});
    return {dense:F,frames:pts,rings:rings,hands:hand,y0:y0};}
  function setScale(f){SEG=11*f;RR=5*f;LH=9*f;}
  function guidedStart(kind){CELLS=W<600?10:13;N=K*CELLS+1;setScale(W<600?1.05:1.35);ball.x=W*0.74;ball.y=H*0.68-ball.r-56;var built=kind==='running'?framesRunning():framesFixed();
    /* the gesture for each step is the way the handle actually travels between the two frames, unless fixed */
    built.hands.forEach(function(h,i){if(h.fixed)return;var a=built.frames[i][h.idx],b=built.frames[i+1][h.idx],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>30){h.dir={x:dx/d,y:dy/d};h.dist=d;}});
    G={kind:kind,dense:built.dense,frames:built.frames,rings:built.rings,hands:built.hands,y0:built.y0,cur:0,t:0,dragging:false,anim:null,p0:null,t0:0};
    P=G.frames[0].map(function(q){return {x:q.x,y:q.y}});S=P.map(function(q){return {x:q.x,y:q.y}});rings=[];drag=-1;stage=0;setStage(0);}
  function ease(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}
  function guidedApply(){var a=G.dense[G.cur],b=G.dense[Math.min(G.cur+1,G.dense.length-1)],e=ease(Math.max(0,Math.min(1,G.t))),blend=[];
    for(var j=0;j<a.length;j++)blend.push({x:a[j].x+(b[j].x-a[j].x)*e,y:a[j].y+(b[j].y-a[j].y)*e});
    var pts=resample(blend);for(var i=0;i<N;i++){P[i].x=pts[i].x;P[i].y=pts[i].y;}
    var rs=G.rings[G.t>0.5?Math.min(G.cur+1,G.rings.length-1):G.cur];rings=rs.map(function(r){return {ci:r.ci,passes:r.passes.slice(),t:-100,stuck:0,slid:0}});}
  function guidedStep(){if(G.anim){G.t+=G.anim;if(G.t>=1){G.t=1;G.anim=null;if(G.cur<G.frames.length-1){G.cur++;G.t=0;setStage(G.cur);}}else if(G.t<=0){G.t=0;G.anim=null;}}
    guidedApply();best=null;var h=G.hands[G.cur-1];if(h&&h.tight&&G.cur===G.frames.length-1&&rings[0])best={r:rings[0],tight:true};}
  function guidedDown(p){if(G.cur>=G.hands.length)return false;var h=G.hands[G.cur],q=P[h.idx];if(dist(p,q)>Math.max(40,40*W/cv.clientWidth))return false;G.dragging=true;G.p0=p;G.t0=G.t;G.anim=null;return true;}
  function guidedMove(p){if(!G.dragging)return;var h=G.hands[G.cur];G.t=Math.max(0,Math.min(1,G.t0+((p.x-G.p0.x)*h.dir.x+(p.y-G.p0.y)*h.dir.y)/h.dist));}
  function guidedUp(){if(!G.dragging)return;G.dragging=false;G.anim=G.t>0.55?0.06:-0.06;}
  function guidedShow(){if(!G||G.cur>=G.hands.length)return;G.dragging=false;G.anim=0.025;}
  function drawGuide(){if(!G||G.cur>=G.hands.length||G.dragging||G.anim)return;var h=G.hands[G.cur],q=P[h.idx],pr=reduce?0:Math.sin(frame/8)*3;
    ctx.strokeStyle='rgba(216,18,31,.9)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.x,q.y,22+pr,0,7);ctx.stroke();
    ctx.fillStyle='rgba(216,18,31,.18)';ctx.beginPath();ctx.arc(q.x,q.y,22+pr,0,7);ctx.fill();
    /* arrow */
    var d=h.dir,L=Math.min(70,h.dist*0.8),ax=q.x+d.x*34,ay=q.y+d.y*34,bx=q.x+d.x*(34+L),by=q.y+d.y*(34+L);
    ctx.strokeStyle='#d8121f';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
    var pv=perp(d);ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx-d.x*12+pv.x*8,by-d.y*12+pv.y*8);ctx.lineTo(bx-d.x*12-pv.x*8,by-d.y*12-pv.y*8);ctx.closePath();ctx.fillStyle='#d8121f';ctx.fill();
    ctx.fillStyle='#d8121f';ctx.font='700 13px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillText('DRAG',q.x-d.x*0+pv.x*0,q.y-30-(d.y<0?12:0));}

  /* ---------- frame ---------- */
  function step(){
    frame++;if(cool>0)cool--;hover=-1;
    if(G){guidedStep();return;}
    ptrSpeed=lastPtr?Math.hypot(ptr.x-lastPtr.x,ptr.y-lastPtr.y):0;lastPtr={x:ptr.x,y:ptr.y};
    rings.forEach(function(r){if(r.stuck>0)r.stuck--});
    var nowC=snapCenters();
    if(drag>=0){
      for(var i=0;i<N;i++){S[i].x=P[i].x;S[i].y=P[i].y;}
      var sx=P[drag].x,sy=P[drag].y,d=Math.hypot(ptr.x-sx,ptr.y-sy),steps=Math.min(60,Math.ceil(d/4));
      for(var q=1;q<=steps;q++){if(!moveDragged(sx+(ptr.x-sx)*q/steps,sy+(ptr.y-sy)*q/steps))break;}
      if(!ringOf(drag)){var bd=1e9,bc=-1;for(var c=0;c<CELLS;c++){var ci=cellCenter(c);if(Math.abs(ci-drag)<K+1)continue;if(rings.some(function(r){var sp=span(r);return r.ci===ci||(ci>sp[0]&&ci<sp[1])}))continue;var dd=dist(P[drag],P[ci]);if(dd<bd){bd=dd;bc=ci;}}
        if(bc>=0&&bd<LH+20&&!nearObject(ptr)){hover=bc;if(bd<LH+14){if(armed!==bc){armed=bc;dwell=0;still=0;}dwell++;still=ptrSpeed<1.2?still+1:0;}else{armed=-1;dwell=0;still=0;}}else{armed=-1;dwell=0;still=0;}
        /* hold the rope still over a lit loop and it goes through by itself: easier than the push gesture, especially with a finger */
        if(armed>=0&&still>=40&&cool===0)autoThread(armed);}
      /* hold a running loop over the tow ball or the post and it drops over it */
      var fr=ringOf(drag);if(!fr){var t=tipRingAt(drag);if(t)fr=t;}
      if(fr&&isFold(fr)){var o=nearObject(ptr);if(o&&!encloses(fr,o)){holdT=ptrSpeed<2?holdT+1:0;if(holdT>=42&&ptrSpeed<1.5){dropOver(fr,o);holdT=0;}}else holdT=0;}else holdT=0;
    }else{armed=-1;dwell=0;still=0;holdT=0;}
    prevC=nowC;
    relax();
    best=enclosing();var M=MISSIONS[mi],last=M.msgs.length-1;
    var t=M.test();if(t!==stage)setStage(t);
  }

  /* sharp folds open up a little, like a real rope. The nudge is towards the chord between the neighbours,
     which never lengthens a segment, so nothing else on the table is disturbed. */
  function relax(){var used=ringIndices(),sd=sides(),moved=[];
    for(var i=1;i<N-1;i++){if(i===drag||used[i])continue;var a=P[i-1],b=P[i+1],c=P[i];
      var ux=c.x-a.x,uy=c.y-a.y,vx=b.x-c.x,vy=b.y-c.y,ul=Math.hypot(ux,uy)||1,vl=Math.hypot(vx,vy)||1,cos=(ux*vx+uy*vy)/(ul*vl);
      if(cos<0.35){var mx=(a.x+b.x)/2,my=(a.y+b.y)/2,nx=c.x+(mx-c.x)*0.08,ny=c.y+(my-c.y)*0.08,ok=true;
        OBJ.forEach(function(o){if(Math.hypot(nx-o.x,ny-o.y)<o.r+RR)ok=false});
        if(ok){moved.push([i,c.x,c.y]);c.x=nx;c.y=ny;}}}
    if(moved.length&&crossed(sd)>=0)moved.forEach(function(m){P[m[0]].x=m[1];P[m[0]].y=m[2];});}

  /* ---------- drawing ---------- */
  var scale=1;
  var mobile=false,lastW=0,lastH=0;
  function resize(){var w=cv.clientWidth,h=cv.clientHeight||w*460/900,dpr=Math.min(2,window.devicePixelRatio||1);var sizeChanged=Math.abs(w-lastW)>2||Math.abs(h-lastH)>2;lastW=w;lastH=h;
    var wasMobile=mobile;mobile=w<640;W=mobile?400:900;H=Math.round(w?W*h/w:460);cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);scale=w*dpr/W;
    if(mobile){ball.x=W-78;ball.y=H*0.74;post.x=W-50;post.y=66;}else{ball.x=768;post.x=790;var yo=(H-460)/2;ball.y=318+yo;post.y=96+yo;if(H<300){ball.y=H-70;post.y=60;}}
    if(P.length&&sizeChanged){if(G)guidedStart(G.kind);else if(wasMobile!==mobile)init();}}
  var ringCell={};
  function strandPts(sign){ringCell={};rings.forEach(function(r){ringCell[Math.floor(r.ci/K)]=1});var out=[];for(var i=0;i<N;i++){var a=P[Math.max(0,i-1)],b=P[Math.min(N-1,i+1)],tx=b.x-a.x,ty=b.y-a.y,tl=Math.hypot(tx,ty)||1;var nx=-ty/tl,ny=tx/tl;
      var c=Math.floor(i/K),s=(c%2?-1:1)*sign,am=amp(i)*s*(ringCell[c]?1.7:1);out.push({x:P[i].x+nx*am,y:P[i].y+ny*am});}return out;}
  function path(pts,from,to){ctx.beginPath();ctx.moveTo(pts[from].x,pts[from].y);for(var i=from+1;i<=to;i++){var p=pts[i],q=pts[Math.min(to,i+1)];if(i===to)ctx.lineTo(p.x,p.y);else ctx.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2);}}
  function strokeRope(A,B,from,to,shadow){
    ctx.lineCap='round';ctx.lineJoin='round';
    if(shadow){ctx.save();ctx.translate(2.5,3.5);ctx.strokeStyle='rgba(21,23,26,.16)';ctx.lineWidth=RR*2.3;path(A,from,to);ctx.stroke();path(B,from,to);ctx.stroke();ctx.restore();}
    ctx.strokeStyle='#9a3708';ctx.lineWidth=RR*1.55;path(A,from,to);ctx.stroke();path(B,from,to);ctx.stroke();
    ctx.strokeStyle='#ff7a1a';ctx.lineWidth=RR*1.15;path(A,from,to);ctx.stroke();ctx.strokeStyle='#f26a0e';path(B,from,to);ctx.stroke();
    ctx.strokeStyle='rgba(255,220,180,.45)';ctx.lineWidth=RR*.4;path(A,from,to);ctx.stroke();path(B,from,to);ctx.stroke();}
  function label(t,x,y){ctx.fillStyle='#615b5c';ctx.font='600 12px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillText(t.toUpperCase(),x,y);}
  function draw(){
    ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,W,H);
    var g=ctx.createRadialGradient(W*.5,H*.45,60,W*.5,H*.5,W*.7);g.addColorStop(0,'#fbfaf8');g.addColorStop(1,'#ebe7e1');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(21,23,26,.05)';ctx.lineWidth=1;for(var x=0;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(var y=0;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    if(!G){ctx.fillStyle='rgba(21,23,26,.18)';ctx.beginPath();ctx.arc(post.x+2,post.y+3,post.r+3,0,7);ctx.fill();
      ctx.fillStyle='#6d6a66';ctx.beginPath();ctx.arc(post.x,post.y,post.r,0,7);ctx.fill();ctx.fillStyle='#a5a19b';ctx.beginPath();ctx.arc(post.x-2,post.y-2,post.r*.55,0,7);ctx.fill();
      label('Post',post.x,post.y+post.r+18);
      ctx.fillStyle='#4a4744';ctx.fillRect(ball.x-18,ball.y+ball.r-6,36,40);ctx.fillStyle='#3a3835';ctx.fillRect(ball.x-40,ball.y+ball.r+30,80,16);}
    else{var y0=G.y0;ctx.strokeStyle='rgba(21,23,26,.22)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,y0+RR+1);ctx.lineTo(W,y0+RR+1);ctx.stroke();
      ctx.fillStyle='rgba(21,23,26,.06)';ctx.fillRect(0,y0+RR+2,W,H-y0);
      ctx.fillStyle='#4a4744';ctx.fillRect(ball.x-9,ball.y+ball.r-6,18,y0-(ball.y+ball.r-6)+RR);ctx.fillStyle='#3a3835';ctx.fillRect(ball.x-34,y0+RR-2,68,10);}
    function hitchTop(){ctx.fillStyle='rgba(21,23,26,.22)';ctx.beginPath();ctx.arc(ball.x+3,ball.y+5,ball.r+4,0,7);ctx.fill();
      var bg=ctx.createRadialGradient(ball.x-9,ball.y-10,4,ball.x,ball.y,ball.r+2);bg.addColorStop(0,'#b9b5ae');bg.addColorStop(.5,'#5e5b57');bg.addColorStop(1,'#26252a');ctx.fillStyle=bg;ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,7);ctx.fill();
      if(G){ctx.fillStyle='#4a4744';ctx.fillRect(ball.x-9,ball.y+ball.r-6,18,(G.y0-22)-(ball.y+ball.r-6));}}
    if(!G)hitchTop();
    label('Tow ball',ball.x,G?G.y0+RR+26:ball.y+ball.r+66);
    if(best&&best.tight){var o=G?ball:(encloses(best.r,ball)?ball:post);ctx.strokeStyle='rgba(216,18,31,.7)';ctx.lineWidth=3;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(o.x,o.y,o.r+RR*2+10,0,7);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#d8121f';ctx.font='700 13px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillText('LOCKED',o.x,o.y-o.r-RR*2-16);}
    var A=strandPts(1),B=strandPts(-1);
    strokeRope(A,B,0,N-1,true);
    rings.forEach(function(r){var c=Math.floor(r.ci/K),from=c*K,to=Math.min(N-1,from+K);strokeRope(A,B,from,to,false);
      if(!reduce&&frame-r.t<24){var a=1-(frame-r.t)/24;ctx.strokeStyle='rgba(216,18,31,'+a+')';ctx.lineWidth=3;ctx.beginPath();ctx.arc(P[r.ci].x,P[r.ci].y,LH+4+(24-(frame-r.t)),0,7);ctx.stroke();}});
    if(hover>=0){var ready=armed===hover&&dwell>=12,pulse=reduce?0:Math.sin(frame/6)*2;ctx.strokeStyle=ready?'rgba(216,18,31,.95)':'rgba(216,18,31,.6)';ctx.lineWidth=ready?4:3;if(!ready)ctx.setLineDash([6,5]);ctx.beginPath();ctx.arc(P[hover].x,P[hover].y,LH+8+pulse,0,7);ctx.stroke();ctx.setLineDash([]);
      if(ready){ctx.fillStyle='#d8121f';ctx.font='700 12px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillText(touch?'HOLD STILL':'PUSH THROUGH',P[hover].x,P[hover].y-LH-16);
        ctx.strokeStyle='#d8121f';ctx.lineWidth=5;ctx.beginPath();ctx.arc(P[hover].x,P[hover].y,LH+14,-Math.PI/2,-Math.PI/2+Math.min(1,still/40)*2*Math.PI);ctx.stroke();}}
    if(holdT>0&&drag>=0){var ho=nearObject(ptr);if(ho){ctx.strokeStyle='#d8121f';ctx.lineWidth=5;ctx.beginPath();ctx.arc(ho.x,ho.y,ho.r+RR*2+14,-Math.PI/2,-Math.PI/2+Math.min(1,holdT/42)*2*Math.PI);ctx.stroke();
      ctx.fillStyle='#d8121f';ctx.font='700 12px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillText('HOLD TO DROP OVER',ho.x,ho.y-ho.r-RR*2-22);}}
    var h=P[0],t=P[1],ang=Math.atan2(h.y-t.y,h.x-t.x);
    ctx.save();ctx.translate(h.x,h.y);ctx.rotate(ang);ctx.fillStyle='#d8121f';ctx.beginPath();ctx.roundRect(-9,-RR-1.5,16,RR*2+3,3);ctx.fill();ctx.restore();
    if(G)hitchTop();
    if(G)drawGuide();
    if(!G&&drag<0&&!rings.length&&frame<600){var pr=reduce?0:Math.sin(frame/10)*3;var mid=P[Math.floor(N/2)];ctx.strokeStyle='rgba(216,18,31,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(mid.x,mid.y,20+pr,0,7);ctx.stroke();
      ctx.fillStyle='#d8121f';ctx.font='700 13px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillText(touch?'GRAB THE ROPE AND LIFT A FOLD':'GRAB THE ROPE ANYWHERE',mid.x+70,mid.y-34);}
  }

  /* ---------- pointer ---------- */
  function toLocal(e){var r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*W/r.width};}
  function finger(e){var p=toLocal(e);if(touch)p.y-=lift;return p;}
  cv.addEventListener('pointerdown',function(e){touch=e.pointerType==='touch';lift=0;var p=finger(e);ptr=p;lastPtr=p;var bi=-1,bd=1e9;
    if(G){if(guidedDown(toLocal(e))){cv.setPointerCapture(e.pointerId);cv.classList.add('grab');e.preventDefault();}return;}
    for(var i=0;i<N;i++){var d=dist(p,P[i]);if(i===0||i===N-1)d-=8;if(d<bd){bd=d;bi=i;}}
    window.__lastDown={p:p,bi:bi,bd:bd,type:e.pointerType};if(bd>Math.max(30,(touch?34:24)*W/cv.clientWidth))bi=-1;
    if(bi>=0){drag=bi;cv.setPointerCapture(e.pointerId);cv.classList.add('grab');e.preventDefault();}});
  cv.addEventListener('pointermove',function(e){if(G){if(G.dragging){guidedMove(toLocal(e));e.preventDefault();}return;}if(drag>=0){if(touch&&lift<34)lift=Math.min(34,lift+3);ptr=finger(e);e.preventDefault();}});
  function up(){if(G){guidedUp();cv.classList.remove('grab');return;}if(drag>=0){drag=-1;hover=-1;cv.classList.remove('grab');}}
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);cv.addEventListener('lostpointercapture',up);
  function restart(){var M=MISSIONS[mi];if(M.guided)guidedStart(M.guided);else init();}
  if(reset)reset.addEventListener('click',restart);if(capReset)capReset.addEventListener('click',restart);if(showBtn)showBtn.addEventListener('click',guidedShow);
  tabs.forEach(function(b,i){b.addEventListener('click',function(){setMission(i)})});
  if(fsb){fsb.addEventListener('click',function(){if(document.fullscreenElement){document.exitFullscreen();}else if(host.requestFullscreen){host.requestFullscreen();}});
    document.addEventListener('fullscreenchange',function(){fsb.textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';setTimeout(function(){resize();draw();},60);setTimeout(function(){resize();draw();},400);});
    if(!document.documentElement.requestFullscreen)fsb.hidden=true;}

  var running=false,raf=0;
  function loop(){step();draw();if(running)raf=requestAnimationFrame(loop);}
  function start(){if(!running){running=true;raf=requestAnimationFrame(loop);}}
  function stop(){running=false;cancelAnimationFrame(raf);}
  if('IntersectionObserver' in window){new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?start():stop();})},{threshold:.05}).observe(cv);}else start();
  window.addEventListener('resize',function(){resize();draw();});
  resize();setMission(0);draw();
  host.dataset.ready='1';
  window.__tryit={G:function(){return G},setT:function(c,t){G.cur=c;G.t=t;G.anim=null;guidedApply();},set:function(pts,rs){for(var i=0;i<N;i++){P[i].x=pts[i][0];P[i].y=pts[i][1];}rings=rs.map(function(r){return {ci:r[0],passes:r[1],t:0,stuck:0,slid:0}});},get:function(){return {P:P,rings:rings,stage:stage,hover:hover,drag:drag,stuck:stuckFrames,why:why,armed:armed,dwell:dwell}},cc:cellCenter,K:K,N:N,ball:ball,post:post,W:W,H:H};
})();
