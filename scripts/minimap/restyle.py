import pickle,numpy as np,collections,json,mapbox_earcut as earcut
from shapely.geometry import Polygon, Point, LineString, MultiPolygon, box
from shapely.prepared import prep
from shapely.ops import unary_union
from shapely import affinity
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
comps=pickle.load(open('comps.pkl','rb')); kind=pickle.load(open('kind.pkl','rb')); zones=pickle.load(open('zones.pkl','rb'))
base=pickle.load(open('/tmp/claude-0/-home-user/0a8c9e87-27f5-5478-8b37-62979dd18bf0/map/hz/tris.pkl','rb'))
Z=unary_union(zones); PB=prep(Z.boundary.buffer(7))
area=lambda T: 0.5*np.abs((T[:,1,0]-T[:,0,0])*(T[:,2,1]-T[:,0,1])-(T[:,2,0]-T[:,0,0])*(T[:,1,1]-T[:,0,1])).sum()
# тонкі кільця біля меж зон — теж частина старого оформлення зон
for i,c in enumerate(comps):
    if kind[i]=='keep' and c['z']<20:
        w,h=c['x1']-c['x0'],c['y1']-c['y0']
        pts=c['tris'][:,:,:2].reshape(-1,2)[::3]
        if area(c['tris'])/max(1,w*h)<0.15 and max(w,h)>6 and np.mean([PB.contains(Point(*p)) for p in pts[:40]])>0.9: kind[i]='zone-border'
print(collections.Counter(kind)); pickle.dump(kind,open("kind.pkl","wb"))

def tri_poly(poly, z, color):
    out=[]
    polys=[poly] if poly.geom_type=='Polygon' else [g for g in getattr(poly,'geoms',[]) if g.geom_type=='Polygon']
    for p in polys:
        if p.is_empty or p.area<0.01: continue
        rings=[np.array(p.exterior.coords)[:-1]]+[np.array(r.coords)[:-1] for r in p.interiors]
        verts=np.concatenate(rings); ends=np.cumsum([len(r) for r in rings]).astype(np.uint32)
        idx=earcut.triangulate_float64(verts, ends).reshape(-1,3)
        for a,b,c in idx: out.append([[*verts[a],z,*color],[*verts[b],z,*color],[*verts[c],z,*color]])
    return out

# ---- зелені зони: напівпрозорий зелений відтінок поверх мапи, дороги лишаються помаранчевими
GREEN=np.array([46,160,87])
def tint(col):
    col=np.array(col,float); road=col[0]>col[2]+25          # помаранчеві дороги
    a=0.18 if road else 0.42
    return tuple(int(v) for v in np.round(col*(1-a)+GREEN*a))
zt=[]
PZ=prep(Z)
for l,_,T,C in base:
    if l==0: continue
    for t,col in zip(T,C):
        bb=box(t[:,0].min(),t[:,1].min(),t[:,0].max(),t[:,1].max())
        if not PZ.intersects(bb): continue
        tp=Polygon(t[:,:2]); 
        if not tp.is_valid or tp.area<1e-4: continue
        inter=tp if PZ.contains(tp) else tp.intersection(Z)
        if inter.is_empty: continue
        zl=13.0+ (0.2 if col[0]>col[2]+25 else 0.0) + l*0.05
        zt+=tri_poly(inter, zl, tint(col))
# межа: світло-зелений пунктир
def dashes(line, dash=9, gap=6, w=2.2):
    out=[]; L=line.length; s=0
    while s<L:
        seg=LineString([line.interpolate(s).coords[0], line.interpolate(min(L,s+dash)).coords[0]])
        out.append(seg.buffer(w/2, cap_style=2)); s+=dash+gap
    return out
for zpoly in zones:
    for ring in [zpoly.exterior]+list(zpoly.interiors):
        for dsh in dashes(LineString(ring.coords)): zt+=tri_poly(dsh,16.6,(150,236,170))
zt=np.array(zt,float); print('zone tris',len(zt))
pickle.dump(zt,open('zone_tris.pkl','wb'))
