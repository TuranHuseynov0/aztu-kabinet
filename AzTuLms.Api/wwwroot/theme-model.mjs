export const COLORS={bg:'#f4f4f2',surface:'#ffffff',well:'#eeeeeb',ink:'#222222',muted:'#646461',line:'#d8d8d3',accent:'#343431',hover:'#e4e4de',buttonText:'#ffffff'};
export const DARK={bg:'#141414',surface:'#1d1d1d',well:'#282828',ink:'#ffffff',muted:'#ffffff',line:'#424242',accent:'#e4e4e1',hover:'#363636',buttonText:'#181818'};
export const PRESETS={
 light:COLORS,dark:DARK,
 sage:{...COLORS,bg:'#eff1eb',well:'#e5eade',ink:'#28372b',muted:'#586451',line:'#cbd4c2',accent:'#3b5941',hover:'#d5dfcc'},
 rose:{...COLORS,bg:'#f6eeee',well:'#f4e5e6',ink:'#412d32',muted:'#795b63',line:'#e0c8ce',accent:'#864758',hover:'#eed8de'},
 mikasa:{...DARK,bg:'#171819',surface:'#222324',well:'#2c2d2e',ink:'#fff9f3',muted:'#e0d7ce',line:'#56504e',accent:'#d8898c',hover:'#493436',buttonText:'#201718'},
 eren:{...DARK,bg:'#151a18',surface:'#202824',well:'#2b3530',ink:'#f6faf6',muted:'#d1ddd5',line:'#4c6156',accent:'#9bc8af',hover:'#354d40',buttonText:'#14231b'},
 madara:{...DARK,bg:'#191416',surface:'#271e22',well:'#35262c',ink:'#fff7f8',muted:'#e5d2d8',line:'#68444f',accent:'#e29aa9',hover:'#51323d',buttonText:'#2a111a'}
};
export const CHARACTER_THEMES={
 mikasa:{name:'Mikasa',title:'MİKASA',description:'Kömür tonları, qırmızı vurğular və Mikasa fonu.',imageDescription:'Qırmızı şərfli Mikasa illüstrasiyası'},
 eren:{name:'Eren Yeager',title:'EREN YEAGER',description:'Meşə yaşılı, kömür tonları və Eren Yeager fonu.',imageDescription:'Yaşıl gözlü Eren Yeager illüstrasiyası'},
 madara:{name:'Madara Uchiha',title:'MADARA UCHIHA',description:'Tünd qırmızı zireh, kömür tonları və Madara Uchiha fonu.',imageDescription:'Qırmızı zirehli Madara Uchiha illüstrasiyası'}
};
export const COLOR_FIELDS=[['bg','Səhifə fonu'],['surface','Panel fonu'],['well','İç bölmələrin fonu'],['ink','Mətn rəngi'],['muted','İkinci dərəcəli mətn'],['line','Sərhəd rəngi'],['accent','Vurğu rəngi'],['hover','Üzərinə gəlmə rəngi'],['buttonText','Düymə mətni']];
export const validColor=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
export function palette(raw={}){return Object.fromEntries(Object.entries(COLORS).map(([key,fallback])=>[key,validColor(raw?.[key])?raw[key].toLowerCase():fallback]));}
export function themeId(value){return value==='custom'||Object.hasOwn(PRESETS,value)?value:'light';}
export function contrast(a,b){
 const luminance=h=>{const c=h.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
