"""Bygger den mapp som laddas upp (_build/) från site/.
   stage: varje sida får <meta name="robots" content="noindex"> och robots.txt stänger ute sökmotorer (testsajten).
   live:  sitemap.xml, robots.txt som tillåter allt och en .htaccess som tvingar https och tar bort www (runlock.se utan www)."""
import sys, os, shutil, datetime, re, json

def bust(dst):
    """Every css/js/json file gets a version stamp in the links (site.css?v=abc123), so browsers fetch the new file as soon as it changes."""
    import hashlib
    assets = ['site.css', 'rope.css', 'uses.css', 'nav.js', 'player.js', 'vidload.js', 'rope3d.js', 'search.json']
    ver = {}
    for a in assets:
        q = os.path.join(dst, a)
        if os.path.exists(q): ver[a] = hashlib.md5(open(q, 'rb').read()).hexdigest()[:8]
    n = 0
    for f in os.listdir(dst):
        if not f.endswith('.html'): continue
        q = os.path.join(dst, f); s = open(q, encoding='utf-8').read(); o = s
        for a, v in ver.items():
            s = s.replace(f'href="{a}"', f'href="{a}?v={v}"').replace(f'src="{a}"', f'src="{a}?v={v}"')
        if s != o: open(q, 'w', encoding='utf-8', newline='\n').write(s); n += 1
    q = os.path.join(dst, 'nav.js')
    if os.path.exists(q) and 'search.json' in ver:
        s = open(q, encoding='utf-8').read().replace("fetch('search.json')", f"fetch('search.json?v={ver['search.json']}')")
        open(q, 'w', encoding='utf-8', newline='\n').write(s)
    return n

def search_index(dst):
    """search.json: title, url, description, headings and text of every page, for the site search."""
    import html as H
    out = []
    for f in sorted(x for x in os.listdir(dst) if x.endswith('.html')):
        if f in ('404.html', 'privacy.html'): continue
        s = open(os.path.join(dst, f), encoding='utf-8').read()
        t = re.search(r'<title>(.*?)</title>', s, flags=re.S); d = re.search(r'<meta name="description" content="(.*?)"', s)
        body = s.split('<body', 1)[-1]
        body = re.sub(r'<nav .*?</nav>|<footer>.*?</footer>|<script.*?</script>|<style.*?</style>|<svg.*?</svg>|<div class="cb[v]?".*?</div>|<div class="crumbs">.*?</div>', ' ', body, flags=re.S)
        heads = ' '.join(re.findall(r'<h[1-3][^>]*>(.*?)</h[1-3]>', body, flags=re.S))
        clean = lambda x: H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x))).strip()
        out.append({'url': '' if f == 'index.html' else f, 'title': clean(t.group(1)).replace(' | RunLock', '') if t else f, 'desc': H.unescape(d.group(1)) if d else '',
                    'heads': clean(heads), 'text': clean(body)[:6000]})
    json.dump(out, open(os.path.join(dst, 'search.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return len(out)

MODE = sys.argv[1] if len(sys.argv) > 1 else 'stage'
SRC, DST, BASE = 'site', '_build', 'https://runlock.se/'
shutil.rmtree(DST, ignore_errors=True)
shutil.copytree(SRC, DST, ignore=shutil.ignore_patterns('.git*', '.DS_Store', 'Thumbs.db', 'desktop.ini', '_to_delete*'))
pages = sorted(f for f in os.listdir(DST) if f.endswith('.html'))
print(f'search.json: {search_index(DST)} sidor')
print(f'versionsstämplade länkar i {bust(DST)} sidor')
ERR = 'ErrorDocument 404 /404.html\n'

if MODE == 'stage':
    for f in pages:
        p = os.path.join(DST, f); s = open(p, encoding='utf-8').read()
        s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">', 1)
        open(p, 'w', encoding='utf-8', newline='\n').write(s)
    open(os.path.join(DST, 'robots.txt'), 'w', newline='\n').write('User-agent: *\nDisallow: /\n')
    open(os.path.join(DST, '.htaccess'), 'w', newline='\n').write(ERR)
    print(f'testbygge: {len(pages)} sidor med noindex')
else:
    today = datetime.date.today().isoformat()
    urls = [BASE] + [BASE + f for f in pages if f not in ('index.html', '404.html', 'privacy.html')]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n' for u in urls) + '</urlset>\n'
    open(os.path.join(DST, 'sitemap.xml'), 'w', newline='\n').write(xml)
    open(os.path.join(DST, 'robots.txt'), 'w', newline='\n').write(f'User-agent: *\nAllow: /\nSitemap: {BASE}sitemap.xml\n')
    # the old WordPress site's addresses, sent on to the new pages (search engines keep their ranking)
    OLD = {'productpage': 'products.html', 'product/the-towing-line': 'towing-line.html', 'product/the-4x4-set': '4x4-set.html', 'product/the-snowmobile-set': 'snowmobile-set.html',
           'product/outdoor-set': 'outdoor-set.html', 'product/the-hunting-set': 'hunting-set.html', 'product/the-dog-leash': 'dog-leash.html', 'product/the-hunting-leash': 'hunting-leash.html',
           'product/runlock-pro': 'pro-pack.html', 'product/pre-cut-box': 'bulk-roll.html', 'product/runlock-pro-bulk-roll': 'bulk-roll.html', 'product/walking-rope': 'walking-rope.html',
           'product/line-up': 'washing-line.html', 'community': 'videos.html', 'contact': 'contact.html', 'runlock-privacy-policy': 'privacy.html', 'about': 'about.html'}
    redirects = ''.join(f'RedirectMatch 301 ^/{a}/?$ {BASE}{b}\n' for a, b in OLD.items())
    open(os.path.join(DST, '.htaccess'), 'w', newline='\n').write(ERR + redirects + '''RewriteEngine On
RewriteCond %{HTTPS} off [OR]
RewriteCond %{HTTP_HOST} ^www\\. [NC]
RewriteRule ^ https://runlock.se%{REQUEST_URI} [L,R=301]
AddDefaultCharset utf-8
<IfModule mod_expires.c>
ExpiresActive On
ExpiresByType image/webp "access plus 30 days"
ExpiresByType image/jpeg "access plus 30 days"
ExpiresByType image/png "access plus 30 days"
ExpiresByType video/mp4 "access plus 30 days"
ExpiresByType video/webm "access plus 30 days"
ExpiresByType text/css "access plus 7 days"
ExpiresByType application/javascript "access plus 7 days"
</IfModule>
''')
    print(f'lanseringsbygge: {len(urls)} adresser i sitemap.xml')
