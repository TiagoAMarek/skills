/* visual-recap recap-runtime.js — v1. do not copy into recaps; link via file:// */

  // ---- rich diff renderer: script.vr-diff -> table with line numbers, syntax colors, word-level emphasis ----
  (function(){
    function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function toks(s){return s.match(/\s+|[A-Za-z0-9_$]+|[^\sA-Za-z0-9_$]/g)||[];}
    // LCS over token arrays -> which tokens are unchanged on each side
    function lcs(a,b){
      var n=a.length,m=b.length,dp=[],i,j;
      for(i=0;i<=n;i++){dp[i]=[];for(j=0;j<=m;j++)dp[i][j]=0;}
      for(i=n-1;i>=0;i--)for(j=m-1;j>=0;j--)
        dp[i][j]= a[i]===b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
      var aS=new Array(n).fill(false),bS=new Array(m).fill(false); i=0;j=0;
      while(i<n&&j<m){
        if(a[i]===b[j]){aS[i]=true;bS[j]=true;i++;j++;}
        else if(dp[i+1][j]>=dp[i][j+1])i++; else j++;
      }
      return {aS:aS,bS:bS};
    }
    // char ranges of changed tokens, merged into continuous runs: interior whitespace between
    // two changed tokens is included; the run's outer whitespace is trimmed; whitespace-only
    // changes (indentation etc.) never open a run, so they stay unemphasized.
    function ranges(tokens,same){
      var off=[],pos=0,k; for(k=0;k<tokens.length;k++){off[k]=pos;pos+=tokens[k].length;}
      var r=[],start=-1,end=-1;
      for(k=0;k<tokens.length;k++){
        if(/^\s+$/.test(tokens[k])) continue;         // whitespace: never opens/closes a run
        if(!same[k]){ if(start<0)start=off[k]; end=off[k]+tokens[k].length; } // changed: extend
        else if(start>=0){ r.push([start,end]); start=-1; end=-1; }           // unchanged: close
      }
      if(start>=0) r.push([start,end]);
      return r;
    }
    // flatten hljs html into [{text,cls}] segments (innermost class wins)
    function flatten(html){
      var tmp=document.createElement('div');tmp.innerHTML=html;var segs=[];
      (function walk(node,cls){Array.prototype.forEach.call(node.childNodes,function(n){
        if(n.nodeType===3)segs.push({text:n.nodeValue,cls:cls});
        else if(n.nodeType===1)walk(n,(n.className||cls));});})(tmp,'');
      return segs;
    }
    function inRange(p,rs){for(var k=0;k<rs.length;k++)if(p>=rs[k][0]&&p<rs[k][1])return true;return false;}
    // highlight one code line with hljs and overlay word-level emphasis at char ranges
    function codeHtml(code,lang,rs){
      var hl;
      try{hl=hljs.highlight(code,{language:lang,ignoreIllegals:true}).value;}
      catch(e){hl=esc(code);}
      var segs=flatten(hl),out='',pos=0;
      segs.forEach(function(seg){
        var t=seg.text,i=0;
        while(i<t.length){
          var e=inRange(pos,rs),j=i;
          while(j<t.length && inRange(pos+(j-i),rs)===e)j++;
          var piece=esc(t.slice(i,j));
          if(seg.cls)piece='<span class="'+seg.cls+'">'+piece+'</span>';
          if(e)piece='<span class="wd">'+piece+'</span>';
          out+=piece;pos+=(j-i);i=j;
        }
        if(t.length===0){/* empty text node */}
      });
      return out;
    }
    function render(src){
      var lang=src.getAttribute('data-lang')||'plaintext';
      if(!hljs.getLanguage(lang))lang='plaintext';
      var raw=src.textContent.replace(/\n$/,''),lines=raw.split('\n');
      var rows=[],oldNo=0,newNo=0,inHunk=false,k;
      for(k=0;k<lines.length;k++){
        var line=lines[k],hm;
        if((hm=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line))){
          oldNo=+hm[1];newNo=+hm[2];inHunk=true;rows.push({t:'hunk',text:line});continue;
        }
        if(!inHunk){rows.push({t:'meta',text:line});continue;}
        var c=line.charAt(0);
        if(c===' ')rows.push({t:'ctx',text:line.slice(1),o:oldNo++,n:newNo++});
        else if(c==='+')rows.push({t:'add',text:line.slice(1),n:newNo++});
        else if(c==='-')rows.push({t:'del',text:line.slice(1),o:oldNo++});
        else if(c==='\\')rows.push({t:'meta',text:line});
        else if(line==='')continue;
        else rows.push({t:'meta',text:line});
      }
      // pair consecutive del-run then add-run -> word-level ranges
      for(k=0;k<rows.length;k++){
        if(rows[k].t==='del'){
          var d=k;while(d<rows.length&&rows[d].t==='del')d++;
          var a=d;while(a<rows.length&&rows[a].t==='add')a++;
          var dels=rows.slice(k,d),adds=rows.slice(d,a),p;
          for(p=0;p<Math.min(dels.length,adds.length);p++){
            var ot=toks(dels[p].text),nt=toks(adds[p].text),f=lcs(ot,nt);
            dels[p].r=ranges(ot,f.aS);adds[p].r=ranges(nt,f.bS);
          }
          k=a-1;
        }
      }
      function rowAttrs(o,n){return (o?' data-o="'+o+'"':'')+(n?' data-n="'+n+'"':'');}
      // unified view
      var uni='<table class="vr-diff"><tbody>';
      rows.forEach(function(r){
        if(r.t==='hunk'||r.t==='meta'){
          uni+='<tr class="'+r.t+'"><td class="ln"></td><td class="ln"></td><td class="code">'+esc(r.text)+'</td></tr>';
        }else{
          uni+='<tr class="'+r.t+'"'+rowAttrs(r.o,r.n)+'><td class="ln">'+(r.o||'')+'</td><td class="ln">'+(r.n||'')+
                 '</td><td class="code">'+codeHtml(r.text,lang,r.r||[])+'</td></tr>';
        }
      });
      uni+='</tbody></table>';
      // split view: ctx mirrors both sides; del-runs face their paired add-runs
      var srows=[];
      for(k=0;k<rows.length;k++){
        var row=rows[k];
        if(row.t==='hunk'||row.t==='meta'){srows.push(row);continue;}
        if(row.t==='ctx'){srows.push({l:{no:row.o,text:row.text,cls:'ctx'},r:{no:row.n,text:row.text,cls:'ctx'}});continue;}
        var d=k;while(d<rows.length&&rows[d].t==='del')d++;
        var a=d;while(a<rows.length&&rows[a].t==='add')a++;
        var dels=rows.slice(k,d),adds=rows.slice(d,a),m=Math.max(dels.length,adds.length),p;
        for(p=0;p<m;p++)srows.push({
          l:dels[p]?{no:dels[p].o,text:dels[p].text,cls:'del',w:dels[p].r}:null,
          r:adds[p]?{no:adds[p].n,text:adds[p].text,cls:'add',w:adds[p].r}:null});
        k=a-1;
      }
      function sCell(s,right){
        if(!s)return '<td class="ln void'+(right?' lnr':'')+'"></td><td class="code void"></td>';
        return '<td class="ln '+s.cls+(right?' lnr':'')+'">'+(s.no||'')+'</td>'+
               '<td class="code '+s.cls+'">'+codeHtml(s.text,lang,s.w||[])+'</td>';
      }
      // colgroup pins the 4 columns: table-layout:fixed otherwise sizes them from the first
      // row, which is the colspan'd hunk header — that split the code width evenly across
      // cols 2-4 and broke the 50/50 layout. Gutter width tracks the widest line number.
      var gw=Math.max(2,String(Math.max(oldNo,newNo)).length)*8+16;
      var spl='<table class="vr-diff split"><colgroup><col style="width:'+gw+'px"><col style="width:50%">'+
        '<col style="width:'+gw+'px"><col style="width:50%"></colgroup><tbody>';
      srows.forEach(function(r){
        if(r.t==='hunk'||r.t==='meta'){
          spl+='<tr class="'+r.t+'"><td class="ln"></td><td class="code" colspan="3">'+esc(r.text)+'</td></tr>';
        }else{
          spl+='<tr'+rowAttrs(r.l&&r.l.no,r.r&&r.r.no)+'>'+sCell(r.l,false)+sCell(r.r,true)+'</tr>';
        }
      });
      spl+='</tbody></table>';
      var mode=src.getAttribute('data-mode')==='unified'?'unified':'split';
      var box=document.createElement('div');box.className='vr-box';box.setAttribute('data-mode',mode);
      box.innerHTML='<div class="vr-mode"><button type="button" data-m="split">split</button>'+
        '<button type="button" data-m="unified">unified</button></div>'+
        '<div class="vr-view split">'+spl+'</div><div class="vr-view unified">'+uni+'</div>';
      src.replaceWith(box);
      box.querySelectorAll('.vr-mode button').forEach(function(b){
        b.addEventListener('click',function(){box.setAttribute('data-mode',b.dataset.m);});
      });
      // diff notes: anchor each li of a following ul.vr-notes inline into both views;
      // unmatched notes stay in the ul as a visible fallback list (never silently dropped)
      var notes=box.nextElementSibling;
      if(notes&&notes.classList&&notes.classList.contains('vr-notes')){
        Array.prototype.slice.call(notes.children).forEach(function(li){
          var n=li.getAttribute('data-line'),
              attr=li.getAttribute('data-side')==='before'?'data-o':'data-n',hit=false;
          box.querySelectorAll('table.vr-diff').forEach(function(tb){
            var tr=tb.querySelector('tr['+attr+'="'+n+'"]');
            if(!tr)return;
            var nr=document.createElement('tr');nr.className='noterow';
            nr.innerHTML='<td colspan="'+(tb.classList.contains('split')?4:3)+'"><div class="note">'+li.innerHTML+'</div></td>';
            tr.parentNode.insertBefore(nr,tr.nextSibling);hit=true;
          });
          if(hit)li.remove();
        });
        if(!notes.children.length)notes.remove();
      }
    }
    document.querySelectorAll('script.vr-diff, pre.vr-diff').forEach(function(src){
      try{render(src);}
      catch(e){ // graceful fallback to plain diff coloring (legacy pre.vr-diff only)
        if(src.tagName!=='PRE')return;
        var c=document.createElement('code');c.className='language-diff';c.textContent=src.textContent;
        var pre=document.createElement('pre');pre.appendChild(c);
        src.replaceWith(pre);
      }
    });
  })();
  // syntax highlighting (annotated-code blocks; rendered diffs already colored above)
  try { hljs.highlightAll(); } catch(e){}
  // diagrams
  // diagrams: 'base' theme + themeVariables mapped from the page's carbon-paper tokens
  try { mermaid.initialize({ startOnLoad: true, securityLevel: 'loose', theme: 'base', themeVariables: {
    background:'#100f0c', primaryColor:'#1c1a15', primaryTextColor:'#ece7db', primaryBorderColor:'#4a4636',
    secondaryColor:'#232019', secondaryTextColor:'#ece7db', secondaryBorderColor:'#33302a',
    tertiaryColor:'#1c1a15', tertiaryTextColor:'#ece7db', tertiaryBorderColor:'#33302a',
    lineColor:'#4a4636', textColor:'#ece7db', edgeLabelBackground:'#100f0c',
    clusterBkg:'#1c1a15', clusterBorder:'#33302a', nodeTextColor:'#ece7db',
    fontFamily:'"SF Mono",ui-monospace,Menlo,monospace', fontSize:'13px'
  }}); } catch(e){}
  // wireframe sketch: Rough.js redraws the whole .wf-* kit hand-drawn — frames/buttons/inputs
  // as wobbly rects (radius-aware), row/topbar/tab dividers as lines, avatars as hachured
  // circles, pills as capsules, .wf-added/.wf-removed as colored rings. Colors come from each
  // element's own computed style so surface variants stay in sync automatically. Seeded by
  // draw order so the sketch is stable across reloads. Panels start display:none, so a tab's
  // wireframes are sketched lazily on first activation (offsetWidth is 0 while hidden).
  (function(){
    if (typeof rough === 'undefined') return;
    var seed = 1;
    var TARGETS = '.wf-screen,.wf-btn,.wf-input,.wf-pill,.wf-avatar,.wf-topbar,.wf-row,.wf-tabs,.wf-tab.on,.wf-added,.wf-removed';
    var root = getComputedStyle(document.documentElement);
    function opts(stroke, sw, roughness, extra){
      var o = { stroke: stroke, strokeWidth: sw, roughness: roughness, bowing: 1,
                fillStyle: 'none', seed: seed++ };
      for (var k in (extra || {})) o[k] = extra[k];
      return o;
    }
    // rounded-rect svg path: inset i (negative = ring outside the box), corner radius r
    function rrPath(w, h, r, i){
      var x0 = i, y0 = i, x1 = w - i, y1 = h - i, rr = Math.max(0, Math.min(r - i, (y1 - y0) / 2));
      if (rr < 1.5) return 'M' + x0 + ' ' + y0 + ' L' + x1 + ' ' + y0 + ' L' + x1 + ' ' + y1 +
                           ' L' + x0 + ' ' + y1 + ' Z';
      var a = function(x, y){ return 'A' + rr + ' ' + rr + ' 0 0 1 ' + x + ' ' + y + ' '; };
      return 'M' + (x0 + rr) + ' ' + y0 + ' L' + (x1 - rr) + ' ' + y0 + ' ' + a(x1, y0 + rr) +
             'L' + x1 + ' ' + (y1 - rr) + ' ' + a(x1 - rr, y1) + 'L' + (x0 + rr) + ' ' + y1 + ' ' +
             a(x0, y1 - rr) + 'L' + x0 + ' ' + (y0 + rr) + ' ' + a(x0 + rr, y0) + 'Z';
    }
    function clearSketch(el){
      var layer = el.querySelector(':scope > svg.wf-rough-layer');
      if (layer) layer.remove();
      el.classList.remove('wf-roughed', 'wf-roughed-b', 'wf-roughed-mark', 'wf-roughed-fill');
      delete el.dataset.roughDone;
    }
    // consecutive same-polarity .wf-row marks → one ring on the leader row (unmarked sibling breaks chain)
    var rowMarkMerge = { skipMark: new WeakSet(), groupFor: new WeakMap() };
    function rowMarkPolarity(row){
      if (row.classList.contains('wf-added')) return 'added';
      if (row.classList.contains('wf-removed')) return 'removed';
      return null;
    }
    function refreshRowMarkMerge(){
      rowMarkMerge.skipMark = new WeakSet();
      rowMarkMerge.groupFor = new WeakMap();
      var parents = new Set();
      document.querySelectorAll('.wf-row.wf-added, .wf-row.wf-removed').forEach(function(row){
        if (row.parentElement) parents.add(row.parentElement);
      });
      parents.forEach(function(parent){
        var current = null;
        Array.from(parent.children).forEach(function(child){
          if (!child.classList.contains('wf-row')){ current = null; return; }
          var p = rowMarkPolarity(child);
          if (!p){ current = null; return; }
          if (current && current.polarity === p) current.rows.push(child);
          else { current = { polarity: p, rows: [child] }; }
          if (current.rows.length > 1){
            rowMarkMerge.groupFor.set(current.rows[0], current.rows.slice());
            for (var i = 1; i < current.rows.length; i++) rowMarkMerge.skipMark.add(current.rows[i]);
          }
        });
      });
    }
    function unionMarkBounds(leader, rows){
      var lr = leader.getBoundingClientRect();
      var minX = 0, minY = 0, maxX = leader.offsetWidth, maxY = leader.offsetHeight;
      rows.forEach(function(row){
        var rr = row.getBoundingClientRect();
        minX = Math.min(minX, rr.left - lr.left);
        minY = Math.min(minY, rr.top - lr.top);
        maxX = Math.max(maxX, rr.right - lr.left);
        maxY = Math.max(maxY, rr.bottom - lr.top);
      });
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    function sketch(el){
      if (el.dataset.roughDone) return;
      if (/^(INPUT|TEXTAREA|SELECT|HR|IMG|BR)$/.test(el.tagName)) return; // void/replaced: can't hold the overlay, keep crisp CSS
      var w = el.offsetWidth, h = el.offsetHeight;
      if (!w || !h) return; // hidden tab panel — picked up on tab activation instead
      var cs = getComputedStyle(el);
      var cl = el.classList;
      var isRowMark = cl.contains('wf-row') && (cl.contains('wf-added') || cl.contains('wf-removed'));
      var skipRowMark = isRowMark && rowMarkMerge.skipMark.has(el);
      var mergeRows = isRowMark && !skipRowMark ? rowMarkMerge.groupFor.get(el) : null;
      var markUnion = mergeRows && mergeRows.length > 1 ? unionMarkBounds(el, mergeRows) : null;
      var markPad = (isRowMark && !skipRowMark) || (cl.contains('wf-added') || cl.contains('wf-removed')) ? 8 : 0;
      if (skipRowMark) markPad = 0;
      var svgMinX = markUnion ? Math.min(0, markUnion.x) : 0;
      var svgMinY = markUnion ? Math.min(0, markUnion.y) : 0;
      var svgMaxX = markUnion ? Math.max(w, markUnion.x + markUnion.w) : w;
      var svgMaxY = markUnion ? Math.max(h, markUnion.y + markUnion.h) : h;
      var vbX = svgMinX - markPad, vbY = svgMinY - markPad;
      var vbW = (svgMaxX - svgMinX) + 2 * markPad, vbH = (svgMaxY - svgMinY) + 2 * markPad;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'wf-rough-layer');
      svg.setAttribute('width', vbW); svg.setAttribute('height', vbH);
      svg.setAttribute('viewBox', vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH);
      if (markPad || markUnion){
        svg.style.top = vbY + 'px';
        svg.style.left = vbX + 'px';
        svg.style.right = 'auto';
        svg.style.bottom = 'auto';
        svg.style.width = vbW + 'px';
        svg.style.height = vbH + 'px';
      }
      var rc = rough.svg(svg), drew = false;
      // boxes: outer frames rougher than small controls; radius follows the CSS corner
      if (cl.contains('wf-screen') || cl.contains('wf-btn') || cl.contains('wf-input')){
        var bw = parseFloat(cs.borderTopWidth) || 1;
        var r = parseFloat(cs.borderTopLeftRadius) || 0;
        var rough_ = cl.contains('wf-screen') ? 1.3 : 1;
        // filled (primary) buttons: rough-solid fill replaces the crisp CSS background,
        // otherwise stroke and fill are the same color and the sketch is invisible
        var filled = cl.contains('wf-btn') && cl.contains('primary');
        svg.appendChild(rc.path(rrPath(w, h, r, bw / 2), opts(cs.borderTopColor, bw, rough_,
          filled ? { fill: cs.backgroundColor, fillStyle: 'solid' } : {})));
        if (filled) cl.add('wf-roughed-fill');
        cl.add('wf-roughed'); drew = true;
        if (el.getAttribute('data-surface') === 'browser'){
          [16, 30, 44].forEach(function(x){
            svg.appendChild(rc.circle(x, 13, 8, opts(cs.borderTopColor, 1, 0.6)));
          });
          svg.appendChild(rc.line(0, 26, w, 26, opts(root.getPropertyValue('--border').trim(), 1, 0.8)));
        }
      } else if (cl.contains('wf-pill')){
        svg.appendChild(rc.path(rrPath(w, h, h / 2, 0.5),
          opts(cs.borderTopColor, 1, 0.8)));
        cl.add('wf-roughed'); drew = true;
      } else if (cl.contains('wf-avatar')){
        var d = Math.min(w, h) - 2;
        svg.appendChild(rc.circle(w / 2, h / 2, d, opts(cs.backgroundColor, 1, 0.8,
          { fill: cs.backgroundColor, fillStyle: 'hachure', hachureGap: 2.5, fillWeight: 0.7 })));
        cl.add('wf-roughed'); drew = true;
      }
      // divider: rough line where the crisp border-bottom was
      var bb = parseFloat(cs.borderBottomWidth);
      if (bb > 0 && (cl.contains('wf-topbar') || cl.contains('wf-row') ||
                     cl.contains('wf-tabs') || cl.contains('wf-tab'))){
        svg.appendChild(rc.line(0, h - bb / 2, w, h - bb / 2, opts(cs.borderBottomColor, bb, 0.8)));
        cl.add('wf-roughed-b'); drew = true;
      }
      // change marks: colored sketch ring just outside the element (replaces the CSS outline)
      if (cl.contains('wf-added') || cl.contains('wf-removed')){
        if (skipRowMark) cl.add('wf-roughed-mark');
        else {
          var add = cl.contains('wf-added');
          var color = root.getPropertyValue(add ? '--add-b' : '--del-b').trim();
          var ringX = markUnion ? markUnion.x : 0, ringY = markUnion ? markUnion.y : 0;
          var ringW = markUnion ? markUnion.w : w, ringH = markUnion ? markUnion.h : h;
          var ring = rc.path(rrPath(ringW, ringH, 6, -3),
            opts(color, 1.5, 1, add ? {} : { strokeLineDash: [7, 4] }));
          if (ringX || ringY){
            var wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            wrap.setAttribute('transform', 'translate(' + ringX + ' ' + ringY + ')');
            wrap.appendChild(ring);
            svg.appendChild(wrap);
          } else svg.appendChild(ring);
          cl.add('wf-roughed-mark'); drew = true;
        }
      }
      if (drew){ el.insertBefore(svg, el.firstChild); el.dataset.roughDone = '1'; }
      else if (skipRowMark){ el.dataset.roughDone = '1'; }
    }
    function sketchAll(){ refreshRowMarkMerge(); document.querySelectorAll(TARGETS).forEach(sketch); }
    var resizeT;
    function resketchAll(){
      document.querySelectorAll('[data-rough-done]').forEach(clearSketch);
      seed = 1; sketchAll();
    }
    window.addEventListener('load', sketchAll);
    window.addEventListener('resize', function(){
      clearTimeout(resizeT); resizeT = setTimeout(resketchAll, 150);
    });
    document.querySelectorAll('#tabs button').forEach(function(b){
      b.addEventListener('click', function(){ setTimeout(sketchAll, 0); });
    });
  })();
  // tabs
  document.querySelectorAll('#tabs button').forEach(function(b){
    b.addEventListener('click', function(){
      document.querySelectorAll('#tabs button').forEach(function(x){x.classList.remove('active')});
      document.querySelectorAll('.tab-panel').forEach(function(x){x.classList.remove('active')});
      b.classList.add('active');
      var el = document.getElementById(b.dataset.tab);
      if (el) el.classList.add('active');
    });
  });
  // bionic reading: pre-wrap word prefixes in .prose, toggle via body.bionic (off by default)
  (function(){
    function bionicify(root){
      var walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
        if(!n.nodeValue.trim())return NodeFilter.FILTER_REJECT;
        if(n.parentNode.closest('code,.bx,.fact'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }});
      var nodes=[],n; while(n=walk.nextNode())nodes.push(n);
      nodes.forEach(function(tn){
        var frag=document.createDocumentFragment();
        tn.nodeValue.split(/(\s+)/).forEach(function(w){
          if(w===''||/^\s+$/.test(w)){frag.appendChild(document.createTextNode(w));return;}
          var k=Math.max(1,Math.ceil(w.length*0.4));
          var b=document.createElement('b');b.className='bx';b.textContent=w.slice(0,k);
          frag.appendChild(b);frag.appendChild(document.createTextNode(w.slice(k)));
        });
        tn.parentNode.replaceChild(frag,tn);
      });
    }
    document.querySelectorAll('.prose').forEach(bionicify);
    var bt=document.getElementById('bionicBtn');
    if(bt)bt.addEventListener('click',function(){
      var on=document.body.classList.toggle('bionic');
      bt.classList.toggle('on',on);
      bt.textContent=on?'bionic ✓':'bionic';
    });
  })();
