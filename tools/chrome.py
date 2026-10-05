"""Samma meny, sökruta, sidfot och sidhuvud på alla sidor.
Kör:  python tools/chrome.py            (från repots rot; skriver om site/*.html på plats)
Menyn och sidfoten ligger här, inte i sidorna: ändra här och kör om."""
import re, os, sys, json, html, glob

SITE = sys.argv[1] if len(sys.argv) > 1 else 'site'
BASE = 'https://runlock.se/'
GA = 'G-SGP5MZD86M'

MENU = [
  ('How it works', 'how-it-works.html', [
    ('The four locks', 'how-it-works.html'), ('Running loop', 'running-loop.html'), ('Fixed loop', 'fixed-loop.html'),
    ('Quick loop, fixed release', 'quick-loop.html'), ('Securing lock', 'securing-lock.html'), ('Try it: the 3D rope', 'try-it.html')]),
  ('The rope', 'the-rope.html', [
    ('How it is made', 'the-rope.html'), ('Sizes and colours', 'sizes.html'), ('Strength and the SP test', 'the-rope.html#strength'),
    ('Material and care', 'the-rope.html#care'), ('Made to your spec', 'custom.html')]),
  ('Uses', 'uses.html', [
    ('Towing and recovery', 'towing-and-recovery.html'), ('Cargo securing', 'cargo-securing.html'), ('Hunting', 'hunting.html'),
    ('Dogs', 'dogs.html'), ('Boat and dock', 'boat-and-dock.html'), ('Camp, home and garden', 'camp-and-garden.html')]),
  ('Products', 'products.html', [
    ('All products', 'products.html'), ('Towing line', 'towing-line.html'), ('4x4 offroad set', '4x4-set.html'), ('Snowmobile set', 'snowmobile-set.html'),
    ('Outdoor set', 'outdoor-set.html'), ('Hunting set', 'hunting-set.html'), ('Hunting leash', 'hunting-leash.html'), ('Dog leash', 'dog-leash.html'),
    ('Pro pack 10 m', 'pro-pack.html'), ('Bulk roll', 'bulk-roll.html'), ('Washing line', 'washing-line.html'),
    ('Walking rope', 'walking-rope.html'), ('Robot mower tow rope', 'robot-mower-rope.html')]),
  ('Videos', 'videos.html', []),
  ('Company', 'about.html', [('About RunLock', 'about.html'), ('Questions and answers', 'faq.html'), ('Contact', 'contact.html'), ('Privacy and cookies', 'privacy.html')]),
]
CHEV = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'

def nav_html():
    items = []
    for label, href, sub in MENU:
        if sub:
            cls = ' cols' if len(sub) > 8 else ''
            subs = ''.join(f'<li><a href="{h}">{t}</a></li>' for t, h in sub)
            items.append(f'<li class="has-sub"><a href="{href}">{label}</a><button type="button" class="more" aria-expanded="false" aria-label="Show {label} pages">{CHEV}</button><ul class="sub{cls}">{subs}</ul></li>')
        else:
            items.append(f'<li><a href="{href}">{label}</a></li>')
    return ('<nav class="nav" aria-label="Main">\n  <div class="wrap">\n'
            '    <a class="brand" href="index.html" aria-label="RunLock home"><img src="img/logo-red.png" alt="RunLock" width="254" height="88"></a>\n'
            '    <ul class="menu" id="menu">\n      ' + '\n      '.join(items) + '\n    </ul>\n'
            '    <button type="button" class="sbtn" aria-label="Search the site" aria-expanded="false" aria-controls="search"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>\n'
            '    <a class="btn btn-red" href="https://texsolvshop.com/collections/runlock">Webshop</a>\n'
            '    <button class="burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="menu"><span></span><span></span><span></span></button>\n'
            '  </div>\n'
            '  <div class="search" id="search" hidden><div class="wrap"><form role="search" class="sform"><input type="search" id="q" placeholder="Search: towing, No 8, washing line, stretch…" aria-label="Search the site" autocomplete="off"><button type="button" class="sclose" aria-label="Close search">×</button></form><div class="sres" id="sres" aria-live="polite"></div></div></div>\n'
            '</nav>\n')

