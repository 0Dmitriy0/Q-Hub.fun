import pickle,numpy as np,collections
from shapely.geometry import Polygon, Point
from shapely.prepared import prep
from shapely.ops import unary_union
comps=pickle.load(open('comps.pkl','rb')); zones=pickle.load(open('zones.pkl','rb'))
Z=unary_union(zones); PZ=prep(Z.buffer(8)); PB=prep(Z.boundary.buffer(6))
col=lambda c: collections.Counter(tuple(int(v) for v in t[0,3:6]) for t in c['tris']).most_common(1)[0][0]
area=lambda T: 0.5*np.abs((T[:,1,0]-T[:,0,0])*(T[:,2,1]-T[:,0,1])-(T[:,2,0]-T[:,0,0])*(T[:,1,1]-T[:,0,1])).sum()
kind=[]
for c in comps:
    w,h=c['x1']-c['x0'],c['y1']-c['y0']; big=max(w,h); cen=Point((c['x0']+c['x1'])/2,(c['y0']+c['y1'])/2)
    thin=area(c['tris'])/max(1,w*h)<0.12 and big>15
    if c['z']>=20: k='ring' if thin else 'name'
    elif col(c)==(18,70,31): k='zone'
    elif big>20 and PZ.contains(cen) and not thin: k='zone'          # перефарбовані дороги/будинки всередині зони
    elif col(c)==(255,255,255) and big<12 and PB.contains(cen) and all(PB.contains(Point(p[0],p[1])) for p in c['tris'][:,0,:2][:5]): k='zone-border'
    else: k='keep'
    kind.append(k)
print(collections.Counter(kind))
pickle.dump(kind,open('kind.pkl','wb'))
# які кольори пішли в «зону» крім заливки
cc=collections.Counter(); 
for c,k in zip(comps,kind):
    if k=='zone': cc[col(c)]+=1
print(cc.most_common(12))
