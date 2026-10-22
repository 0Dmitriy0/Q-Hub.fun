import pickle,numpy as np,os,shutil,glob,zipfile,math,collections
comps=pickle.load(open('comps.pkl','rb')); kind=pickle.load(open('kind.pkl','rb'))
keep=[c['tris'] for c,k in zip(comps,kind) if k in ('keep','ring')]
T=np.concatenate(keep+[pickle.load(open('zone_tris.pkl','rb')),pickle.load(open('name_tris.pkl','rb'))])
print('tris',len(T))
OUT='final'; shutil.rmtree(OUT,ignore_errors=True); shutil.copytree('old',OUT)   # чистий експорт без додатків + наші шари
cx=T[:,:,0].mean(1); cy=T[:,:,1].mean(1)
col=np.floor((cx+4500)/1175).astype(int); row=np.floor((8000-cy)/1388).astype(int)
f7=lambda v:f'{v:.7f}'
def write(k, tris, part):
    tile=f'supertile_fore_{k}_tile_2_{part}'; d=f'{OUT}/minimap_{k}'; os.makedirs(f'{d}/{tile}',exist_ok=True)
    verts={}; V=[]; I=[]
    for t in tris:
        for p in t:
            key=(round(p[0],3),round(p[1],3),round(p[2],3),int(p[3]),int(p[4]),int(p[5]))
            if key not in verts: verts[key]=len(V); V.append(key)
            I.append(verts[key])
    V=np.array(V,float); mn=V[:,:3].min(0); mx=V[:,:3].max(0)
    lines='\n'.join('\t\t\t\t'+' '.join(map(str,I[i:i+15])) for i in range(0,len(I),15))
    vl='\n'.join(f'\t\t\t\t{f7(v[0])} {f7(v[1])} {f7(v[2])} / {int(v[3])} {int(v[4])} {int(v[5])} 255' for v in V)
    mesh=(f'Version 165 32\n{{\n\tLocked false\n\tSkinned false\n\tBoneCount 0\n\tMask 255\n\tBounds\n\t{{\n\t\tAabb\n\t\t{{\n\t\t\tMin {" ".join(map(f7,mn))}\n\t\t\tMax {" ".join(map(f7,mx))}\n\t\t}}\n\t}}\n'
          f'\tGeometries\n\t{{\n\t\tGeometry\n\t\t{{\n\t\t\tShaderIndex 0\n\t\t\tFlags -\n\t\t\tVertexDeclaration NB60E6ACF\n\t\t\tIndices {len(I)}\n\t\t\t{{\n{lines}\n\t\t\t}}\n'
          f'\t\t\tVertices {len(V)}\n\t\t\t{{\n{vl}\n\t\t\t}}\n\t\t}}\n\t}}\n}}')
    open(f'{d}/{tile}/{tile}_high.mesh','w',newline='\n').write(mesh)
    c=(mn+mx)/2; r=math.sqrt(((mx-mn)/2).dot((mx-mn)/2))
    odr=(f'Version 165 32\n{{\n\tShaders\n\t{{\n\t\tminimap.sps\n\t\t{{\n\t\t\tUseTessellation 0.0000000\n\t\t}}\n\t}}\n\tSkeleton null\n\tLodGroup\n\t{{\n\t\tHigh 9998.0\n\t\t{{\n\t\t\t{tile}\\{tile}_high.mesh 0\n\t\t}}\n'
         f'\t\tMed 9998.0\n\t\tLow 9998.0\n\t\tVlow 9998.0\n\t\tAABBMin {" ".join(map(f7,mn))}\n\t\tAABBMax {" ".join(map(f7,mx))}\n\t\tRadius {r:.5f}\n\t\tCenter {" ".join(map(f7,c))}\n\t}}\n\tLight null\n\tBound null\n\tJoints null\n}}')
    open(f'{d}/{tile}.odr','w',newline='\n').write(odr)
    return len(V)
stats=collections.Counter()
for (c,r) in sorted(set(zip(col,row))):
    k=f'{c}_{r}'; m=(col==c)&(row==r); tris=T[m][np.argsort(T[m][:,0,2],kind='stable')]
    part=2; start=0
    while start<len(tris):   # до ~60 тис. вершин на файл, як і генератор сайту
        end=min(len(tris),start+20000); stats[k]+=write(k,tris[start:end],part); part+=1; start=end
    # .odd: усі .odr частини за алфавітом
    d=f'{OUT}/minimap_{k}'; odrs=sorted(os.path.basename(x) for x in glob.glob(f'{d}/*.odr'))
    open(f'{OUT}/minimap_{k}.odd','w',newline='\n').write('Version 165 32\n{\n'+'\n'.join(f'\tminimap_{k}\\{n}' for n in odrs)+'\n}')
print('supertiles',len(stats),'verts',sum(stats.values()))
# zip у тому ж порядку/форматі, що й експорт Hydra (папки теж як записи)
names=[]
for root,dirs,files in os.walk(OUT):
    dirs.sort(); rel=os.path.relpath(root,OUT)
    if rel!='.': names.append(rel.replace(os.sep,'/')+'/')
    for f in sorted(files): names.append(os.path.relpath(os.path.join(root,f),OUT).replace(os.sep,'/'))
with zipfile.ZipFile('/home/user/q-hub.fun/public/map/game/base.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for n in names:
        if n.endswith('/'): z.writestr(zipfile.ZipInfo(n),'')
        else: z.write(f'{OUT}/{n}',n)
print('zip',os.path.getsize('/home/user/q-hub.fun/public/map/game/base.zip'))