FOOTER = '''<footer>
  <div class="wrap">
    <div>
      <a class="brand" href="index.html" aria-label="RunLock home"><img src="img/logo-white.png" alt="RunLock" width="254" height="88"></a>
      <p style="margin-top:16px;max-width:320px">Much more than just a rope. Made by Texsolv AB in Tösse, Sweden, since 1983.</p>
    </div>
    <div><h4>Products</h4><ul><li><a href="products.html">All products</a></li><li><a href="sizes.html">Sizes and colours</a></li><li><a href="pro-pack.html">Pro pack 10 m</a></li><li><a href="bulk-roll.html">Bulk roll</a></li><li><a href="custom.html">Made to your spec</a></li><li><a href="https://texsolvshop.com/collections/runlock">Webshop</a></li></ul></div>
    <div><h4>Learn</h4><ul><li><a href="how-it-works.html">How it works</a></li><li><a href="try-it.html">Try it</a></li><li><a href="the-rope.html">The rope</a></li><li><a href="uses.html">Uses</a></li><li><a href="videos.html">Videos</a></li><li><a href="faq.html">Questions and answers</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="about.html">About RunLock</a></li><li><a href="contact.html">Contact</a></li><li><a href="https://texsolv.se/">texsolv.se</a></li><li><a href="privacy.html">Privacy</a></li><li><button type="button" class="cookielink" onclick="rlShowConsent()">Cookies</button></li></ul></div>
    <div class="copy"><span>© <span data-year>2026</span> Texsolv AB. All rights reserved.</span><span>Company reg. no. 556311-9816 · Registered office: Åmål, Sweden</span></div>
  </div>
</footer>
<div class="cbv" id="cbv" hidden></div>
<div class="cb" id="cb" role="dialog" aria-labelledby="cbh" hidden><div class="cbt"><h3 id="cbh">Cookies for visitor statistics?</h3><p>We would like to use Google Analytics to see which pages are read. No cookies are set unless you say yes. <a href="privacy.html">How we handle your data →</a></p></div><div class="cbb"><button type="button" class="y" onclick="rlConsent('yes')">Yes, that's fine</button><button type="button" onclick="rlConsent('no')">No thanks</button></div></div>
'''

CONSENT = '''<script>
/* Google Analytics only after consent (Consent Mode). The choice is kept in the browser. */
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
window.rlGA='%s';
window.rlConsent=function(v){try{localStorage.setItem('rl_consent',v);}catch(e){}
 if(v==='yes'){gtag('consent','update',{analytics_storage:'granted'});if(!window.rlLoaded){window.rlLoaded=1;var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+window.rlGA;document.head.appendChild(s);gtag('js',new Date());gtag('config',window.rlGA,{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});}}
 else{gtag('consent','update',{analytics_storage:'denied'});try{document.cookie.split(';').forEach(function(c){var n=c.split('=')[0].trim();if(n.indexOf('_ga')===0){document.cookie=n+'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.runlock.se';document.cookie=n+'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';}});}catch(e){}}
 var b=document.getElementById('cb');if(b)b.hidden=true;var vv=document.getElementById('cbv');if(vv)vv.hidden=true;};
window.rlShowConsent=function(){var b=document.getElementById('cb');if(b)b.hidden=false;};
(function(){var v=null;try{v=localStorage.getItem('rl_consent');}catch(e){}if(v==='yes')window.rlConsent('yes');else if(v!=='no')document.addEventListener('DOMContentLoaded',function(){setTimeout(window.rlShowConsent,1200);});})();
</script>''' % GA

ORG = {"@type": "Organization", "@id": BASE + "#org", "name": "Texsolv AB", "url": BASE, "logo": BASE + "img/logo-red.png",
       "brand": {"@type": "Brand", "name": "RunLock"}, "foundingDate": "1977", "email": "info@texsolv.se", "telephone": "+46 532 240 10",
       "address": {"@type": "PostalAddress", "streetAddress": "Vitlanda 102", "postalCode": "662 98", "addressLocality": "Tösse", "addressCountry": "SE"},
       "sameAs": ["https://texsolv.se/", "https://texsolvshop.com/collections/runlock"]}

def text_of(frag):
    frag = re.sub(r'<[^>]+>', '', frag); return html.unescape(re.sub(r'\s+', ' ', frag)).strip()

