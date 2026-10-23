import re,glob,pickle,numpy as np,collections
# компоненти зв'язності трикутників у кожному файлі tile_2_2 (спільні вершини)
comps=[]
for f in sorted(glob.glob('new/*/supertile_fore_*_tile_2_2/*.mesh')):
    s=open(f).read()
    for g in re.finditer(r'Indices (\d+)\s*\{(.*?)\}\s*Vertices (\d+)\s*\{(.*?)\}',s,re.S):
        idx=np.array(g.group(2).split(),dtype=int).reshape(-1,3); V=[]
        for line in g.group(4).strip().split('\n'):
            p,c=line.split('/')[:2]; p=p.split(); c=c.split(); V.append((float(p[0]),float(p[1]),float(p[2]),int(c[0]),int(c[1]),int(c[2])))
        V=np.array(V); par=list(range(len(V)))
        def find(a):
            while par[a]!=a: par[a]=par[par[a]]; a=par[a]
            return a
        for a,b,c in idx:
            ra,rb,rc=find(a),find(b),find(c); par[rb]=ra; par[find(rc)]=ra
        groups=collections.defaultdict(list)
        for t in idx: groups[find(t[0])].append(t)
        for k,ts in groups.items():
            T=V[np.array(ts)]
            comps.append(dict(file=f.split('/')[1], tris=T, z=float(T[:,:,2].mean()), x0=T[:,:,0].min(),x1=T[:,:,0].max(),y0=T[:,:,1].min(),y1=T[:,:,1].max()))
pickle.dump(comps,open('comps.pkl','wb'))
print(len(comps))
sz=np.array([max(c['x1']-c['x0'],c['y1']-c['y0']) for c in comps]); z=np.array([c['z'] for c in comps])
for lo,hi in [(0,16.5),(16.5,20),(20,30),(30,40)]:
    m=(z>=lo)&(z<hi); print(lo,hi,'comps',m.sum(),'size pct',np.percentile(sz[m],[10,50,90,99]).round(1) if m.any() else '')
