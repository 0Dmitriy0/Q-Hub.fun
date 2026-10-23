import json,pickle,numpy as np,mapbox_earcut as earcut
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import affinity
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
F=TTFont('unbounded.ttf'); GS=F.getGlyphSet(); CM=F.getBestCmap(); HM=F['hmtx']; UPM=F['head'].unitsPerEm
CAP=F['OS/2'].sCapHeight or 700
class Flat(BasePen):
    def __init__(s,gs): super().__init__(gs); s.c=[]; s.cur=[]
    def _moveTo(s,p): s.cur=[p]
    def _lineTo(s,p): s.cur.append(p)
    def _qCurveToOne(s,p1,p2):
        p0=s.cur[-1]
        for t in np.linspace(0,1,7)[1:]: s.cur.append(((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0],(1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1]))
    def _curveToOne(s,p1,p2,p3):
        p0=s.cur[-1]
        for t in np.linspace(0,1,8)[1:]: s.cur.append(tuple((1-t)**3*np.array(p0)+3*(1-t)**2*t*np.array(p1)+3*(1-t)*t*t*np.array(p2)+t**3*np.array(p3)))
    def _closePath(s):
        if len(s.cur)>2: s.c.append(s.cur)
        s.cur=[]
    _endPath=_closePath
def glyph(ch):
    g=CM.get(ord(ch)); 
    if g is None: return None, HM[CM[ord(' ')]][0]
    pen=Flat(GS); GS[g].draw(pen)
    shp=None
    for c in pen.c:
        p=Polygon(c).buffer(0)
        shp=p if shp is None else shp.symmetric_difference(p)
    return shp, HM[g][0]
cache={}
def line_shape(txt, track=0.02):
    x=0; parts=[]
    for ch in txt:
        if ch not in cache: cache[ch]=glyph(ch)
        shp,adv=cache[ch]
        if shp is not None and not shp.is_empty: parts.append(affinity.translate(shp,x,0))
        x+=adv+track*UPM
    return unary_union(parts) if parts else None, x-track*UPM
def tri(poly,z,col):
    out=[]
    for p in ([poly] if poly.geom_type=='Polygon' else list(poly.geoms)):
        if p.geom_type!='Polygon' or p.area<1e-6: continue
        rings=[np.array(p.exterior.coords)[:-1]]+[np.array(r.coords)[:-1] for r in p.interiors]
        v=np.concatenate(rings); e=np.cumsum([len(r) for r in rings]).astype(np.uint32)
        for a,b,c in earcut.triangulate_float64(v,e).reshape(-1,3): out.append([[*v[a],z,*col],[*v[b],z,*col],[*v[c],z,*col]])
    return out
labels=json.load(open('labels_final.json'))
T=[]
for L in labels:
    shapes=[]; caps=[]
    for ln in L['lines']:
        sh,w=line_shape(ln['text'])
        if sh is None: continue
        s=ln['cap']/CAP; caps.append(ln['cap'])
        sh=affinity.scale(sh,s,s,origin=(0,0)); shapes.append(affinity.translate(sh,ln['x']-w*s/2,ln['y0']))
    if not shapes: continue
    fill=unary_union(shapes); out=fill.buffer(min(caps)*0.12, join_style=1)
    T+=tri(out,30.0,(12,13,15))
    for sh,ln in zip(shapes,L['lines']): T+=tri(sh,30.4,tuple(ln.get('col',L['col'])))
T=np.array(T,float); print('name tris',len(T)); pickle.dump(T,open('name_tris.pkl','wb'))
