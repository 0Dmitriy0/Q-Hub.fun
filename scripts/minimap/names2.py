import pickle,numpy as np,collections,json
comps=pickle.load(open('comps.pkl','rb')); kind=pickle.load(open('kind.pkl','rb')); groups=pickle.load(open('groups.pkl','rb'))
ocr=json.load(open('ocr_ng.json'))
FIX={0:'БУБЛИК',1:'ТРАСА-М2',7:'ГОРА\n"ЧІЛІАД"',8:'ТРАСА-М1',12:'ФЕРМА',18:'ХЬЮМАН\nЛАБС',22:'АШАН',23:'КПП-2',29:'ТРАСА-68',32:'КПП-1',36:'ТРАСА-68',38:'ТРАСА-М1',
 40:'ТРАСА-М3',41:'ВЗХ',42:'ТРАСА-М2',46:'ЧУМАШ',48:'ТРАСА-М2',51:'ГОРА\nІНКАСІВ',52:'Ж/К\nECLIPSE',54:'СКЛАД\nМАРКЕТУ',55:'ГОЛЬФ\nКЛУБ',59:'БАР',61:'ТРАСА-М1',
 66:'ЯЛИНКИ',68:'Ж/К\nINTEGRITY',69:'Ж/К\nWIWANG\nБАР - 17 поверх',72:'КУБИ',74:'БАР',76:'ТРАСА-М3',82:'БУРГЕРКА',85:'ВЗА',86:'ЛИМОН',87:'МУРАВИ',88:'СВІЧ\nБП',
 89:'ПОЖАРКА',90:'НАПРОТИ\nВЗА',91:'ПАРКОВКА\nМОЛ',96:'ТИР',98:'ДРІФТ\nЗОНА',101:'АЕРОПОРТ\nЛОС-САНТОС',103:'ПОРТ',7.5:''}
SHARDS={15,62,63,64,73,77,99,100}
lum=lambda c:0.3*c[0]+0.59*c[1]+0.11*c[2]
def ourcol(c):
    r,g,b=c
    if b>180 and r<80: return (96,165,250)
    if g-r>25 and b>150 and r>120: return (255,138,61)
    if r>200 and g>200 and b<150: return (250,204,21)
    if r>200 and g>200 and b>200: return (244,241,236)
    if g>180 and b>180 and r<200: return (255,138,61)
    if r>200 and b>200 and g<170: return (192,132,252)
    if r>200 and g<140: return (255,106,31)
    if g>150: return (110,231,150)
    return (244,241,236)
labels=[]
for k,G in enumerate(groups):
    if k in SHARDS:
        for i in G['ids']: kind[i]='ring'
        continue
    t=FIX.get(k, ocr[f'{k:03d}.png']).strip()
    if not t: continue
    parts=[p.strip() for p in t.split('\n') if p.strip()]
    let=[comps[i] for i in G['let']]
    cols=collections.Counter(tuple(int(v) for v in tr[0,3:6]) for c in let for tr in c['tris'])
    fill=cols.most_common(1)[0][0]
    # рядки — за проміжками в проєкції літер на вісь Y; дрібні смуги (крапки Ї, Й) приєднуються до сусіднього рядка
    T=np.concatenate([c['tris'] for c in let]); y0=T[:,:,1].min(); y1=T[:,:,1].max(); step=max(0.15,(y1-y0)/400)
    nb=int((y1-y0)/step)+2; occ=np.zeros(nb,bool)
    for tr in T:
        lo=int((tr[:,1].min()-y0)/step); hi=int((tr[:,1].max()-y0)/step); occ[lo:hi+1]=True
    bands=[]; i=0
    while i<nb:
        if occ[i]:
            j=i
            while j<nb and occ[j]: j+=1
            bands.append([y0+i*step,y0+j*step]); i=j
        else: i+=1
    bands.sort(key=lambda b:-b[0]); hmax=max(b[1]-b[0] for b in bands)
    main=[b for b in bands if b[1]-b[0]>=0.35*hmax]
    if len(main)!=len(parts):
        print('rows mismatch',k,parts,len(main)); main=[[min(b[0] for b in bands),max(b[1] for b in bands)]]; 
        if len(parts)>1: parts=[' '.join(parts)]
    lines=[]; fills=[]
    for p,(b0,b1) in zip(parts,main):
        sel=T[(T[:,:,1].mean(1)>=b0-step)&(T[:,:,1].mean(1)<=b1+step)]
        # нижня межа рядка без хвостів Д/Ц/Щ: медіана нижніх точок трикутників біля низу смуги
        lines.append(dict(text=p,x=float((sel[:,:,0].min()+sel[:,:,0].max())/2),y0=float(b0),cap=float(b1-b0)))
        cc=collections.Counter(tuple(int(v) for v in tr[0,3:6]) for tr in sel); fills.append(cc.most_common(1)[0][0])
    fill=fills[0]
    for ln,f in zip(lines,fills): ln['col']=ourcol(f)
    labels.append(dict(text=t,fill=fill,col=ourcol(fill),lines=lines))
pickle.dump(kind,open('kind.pkl','wb'))
json.dump(labels,open('labels_final.json','w'),ensure_ascii=False,indent=0)
print(len(labels), collections.Counter(kind))
for l in labels:
    if any(s in l['text'] for s in ['WIWANG','ПАРКОВКА','МЕРІЯ','ФІБ','СВІЧ']): print(l['text'].replace('\n',' / '), [(x['text'],round(x['cap'],1)) for x in l['lines']], l['col'])
