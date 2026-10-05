/* Video loading helper. The preview host cannot serve byte ranges, and iPhone Safari will not play a film from
   such a server, so the film is fetched whole and played from memory. On a normal web server this flag can be
   set to false and the <source> elements are used as they are. */
(function(){
  var BLOB_LOAD=true, cache={};
  function pick(v){var s=v.querySelector('source[type="video/mp4"]')||v.querySelector('source');return s?s.getAttribute('src'):v.getAttribute('src');}
  /* load the film into the element; cb(ok) when its metadata is in */
  window.rlLoadVideo=function(v,url,cb){
    url=url||pick(v);if(!url){cb&&cb(false);return;}
    if(!BLOB_LOAD){if(v.getAttribute('src')!==url&&!v.querySelector('source')){v.src=url;}v.load();v.addEventListener('loadedmetadata',function h(){v.removeEventListener('loadedmetadata',h);cb&&cb(true);});return;}
    if(v.dataset.rlUrl===url&&v.src){cb&&cb(true);return;}
    v.dataset.rlUrl=url;
    function apply(obj){Array.prototype.slice.call(v.querySelectorAll('source')).forEach(function(s){s.remove()});v.src=obj;v.load();
      v.addEventListener('loadedmetadata',function h(){v.removeEventListener('loadedmetadata',h);cb&&cb(true);});}
    if(cache[url]){apply(cache[url]);return;}
    fetch(url).then(function(r){if(!r.ok)throw new Error(r.status);return r.blob();}).then(function(b){cache[url]=URL.createObjectURL(b);if(v.dataset.rlUrl===url)apply(cache[url]);})
      .catch(function(){/* fall back to streaming */if(!v.querySelector('source')&&!v.src){v.src=url;}v.load();cb&&cb(false);});
  };
  window.rlBlobMode=BLOB_LOAD;
  /* films with native controls: fetch on the first press of play */
  if(BLOB_LOAD)document.addEventListener('DOMContentLoaded',function(){
    Array.prototype.slice.call(document.querySelectorAll('video[controls]')).forEach(function(v){
      v.addEventListener('play',function h(){if(v.dataset.rlUrl)return;v.removeEventListener('play',h);var url=pick(v);v.pause();v.classList.add('rl-loading');
        window.rlLoadVideo(v,url,function(){v.classList.remove('rl-loading');var p=v.play();if(p&&p.catch)p.catch(function(){});});});});});
})();