def head_common(fn, s):
    url = BASE if fn == 'index.html' else BASE + fn
    title = re.search(r'<title>(.*?)</title>', s, flags=re.S); title = html.unescape(title.group(1).strip()) if title else 'RunLock'
    desc = re.search(r'<meta name="description" content="(.*?)"', s); desc = html.unescape(desc.group(1)) if desc else ''
    m = re.search(r'<(?:header|div) class="(?:hero|phero)[^"]*".*?<img[^>]*src="([^"]+)"', s, flags=re.S)
    img = BASE + (m.group(1) if m else 'img/hero-atv.webp')
    graph = [dict(ORG)] if fn == 'index.html' else []
    if fn == 'index.html':
        graph.append({"@type": "WebSite", "url": BASE, "name": "RunLock", "publisher": {"@id": BASE + "#org"}})
    cr = re.search(r'<div class="crumbs">(.*?)</div>', s, flags=re.S)
    if cr:
        items, pos = [], 1
        for h, t in re.findall(r'<a href="([^"]+)">([^<]+)</a>', cr.group(1)):
            items.append({"@type": "ListItem", "position": pos, "name": html.unescape(t), "item": BASE if h == 'index.html' else BASE + h}); pos += 1
        last = re.findall(r'<span>([^<›]+)</span>\s*$', cr.group(1).strip())
        if last: items.append({"@type": "ListItem", "position": pos, "name": html.unescape(last[-1].strip())})
        graph.append({"@type": "BreadcrumbList", "itemListElement": items})
        if '>Products<' in cr.group(1) and fn not in ('products.html',):
            h1 = re.search(r'<h1[^>]*>(.*?)</h1>', s, flags=re.S)
            graph.append({"@type": "Product", "name": text_of(h1.group(1)).rstrip('.') if h1 else title.split('|')[0].strip(), "description": desc, "image": img,
                          "brand": {"@type": "Brand", "name": "RunLock"}, "manufacturer": {"@id": BASE + "#org"}, "url": url, "material": "Polyester", "countryOfOrigin": "SE"})
    if fn == 'faq.html':
        qa = re.findall(r'<details class="faq">\s*<summary>(.*?)</summary>(.*?)</details>', s, flags=re.S)
        graph.append({"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": text_of(q), "acceptedAnswer": {"@type": "Answer", "text": text_of(a)}} for q, a in qa]})
    ld = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)
    return ('<!-- head:common -->\n'
            f'<link rel="canonical" href="{url}">\n'
            '<link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="icon" href="favicon.png" type="image/png" sizes="32x32"><link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
            '<meta name="theme-color" content="#d8121f">\n'
            f'<meta property="og:title" content="{html.escape(title, quote=True)}"><meta property="og:description" content="{html.escape(desc, quote=True)}"><meta property="og:image" content="{img}"><meta property="og:url" content="{url}"><meta property="og:type" content="website"><meta property="og:site_name" content="RunLock"><meta property="og:locale" content="en_GB"><meta name="twitter:card" content="summary_large_image">\n'
            '<link rel="preload" href="fonts/barlow-condensed-700.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin>\n'
            f'<script type="application/ld+json">{ld}</script>\n'
            + CONSENT + '\n<!-- /head:common -->\n')

def process(path):
    fn = os.path.basename(path); s = open(path, encoding='utf-8').read(); o = s
    s = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]*">\n?', '', s)
    s = s.replace('<meta name="viewport" content="width=device-width,initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
    s = re.sub(r'<!-- head:common -->.*?<!-- /head:common -->\n?', '', s, flags=re.S)
    s = s.replace('</head>', head_common(fn, s) + '</head>', 1)
    s = re.sub(r'<nav class="nav" aria-label="Main">.*?</nav>\n(?:<script>\(function\(\)\{if\(\'scrollRestoration\'.*?</script>\n)?', nav_html(), s, count=1, flags=re.S)
    s = re.sub(r'<footer>.*?</footer>\n(?:<div class="cbv".*?</div>\n)?', FOOTER, s, count=1, flags=re.S)
    if '<script src="nav.js"></script>' not in s:
        s = s.replace('</body>', '<script src="nav.js"></script>\n</body>', 1)
    if s != o: open(path, 'w', encoding='utf-8', newline='\n').write(s)
    return s != o

if __name__ == '__main__':
    n = 0
    for p in sorted(glob.glob(os.path.join(SITE, '*.html'))):
        if process(p): n += 1
    print(f'{n} sidor uppdaterade')
